// Relative import on purpose: this module is shared with the Telegram bot,
// which runs under tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Statuses where the customer has not yet been given the pickup details.
 *
 * Cancelling from one of these can safely put the unit back on the shelf.
 * Cancelling an ON_PICKUP or COMPLETED item must NOT: its location and video
 * have already been sent, and re-listing that unit would send a second
 * customer to a spot that is already spoken for.
 */
const PRE_DELIVERY_STATUSES = ["ORDERED", "PENDING_PAYMENT", "PROCESSING", "PAID", "COOLDOWN_ACTIVE"];

/**
 * Put a single order item's stock back after it is cancelled.
 *
 * Admins cancel individual items from the control panel, and that path used to
 * change the status and nothing else - the reserved unit stayed USED and both
 * counters stayed decremented, so a cancelled order silently destroyed a unit
 * of stock along with its location and video links.
 *
 * Call inside the caller's transaction, BEFORE writing the new status, so the
 * pre-delivery guard still sees the old one.
 *
 * @returns "RESTORED" if stock went back, "SKIPPED" if the item was already
 *          cancelled or had already been handed to the customer.
 */
export async function restoreOrderItemStock(
  tx: Tx,
  orderItemId: string,
  reason: string
): Promise<"RESTORED" | "SKIPPED"> {
  const item = await tx.orderItem.findUnique({ where: { id: orderItemId } });

  if (!item || !PRE_DELIVERY_STATUSES.includes(item.status)) {
    return "SKIPPED";
  }

  // Each OrderItem row is exactly one unit.
  await tx.product.update({
    where: { id: item.productId },
    data: { stockQuantity: { increment: 1 } },
  });

  if (item.areaId) {
    const areaDetail = await tx.productAreaDetail.findUnique({
      where: { productId_areaId: { productId: item.productId, areaId: item.areaId } },
    });
    if (areaDetail) {
      await tx.productAreaDetail.update({
        where: { id: areaDetail.id },
        data: { stockQuantity: { increment: 1 } },
      });

      await tx.stockEntry.create({
        data: {
          productAreaDetailId: areaDetail.id,
          quantity: 1,
          type: "RETURN",
          notes: `${reason} - order item ${orderItemId.slice(0, 8)} cancelled`,
          createdBy: null,
        },
      });
    }
  }

  // The specific unit goes back to the pool with its links intact, keeping its
  // original createdAt so FIFO offers it again first.
  if (item.stockItemId) {
    await tx.stockItem.update({
      where: { id: item.stockItemId },
      data: { status: "AVAILABLE" },
    });
  }

  return "RESTORED";
}

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
