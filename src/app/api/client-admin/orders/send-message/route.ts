import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escapeTelegramMarkdown } from "@/lib/stock";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderItemId, message, locationLink, pickupVideoUrl, cancellationReason, file, fileName, fileType } = await req.json();

    if (!orderItemId) {
      return NextResponse.json({ error: "Order Item ID is required" }, { status: 400 });
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { 
        product: true,
        order: {
          include: { user: true, items: true }
        }
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: "Order Item not found" }, { status: 404 });
    }

    // Save file locally if provided
    let fileUrl: string | null = null;
    let localFileType: string | null = null;
    let fileBuffer: Buffer | null = null;

    if (file && fileName && fileType) {
      // Decode base64 file
      const matches = file.match(/^data:([A-Za-z-+/]+);base64,(.+)$/);
      const base64Data = matches ? matches[2] : file;
      fileBuffer = Buffer.from(base64Data, "base64");

      const uploadDir = path.join(process.cwd(), "public", "uploads", "attachments");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const uniqueFileName = `${orderItemId}-${Date.now()}-${fileName}`;
      const filePath = path.join(uploadDir, uniqueFileName);
      fs.writeFileSync(filePath, fileBuffer);
      fileUrl = `/uploads/attachments/${uniqueFileName}`;
      localFileType = fileType;
    }

    const updatedOrderItem = await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.update({
        where: { id: orderItemId },
        data: {
          adminMessage: message || orderItem.adminMessage,
          locationLink: locationLink || orderItem.locationLink,
          pickupVideoUrl: pickupVideoUrl || orderItem.pickupVideoUrl,
          cancellationReason: cancellationReason || orderItem.cancellationReason,
          adminMessageFileUrl: fileUrl || orderItem.adminMessageFileUrl,
          adminMessageFileType: localFileType || orderItem.adminMessageFileType,
          adminMessageSentAt: new Date(),
        },
      });

      // Check if all items in order are ON_PICKUP, COMPLETED, or CANCELLED
      const allItems = await tx.orderItem.findMany({ where: { orderId: orderItem.orderId } });
      const allCompleted = allItems.every(i => i.status === "COMPLETED");
      const anyCancelled = allItems.some(i => i.status === "CANCELLED");
      
      if (allCompleted) {
        await tx.order.update({ where: { id: orderItem.orderId }, data: { status: "COMPLETED" } });
      }

      return item;
    });

    let telegramSent = false;
    let telegramError: string | null = null;

    const user = orderItem.order.user;

    // Telegram Bot Integration - send message if user has linked their Telegram
    if (user.telegramId) {
      const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
      if (botToken && botToken !== "PLACEHOLDER_BOT_1_TOKEN") {
        try {
          let telegramMessage = `📦 *Order Update for ${escapeTelegramMarkdown(orderItem.product.name)}*\n\n`;
          if (updatedOrderItem.status === "ON_PICKUP") {
            telegramMessage += `📍 *Your order is ready for pickup!*\n\n`;
          } else if (updatedOrderItem.status === "CANCELLED") {
            telegramMessage += `❌ *Your order was cancelled.*\n\n`;
          } else {
            telegramMessage += `Admin sent an update:\n\n`;
          }

          if (message) telegramMessage += `📝 ${String(message)}\n\n`;
          if (locationLink) telegramMessage += `🗺️ *Location:* [View on Map](${escapeTelegramMarkdown(locationLink)})\n`;
          if (pickupVideoUrl) telegramMessage += `🎥 *Video Guide:* [Watch Video](${escapeTelegramMarkdown(pickupVideoUrl)})\n`;
          if (cancellationReason) telegramMessage += `\n*Reason:* ${escapeTelegramMarkdown(cancellationReason)}\n`;

          telegramMessage += `\nItem Status is now: *${escapeTelegramMarkdown(updatedOrderItem.status)}*`;

          if (fileBuffer && fileName && localFileType) {
            // Send as file attachment using multipart FormData
            const formData = new FormData();
            formData.append("chat_id", user.telegramId);

            // Determine method and field based on file type
            let method = "sendDocument";
            let field = "document";

            if (localFileType.startsWith("image/")) {
              method = "sendPhoto";
              field = "photo";
            } else if (localFileType.startsWith("video/")) {
              method = "sendVideo";
              field = "video";
            }

            const blob = new Blob([new Uint8Array(fileBuffer)], { type: localFileType });
            formData.append(field, blob, fileName);
            formData.append("caption", telegramMessage);
            formData.append("parse_mode", "Markdown");

            const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
              method: "POST",
              body: formData,
            });

            const tgBody = (await tgRes.json().catch(() => null)) as {
              ok?: boolean;
              description?: string;
            } | null;

            if (tgRes.ok && tgBody?.ok) {
              telegramSent = true;
            } else {
              telegramError = tgBody?.description || `Telegram HTTP ${tgRes.status}`;
            }
          } else {
            // Send regular text message
            const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: user.telegramId,
                text: telegramMessage,
                parse_mode: "Markdown",
              }),
            });

            const tgBody = (await tgRes.json().catch(() => null)) as {
              ok?: boolean;
              description?: string;
            } | null;

            if (tgRes.ok && tgBody?.ok) {
              telegramSent = true;
            } else {
              telegramError = tgBody?.description || `Telegram HTTP ${tgRes.status}`;
            }
          }
        } catch (err) {
          telegramError = err instanceof Error ? err.message : "Telegram request failed";
          console.error("Telegram sendMessage error:", err);
        }
      } else {
        telegramError = "TELEGRAM_BOT_1_TOKEN is not configured";
      }
    } else {
      telegramError = "User has no linked Telegram ID";
    }

    return NextResponse.json({
      success: true,
      orderItem: updatedOrderItem,
      telegramSent,
      telegramError: telegramSent ? null : telegramError,
    });
  } catch (err) {
    console.error("send-message error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
