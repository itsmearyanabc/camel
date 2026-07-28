import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderItemId, status } = await req.json();

    if (!orderItemId || !status) {
      return NextResponse.json({ error: "Order Item ID and status are required" }, { status: 400 });
    }

    const validStatuses = ["ORDERED", "PROCESSING", "COOLDOWN_ACTIVE", "PAID", "PENDING_PAYMENT", "ON_PICKUP", "COMPLETED", "CANCELLED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status provided" }, { status: 400 });
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: { 
        product: true,
        order: { include: { user: true } } 
      },
    });

    if (!orderItem) {
      return NextResponse.json({ error: "Order Item not found" }, { status: 404 });
    }

    const updatedOrderItem = await prisma.$transaction(async (tx) => {
      const item = await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status },
      });

      // Simple sync to master order: if all items are completed, update master
      const allItems = await tx.orderItem.findMany({ where: { orderId: orderItem.orderId } });
      const allCompleted = allItems.every(i => i.status === "COMPLETED");
      const anyCancelled = allItems.some(i => i.status === "CANCELLED");

      if (allCompleted) {
        await tx.order.update({ where: { id: orderItem.orderId }, data: { status: "COMPLETED" } });
      } else if (anyCancelled && allItems.every(i => ["COMPLETED", "CANCELLED"].includes(i.status))) {
        await tx.order.update({ where: { id: orderItem.orderId }, data: { status: "CANCELLED" } });
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
          const telegramMessage =
            `📦 *Order Update for ${orderItem.product.name}*\n\n` +
            `Your item status has been updated to: *${status.replace(/_/g, " ")}*`;

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
      telegramError: telegramSent ? null : telegramError
    });
  } catch (err) {
    console.error("update-status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
