// Relative import on purpose: consistent with the other shared lib modules.
import { Prisma } from "@prisma/client";

/**
 * How long a customer keeps sight of a finished order.
 *
 * This is the single retention policy for order history, and the delivery
 * media cleanup in src/lib/mediaRetention.ts reads the same number - a
 * customer must never open a 60-day-old order and find the photos gone, which
 * is exactly what happened while media was purged after 7 days.
 */
export const ORDER_HISTORY_RETENTION_DAYS = 90;

/** Statuses that mean an order is finished and the clock has started. */
const FINISHED_STATUSES = ["COMPLETED", "CANCELLED"];

export function orderHistoryCutoff(): Date {
  return new Date(Date.now() - ORDER_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Where-clause for the orders a customer should still see.
 *
 * Anything still in flight is always included regardless of age: an order that
 * has not been delivered is the customer's live business, and hiding it because
 * it is old would be worse than showing it. Only finished orders age out.
 */
export function visibleOrdersWhere(userId: string): Prisma.OrderWhereInput {
  return {
    userId,
    OR: [
      { status: { notIn: FINISHED_STATUSES } },
      { createdAt: { gte: orderHistoryCutoff() } },
    ],
  };
}
