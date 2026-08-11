import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Most media files one unit can carry (e.g. a few photos + a video). */
const MAX_MEDIA_PER_UNIT = 6;

/**
 * Keep only well-formed, locally-hosted media entries.
 *
 * Only /uploads/ paths are accepted: these URLs are later resolved to files on
 * the VPS disk and pushed to Telegram, so an external URL here would at best
 * fail to send and at worst turn the Telegram sender into a proxy for
 * arbitrary hosts.
 */
function sanitizeMediaUrls(input: unknown): Array<{ url: string; type: "image" | "video" }> {
  if (!Array.isArray(input)) return [];
  const clean: Array<{ url: string; type: "image" | "video" }> = [];
  for (const entry of input) {
    const url = typeof entry?.url === "string" ? entry.url.trim() : "";
    const type = entry?.type === "video" ? "video" : entry?.type === "image" ? "image" : null;
    if (!type) continue;
    if (!url.startsWith("/uploads/") || url.includes("..")) continue;
    clean.push({ url, type });
    if (clean.length >= MAX_MEDIA_PER_UNIT) break;
  }
  return clean;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: productId } = await params;
  const { areaDetails } = await req.json();

  if (!areaDetails || !Array.isArray(areaDetails)) {
    return NextResponse.json({ error: "Invalid area details" }, { status: 400 });
  }

  try {
    // Note: the stock ledger entry and the restock alert for a quantity change
    // are raised by PUT /api/admin/products, which runs first and is the only
    // step that still sees the previous quantity. This route just makes the
    // per-unit rows match.
    //
    // Everything below is batched into a handful of round trips. Doing it one
    // area at a time meant five sequential queries per area, and against a
    // pooled database in another region that was seconds of latency on a save.
    const savedDetails = await prisma.$transaction(
      areaDetails.map((detail: any) => {
        const detailMedia = sanitizeMediaUrls(detail.mediaUrls);
        const shared = {
          locationUrl: detail.locationUrl || null,
          videoUrl: detail.videoUrl || null,
          mediaUrls: detailMedia,
          message: detail.message || null,
          cooldownMinutes: parseInt(detail.cooldownMinutes) || 0,
        };
        return prisma.productAreaDetail.upsert({
          where: { productId_areaId: { productId, areaId: detail.areaId } },
          update: shared,
          create: { productId, areaId: detail.areaId, ...shared },
        });
      })
    );

    // Drop any submitted unit that has been sold since the form was loaded.
    //
    // The editor holds a snapshot of the units that were AVAILABLE when it
    // opened. If a customer buys one before the admin saves, that unit is now
    // USED - but it is still in the submitted list. Recreating it would put an
    // already-delivered location and video back on the shelf and hand them to a
    // second customer. Units carry their id, so anything that is no longer
    // AVAILABLE is discarded here; entries without an id are genuinely new.
    //
    // Resolved for every area at once, but keyed by area as well as by id so a
    // unit can still only survive inside the area it actually belongs to.
    const submittedIds: string[] = [];
    for (const detail of areaDetails) {
      if (!Array.isArray(detail.stockItems)) continue;
      for (const item of detail.stockItems) {
        if (typeof item?.id === "string" && item.id.length > 0) submittedIds.push(item.id);
      }
    }

    let stillAvailable = new Set<string>();
    if (submittedIds.length > 0) {
      const rows = await prisma.stockItem.findMany({
        where: {
          id: { in: submittedIds },
          productAreaDetailId: { in: savedDetails.map((d) => d.id) },
          status: "AVAILABLE",
        },
        select: { id: true, productAreaDetailId: true },
      });
      stillAvailable = new Set(rows.map((r) => `${r.productAreaDetailId}:${r.id}`));
    }

    // Rebuild each area's available units: delete, recreate, then re-sync the
    // count. Order matters inside the batch, and Prisma preserves it.
    const writes: any[] = [];
    for (let i = 0; i < areaDetails.length; i++) {
      const detail = areaDetails[i];
      if (!Array.isArray(detail.stockItems)) continue;

      const saved = savedDetails[i];
      const surviving = detail.stockItems.filter(
        (item: any) => !item?.id || stillAvailable.has(`${saved.id}:${item.id}`)
      );

      // Remove existing AVAILABLE units (used ones are kept for history).
      writes.push(
        prisma.stockItem.deleteMany({
          where: { productAreaDetailId: saved.id, status: "AVAILABLE" },
        })
      );

      // Create the new set of available units.
      if (surviving.length > 0) {
        writes.push(
          prisma.stockItem.createMany({
            data: surviving.map((item: any) => ({
              productAreaDetailId: saved.id,
              locationUrl: item.locationUrl || null,
              videoUrl: item.videoUrl || null,
              mediaUrls: sanitizeMediaUrls(item.mediaUrls),
              status: "AVAILABLE",
            })),
          })
        );
      }

      // Keep stockQuantity in sync with the number of available units. This
      // also repairs the count if the step above dropped a sold unit.
      writes.push(
        prisma.productAreaDetail.update({
          where: { id: saved.id },
          data: { stockQuantity: surviving.length },
        })
      );
    }

    if (writes.length > 0) await prisma.$transaction(writes);

    // Global stock mirrors the sum of every area, so recompute it here too -
    // the per-unit sync above can land on a different number than the caller
    // sent as the area quantity.
    const allAreaDetails = await prisma.productAreaDetail.findMany({
      where: { productId },
      select: { stockQuantity: true },
    });
    await prisma.product.update({
      where: { id: productId },
      data: {
        stockQuantity: allAreaDetails.reduce((sum, d) => sum + (d.stockQuantity || 0), 0),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update area details error:", error);
    return NextResponse.json({ error: "Failed to update area details" }, { status: 500 });
  }
}
