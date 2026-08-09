// Relative imports on purpose: consistent with the other shared lib modules.
import { prisma } from "./db";

/** Escape characters that break Telegram MarkdownV2 parsing. */
function escapeMarkdownV2(text: string): string {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/**
 * Escape a URL for use inside a MarkdownV2 inline link target.
 * Only `)` and `\` are special there.
 */
function escapeMarkdownV2Url(url: string): string {
  return String(url).replace(/([\\)])/g, "\\$1");
}

export interface DeliveryDetails {
  locationLink: string | null;
  pickupVideoUrl: string | null;
  adminMessage: string;
}

/**
 * Work out what this order item should receive.
 *
 * The unit reserved for this item wins: each unit carries its own location and
 * video, so falling back to the area-level links first would hand every buyer
 * the same spot. The area values are only a fallback for stock that is tracked
 * as a plain count with no per-unit rows behind it.
 */
export async function resolveDeliveryDetails(item: {
  productId: string;
  areaId: string | null;
  stockItemId?: string | null;
}): Promise<DeliveryDetails> {
  let adminMessage = "Your product is ready for pickup!";

  const areaDetail = item.areaId
    ? await prisma.productAreaDetail.findUnique({
        where: { productId_areaId: { productId: item.productId, areaId: item.areaId } },
      })
    : // Older orders (and bot orders placed before areas existed) have no areaId.
      await prisma.productAreaDetail.findFirst({ where: { productId: item.productId } });

  const stockItem = item.stockItemId
    ? await prisma.stockItem.findUnique({ where: { id: item.stockItemId } })
    : null;

  const locationLink = stockItem?.locationUrl || areaDetail?.locationUrl || null;
  const pickupVideoUrl = stockItem?.videoUrl || areaDetail?.videoUrl || null;
  if (areaDetail?.message) adminMessage = areaDetail.message;

  return { locationLink, pickupVideoUrl, adminMessage };
}

/**
 * Send the pickup details to Telegram.
 *
 * MarkdownV2 is strict: one stray character in a customer-supplied URL or in
 * the admin's message makes Telegram reject the whole message with a 400, and
 * the customer would simply never hear about their order. So a failed
 * formatted send is retried as plain text - an unstyled message beats none.
 */
async function sendTelegramDelivery(
  botToken: string,
  chatId: string,
  productName: string,
  details: DeliveryDetails
): Promise<boolean> {
  const { locationLink, pickupVideoUrl, adminMessage } = details;

  let formatted = `📦 *Automated Delivery for ${escapeMarkdownV2(productName)}*\n\n`;
  formatted += `📝 ${escapeMarkdownV2(adminMessage)}\n\n`;
  if (locationLink) {
    formatted += `🗺️ *Location:* [View on Map](${escapeMarkdownV2Url(locationLink)})\n`;
  }
  if (pickupVideoUrl) {
    formatted += `🎥 *Video Guide:* [Watch Video](${escapeMarkdownV2Url(pickupVideoUrl)})\n`;
  }
  formatted += `\nStatus: *READY FOR PICKUP*`;

  const plain =
    `📦 Automated Delivery for ${productName}\n\n` +
    `📝 ${adminMessage}\n\n` +
    (locationLink ? `🗺️ Location: ${locationLink}\n` : "") +
    (pickupVideoUrl ? `🎥 Video Guide: ${pickupVideoUrl}\n` : "") +
    `\nStatus: READY FOR PICKUP`;

  const post = (body: Record<string, unknown>) =>
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  try {
    const res = await post({
      chat_id: chatId,
      text: formatted,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: false,
    });
    if (res.ok) return true;

    console.error("Telegram delivery rejected formatted message:", res.status, await res.text());
  } catch (err) {
    console.error("Telegram delivery send error:", err);
  }

  try {
    const res = await post({ chat_id: chatId, text: plain, disable_web_page_preview: false });
    if (res.ok) return true;
    console.error("Telegram delivery plain-text fallback failed:", res.status, await res.text());
  } catch (err) {
    console.error("Telegram delivery plain-text fallback error:", err);
  }

  return false;
}

/**
 * Release a finished-cooldown order item to the customer: write the pickup
 * details onto the item, raise the website notification, and message Telegram.
 *
 * Idempotent by construction: the transition out of COOLDOWN_ACTIVE is itself
 * the claim, so exactly one caller ever proceeds. The cron and the dashboard's
 * own status poll routinely fire at the same moment, and before this was shared
 * the poll would quietly transition the item and leave the cron unable to find
 * it - costing the customer their Telegram message.
 *
 * @returns true if this call performed the delivery.
 */
