import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deliverReadyOrderItem, retryPendingTelegramDeliveries } from "@/lib/orderDelivery";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    let order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: true }
        }
      },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Verify ownership
    if (order.userId !== session.userId && !["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized access to order" }, { status: 403 });
    }

    let itemsUpdated = false;

    // Check if cooldown has finished for each item.
    //
    // This shares deliverReadyOrderItem with the cron rather than transitioning
    // items itself. Doing it locally used to move the item out of
    // COOLDOWN_ACTIVE without sending anything to Telegram, and the cron then
    // could no longer find it - so any customer who happened to have the
    // dashboard open when their cooldown expired silently lost their Telegram
    // message. The shared helper writes the URLs, raises the website
    // notification and messages Telegram, and only one caller can win.
    const now = new Date();
    for (const item of order.items) {
      if (item.status === "COOLDOWN_ACTIVE" && item.cooldownEndAt && now >= item.cooldownEndAt) {
        const delivered = await deliverReadyOrderItem(item.id);
        if (delivered) itemsUpdated = true;
      }
    }

    // Also retry any Telegram copy that previously failed to send. This poll is
    // the one delivery driver that is always running, so it must not depend on
    // the cron being scheduled for the customer to get their message.
    await retryPendingTelegramDeliveries({ userId: order.userId });

    if (itemsUpdated) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: { product: true }
          }
        },
      });
      // If all items are COMPLETED, update master order status
      if (order && order.items.every(i => i.status === "COMPLETED")) {
        order = await prisma.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
          include: {
            items: {
              include: { product: true }
            }
          },
        });
      }
    }

    return NextResponse.json({
      order: {
        ...order,
      },
    });
  } catch (error) {
    console.error("Order status update error:", error);
    return NextResponse.json({ error: "Internal server error checking order status" }, { status: 500 });
  }
}
