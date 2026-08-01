import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCryptoInfo, CRYPTO_CURRENCIES } from "@/lib/currencies";
import { createNOWPaymentInvoice, mapToNOWPaymentsCurrency, isNOWPaymentsConfigured } from "@/lib/nowpayments";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cart, cryptoCurrency, areaId, couponCode } = await req.json();
    if (!cart || !Array.isArray(cart) || cart.length === 0 || !cryptoCurrency) {
      return NextResponse.json({ error: "Cart and crypto currency are required" }, { status: 400 });
    }

    // Validate crypto currency
    const cryptoInfo = getCryptoInfo(cryptoCurrency);
    if (!cryptoInfo) {
      return NextResponse.json({ 
        error: "Unsupported cryptocurrency",
        supported: CRYPTO_CURRENCIES.map(c => c.code),
      }, { status: 400 });
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

    let totalAmountDue = 0;
    const orderItemsData: Array<{
      productId: string;
      priceAtPurchase: any;
      status: string;
      areaId: string | undefined;
      cooldownEndAt: Date;
      stockItemId: string | null;
    }> = [];
    let firstProductName = "Multiple Items";

    // Validate inventory and calculate total price
    for (let i = 0; i < cart.length; i++) {
      const { productId, quantity } = cart[i];
      
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return NextResponse.json({ error: `Product not found: ${productId}` }, { status: 404 });
      }

      if (i === 0) firstProductName = product.name;

      // Check area-specific stock if areaId is provided
      let areaDetail = null;
      if (areaId) {
        areaDetail = await prisma.productAreaDetail.findUnique({
          where: { productId_areaId: { productId: product.id, areaId } }
        });
        
        if (areaDetail && areaDetail.stockQuantity < quantity) {
          return NextResponse.json({ error: `Not enough stock for ${product.name} in this area. Requested: ${quantity}, Available: ${areaDetail.stockQuantity}` }, { status: 400 });
        }
      } else {
        // Fallback to global stock check
        if (product.stockQuantity < quantity) {
          return NextResponse.json({ error: `Not enough stock for ${product.name}. Requested: ${quantity}, Available: ${product.stockQuantity}` }, { status: 400 });
        }
      }

      const itemCost = Number(product.price);
      totalAmountDue += itemCost * quantity;

      let cooldownEndAt: Date = new Date();
      if (areaDetail && areaDetail.cooldownMinutes > 0) {
        cooldownEndAt.setMinutes(cooldownEndAt.getMinutes() + areaDetail.cooldownMinutes);
      }

      for (let j = 0; j < quantity; j++) {
        orderItemsData.push({
          productId: product.id,
          priceAtPurchase: product.price,
          status: "PENDING_PAYMENT",
          areaId,
          cooldownEndAt,
          stockItemId: null, // reserved inside the transaction below
        });
      }
    }

    // Fetch the admin's wallet address for this currency
    const walletSetting = await prisma.setting.findUnique({
      where: { key: cryptoInfo.settingKey },
    });

    if (!walletSetting || !walletSetting.value) {
      return NextResponse.json({ error: "Payment method not configured for this currency" }, { status: 400 });
    }

    // Fetch estimated network fee for this currency
    const feeSetting = await prisma.setting.findUnique({
      where: { key: cryptoInfo.feeSettingKey },
    });
    const networkFee = feeSetting ? parseFloat(feeSetting.value) : 0;

    // Apply coupon discount if provided
    let finalAmount = totalAmountDue;
    if (coupon) {
      // Check minimum order amount
      if (coupon.minOrderAmount && totalAmountDue < Number(coupon.minOrderAmount)) {
        return NextResponse.json({ 
          error: `Minimum order amount of $${coupon.minOrderAmount} required for this coupon` 
        }, { status: 400 });
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

    // Create master order with PENDING_PAYMENT status and deduct stock in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Deduct stock for each product and reserve unique per-unit stock items (FIFO)
      for (const cartItem of cart) {
        const { productId, quantity } = cartItem;
        let reservedUnits: Array<{ id: string }> = [];
        
        // Check if we have area-specific stock
        if (areaId) {
          const areaDetail = await tx.productAreaDetail.findUnique({
            where: { productId_areaId: { productId, areaId } }
          });
          
          if (areaDetail) {
            // Reserve unique per-unit stock items (FIFO) if they exist
            const availableCount = await tx.stockItem.count({
              where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" }
            });
            if (availableCount > 0) {
              if (availableCount < quantity) {
                throw new Error(`Not enough unique units for product in this area. Requested: ${quantity}, Available: ${availableCount}`);
              }
              reservedUnits = await tx.stockItem.findMany({
                where: { productAreaDetailId: areaDetail.id, status: "AVAILABLE" },
                orderBy: { createdAt: "asc" },
                take: quantity,
                select: { id: true }
              });
              await tx.stockItem.updateMany({
                where: { id: { in: reservedUnits.map((u) => u.id) } },
                data: { status: "USED" }
              });
            }

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
                notes: `Crypto order checkout - ${quantity} unit(s)`,
                createdBy: session.userId
              }
            });
          }
        }
        
        // Always deduct from global stock
        await tx.product.update({
          where: { id: productId },
          data: { stockQuantity: { decrement: quantity } }
        });

        // Assign reserved per-unit stock items to this product's order items (FIFO)
        if (reservedUnits.length > 0) {
          let idx = 0;
          for (const item of orderItemsData) {
            if (item.productId === productId && item.stockItemId === null && idx < reservedUnits.length) {
              item.stockItemId = reservedUnits[idx].id;
              idx++;
            }
          }
        }
      }

      // Create the order
      const createdOrder = await tx.order.create({
        data: {
          userId: session.userId,
          totalAmount: finalAmount,
          status: "PENDING_PAYMENT",
          orderSource: "WEBSITE",
          paymentMethod: "DIRECT_CRYPTO",
          cryptoCurrency: cryptoCurrency,
          networkFee: networkFee,
          cryptoAmountDue: (finalAmount + networkFee).toFixed(2),
          paymentWalletAddress: walletSetting.value,
          items: {
            create: orderItemsData,
          }
        },
      });

      // Record coupon usage if coupon was applied
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
    // Check if NOWPayments is configured
    if (!isNOWPaymentsConfigured()) {
      console.warn("NOWPayments not configured for crypto-checkout, falling back to manual deposit");
      return NextResponse.json({ 
        success: true, 
        order: {
          id: order.id,
          productName: cart.length > 1 ? `${firstProductName} and ${cart.length - 1} more` : firstProductName,
          totalAmount: order.totalAmount,
          currency: order.currency,
          cryptoCurrency: cryptoCurrency,
          cryptoName: cryptoInfo.name,
          network: cryptoInfo.network,
          networkFee: networkFee,
          totalDue: finalAmount + networkFee,
          walletAddress: walletSetting.value,
          status: order.status,
          discount: discount > 0 ? discount : undefined,
          couponCode: coupon ? coupon.code : undefined,
        }
      });
    }

    // Generate NOWPayments Invoice
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://camel971.com";
    const nowpaymentsCurrency = mapToNOWPaymentsCurrency(cryptoCurrency);
    
    const invoiceResult = await createNOWPaymentInvoice({
      priceAmount: parseFloat((finalAmount + networkFee).toFixed(2)),
      priceCurrency: "usd",
      payCurrency: nowpaymentsCurrency,
      orderId: order.id,
      orderDescription: `Order ${order.id.slice(0, 8)} - ${firstProductName}`,
      ipnCallbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      successUrl: `${baseUrl}/dashboard?payment=success`,
      cancelUrl: `${baseUrl}/dashboard?payment=cancelled`,
    });

    if (!invoiceResult.success || !invoiceResult.invoice) {
      console.error("NOWPayments error:", invoiceResult.error);
      return NextResponse.json({ 
        error: "Failed to generate payment gateway for checkout",
        details: invoiceResult.error 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      paymentUrl: invoiceResult.invoice.invoice_url,
      invoiceId: invoiceResult.invoice.id,
      order: {
        id: order.id,
        productName: cart.length > 1 ? `${firstProductName} and ${cart.length - 1} more` : firstProductName,
        totalDue: finalAmount + networkFee,
        status: order.status,
        discount: discount > 0 ? discount : undefined,
        couponCode: coupon ? coupon.code : undefined,
      }
    });

  } catch (error) {
    console.error("Crypto checkout error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