export async function deliverReadyOrderItem(orderItemId: string): Promise<boolean> {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    include: { order: { include: { user: true } }, product: true },
  });

  if (!item || item.status !== "COOLDOWN_ACTIVE") return false;

  const details = await resolveDeliveryDetails({
    productId: item.productId,
    areaId: item.areaId,
    stockItemId: item.stockItemId,
  });

  // The claim and the delivery are the same write. Flagging the item first and
  // filling it in afterwards would strand the order if anything failed in
  // between: it would no longer match the cron's query and the customer would
  // never receive it. Here the status predicate still guarantees a single
  // winner, but the losing path changes nothing at all.
  //
  // `automatedMessageSent` deliberately stays false here. It means "Telegram is
  // done", not "the item moved", and is only set once the message is actually
  // accepted - which is what lets a failed send be retried later.
  const claimed = await prisma.orderItem.updateMany({
    where: { id: item.id, status: "COOLDOWN_ACTIVE" },
    data: {
      status: "ON_PICKUP",
      locationLink: details.locationLink,
      pickupVideoUrl: details.pickupVideoUrl,
      adminMessage: details.adminMessage,
      adminMessageSentAt: new Date(),
      onPickupAt: new Date(),
    },
  });

  if (claimed.count === 0) return false;

  await prisma.order.update({
    where: { id: item.orderId },
    data: { status: "ON_PICKUP" },
  });

  // Website notification. Wrapped so a notification failure can never stop the
  // Telegram send that follows it.
  try {
    await prisma.notification.create({
      data: {
        userId: item.order.userId,
        type: "ORDER_READY",
        title: "Order Ready for Pickup",
        message: `Your order for ${item.product.name} is ready for pickup! ${details.adminMessage}`,
        // The dashboard is a single tabbed page - there is no
        // /dashboard/orders/<id> route, and linking to one 404s.
        link: "/dashboard?tab=orders",
      },
    });
  } catch (err) {
    console.error("Delivery notification create error:", err);
  }

  await sendAndRecordTelegram(item.id, item.order.user.telegramId, item.product.name, details);

  return true;
}

/**
 * Send the Telegram copy and record whether it landed.
 *
 * `automatedMessageSent` is only set once Telegram has accepted the message, or
 * when there is nothing to send (customer has not linked Telegram, or no bot is
 * configured). Anything else - a network blip, a Telegram outage - leaves it
 * false so retryPendingTelegramDeliveries picks it up again. Without that, a
 * single failed HTTP call lost the customer's message permanently.
 */
async function sendAndRecordTelegram(
  orderItemId: string,
  telegramId: string | null,
  productName: string,
  details: DeliveryDetails
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
  const deliverable = Boolean(botToken) && !botToken!.startsWith("PLACEHOLDER") && Boolean(telegramId);

  const sent = deliverable
    ? await sendTelegramDelivery(botToken!, telegramId!, productName, details)
    : false;

  // Nothing to send is "done"; a real failure is not.
  if (sent || !deliverable) {
    await prisma.orderItem.update({
      where: { id: orderItemId },
      data: { automatedMessageSent: true },
    });
  }

  return sent;
}

const TELEGRAM_RETRY_WINDOW_HOURS = 24;

/**
 * Re-send Telegram copies for items that were handed over on the website but
 * whose Telegram message never got through.
 *
 * Also covers the customer who links their Telegram account after ordering:
 * the flag is still false, so the next run reaches them.
 *
 * Pass `userId` to limit the sweep to one customer - the dashboard poll uses
 * that so a customer checking their own order never does work for anyone else.
 *
 * Only recent hand-overs are retried. Orders left unflagged by the older code
 * paths are still sitting in the table, and messaging someone that a weeks-old
 * pickup is "ready" would be worse than staying quiet.
 *
 * Safe to call repeatedly; never throws.
 */
export async function retryPendingTelegramDeliveries(
  opts: { userId?: string; limit?: number } = {}
): Promise<number> {
  const { userId, limit = 50 } = opts;
  const since = new Date(Date.now() - TELEGRAM_RETRY_WINDOW_HOURS * 60 * 60 * 1000);
  try {
    const pending = await prisma.orderItem.findMany({
      where: {
        status: "ON_PICKUP",
        automatedMessageSent: false,
        onPickupAt: { gte: since },
        order: {
          ...(userId ? { userId } : {}),
          user: { telegramId: { not: null } },
        },
      },
      include: { order: { include: { user: true } }, product: true },
      orderBy: { onPickupAt: "asc" },
      take: limit,
    });

    let resent = 0;
    for (const item of pending) {
      const ok = await sendAndRecordTelegram(
        item.id,
        item.order.user.telegramId,
        item.product.name,
        {
          locationLink: item.locationLink,
          pickupVideoUrl: item.pickupVideoUrl,
          adminMessage: item.adminMessage || "Your product is ready for pickup!",
        }
      );
      if (ok) resent++;
    }
    return resent;
  } catch (err) {
    console.error("retryPendingTelegramDeliveries error:", err);
    return 0;
  }
}
