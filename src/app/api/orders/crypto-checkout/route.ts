import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCryptoInfo, CRYPTO_CURRENCIES } from "@/lib/currencies";
import {
  createNOWPaymentInvoice,
  mapToNOWPaymentsCurrency,
  isNOWPaymentsConfigured,
  getPublicBaseUrl,
} from "@/lib/nowpayments";
import { releaseOrderReservation } from "@/lib/orderReservation";

// How long a customer has to complete payment before the reclaim cron restores
// the stock they were holding.
const PAYMENT_WINDOW_MINUTES = 60;

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { cart, cryptoCurrency, areaId, couponCode } = await req.json();
    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return NextResponse.json({ error: "Cart is required" }, { status: 400 });
    }

    const gatewayEnabled = isNOWPaymentsConfigured();

    // "ANY" (or an omitted coin) lets the customer pick from every coin
    // NOWPayments supports on the hosted invoice page. A specific code pins the
    // invoice to that coin. The manual-address fallback has no such picker, so
    // there a concrete coin is still required.
    const wantsAnyCoin = !cryptoCurrency || cryptoCurrency === "ANY";

    let cryptoInfo = null;
    if (!wantsAnyCoin) {
      cryptoInfo = getCryptoInfo(cryptoCurrency);
      if (!cryptoInfo) {
        return NextResponse.json({
          error: "Unsupported cryptocurrency",
          supported: CRYPTO_CURRENCIES.map(c => c.code),
        }, { status: 400 });
      }
    } else if (!gatewayEnabled) {
      return NextResponse.json({
        error: "Please select a cryptocurrency",
        supported: CRYPTO_CURRENCIES.map(c => c.code),
      }, { status: 400 });
    }

    // Quantities are used both to price the order and to decrement stock, so a
    // non-positive or fractional value would corrupt the total and the ledger.
    for (const line of cart) {
      const quantity = Number(line?.quantity);
      if (!line?.productId || typeof line.productId !== "string") {
        return NextResponse.json({ error: "Invalid cart item" }, { status: 400 });
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return NextResponse.json({ error: "Invalid quantity in cart" }, { status: 400 });
      }
    }

    // Collapse duplicate lines for the same product so stock maths can't be
    // sidestepped by sending the same productId twice.
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
    for (let i = 0; i < mergedCart.length; i++) {
      const { productId, quantity } = mergedCart[i];

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

    // The manual flow needs one of our own receiving addresses. NOWPayments
    // issues a fresh deposit address per invoice, so requiring a configured
    // WALLET_* setting there would block checkout for no reason.
    let walletAddress: string | null = null;
    if (!gatewayEnabled) {
      const walletSetting = await prisma.setting.findUnique({
        where: { key: cryptoInfo!.settingKey },
      });

      if (!walletSetting || !walletSetting.value) {
        return NextResponse.json({ error: "Payment method not configured for this currency" }, { status: 400 });
      }
      walletAddress = walletSetting.value;
    }

    // Fetch estimated network fee for this currency
    let networkFee = 0;
    if (cryptoInfo) {
      const feeSetting = await prisma.setting.findUnique({
        where: { key: cryptoInfo.feeSettingKey },
      });
      const parsedFee = feeSetting ? parseFloat(feeSetting.value) : 0;
      networkFee = Number.isFinite(parsedFee) ? parsedFee : 0;
    }

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
      for (const cartItem of mergedCart) {
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
          cryptoCurrency: wantsAnyCoin ? null : cryptoCurrency,
          networkFee: networkFee,
          cryptoAmountDue: (finalAmount + networkFee).toFixed(2),
          paymentWalletAddress: walletAddress,
          paymentProvider: gatewayEnabled ? "NOWPAYMENTS" : null,
          paymentStatus: gatewayEnabled ? "waiting" : null,
          paymentExpiresAt: gatewayEnabled
            ? new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000)
            : null,
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
    const productName = mergedCart.length > 1
      ? `${firstProductName} and ${mergedCart.length - 1} more`
      : firstProductName;

    // Manual fallback: show the customer one of our own addresses and let an
    // admin confirm the transfer by hand.
    if (!gatewayEnabled) {
      console.warn("NOWPayments not configured for crypto-checkout, falling back to manual payment");
      return NextResponse.json({
        success: true,
        order: {
          id: order.id,
          productName,
          totalAmount: order.totalAmount,
          currency: order.currency,
          cryptoCurrency: cryptoCurrency,
          cryptoName: cryptoInfo!.name,
          network: cryptoInfo!.network,
          networkFee: networkFee,
          totalDue: finalAmount + networkFee,
          walletAddress: walletAddress,
          status: order.status,
          discount: discount > 0 ? discount : undefined,
          couponCode: coupon ? coupon.code : undefined,
        }
      });
    }

    // Generate NOWPayments Invoice
    const baseUrl = getPublicBaseUrl();
    if (!baseUrl) {
      // Without a public URL the IPN callback would never reach us and the
      // customer would pay into a void. Fail before taking any money.
      await prisma.$transaction((tx) =>
        releaseOrderReservation(tx, order.id, "Payment gateway misconfigured")
      );
      console.error("NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL is not set - refusing to create invoice");
      return NextResponse.json({
        error: "Payment gateway is not configured. Please contact support.",
      }, { status: 503 });
    }

    const invoiceResult = await createNOWPaymentInvoice({
      priceAmount: parseFloat((finalAmount + networkFee).toFixed(2)),
      priceCurrency: "usd",
      // Omitted for "ANY" so the hosted page shows the full coin picker.
      payCurrency: wantsAnyCoin ? null : mapToNOWPaymentsCurrency(cryptoCurrency),
      orderId: order.id,
      orderDescription: `Order ${order.id.slice(0, 8)} - ${firstProductName}`,
      ipnCallbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
      successUrl: `${baseUrl}/dashboard?payment=success&order=${order.id}`,
      cancelUrl: `${baseUrl}/dashboard?payment=cancelled&order=${order.id}`,
    });

    if (!invoiceResult.success || !invoiceResult.invoice) {
      // The order already holds stock and a coupon use. Hand them back now
      // rather than waiting an hour for the reclaim cron.
      await prisma.$transaction((tx) =>
        releaseOrderReservation(tx, order.id, "Payment gateway error")
      );
      console.error("NOWPayments error:", invoiceResult.error);
      return NextResponse.json({
        error: "Failed to generate payment gateway for checkout",
        details: invoiceResult.error
      }, { status: 502 });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        providerInvoiceId: String(invoiceResult.invoice.id),
        paymentUrl: invoiceResult.invoice.invoice_url,
      },
    });

    return NextResponse.json({
      success: true,
      paymentUrl: invoiceResult.invoice.invoice_url,
      invoiceId: invoiceResult.invoice.id,
      order: {
        id: order.id,
        productName,
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
