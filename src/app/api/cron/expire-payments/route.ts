import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNOWPaymentStatus, NOWPAYMENTS_SUCCESS_STATUSES } from "@/lib/nowpayments";
import { releaseOrderReservation } from "@/lib/orderReservation";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

/**
 * Reclaims stock from crypto orders that were never paid.
 *
 * Checkout reserves stock the moment the invoice is created so nobody else can
 * buy the same units while the customer is on the payment page. NOWPayments
 * only sends an IPN once a payment actually exists - a customer who opens the
 * invoice and closes the tab generates no callback at all, so without this job
 * those units would stay reserved forever and the product would look sold out.
 *
 * Before cancelling, each order is checked against the NOWPayments API so a
 * payment that settled while a webhook was lost is never thrown away.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();

    const staleOrders = await prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        paymentExpiresAt: { not: null, lte: now },
      },
      select: { id: true, providerPaymentId: true, providerInvoiceId: true, userId: true },
      take: 200,
    });

    let cancelledCount = 0;
    let rescuedCount = 0;

    for (const order of staleOrders) {
      // If a payment was ever attached, confirm with the gateway before
      // cancelling - a dropped webhook must not cost the customer their order.
      if (order.providerPaymentId) {
        const check = await getNOWPaymentStatus(order.providerPaymentId);
        if (check.success && check.status) {
          const status = check.status.payment_status;
          if ((NOWPAYMENTS_SUCCESS_STATUSES as readonly string[]).includes(status)) {
            console.warn(
              `expire-payments: order ${order.id} is actually ${status}; extending instead of cancelling`
            );
            // Push the deadline out and let the webhook (or a retry) finish the
            // job. Never fulfil an order from the cron - that path belongs to
            // the webhook, which does the full amount verification.
            await prisma.order.update({
              where: { id: order.id },
              data: {
                paymentStatus: status,
                paymentExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
              },
            });
            rescuedCount++;
            continue;
          }
          if (status === "partially_paid") {
            // Real money is against this order. Hold it for manual review.
            await prisma.order.update({
              where: { id: order.id },
              data: { paymentStatus: status, paymentExpiresAt: null },
            });
            rescuedCount++;
            continue;
          }
        } else {
          // Gateway unreachable - do not cancel on incomplete information.
          console.warn(
            `expire-payments: could not verify order ${order.id} (${check.error}); leaving it for the next run`
          );
          continue;
        }
      }

      const released = await prisma.$transaction((tx) =>
        releaseOrderReservation(tx, order.id, "Payment window expired")
      );

      if (released === "RELEASED") {
        cancelledCount++;
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "expired" },
        });
        await prisma.notification.create({
          data: {
            userId: order.userId,
            type: "ORDER_CANCELLED",
            title: "Order expired",
            message: `Order ${order.id.slice(0, 8)} was cancelled because payment was not completed in time. The items are available again.`,
            link: "/dashboard",
          },
        });
      }
    }

    // Deposit requests hold no stock, so they only need closing out for tidiness.
    const expiredDeposits = await prisma.depositRequest.updateMany({
      where: {
        status: "PENDING",
        paymentExpiresAt: { not: null, lte: now },
      },
      data: { status: "REJECTED", paymentStatus: "expired", updatedAt: now },
    });

    return NextResponse.json({
      success: true,
      cancelledCount,
      rescuedCount,
      expiredDeposits: expiredDeposits.count,
      scanned: staleOrders.length,
    });
  } catch (error) {
    console.error("expire-payments cron error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
