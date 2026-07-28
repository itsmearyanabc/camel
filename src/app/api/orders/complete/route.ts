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

    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.userId !== session.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Allow completion if order is PROCESSING, READY, or ON_PICKUP
    if (!["PROCESSING", "READY", "ON_PICKUP"].includes(order.status)) {
      return NextResponse.json({ error: "Order is not in a valid state to be completed" }, { status: 400 });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update all items that are ON_PICKUP or READY
      await tx.orderItem.updateMany({
        where: { orderId: orderId, status: { in: ["READY", "ON_PICKUP"] } },
        data: { status: "COMPLETED" },
      });

      // Update master order if all items are now COMPLETED
      const allItems = await tx.orderItem.findMany({ where: { orderId: orderId } });
      if (allItems.every(i => i.status === "COMPLETED")) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "COMPLETED" },
        });
      }

      return await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: { product: true }
          },
        },
      });
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error) {
    console.error("Order complete error:", error);
    return NextResponse.json({ error: "Internal server error completing order" }, { status: 500 });
  }
}
