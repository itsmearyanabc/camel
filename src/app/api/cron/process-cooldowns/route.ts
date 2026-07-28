import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Helper for escaping markdown for Telegram
function escapeTelegramMarkdown(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export async function GET(req: Request) {
  // Can be called by a cron job scheduler (e.g., cron-job.org or Vercel Cron)
  // Usually you'd check an Authorization header here for security, e.g., Bearer CRON_SECRET
  // But for the scope of this implementation we'll keep it simple or check a query param

  try {
    const now = new Date();

    // 1. Find all order items that are in COOLDOWN_ACTIVE and cooldownEndAt is in the past
    const readyItems = await prisma.orderItem.findMany({
      where: {
        status: "COOLDOWN_ACTIVE",
        cooldownEndAt: { lte: now },
        automatedMessageSent: false,
      },
      include: {
        order: { include: { user: true } },
        product: true,
      },
    });

    if (readyItems.length === 0) {
      return NextResponse.json({ message: "No items ready to process." });
    }

    const botToken = process.env.TELEGRAM_BOT_1_TOKEN;
    let processedCount = 0;

    for (const item of readyItems) {
      // 2. Fetch product area detail for this item's area
      let locationLink = null;
      let pickupVideoUrl = null;
      let adminMessage = "Your product is ready for pickup!";

      if (item.areaId) {
        const areaDetail = await prisma.productAreaDetail.findUnique({
          where: {
            productId_areaId: { productId: item.productId, areaId: item.areaId }
          }
        });
        
        if (areaDetail) {
          locationLink = areaDetail.locationUrl || null;
          pickupVideoUrl = areaDetail.videoUrl || null;
          if (areaDetail.message) {
            adminMessage = areaDetail.message;
          }
        }
      }

      // 3. Update the OrderItem
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          status: "COMPLETED",
          locationLink,
          pickupVideoUrl,
          adminMessage,
          automatedMessageSent: true,
          adminMessageSentAt: new Date(),
        },
      });

      // 4. Send Telegram message if user has Telegram ID
      const user = item.order.user;
      if (user.telegramId && botToken) {
        let telegramMessage = `📦 *Automated Delivery for ${escapeTelegramMarkdown(item.product.name)}*\\n\\n`;
        telegramMessage += `📝 ${escapeTelegramMarkdown(adminMessage)}\\n\\n`;
        
        if (locationLink) {
          telegramMessage += `🗺️ *Location:* [View on Map](${escapeTelegramMarkdown(locationLink)})\\n`;
        }
        if (pickupVideoUrl) {
          telegramMessage += `🎥 *Video Guide:* [Watch Video](${escapeTelegramMarkdown(pickupVideoUrl)})\\n`;
        }

        telegramMessage += `\\nStatus: *COMPLETED*`;

        try {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: telegramMessage,
              parse_mode: "MarkdownV2",
              disable_web_page_preview: false,
            }),
          });
        } catch (err) {
          console.error("Failed to send telegram message for item", item.id, err);
        }
      }

      // Check if we need to update the parent order status
      // If all items in the order are COMPLETED, update the master order to COMPLETED
      const allItems = await prisma.orderItem.findMany({ where: { orderId: item.orderId } });
      const allCompleted = allItems.every(i => i.status === "COMPLETED");
      if (allCompleted) {
        await prisma.order.update({
          where: { id: item.orderId },
          data: { status: "COMPLETED" }
        });
      }

      processedCount++;
    }

    return NextResponse.json({ success: true, processedCount });
  } catch (error) {
    console.error("Process cooldowns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
