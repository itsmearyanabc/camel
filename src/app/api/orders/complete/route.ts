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

    if (order.status !== "READY") {
      return NextResponse.json({ error: "Only orders in READY state can be marked as COMPLETED" }, { status: 400 });
    }

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // Update all items
      await tx.orderItem.updateMany({
        where: { orderId: orderId, status: "READY" },
        data: { status: "COMPLETED" },
      });

      // Update master order
      return await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED" },
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
