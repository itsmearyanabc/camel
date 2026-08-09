// Relative imports on purpose: kept consistent with the other shared lib
// modules so this can be reused from the bot runner if needed.
import { prisma } from "./db";
import { releaseOrderReservation } from "./orderReservation";

export interface DeletionSummary {
  username: string;
  ordersDeleted: number;
  reservationsReleased: number;
}

/**
 * Permanently erase a user and everything personal attached to them.
 *
 * Most rows disappear through `onDelete: Cascade` (wallet + ledger, orders and
 * their items, disputes and messages, deposit requests, reviews, notifications,
 * restock subscriptions). Three things do NOT cascade and are handled here:
 *
 *   - CouponUsage.userId is a plain column with no relation, so those rows
 *     would otherwise outlive the account and keep burning the user's per-user
 *     coupon limit.
 *   - StockItem.orderItemId points at order items that are about to vanish;
 *     it is cleared so no unit row references a deleted order.
 *   - StockEntry.createdBy holds the user id on every SALE row they generated;
 *     it is nulled so the stock ledger survives without naming a deleted user.
 *
 * Anything the user had reserved but not paid for is released first, otherwise
 * deleting the account would swallow that stock permanently.
 *
 * This is irreversible - callers must have verified a password first.
 */
export async function deleteUserPermanently(userId: string): Promise<DeletionSummary> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { orders: { select: { id: true, status: true } } },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Hand back stock sitting in unpaid checkouts before the orders disappear.
    let reservationsReleased = 0;
    for (const order of user.orders) {
      if (order.status === "PENDING_PAYMENT") {
        const result = await releaseOrderReservation(tx, order.id, "Account deleted");
        if (result === "RELEASED") reservationsReleased++;
      }
    }

    const orderItems = await tx.orderItem.findMany({
      where: { order: { userId } },
      select: { id: true },
    });
    const orderItemIds = orderItems.map((i) => i.id);

    if (orderItemIds.length > 0) {
      await tx.stockItem.updateMany({
        where: { orderItemId: { in: orderItemIds } },
        data: { orderItemId: null },
      });
    }

    await tx.stockEntry.updateMany({
      where: { createdBy: userId },
      data: { createdBy: null },
    });

    await tx.couponUsage.deleteMany({ where: { userId } });

    const ordersDeleted = user.orders.length;

    await tx.user.delete({ where: { id: userId } });

    return { username: user.username, ordersDeleted, reservationsReleased };
  });
}
