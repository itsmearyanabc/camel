// Relative imports on purpose: consistent with the other shared lib modules.
import { prisma } from "./db";

/**
 * A product delete can touch a lot of rows at once (every order line, every
 * per-unit stock row, every area detail), and this database is a pooled
 * Supabase instance in another region - so the 5s Prisma default is not enough
 * for a product with real history behind it.
 */
const DELETE_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

export interface ProductDeletionSummary {
  name: string;
  /** Quantity options removed along with the parent. */
  variantsDeleted: number;
  /** Order lines that referenced the product or one of its options. */
  orderItemsDeleted: number;
  /** Orders that had nothing left in them once those lines were gone. */
  ordersDeleted: number;
  /** Coupon uses handed back because the order that consumed them is gone. */
  couponUsagesReleased: number;
}

/**
 * Permanently erase a product, its quantity options, and every trace of them.
 *
 * Most of it goes through `onDelete: Cascade`: OrderItem, Review,
 * RestockSubscription, and ProductAreaDetail (which in turn takes StockEntry
 * and StockItem with it). Deleting a parent also cascades into its variant
 * children, since a variant's `parentProduct` relation cascades too.
 *
 * Two things do NOT cascade and are handled here:
 *
 *   - An Order whose every line belonged to this product is left behind as a
 *     shell: a row with a total and no items, which the customer's dashboard
 *     renders as an empty order. Those are removed. An order that still holds
 *     lines from other products is left exactly as it was.
 *   - CouponUsage.orderId is a plain column with no relation, so those rows
 *     would outlive the order and keep burning a limited coupon. They are
 *     deleted and the coupon's usedCount is handed back with them.
 *
 * This is irreversible and destroys real order history, so callers must have
 * verified the acting admin's password first - see DELETE /api/admin/products.
 */
export async function deleteProductPermanently(productId: string): Promise<ProductDeletionSummary> {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, variants: { select: { id: true } } },
    });

    if (!product) {
      throw new Error("Product not found");
    }

    const productIds = [product.id, ...product.variants.map((v) => v.id)];

    // Read the affected orders BEFORE the delete: the OrderItem rows that name
    // them are about to be cascaded away, and there is no other link back.
    const doomedItems = await tx.orderItem.findMany({
      where: { productId: { in: productIds } },
      select: { id: true, orderId: true },
    });
    const affectedOrderIds = Array.from(new Set(doomedItems.map((i) => i.orderId)));

    await tx.product.deleteMany({ where: { id: { in: productIds } } });

    let ordersDeleted = 0;
    let couponUsagesReleased = 0;

    for (const orderId of affectedOrderIds) {
      const remaining = await tx.orderItem.count({ where: { orderId } });
      if (remaining > 0) continue;

      const usages = await tx.couponUsage.findMany({ where: { orderId } });
      for (const usage of usages) {
        // Guarded so a counter that has already drifted low can never be
        // pushed negative, which would silently grant extra uses.
        await tx.coupon.updateMany({
          where: { id: usage.couponId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } },
        });
      }
      if (usages.length > 0) {
        await tx.couponUsage.deleteMany({ where: { orderId } });
        couponUsagesReleased += usages.length;
      }

      await tx.order.delete({ where: { id: orderId } });
      ordersDeleted++;
    }

    return {
      name: product.name,
      variantsDeleted: product.variants.length,
      orderItemsDeleted: doomedItems.length,
      ordersDeleted,
      couponUsagesReleased,
    };
  }, DELETE_TX_OPTIONS);
}
