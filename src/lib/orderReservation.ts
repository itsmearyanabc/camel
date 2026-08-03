// Relative import on purpose: this module is shared with the Telegram bot,
// which runs under tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Releases everything a PENDING_PAYMENT order reserved and marks it CANCELLED.
 *
 * Crypto checkout reserves stock up front so two customers can't buy the last
 * unit while one of them is on the payment page. Every path that ends without a
 * successful payment - gateway error, failed/expired IPN, or the reclaim cron
 * for invoices the customer simply abandoned - has to undo that reservation,
 * otherwise stock leaks permanently.
 *
 * Safe to call concurrently: the status guard is re-read inside the caller's
 * transaction, so a webhook and the cron racing on the same order results in
 * exactly one release.
 *
 * @returns "RELEASED" if this call performed the release, "SKIPPED" if the order
 *          was no longer PENDING_PAYMENT (already paid, already cancelled).
 */
export async function releaseOrderReservation(
  tx: Tx,
  orderId: string,
  reason: string
): Promise<"RELEASED" | "SKIPPED"> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order || order.status !== "PENDING_PAYMENT") {
    return "SKIPPED";
  }

  // Each OrderItem row represents exactly one unit, so restoring is per-row.
  for (const item of order.items) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stockQuantity: { increment: 1 } },
    });

    if (item.areaId) {
      const areaDetail = await tx.productAreaDetail.findUnique({
        where: {
          productId_areaId: { productId: item.productId, areaId: item.areaId },
        },
      });
      if (areaDetail) {
        await tx.productAreaDetail.update({
          where: { id: areaDetail.id },
          data: { stockQuantity: { increment: 1 } },
        });

        // Checkout wrote a negative SALE entry when it reserved this unit.
        // Balance it out so the stock ledger reconciles against the real
        // quantity instead of showing a sale that never happened.
        await tx.stockEntry.create({
          data: {
            productAreaDetailId: areaDetail.id,
            quantity: 1,
            type: "RETURN",
            notes: `${reason} - reservation released for order ${orderId.slice(0, 8)}`,
            createdBy: order.userId,
          },
        });
      }
    }

    // Hand the specific reserved unit back to the pool.
    if (item.stockItemId) {
      await tx.stockItem.update({
        where: { id: item.stockItemId },
        data: { status: "AVAILABLE" },
      });
    }
  }

  // Give the coupon back. Without this, a customer who opens a checkout and
  // never pays burns one use of a limited coupon - both globally (usedCount)
  // and against their own per-user limit.
  const usages = await tx.couponUsage.findMany({ where: { orderId } });
  for (const usage of usages) {
    await tx.coupon.update({
      where: { id: usage.couponId },
      data: { usedCount: { decrement: 1 } },
    });
  }
  if (usages.length > 0) {
    await tx.couponUsage.deleteMany({ where: { orderId } });
  }

  await tx.orderItem.updateMany({
    where: { orderId },
    data: { status: "CANCELLED", cancellationReason: reason },
  });

  await tx.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED", updatedAt: new Date() },
  });

  return "RELEASED";
}
