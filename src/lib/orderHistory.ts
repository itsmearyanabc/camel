// Relative import on purpose: consistent with the other shared lib modules.
import { Prisma } from "@prisma/client";

/**
 * How long a customer keeps sight of a finished order.
 *
 * Hidden, never deleted. visibleOrdersWhere filters what the customer is
 * shown; every row stays in the database for the control panel, the revenue
 * figures and dispute lookups, which would otherwise lose a month of history
 * every month.
 *
 * Delivery photos and videos are purged sooner - see MEDIA_RETENTION_DAYS in
 * src/lib/mediaRetention.ts. The two numbers are deliberately different now,
 * which is safe because the cleanup clears the database reference before it
 * unlinks the file: an order between the two windows renders with no gallery
 * rather than a broken image.
 */
export const ORDER_HISTORY_RETENTION_DAYS = 30;

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
