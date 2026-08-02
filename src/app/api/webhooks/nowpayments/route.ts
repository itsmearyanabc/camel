import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  verifyNOWPaymentsIPN,
  getNOWPaymentStatus,
  NOWPAYMENTS_SUCCESS_STATUSES,
  NOWPAYMENTS_FAILURE_STATUSES,
} from "@/lib/nowpayments";
import { releaseOrderReservation } from "@/lib/orderReservation";

// Payment confirmation must never be served from a cache, and this route does
// per-request work regardless.
export const dynamic = "force-dynamic";

/**
 * Underpayment tolerance, in USD. Exchange-rate drift between invoice creation
 * and settlement routinely lands a cent or two short; anything beyond this is
 * treated as a genuine underpayment and held for manual review.
 */
const UNDERPAYMENT_TOLERANCE_USD = 0.5;

function escapeTelegramMarkdown(text: string) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

async function notifyTelegram(telegramId: string | null, message: string) {
  const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
  if (!telegramId || !botToken) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramId,
        text: message,
        parse_mode: "MarkdownV2",
      }),
    });
    if (!res.ok) {
      console.error("Telegram notify failed:", res.status, await res.text());
    }
  } catch (err) {
    // A failed notification must never fail the webhook - the payment is real
    // either way and NOWPayments would retry the whole callback.
    console.error("Telegram notify error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: Record<string, any>;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const signature = req.headers.get("x-nowpayments-sig");

    if (!signature) {
      console.error("NOWPayments webhook: Missing signature");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    if (!verifyNOWPaymentsIPN(body, signature)) {
      console.error("NOWPayments webhook: Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const orderId: string | undefined = body.order_id;
    const paymentId = body.payment_id != null ? String(body.payment_id) : null;

    if (!orderId || !paymentId) {
      console.error("NOWPayments webhook: missing order_id/payment_id", body);
      return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
    }

    // Re-fetch the payment from NOWPayments and treat that as the source of
    // truth. The signature already proves authenticity, but this also defends
    // against replayed bodies and any future drift in signing, and it is the
    // only way to be certain about the amount actually settled.
    let paymentStatus: string = body.payment_status;
    let priceAmount = Number(body.price_amount);
    let payCurrency: string | null = body.pay_currency ?? null;

    const authoritative = await getNOWPaymentStatus(paymentId);
    if (authoritative.success && authoritative.status) {
      const s = authoritative.status;
      if (String(s.order_id) !== String(orderId)) {
        console.error(
          `NOWPayments webhook: order_id mismatch. body=${orderId} api=${s.order_id}`
        );
        return NextResponse.json({ error: "Order mismatch" }, { status: 400 });
      }
      paymentStatus = s.payment_status;
      priceAmount = Number(s.price_amount);
      payCurrency = s.pay_currency ?? payCurrency;
    } else {
      // Verified signature but the API is unreachable. Proceed on the signed
      // body rather than dropping a real payment, and make it loud in the logs.
      console.warn(
        `NOWPayments webhook: could not re-verify payment ${paymentId} (${authoritative.error}); trusting signed body`
      );
    }

    console.log(
      `NOWPayments webhook: ${paymentStatus} for ${orderId} (payment ${paymentId})`
    );

    const isSuccess = (NOWPAYMENTS_SUCCESS_STATUSES as readonly string[]).includes(paymentStatus);
    const isFailure = (NOWPAYMENTS_FAILURE_STATUSES as readonly string[]).includes(paymentStatus);

    // ---------------------------------------------------------------
    // Wallet deposit
    // ---------------------------------------------------------------
    const depositRequest = await prisma.depositRequest.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (depositRequest) {
      if (isSuccess) {
        // Credit what actually settled, never more than was requested.
        const expected = Number(depositRequest.amount);
        if (Number.isFinite(priceAmount) && priceAmount + UNDERPAYMENT_TOLERANCE_USD < expected) {
          console.error(
            `NOWPayments deposit ${orderId} underpaid: expected ${expected}, got ${priceAmount}. Holding for review.`
          );
          await prisma.depositRequest.update({
            where: { id: orderId },
            data: {
              status: "PROCESSING",
              paymentStatus,
              providerPaymentId: paymentId,
              paidAmount: Number.isFinite(priceAmount) ? priceAmount : null,
              updatedAt: new Date(),
            },
          });
          return NextResponse.json({ success: true, message: "Underpaid - held for review" });
        }

        const result = await prisma.$transaction(async (tx) => {
          const current = await tx.depositRequest.findUnique({ where: { id: orderId } });
          if (!current || current.status === "APPROVED") return "ALREADY_PROCESSED";

          await tx.depositRequest.update({
            where: { id: orderId },
            data: {
              status: "APPROVED",
              paymentStatus,
              providerPaymentId: paymentId,
              paidAmount: Number.isFinite(priceAmount) ? priceAmount : null,
              updatedAt: new Date(),
            },
          });

          const wallet = await tx.wallet.findUnique({ where: { userId: current.userId } });
          if (wallet) {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                balance: { increment: current.amount },
                updatedAt: new Date(),
              },
            });

            await tx.walletLedger.create({
              data: {
                walletId: wallet.id,
                type: "DEPOSIT",
                amount: current.amount,
                description: `NOWPayments deposit (Payment ID: ${paymentId})`,
              },
            });
          }
          return "PROCESSED";
        });

        if (result === "ALREADY_PROCESSED") {
          return NextResponse.json({ success: true, message: "Already processed" });
        }

        await prisma.notification.create({
          data: {
            userId: depositRequest.userId,
            type: "GENERAL",
            title: "Deposit confirmed",
            message: `Your deposit of $${Number(depositRequest.amount).toFixed(2)} has been credited to your wallet.`,
            link: "/dashboard",
          },
        });

        await notifyTelegram(
          depositRequest.user.telegramId,
          `✅ *Deposit confirmed*\n\nYour wallet has been credited with $${escapeTelegramMarkdown(
            Number(depositRequest.amount).toFixed(2)
          )}\\.`
        );

        console.log(`Processed NOWPayments deposit ${orderId}`);
        return NextResponse.json({ success: true });
      }

      if (isFailure) {
        await prisma.depositRequest.updateMany({
          where: { id: orderId, status: { notIn: ["APPROVED"] } },
          data: { status: "REJECTED", paymentStatus, updatedAt: new Date() },
        });
        return NextResponse.json({ success: true });
      }

      // waiting / confirming / sending / partially_paid - just record progress.
      await prisma.depositRequest.updateMany({
        where: { id: orderId, status: { notIn: ["APPROVED"] } },
        data: { paymentStatus, updatedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    // ---------------------------------------------------------------
    // Direct product order
    // ---------------------------------------------------------------
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true },
    });

    if (!order) {
      console.error("NOWPayments webhook: order/deposit not found:", orderId);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (isSuccess) {
      // What we actually charged, including the network-fee markup.
      const expected = Number(order.cryptoAmountDue ?? order.totalAmount);

      if (Number.isFinite(priceAmount) && priceAmount + UNDERPAYMENT_TOLERANCE_USD < expected) {
        // Do not release goods. Leave stock reserved and flag for an admin -
        // cancelling here would let someone underpay to free another buyer's hold.
        console.error(
          `NOWPayments order ${orderId} underpaid: expected ${expected}, got ${priceAmount}. Holding for review.`
        );
        await prisma.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "underpaid",
            providerPaymentId: paymentId,
            paidAmount: Number.isFinite(priceAmount) ? priceAmount : null,
            paidCurrency: payCurrency,
            // Stop the reclaim cron from cancelling an order that has real money against it.
            paymentExpiresAt: null,
            updatedAt: new Date(),
          },
        });
        return NextResponse.json({ success: true, message: "Underpaid - held for review" });
      }

      const result = await prisma.$transaction(async (tx) => {
        const currentOrder = await tx.order.findUnique({
          where: { id: orderId },
          include: { items: true },
        });

        if (!currentOrder || currentOrder.status !== "PENDING_PAYMENT") {
          return "ALREADY_PROCESSED";
        }

        // Cooldown starts at payment confirmation, not at checkout, so a
        // customer who takes 40 minutes to pay still gets the full window.
        await tx.order.update({
          where: { id: orderId },
          data: {
            status: "COOLDOWN_ACTIVE",
            paymentStatus,
            providerPaymentId: paymentId,
            paidAmount: Number.isFinite(priceAmount) ? priceAmount : null,
            paidCurrency: payCurrency,
            paymentExpiresAt: null,
            updatedAt: new Date(),
          },
        });

        for (const item of currentOrder.items) {
          let cooldownMinutes = 0;
          if (item.areaId) {
            const areaDetail = await tx.productAreaDetail.findUnique({
              where: {
                productId_areaId: { productId: item.productId, areaId: item.areaId },
              },
            });
            if (areaDetail && areaDetail.cooldownMinutes > 0) {
              cooldownMinutes = areaDetail.cooldownMinutes;
            }
          }
          const cd = new Date();
          cd.setMinutes(cd.getMinutes() + cooldownMinutes);

          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: "COOLDOWN_ACTIVE", cooldownEndAt: cd },
          });
        }

        return "PROCESSED";
      });

      if (result === "ALREADY_PROCESSED") {
        return NextResponse.json({ success: true, message: "Already processed" });
      }

      await prisma.notification.create({
        data: {
          userId: order.userId,
          type: "GENERAL",
          title: "Payment confirmed",
          message: `Payment received for order ${order.id.slice(0, 8)}. Your order is now being prepared.`,
          link: `/dashboard/orders/${order.id}`,
        },
      });

      await notifyTelegram(
        order.user.telegramId,
        `✅ *Payment confirmed*\n\nOrder \`${escapeTelegramMarkdown(
          order.id.slice(0, 8)
        )}\` is confirmed and now being prepared\\. You will be notified when it is ready for pickup\\.`
      );

      console.log(`Processed NOWPayments order ${orderId}`);
      return NextResponse.json({ success: true });
    }

    if (isFailure) {
      const released = await prisma.$transaction((tx) =>
        releaseOrderReservation(tx, orderId, `Payment ${paymentStatus}`)
      );

      // A late "expired" for an order that was already paid and fulfilled must
      // not overwrite its payment state, so only record this against orders
      // still awaiting payment.
      await prisma.order.updateMany({
        where: { id: orderId, status: { in: ["PENDING_PAYMENT", "CANCELLED"] } },
        data: { paymentStatus, providerPaymentId: paymentId, updatedAt: new Date() },
      });

      if (released === "RELEASED") {
        await prisma.notification.create({
          data: {
            userId: order.userId,
            type: "ORDER_CANCELLED",
            title: "Payment not completed",
            message: `Order ${order.id.slice(0, 8)} was cancelled because the payment ${paymentStatus}. Any reserved items have been released.`,
            link: "/dashboard",
          },
        });

        await notifyTelegram(
          order.user.telegramId,
          `❌ *Payment ${escapeTelegramMarkdown(paymentStatus)}*\n\nOrder \`${escapeTelegramMarkdown(
            order.id.slice(0, 8)
          )}\` was cancelled\\. You can place a new order at any time\\.`
        );
      }

      console.log(`NOWPayments payment ${paymentStatus} for order ${orderId}`);
      return NextResponse.json({ success: true });
    }

    // partially_paid and the in-flight statuses: record progress, keep the
    // stock reserved, and stop the reclaim cron from cancelling an order that
    // already has funds against it.
    await prisma.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      data: {
        paymentStatus,
        providerPaymentId: paymentId,
        ...(paymentStatus === "partially_paid" ? { paymentExpiresAt: null } : {}),
        updatedAt: new Date(),
      },
    });

    if (paymentStatus === "partially_paid") {
      console.warn(`NOWPayments order ${orderId} is partially paid - awaiting the remainder`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing NOWPayments webhook:", error);
    // 500 makes NOWPayments retry, which is what we want for transient failures.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
