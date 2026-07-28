import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStockState } from "@/lib/stock";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await req.json();

    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.status !== "PENDING_PAYMENT") {
      return NextResponse.json({ error: "Order is not awaiting payment" }, { status: 400 });
    }

    // Use a transaction to safely allocate items
    await prisma.$transaction(async (tx) => {
      let anyOutOfStock = false;
      const updatedProductIds: string[] = [];

      for (const orderItem of order.items) {
        // 1. Fetch product
        const product = await tx.product.findUnique({
          where: { id: orderItem.productId }
        });

        // Fetch area details to get cooldownMinutes
        let actualCooldownMinutes = 0;
        if (orderItem.areaId) {
          const areaDetail = await tx.productAreaDetail.findUnique({
            where: { productId_areaId: { productId: orderItem.productId, areaId: orderItem.areaId } }
          });
          if (areaDetail && areaDetail.cooldownMinutes > 0) {
            actualCooldownMinutes = areaDetail.cooldownMinutes;
          }
        }

        // We only decrement stock if it was not already deducted during crypto-checkout.
        // Wait, crypto-checkout already deducts stock? No, crypto-checkout did NOT deduct stock in the previous agent's code. Let's assume confirm-payment handles it.

        if (!product || product.stockQuantity < 1) {
          anyOutOfStock = true;
          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: {
              status: "PAID",
              adminMessage: "Payment confirmed but this item went out of stock. Contact admin.",
            },
          });
        } else {
          // 2. Deduct stock
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: 1 } },
          });

          // 3. Update order item to COOLDOWN_ACTIVE
          const cd = new Date();
          cd.setMinutes(cd.getMinutes() + actualCooldownMinutes);

          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: {
              status: "COOLDOWN_ACTIVE",
              cooldownEndAt: cd,
            },
          });
        }
      }

      // 5. Update master order status
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: anyOutOfStock ? "PAID" : "COOLDOWN_ACTIVE",
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm payment error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
