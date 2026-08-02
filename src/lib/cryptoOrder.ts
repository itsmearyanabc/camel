// Relative imports on purpose: this module is shared with the Telegram bot,
// which runs under tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";
import {
  createNOWPaymentInvoice,
  isNOWPaymentsConfigured,
  mapToNOWPaymentsCurrency,
  getPublicBaseUrl,
} from "./nowpayments";
import { releaseOrderReservation } from "./orderReservation";

/** Minutes a customer has to pay before the reclaim cron restores the stock. */
export const PAYMENT_WINDOW_MINUTES = 60;

export interface CryptoOrderResult {
  success: boolean;
  orderId?: string;
  paymentUrl?: string;
  amountDue?: number;
  discount?: number;
  error?: string;
}

/**
 * Creates a single-product PENDING_PAYMENT order, reserves its stock, and
 * returns a hosted NOWPayments invoice URL for the customer to pay.
 *
 * This is the Telegram path. The website's multi-item cart goes through
 * /api/orders/crypto-checkout, which does the same thing across a whole cart;
 * both share the invoice creation, the reservation-release rollback, and the
 * IPN handler, so a payment behaves identically whichever surface it came from.
 *
 * Stock is reserved before the invoice exists so two buyers can't be sent to
 * pay for the same last unit. Every failure path after that point releases the
 * reservation immediately.
 */
export async function createCryptoOrderForProduct(params: {
  userId: string;
  productId: string;
  cryptoCurrency?: string | null;
  couponCode?: string;
  orderSource: "TELEGRAM" | "WEBSITE";
}): Promise<CryptoOrderResult> {
  const { userId, productId, couponCode, orderSource } = params;

  if (!isNOWPaymentsConfigured()) {
    return { success: false, error: "Crypto payments are not available right now." };
  }

  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL is not set - refusing to create invoice");
    return { success: false, error: "Crypto payments are not available right now." };
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return { success: false, error: "Product not found." };
  }

  const wantsAnyCoin = !params.cryptoCurrency || params.cryptoCurrency === "ANY";

  let created: { orderId: string; amountDue: number; discount: number };

  try {
    created = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the stock check and the decrement have
      // to be atomic or two concurrent buyers can both pass the check.
      const dbProduct = await tx.product.findUnique({ where: { id: productId } });
      if (!dbProduct || dbProduct.stockQuantity < 1) {
        throw new Error("This compound is currently out of stock.");
      }

      const basePrice = Number(dbProduct.price);
      let discount = 0;
      let coupon: { id: string; code: string } | null = null;

      if (couponCode) {
        const found = await tx.coupon.findUnique({
          where: { code: couponCode.toUpperCase() },
          include: { couponUsages: { where: { userId } } },
        });
        if (!found) throw new Error("Invalid coupon code.");
        if (!found.isActive) throw new Error("This coupon is no longer active.");

        const now = new Date();
        if (found.validFrom > now) throw new Error("This coupon is not yet valid.");
        if (found.validUntil && found.validUntil < now) throw new Error("This coupon has expired.");
        if (found.usageLimit && found.usedCount >= found.usageLimit) {
          throw new Error("This coupon has reached its usage limit.");
        }
        if (found.userLimit && found.couponUsages.length >= found.userLimit) {
          throw new Error("You have already used this coupon the maximum number of times.");
        }
        if (found.minOrderAmount && basePrice < Number(found.minOrderAmount)) {
          throw new Error(
            `Minimum order amount of $${Number(found.minOrderAmount).toFixed(2)} required for this coupon.`
          );
        }

        if (found.discountType === "PERCENTAGE") {
          discount = (basePrice * Number(found.discountValue)) / 100;
          if (found.maxDiscount && discount > Number(found.maxDiscount)) {
            discount = Number(found.maxDiscount);
          }
        } else if (found.discountType === "FIXED_AMOUNT") {
          discount = Number(found.discountValue);
          if (discount > basePrice) discount = basePrice;
        }
        discount = parseFloat(discount.toFixed(2));
        coupon = { id: found.id, code: found.code };
      }

      const finalAmount = parseFloat((basePrice - discount).toFixed(2));
      if (finalAmount <= 0) {
        throw new Error("This order has no payable amount.");
      }

      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { decrement: 1 } },
      });

      const order = await tx.order.create({
        data: {
          userId,
          totalAmount: finalAmount,
          status: "PENDING_PAYMENT",
          orderSource,
          paymentMethod: "DIRECT_CRYPTO",
          cryptoCurrency: wantsAnyCoin ? null : params.cryptoCurrency,
          cryptoAmountDue: finalAmount.toFixed(2),
          paymentProvider: "NOWPAYMENTS",
          paymentStatus: "waiting",
          paymentExpiresAt: new Date(Date.now() + PAYMENT_WINDOW_MINUTES * 60 * 1000),
          items: {
            create: [
              {
                productId: dbProduct.id,
                priceAtPurchase: finalAmount,
                status: "PENDING_PAYMENT",
                cooldownEndAt: new Date(),
              },
            ],
          },
        },
      });

      if (coupon && discount > 0) {
        await tx.couponUsage.create({
          data: { couponId: coupon.id, userId, orderId: order.id, discount },
        });
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      return { orderId: order.id, amountDue: finalAmount, discount };
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Could not create the order.",
    };
  }

  const invoiceResult = await createNOWPaymentInvoice({
    priceAmount: created.amountDue,
    priceCurrency: "usd",
    payCurrency: wantsAnyCoin ? null : mapToNOWPaymentsCurrency(params.cryptoCurrency!),
    orderId: created.orderId,
    orderDescription: `Order ${created.orderId.slice(0, 8)} - ${product.name}`,
    ipnCallbackUrl: `${baseUrl}/api/webhooks/nowpayments`,
    successUrl: `${baseUrl}/dashboard?payment=success&order=${created.orderId}`,
    cancelUrl: `${baseUrl}/dashboard?payment=cancelled&order=${created.orderId}`,
  });

  if (!invoiceResult.success || !invoiceResult.invoice) {
    // Give the stock and coupon back straight away rather than making the
    // customer wait for the reclaim cron.
    await prisma.$transaction((tx) =>
      releaseOrderReservation(tx, created.orderId, "Payment gateway error")
    );
    console.error("NOWPayments error:", invoiceResult.error);
    return { success: false, error: "Could not open the payment page. Please try again." };
  }

  await prisma.order.update({
    where: { id: created.orderId },
    data: {
      providerInvoiceId: String(invoiceResult.invoice.id),
      paymentUrl: invoiceResult.invoice.invoice_url,
    },
  });

  return {
    success: true,
    orderId: created.orderId,
    paymentUrl: invoiceResult.invoice.invoice_url,
    amountDue: created.amountDue,
    discount: created.discount,
  };
}
