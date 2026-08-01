import { prisma } from "@/lib/db";

/**
 * Notify all users subscribed to a product's restock alerts.
 * Sends an in-app Notification and a Telegram message (if linked),
 * then removes the subscriptions so each user is only notified once.
 *
 * Safe to call fire-and-forget; never throws.
 */
export async function notifyRestockSubscribers(productId: string): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stockQuantity: true },
    });
    if (!product) return;

    const subs = await prisma.restockSubscription.findMany({
      where: { productId },
      include: { user: { select: { id: true, telegramId: true, username: true } } },
    });
    if (subs.length === 0) return;

    const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
    const botConfigured = botToken && botToken !== "PLACEHOLDER_BOT_1_TOKEN";

    const title = "Back in Stock";
    const message = `Good news! "${product.name}" is back in stock (${product.stockQuantity} available). Grab it before it's gone!`;
    const link = `/dashboard/product/${product.id}`;

    for (const sub of subs) {
      // In-app notification
      try {
        await prisma.notification.create({
          data: {
            userId: sub.userId,
            type: "RESTOCK",
            title,
            message,
            link,
          },
        });
      } catch (err) {
        console.error("Restock notification create error:", err);
      }

      // Telegram message
      if (botConfigured && sub.user.telegramId) {
        try {
          const tgMessage =
            `🔔 *Back in Stock!*\n\n` +
            `*${product.name}* is available again (${product.stockQuantity} in stock).\n\n` +
            `Open the store to grab it before it's gone!`;

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: sub.user.telegramId,
              text: tgMessage,
              parse_mode: "Markdown",
            }),
          });
        } catch (err) {
          console.error("Restock Telegram send error:", err);
        }
      }
    }

    // Auto-remove subscriptions so users are only notified once
    await prisma.restockSubscription.deleteMany({ where: { productId } });
  } catch (err) {
    console.error("notifyRestockSubscribers error:", err);
  }
}
