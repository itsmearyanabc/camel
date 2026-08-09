import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { deliverReadyOrderItem, retryPendingTelegramDeliveries } from "@/lib/orderDelivery";

// Helper for escaping markdown for Telegram (MarkdownV2). The backslash must
// be in the set too: leaving it out turns a name containing one into a dangling
// escape and Telegram rejects the whole message.
function escapeTelegramMarkdown(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

// Production: Require CRON_SECRET for authentication
const CRON_SECRET = process.env.CRON_SECRET || "";
if (!CRON_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "CRON_SECRET environment variable is required in production. " +
    "Generate one with: openssl rand -base64 32"
  );
}

export async function GET(req: Request) {
  try {
    // Verify cron secret. The empty-secret check matters: without it an unset
    // CRON_SECRET makes `Authorization: Bearer ` a valid credential, leaving
    // the endpoint open to anyone.
    const authHeader = req.headers.get("authorization");
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    let processedCount = 0;
    let autoCompletedCount = 0;
    const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");

    // ============================================================
    // PASS 1: COOLDOWN_ACTIVE → ON_PICKUP (cooldown expired)
    // ============================================================
    const readyItems = await prisma.orderItem.findMany({
      where: {
        status: "COOLDOWN_ACTIVE",
        cooldownEndAt: { lte: now },
        automatedMessageSent: false,
      },
      select: { id: true },
    });

    // One message per unit. Units each carry their own location and video, so
    // there is nothing meaningful left to group - and deliverReadyOrderItem is
    // the same path the dashboard's status poll uses, so whichever fires first
    // does the delivery exactly once.
    for (const item of readyItems) {
      const delivered = await deliverReadyOrderItem(item.id);
      if (delivered) processedCount++;
    }

    // Re-send any Telegram copy that failed on a previous run (outage, network
    // blip) or that became sendable since - e.g. the customer linked their
    // Telegram account after ordering. The website copy is already in place.
    const telegramResent = await retryPendingTelegramDeliveries();

    // ============================================================
    // PASS 2: Auto-complete ON_PICKUP items older than 2 days
    // ============================================================
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const stalePickupItems = await prisma.orderItem.findMany({
      where: {
        status: "ON_PICKUP",
        onPickupAt: { lte: twoDaysAgo },
      },
      include: {
        order: { include: { user: true } },
        product: true,
      },
    });

    for (const item of stalePickupItems) {
      // Auto-complete the item
      await prisma.orderItem.update({
        where: { id: item.id },
        data: { status: "COMPLETED" },
      });

      // Check if all items in the order are now COMPLETED
      const allItems = await prisma.orderItem.findMany({ where: { orderId: item.orderId } });
      const allCompleted = allItems.every(i => i.status === "COMPLETED");
      if (allCompleted) {
        await prisma.order.update({
          where: { id: item.orderId },
          data: { status: "COMPLETED" },
        });
      }

      // Send Telegram auto-complete notification
      const user = item.order.user;
      if (user.telegramId && botToken) {
        const telegramMessage = `✅ *Order Auto\\-Completed*\n\nYour order for *${escapeTelegramMarkdown(item.product.name)}* has been automatically marked as completed after 2 days\\.\n\nIf you have any issues, please file a dispute from your dashboard\\.`;

        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: telegramMessage,
              parse_mode: "MarkdownV2",
            }),
          });
          
          if (!res.ok) {
            const errText = await res.text();
            console.error("Telegram API Error (Auto-complete):", res.status, errText, "Message:", telegramMessage);
          }
        } catch (err) {
          console.error("Failed to send auto-complete telegram message for item", item.id, err);
        }
      }

      autoCompletedCount++;
    }

    return NextResponse.json({ success: true, processedCount, autoCompletedCount, telegramResent });
  } catch (error) {
    console.error("Process cooldowns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
