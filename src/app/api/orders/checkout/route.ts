import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
      for (const cartItem of cart) {
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
          
          if (areaDetail && areaDetail.stockQuantity < quantity) {
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

        for (let i = 0; i < quantity; i++) {
          orderItemsData.push({
            productId: product.id,
            priceAtPurchase: product.price,
            status: "COOLDOWN_ACTIVE",
            areaId: areaId,
            cooldownEndAt,
          });
        }
        
        if (!updatedProductIds.includes(product.id)) {
          updatedProductIds.push(product.id);
        }
        
        // Deduct stock - use area-specific if available, otherwise global
        if (areaDetail) {
          // Deduct from area-specific stock
          await tx.productAreaDetail.update({
            where: { id: areaDetail.id },
            data: { stockQuantity: { decrement: quantity } }
          });
          
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
          
          // Update global stock as well
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } }
          });
        } else {
          // Deduct from global stock only
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: quantity } }
          });
        }
      }

      // 3. Apply coupon discount if provided
      let finalAmount = totalAmountDue;
      if (coupon) {
        // Check minimum order amount
        if (coupon.minOrderAmount && totalAmountDue < Number(coupon.minOrderAmount)) {
          throw new Error(`Minimum order amount of $${coupon.minOrderAmount} required for this coupon`);
        }

        // Calculate discount
        if (coupon.discountType === "PERCENTAGE") {
          discount = (totalAmountDue * Number(coupon.discountValue)) / 100;
          // Apply max discount limit if set
          if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
            discount = Number(coupon.maxDiscount);
          }
        } else if (coupon.discountType === "FIXED_AMOUNT") {
          discount = Number(coupon.discountValue);
          // Don't allow discount to exceed order amount
          if (discount > totalAmountDue) {
            discount = totalAmountDue;
          }
        }

        finalAmount = totalAmountDue - discount;
      }

      // 4. Handle Wallet Payment
      if (paymentMethod === "WALLET") {
        if (Number(wallet.balance) < finalAmount) {
          throw new Error("Insufficient wallet balance. Please deposit funds or select Crypto.");
        }

        // Deduct from wallet balance
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { decrement: finalAmount } },
        });

        // Create ledger entry
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "PURCHASE",
            amount: -finalAmount,
            description: coupon 
              ? `Checkout of ${cart.length} item(s) with coupon ${coupon.code} (discount: $${discount.toFixed(2)})`
              : `Checkout of ${cart.length} item(s)`,
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
    });

    return NextResponse.json({ success: true, order });
  } catch (error: any) {
    const msg = error?.message || "";
    const isUserError = msg.includes("Insufficient") || msg.includes("Not enough stock") || msg.includes("another customer");
    return NextResponse.json({ error: isUserError ? msg : "Checkout failed" }, { status: isUserError ? 400 : 500 });
  }
}
