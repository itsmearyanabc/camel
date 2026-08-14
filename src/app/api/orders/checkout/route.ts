import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHECKOUT_TX_OPTIONS } from "@/lib/stockReservation";
import { getOngoingDiscount, ongoingDiscountAmount } from "@/lib/ongoingDiscount";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cart, paymentMethod, areaId, couponCode } = await req.json();
    
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Validate payment method - only WALLET is allowed for this endpoint
    if (paymentMethod !== "WALLET") {
      return NextResponse.json({ error: "Invalid payment method. Only WALLET is supported for this checkout." }, { status: 400 });
    }

    // Quantities drive both the price and the stock decrement, so they must be
    // whole positive numbers. A negative quantity would produce a negative
    // total, and `decrement: negative` CREDITS the wallet - i.e. free money.
    for (const line of cart) {
      const quantity = Number(line?.quantity);
      if (!line?.productId || typeof line.productId !== "string") {
        return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return NextResponse.json({ error: "Invalid quantity in cart" }, { status: 400 });
      }
    }

    // Collapse duplicate lines for the same product so the stock check cannot
    // be sidestepped by sending the same productId on two lines.
    const mergedCart = Array.from(
      cart.reduce((acc: Map<string, number>, line: any) => {
        acc.set(line.productId, (acc.get(line.productId) || 0) + Number(line.quantity));
        return acc;
      }, new Map<string, number>()),
      ([productId, quantity]) => ({ productId, quantity })
    );

    // Validate coupon if provided
    let coupon = null;
    let discount = 0;
    if (couponCode) {
      coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.toUpperCase() },
        include: {
          couponUsages: {
            where: { userId: session.userId },
          },
        },
      });

      if (!coupon) {
        return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
      }

      if (!coupon.isActive) {
        return NextResponse.json({ error: "This coupon is no longer active" }, { status: 400 });
      }

      const now = new Date();
      if (coupon.validFrom > now) {
        return NextResponse.json({ error: "This coupon is not yet valid" }, { status: 400 });
      }

      if (coupon.validUntil && coupon.validUntil < now) {
        return NextResponse.json({ error: "This coupon has expired" }, { status: 400 });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 400 });
      }

      if (coupon.userLimit && coupon.couponUsages.length >= coupon.userLimit) {
        return NextResponse.json({ error: "You have already used this coupon the maximum number of times" }, { status: 400 });
      }
    }

    // The store-wide discount an admin has switched on. Read before the
    // transaction opens: it is a settings lookup, not part of the money maths
    // that has to be atomic, and a toggle flipped mid-checkout is not worth an
    // extra round trip inside the transaction.
    const ongoing = await getOngoingDiscount();

    // Process checkout using database transactions to avoid race conditions
    const order = await prisma.$transaction(async (tx) => {
      // 1. Fetch user wallet
      const wallet = await tx.wallet.findUnique({
        where: { userId: session.userId },
      });

      if (!wallet) throw new Error("Wallet not found.");

      let totalAmountDue = 0;
      const orderItemsData = [];
      const updatedProductIds: string[] = [];

      // 2. Validate inventory and calculate total price
      for (const cartItem of mergedCart) {
        const { productId, quantity } = cartItem;

        const product = await tx.product.findUnique({
          where: { id: productId },
        });

        if (!product) throw new Error(`Product not found: ${productId}`);

        // Check area-specific stock if areaId is provided
        let areaDetail = null;
        if (areaId) {
          areaDetail = await tx.productAreaDetail.findUnique({
            where: { productId_areaId: { productId: product.id, areaId } }
          });

          // No row means this product is simply not sold in that area. Without
          // this the whole stock check was skipped, letting a caller order any
          // quantity of anything by naming an area it isn't stocked in.
          if (!areaDetail) {
            throw new Error(`Not enough stock for ${product.name} in this area.`);
          }

          if (areaDetail.stockQuantity < quantity) {
            throw new Error(`Not enough stock for ${product.name} in this area. Requested: ${quantity}, Available: ${areaDetail.stockQuantity}`);
          }
        } else {
          // Fallback to global stock check
          if (product.stockQuantity < quantity) {
            throw new Error(`Not enough stock for ${product.name}. Requested: ${quantity}, Available: ${product.stockQuantity}`);
          }
        }

        const itemCost = Number(product.price);
        totalAmountDue += itemCost * quantity;

        let cooldownEndAt: Date = new Date(); // Default to now (immediate delivery)
        if (areaDetail && areaDetail.cooldownMinutes > 0) {
          cooldownEndAt.setMinutes(cooldownEndAt.getMinutes() + areaDetail.cooldownMinutes);
        }

        // Reserve unique per-unit stock items (FIFO) for this area, if they exist.
        let reservedUnits: Array<{ id: string }> = [];
        if (areaDetail) {
          const availableCount = await tx.stockItem.count({
            where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" }
          });

          if (availableCount > 0) {
            if (availableCount < quantity) {
              throw new Error(`Not enough unique units for ${product.name} in this area. Requested: ${quantity}, Available: ${availableCount}`);
            }
            reservedUnits = await tx.stockItem.findMany({
              where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" },
              orderBy: { createdAt: "asc" },
              take: quantity,
              select: { id: true }
            });

            // Claim atomically: only rows still AVAILABLE flip to USED. Without
            // the status predicate two buyers who read the same row would both
            // be assigned it and receive the same pickup location.
            const claimed = await tx.stockItem.updateMany({
              where: { id: { in: reservedUnits.map((u) => u.id) }, status: "AVAILABLE" },
              data: { status: "USED" }
            });
            if (claimed.count !== reservedUnits.length) {
              throw new Error("Not enough stock — those units were just taken by another customer.");
            }
          }
        }

        for (let i = 0; i < quantity; i++) {
          orderItemsData.push({
            productId: product.id,
            priceAtPurchase: product.price,
            status: "COOLDOWN_ACTIVE",
            areaId: areaId,
            cooldownEndAt,
            stockItemId: reservedUnits[i] ? reservedUnits[i].id : null,
          });
        }
        
        if (!updatedProductIds.includes(product.id)) {
          updatedProductIds.push(product.id);
        }
        
        // Deduct stock - use area-specific if available, otherwise global.
        // Both decrements carry their own "still enough left" predicate so a
        // concurrent order cannot drive the counter negative between the check
        // above and the write here.
        if (areaDetail) {
          const areaTaken = await tx.productAreaDetail.updateMany({
            where: { id: areaDetail.id, stockQuantity: { gte: quantity } },
            data: { stockQuantity: { decrement: quantity } }
          });
          if (areaTaken.count === 0) {
            throw new Error(`Not enough stock for ${product.name} in this area.`);
          }

          // Create stock entry for the sale
          await tx.stockEntry.create({
            data: {
              productAreaDetailId: areaDetail.id,
              quantity: -quantity,
              type: "SALE",
              notes: `Order checkout - ${quantity} unit(s)`,
              createdBy: session.userId
            }
          });

          // Global stock mirrors the sum of the areas; the area gate above is
          // the real check, so this follows unconditionally.
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } }
          });
        } else {
          // No area: the global counter is the only gate.
          const taken = await tx.product.updateMany({
            where: { id: product.id, stockQuantity: { gte: quantity } },
            data: { stockQuantity: { decrement: quantity } }
          });
          if (taken.count === 0) {
            throw new Error(`Not enough stock for ${product.name}.`);
          }
        }
      }

      // 3. Apply discounts.
      //
      // The store-wide discount comes off first and a coupon then applies to
      // what is left, so the two stack without either one ever being computed
      // against money the customer is no longer being charged.
      const storeDiscount = ongoingDiscountAmount(totalAmountDue, ongoing);
      const afterStoreDiscount = parseFloat((totalAmountDue - storeDiscount).toFixed(2));

      let finalAmount = afterStoreDiscount;
      if (coupon) {
        // Check minimum order amount
        if (coupon.minOrderAmount && afterStoreDiscount < Number(coupon.minOrderAmount)) {
          throw new Error(`Minimum order amount of $${coupon.minOrderAmount} required for this coupon`);
        }

        // Calculate discount
        if (coupon.discountType === "PERCENTAGE") {
          discount = (afterStoreDiscount * Number(coupon.discountValue)) / 100;
          // Apply max discount limit if set
          if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
            discount = Number(coupon.maxDiscount);
          }
        } else if (coupon.discountType === "FIXED_AMOUNT") {
          discount = Number(coupon.discountValue);
          // Don't allow discount to exceed order amount
          if (discount > afterStoreDiscount) {
            discount = afterStoreDiscount;
          }
        }

        finalAmount = afterStoreDiscount - discount;
      }

      finalAmount = Math.max(0, parseFloat(finalAmount.toFixed(2)));

      // 4. Handle Wallet Payment
      if (paymentMethod === "WALLET") {
        // Debit only if the balance still covers it. Reading the balance and
        // then decrementing lets two checkouts fired at once both pass the
        // check and spend the same money twice; the predicate makes the debit
        // atomic, and 0 rows updated means the funds are no longer there.
        const debited = await tx.wallet.updateMany({
          where: { id: wallet.id, balance: { gte: finalAmount } },
          data: { balance: { decrement: finalAmount } },
        });
        if (debited.count === 0) {
          throw new Error("Insufficient wallet balance. Please deposit funds or select Crypto.");
        }

        // Create ledger entry
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -finalAmount,
            description:
              `Checkout of ${cart.length} item(s)` +
              (storeDiscount > 0 ? ` · ${ongoing.percent}% store discount (−$${storeDiscount.toFixed(2)})` : "") +
              (coupon ? ` · coupon ${coupon.code} (−$${discount.toFixed(2)})` : ""),
          },
        });
      }

      // 5. Create Master Order and OrderItems
      const createdOrder = await tx.order.create({
        data: {
          userId: session.userId,
          totalAmount: finalAmount,
          status: "COOLDOWN_ACTIVE",
          orderSource: "WEBSITE",
          paymentMethod: paymentMethod || "WALLET",
          items: {
            create: orderItemsData.map(item => ({
              ...item,
              status: "COOLDOWN_ACTIVE"
            })),
          },
        },
        include: {
          items: {
            include: { product: true }
          }
        },
      });

      // 6. Record coupon usage if coupon was applied
      if (coupon && discount > 0) {
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            userId: session.userId,
            orderId: createdOrder.id,
            discount: discount,
          },
        });

        // Increment coupon used count
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return createdOrder;
    }, CHECKOUT_TX_OPTIONS);

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    const msg = error?.message || "";
    const isUserError = msg.includes("Insufficient") || msg.includes("Not enough stock") || msg.includes("another customer");
    return NextResponse.json({ error: isUserError ? msg : "Checkout failed" }, { status: isUserError ? 400 : 500 });
  }
}
