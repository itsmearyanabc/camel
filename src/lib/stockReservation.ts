// Relative imports on purpose: shared with the Telegram bot, which runs under
// tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

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
      await tx.stockItem.updateMany({
        where: { id: { in: reservedUnitIds } },
        data: { status: "USED" },
      });
    }

    await tx.productAreaDetail.update({
      where: { id: areaDetail.id },
      data: { stockQuantity: { decrement: quantity } },
    });

    await tx.stockEntry.create({
      data: {
        productAreaDetailId: areaDetail.id,
        quantity: -quantity,
        type: "SALE",
        notes: `${note} - ${quantity} unit(s)`,
        createdBy: userId,
      },
    });
  } else {
    if (product.stockQuantity < quantity) {
      throw new Error(
        `Not enough stock. Requested: ${quantity}, Available: ${product.stockQuantity}`
      );
    }
  }

  // Global stock mirrors the sum of area stock, so it always moves too.
  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { decrement: quantity } },
  });

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
