// Relative imports on purpose: consistent with the other shared lib modules,
// and this is reachable from the bot runner as well as the web server.
import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import fs from "fs";
import path from "path";

/**
 * How long a completed order keeps its delivery photos/videos.
 *
 * Deliberately shorter than the order-history window. The pictures are the
 * most sensitive thing an order carries - they show a real location - and
 * there is no reason to hold them on disk for as long as the order stays
 * listed.
 *
 * Decoupling the two is only safe because cleanupExpiredDeliveryMedia clears
 * the database reference BEFORE unlinking the file. An order sitting between
 * the two windows therefore renders with no gallery at all, never a broken
 * image - which is what went wrong the last time these numbers differed.
 */
export const MEDIA_RETENTION_DAYS = 7;

/** Orders cleaned per run, so one sweep can never stall the server. */
const BATCH_LIMIT = 200;

interface MediaRef {
  url: string;
  type: string;
}

function parseMedia(value: unknown): MediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is MediaRef =>
      !!entry && typeof entry === "object" && typeof (entry as any).url === "string"
  );
}

/**
 * Absolute path for an `/uploads/delivery/...` URL, or null if it points
 * anywhere else.
 *
 * These URLs come out of a JSON column, so a stored `../` would otherwise let
 * this job delete arbitrary files off the server. Nothing outside the delivery
 * directory is ever removed.
 */
