import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

    // Check if cooldown has finished for each item
    for (const item of order.items) {
      if (item.status === "COOLDOWN_ACTIVE" && item.cooldownEndAt) {
        const now = new Date();
        if (now >= item.cooldownEndAt) {
          await prisma.orderItem.update({
            where: { id: item.id },
            data: { status: "READY" },
          });
          itemsUpdated = true;
        }
      }
    }

    if (itemsUpdated) {
      order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: { product: true }
          }
        },
      });
      // If all items are READY or COMPLETED, update master order status
      if (order && order.items.every(i => i.status === "READY" || i.status === "COMPLETED")) {
        order = await prisma.order.update({
          where: { id: orderId },
          data: { status: "READY" },
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
