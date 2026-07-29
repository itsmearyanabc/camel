import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Helper for escaping markdown for Telegram
function escapeTelegramMarkdown(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

export async function GET(req: Request) {
  try {
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
      include: {
        order: { include: { user: true } },
        product: true,
      },
    });

    const telegramMessagesToGroup: any[] = [];

    for (const item of readyItems) {
      // Fetch product area detail for this item's area
      let locationLink: string | null = null;
      let pickupVideoUrl: string | null = null;
      let adminMessage = "Your product is ready for pickup!";

      let areaDetail = null;
      if (item.areaId) {
        areaDetail = await prisma.productAreaDetail.findUnique({
          where: {
            productId_areaId: { productId: item.productId, areaId: item.areaId }
          }
        });
      } else {
        // Fallback for older orders or Telegram orders without an areaId
        areaDetail = await prisma.productAreaDetail.findFirst({
          where: { productId: item.productId }
        });
      }
      
      if (areaDetail) {
        locationLink = areaDetail.locationUrl || null;
        pickupVideoUrl = areaDetail.videoUrl || null;
        if (areaDetail.message) {
          adminMessage = areaDetail.message;
        }
      }

      // Update the OrderItem to ON_PICKUP
      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          status: "ON_PICKUP",
          locationLink,
          pickupVideoUrl,
          adminMessage,
          automatedMessageSent: true,
          adminMessageSentAt: new Date(),
          onPickupAt: new Date(),
        },
      });

      // Aggregate Telegram message for grouping
      const user = item.order.user;
      if (user.telegramId && botToken) {
        const existingMsg = telegramMessagesToGroup.find(m => 
          m.telegramId === user.telegramId && 
          m.productId === item.productId &&
          m.locationLink === locationLink &&
          m.pickupVideoUrl === pickupVideoUrl &&
          m.adminMessage === adminMessage
        );
        if (existingMsg) {
          existingMsg.quantity += 1;
        } else {
          telegramMessagesToGroup.push({
            telegramId: user.telegramId,
            productId: item.productId,
            productName: item.product.name,
            locationLink,
            pickupVideoUrl,
            adminMessage,
          });
        }
      }

      // Update master order status to PROCESSING
      await prisma.order.update({
        where: { id: item.orderId },
        data: { status: "PROCESSING" },
      });

      processedCount++;
    } // End of readyItems loop

    // Send grouped Telegram messages
    for (const msg of telegramMessagesToGroup) {
      let telegramMessage = `📦 *Automated Delivery for ${msg.quantity > 1 ? `${msg.quantity}x ` : ""}${escapeTelegramMarkdown(msg.productName)}*\n\n`;
      telegramMessage += `📝 ${escapeTelegramMarkdown(msg.adminMessage)}\n\n`;
      
      if (msg.locationLink) {
        const safeLink = msg.locationLink.replace(/([\\()])/g, "\\$1");
        telegramMessage += `🗺️ *Location:* [View on Map](${safeLink})\n`;
      }
      if (msg.pickupVideoUrl) {
        const safeVid = msg.pickupVideoUrl.replace(/([\\()])/g, "\\$1");
        telegramMessage += `🎥 *Video Guide:* [Watch Video](${safeVid})\n`;
      }

      telegramMessage += `\nStatus: *READY FOR PICKUP*`;

      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: msg.telegramId,
            text: telegramMessage,
            parse_mode: "MarkdownV2",
            disable_web_page_preview: false,
          }),
        });
      } catch (err) {
        console.error("Failed to send telegram message for grouped items", err);
      }
    }

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
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: user.telegramId,
              text: telegramMessage,
              parse_mode: "MarkdownV2",
            }),
          });
        } catch (err) {
          console.error("Failed to send auto-complete telegram message for item", item.id, err);
        }
      }

      autoCompletedCount++;
    }

    return NextResponse.json({ success: true, processedCount, autoCompletedCount });
  } catch (error) {
    console.error("Process cooldowns error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
