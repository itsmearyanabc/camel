// Relative imports on purpose: shared with the Telegram bot, which runs under
// tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Interactive-transaction limits for checkout.
 *
 * Prisma defaults to a 5s transaction timeout and a 2s wait for a connection.
 * A checkout runs roughly ten round-trips per cart line, and this deployment
 * talks to Supabase's pooler in another region - so a multi-item cart can pass
 * 5s on network latency alone and die with "Transaction already closed" (P2028)
 * after the stock has been reserved. The higher ceiling costs nothing when the
 * database is quick and prevents a class of failed checkouts when it is not.
 */
export const CHECKOUT_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

export interface ReservationResult {
  /** StockItem ids reserved for this line, in FIFO order. May be empty when an
   *  area tracks only an aggregate count rather than per-unit rows. */
  reservedUnitIds: string[];
  /** Cooldown configured for this product in this area, in minutes. */
  cooldownMinutes: number;
}

/**
 * Reserve `quantity` units of a product, decrementing both area-level and
 * global stock and claiming the specific per-unit rows (FIFO).
 *
 * This is the single definition of "take stock off the shelf". The website
 * cart, the website crypto checkout and the Telegram bot all go through it, so
 * an order placed from Telegram moves inventory exactly the same way as one
 * placed on the site - which is what stops the two surfaces drifting apart.
 *
 * Must be called inside a transaction: the availability check and the
 * decrement have to be atomic or two concurrent buyers can both pass the check.
 *
 * Throws when there is not enough stock, so the caller's transaction rolls back.
 */
export async function reserveProductStock(
  tx: Tx,
  params: {
    productId: string;
    areaId?: string | null;
    quantity: number;
    userId: string;
    note: string;
  }
): Promise<ReservationResult> {
  const { productId, areaId, quantity, userId, note } = params;

  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new Error("Product not found.");
  }

  let reservedUnitIds: string[] = [];
  let cooldownMinutes = 0;

  if (areaId) {
    const areaDetail = await tx.productAreaDetail.findUnique({
      where: { productId_areaId: { productId, areaId } },
    });

    if (!areaDetail) {
      throw new Error("This product is not available in the selected area.");
    }

    if (areaDetail.stockQuantity < quantity) {
      throw new Error(
        `Not enough stock in this area. Requested: ${quantity}, Available: ${areaDetail.stockQuantity}`
      );
    }

    cooldownMinutes = areaDetail.cooldownMinutes || 0;

    // Where per-unit rows exist, claim specific ones so each buyer gets their
    // own location/video links rather than everyone sharing the area default.
    const availableCount = await tx.stockItem.count({
      where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" },
    });

    if (availableCount > 0) {
      if (availableCount < quantity) {
        throw new Error(
          `Not enough unique units in this area. Requested: ${quantity}, Available: ${availableCount}`
        );
      }
      const units = await tx.stockItem.findMany({
        where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" },
        orderBy: { createdAt: "asc" },
        take: quantity,
        select: { id: true },
      });
      reservedUnitIds = units.map((u) => u.id);

      // Claim by flipping AVAILABLE -> USED and checking how many rows actually
      // changed. Selecting then blindly updating lets two buyers who read the
      // same row both "win" it, and they would be sent the same pickup
      // location. The status predicate makes the claim atomic: the loser
      // updates 0 rows and rolls the whole transaction back.
      const claimed = await tx.stockItem.updateMany({
        where: { id: { in: reservedUnitIds }, status: "AVAILABLE" },
        data: { status: "USED" },
      });
      if (claimed.count !== reservedUnitIds.length) {
        throw new Error("Those units were just taken by another customer. Please try again.");
      }
    }

    // Same idea for the counter: decrement only if there is still enough left.
    const areaTaken = await tx.productAreaDetail.updateMany({
      where: { id: areaDetail.id, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (areaTaken.count === 0) {
      throw new Error("Not enough stock in this area. Please try again.");
    }

    await tx.stockEntry.create({
      data: {
        productAreaDetailId: areaDetail.id,
        quantity: -quantity,
        type: "SALE",
        notes: `${note} - ${quantity} unit(s)`,
        createdBy: userId,
      },
    });

    // Global stock mirrors the sum of area stock. The area check above is the
    // real gate here, so this follows unconditionally - guarding it too would
    // fail the sale whenever the mirror had drifted low.
    await tx.product.update({
      where: { id: productId },
      data: { stockQuantity: { decrement: quantity } },
    });
  } else {
    // No area: the global counter is the only gate, so decrement it
    // conditionally and treat "nothing updated" as sold out.
    const taken = await tx.product.updateMany({
      where: { id: productId, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (taken.count === 0) {
      throw new Error(
        `Not enough stock. Requested: ${quantity}, Available: ${product.stockQuantity}`
      );
    }
  }

  return { reservedUnitIds, cooldownMinutes };
}

/**
 * Areas where a product currently has stock, with the city name for display.
 * Used by the Telegram bot to offer the same delivery-area choice the website
 * shows before checkout.
 */
export async function getAvailableAreasForProduct(productId: string) {
  const details = await prisma.productAreaDetail.findMany({
    where: { productId, stockQuantity: { gt: 0 } },
    include: { area: { include: { city: true } } },
    orderBy: { stockQuantity: "desc" },
  });

  return details.map((d) => ({
    areaId: d.areaId,
    areaName: d.area.name,
    cityName: d.area.city.name,
    stockQuantity: d.stockQuantity,
    cooldownMinutes: d.cooldownMinutes,
  }));
}