function resolveDeliveryPath(url: string): string | null {
  if (!url.startsWith("/uploads/delivery/")) return null;
  const root = path.join(process.cwd(), "public", "uploads", "delivery");
  const resolved = path.resolve(root, url.slice("/uploads/delivery/".length));
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * Absolute path for an `/uploads/attachments/...` URL, or null if it points
 * anywhere else.
 *
 * Same containment rule as resolveDeliveryPath, for the same reason: the value
 * comes out of the database and a stored `../` would otherwise let this job
 * delete arbitrary files off the server.
 */
function resolveAttachmentPath(url: string): string | null {
  if (!url.startsWith("/uploads/attachments/")) return null;
  const root = path.join(process.cwd(), "public", "uploads", "attachments");
  const resolved = path.resolve(root, url.slice("/uploads/attachments/".length));
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export interface CleanupResult {
  ordersCleaned: number;
  filesDeleted: number;
  filesKept: number;
}

/**
 * Delete the pickup photos/videos belonging to orders that completed more than
 * MEDIA_RETENTION_DAYS ago, and clear the rows that referenced them.
 *
 * Only the per-order snapshot is disposable. A file is kept - even past the
 * retention window - while anything still needs it:
 *
 *   - a ProductAreaDetail template, which is reused by every future order in
 *     that area, so deleting it would break deliveries that have not happened;
 *   - a StockItem that has not been sold, whose media is still on the shelf;
 *   - another order that has not aged out yet.
 *
 * Getting that wrong destroys a live product's delivery media, so the live set
 * is rebuilt from the database on every run rather than assumed.
 *
 * Cancelled orders are deliberately left alone: releasing a reservation puts
 * the unit back with its links intact, so its files are still in use.
 *
 * Safe to call repeatedly; never throws.
 */
export async function cleanupExpiredDeliveryMedia(): Promise<CleanupResult> {
  const result: CleanupResult = { ordersCleaned: 0, filesDeleted: 0, filesKept: 0 };

  try {
    const cutoff = new Date(Date.now() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    // updatedAt is when the order last changed, which for a COMPLETED order is
    // when it completed - there is no separate completedAt column.
    const expiredOrders = await prisma.order.findMany({
      where: { status: "COMPLETED", updatedAt: { lte: cutoff } },
      select: {
        id: true,
        items: {
          select: {
            id: true,
            stockItemId: true,
            deliveryMedia: true,
            // The attachment an admin sends with a message is a picture too,
            // rendered in the same order-history block, and nothing else on the
            // server ever deletes it - so it expires on this same schedule.
            adminMessageFileUrl: true,
          },
        },
      },
      take: BATCH_LIMIT,
    });

    const candidates = new Set<string>();
    const attachments = new Set<string>();
    const itemIds: string[] = [];
    const stockItemIds: string[] = [];

    for (const order of expiredOrders) {
      for (const item of order.items) {
        const media = parseMedia(item.deliveryMedia);
        const attachment =
          typeof item.adminMessageFileUrl === "string" ? item.adminMessageFileUrl : "";

        // An item can carry only an attachment and no gallery, so this must not
        // skip on an empty media list alone or those files leak forever.
        if (media.length === 0 && !attachment) continue;

        media.forEach((m) => candidates.add(m.url));
        if (attachment) attachments.add(attachment);
        itemIds.push(item.id);
        if (item.stockItemId) stockItemIds.push(item.stockItemId);
      }
    }

    if (candidates.size === 0 && attachments.size === 0) return result;

    // Clear the references first. If the unlink loop below dies halfway, the
    // worst case is an orphaned file on disk - never a row pointing at a file
    // that is already gone, which would show the customer a broken image.
    await prisma.$transaction([
      prisma.orderItem.updateMany({
        where: { id: { in: itemIds } },
        data: { deliveryMedia: [], adminMessageFileUrl: null, adminMessageFileType: null },
      }),
      // The unit these came from was sold and can never be sold again, so its
      // copy of the media is dead weight too.
      prisma.stockItem.updateMany({
        where: { id: { in: stockItemIds }, status: "USED" },
        data: { mediaUrls: [] },
      }),
    ]);

    // Rebuild what is still in use, after the clears above.
    const [areaTemplates, liveUnits, liveOrderItems, liveAttachments] = await Promise.all([
      prisma.productAreaDetail.findMany({ select: { mediaUrls: true } }),
      prisma.stockItem.findMany({ select: { mediaUrls: true } }),
      prisma.orderItem.findMany({
        where: { deliveryMedia: { not: Prisma.DbNull } },
        select: { deliveryMedia: true },
      }),
      prisma.orderItem.findMany({
        where: { adminMessageFileUrl: { not: null } },
        select: { adminMessageFileUrl: true },
      }),
    ]);

    const inUse = new Set<string>();
    for (const row of areaTemplates) parseMedia(row.mediaUrls).forEach((m) => inUse.add(m.url));
    for (const row of liveUnits) parseMedia(row.mediaUrls).forEach((m) => inUse.add(m.url));
    for (const row of liveOrderItems) parseMedia(row.deliveryMedia).forEach((m) => inUse.add(m.url));

    // Attachments are tracked separately: they live in their own directory and
    // are a plain column rather than a JSON list.
    const attachmentsInUse = new Set<string>();
    for (const row of liveAttachments) {
      if (row.adminMessageFileUrl) attachmentsInUse.add(row.adminMessageFileUrl);
    }

    for (const url of candidates) {
      if (inUse.has(url)) {
        result.filesKept++;
        continue;
      }
      const filePath = resolveDeliveryPath(url);
      if (!filePath) continue;
      try {
        await fs.promises.unlink(filePath);
        result.filesDeleted++;
      } catch (err: any) {
        // Already gone is success as far as this job is concerned.
        if (err?.code !== "ENOENT") {
          console.error(`Media cleanup could not delete ${url}:`, err?.code || err);
        }
      }
    }

    for (const url of attachments) {
      if (attachmentsInUse.has(url)) {
        result.filesKept++;
        continue;
      }
      const filePath = resolveAttachmentPath(url);
      if (!filePath) continue;
      try {
        await fs.promises.unlink(filePath);
        result.filesDeleted++;
      } catch (err: any) {
        if (err?.code !== "ENOENT") {
          console.error(`Attachment cleanup could not delete ${url}:`, err?.code || err);
        }
      }
    }

    result.ordersCleaned = expiredOrders.length;
    return result;
  } catch (err) {
    console.error("cleanupExpiredDeliveryMedia error:", err);
    return result;
  }
}
