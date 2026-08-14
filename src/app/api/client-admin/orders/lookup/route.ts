import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseDeliveryMedia } from "@/lib/orderDelivery";

export const dynamic = "force-dynamic";

/** Matches a full order UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shortest prefix accepted, so a stray keystroke cannot list the whole table. */
const MIN_PREFIX = 6;

/**
 * Look an order up by the id a customer quotes.
 *
 * Customers are only ever shown the first 8 characters of an order id - that is
 * what appears in their notifications and Telegram messages - so a support
 * lookup that only accepted the full UUID would fail on every real complaint.
 * A prefix is matched too, and an ambiguous prefix returns the candidates
 * rather than guessing.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const raw = (req.nextUrl.searchParams.get("orderId") || "").trim().toLowerCase();
    // Customers paste ids with surrounding punctuation and "#" surprisingly often.
    const query = raw.replace(/^[#\s]+|[#\s.,]+$/g, "");

    if (query.length < MIN_PREFIX) {
      return NextResponse.json(
        { error: `Enter at least the first ${MIN_PREFIX} characters of the Order ID.` },
        { status: 400 }
      );
    }

    const include = {
      user: {
        select: {
          id: true,
          username: true,
          telegramUsername: true,
          telegramId: true,
          role: true,
          createdAt: true,
          wallet: { select: { balance: true, currency: true } },
        },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, variantLabel: true, productType: true, imageUrl: true } },
          area: { select: { id: true, name: true, city: { select: { name: true } } } },
        },
      },
      disputes: {
        include: { messages: { orderBy: { createdAt: "asc" as const } } },
        orderBy: { createdAt: "desc" as const },
      },
    };

    const order = UUID.test(query)
      ? await prisma.order.findUnique({ where: { id: query }, include })
      : null;

    if (!order) {
      // Prefix search. Two matches is already a support problem, so hand back
      // the candidates with enough detail to tell them apart instead of
      // silently picking one.
      const matches = await prisma.order.findMany({
        where: { id: { startsWith: query } },
        include,
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      if (matches.length === 0) {
        return NextResponse.json({ error: "No order found with that ID." }, { status: 404 });
      }
      if (matches.length > 1) {
        return NextResponse.json({
          ambiguous: true,
          candidates: matches.map((o) => ({
            id: o.id,
            status: o.status,
            createdAt: o.createdAt,
            username: o.user.username,
            totalAmount: o.totalAmount,
          })),
        });
      }
      return NextResponse.json({ order: shape(matches[0]) });
    }

    return NextResponse.json({ order: shape(order) });
  } catch (error) {
    console.error("Order lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Flatten an order into everything a support agent needs on one screen. */
function shape(order: any) {
  return {
    id: order.id,
    status: order.status,
    orderSource: order.orderSource,
    totalAmount: order.totalAmount,
    currency: order.currency,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,

    payment: {
      method: order.paymentMethod,
      provider: order.paymentProvider,
      status: order.paymentStatus,
      cryptoCurrency: order.cryptoCurrency,
      amountDue: order.cryptoAmountDue,
      paidAmount: order.paidAmount,
      paidCurrency: order.paidCurrency,
      providerPaymentId: order.providerPaymentId,
      providerInvoiceId: order.providerInvoiceId,
      paymentUrl: order.paymentUrl,
      expiresAt: order.paymentExpiresAt,
    },

    customer: {
      id: order.user.id,
      username: order.user.username,
      telegramUsername: order.user.telegramUsername,
      telegramId: order.user.telegramId,
      memberSince: order.user.createdAt,
      walletBalance: order.user.wallet?.balance ?? null,
      walletCurrency: order.user.wallet?.currency ?? null,
    },

    items: order.items.map((item: any) => ({
      id: item.id,
      productId: item.productId,
      productName: item.product?.name || "(deleted product)",
      productType: item.product?.productType || null,
      variantLabel: item.product?.variantLabel || null,
      imageUrl: item.product?.imageUrl || null,
      priceAtPurchase: item.priceAtPurchase,
      status: item.status,
      area: item.area ? { id: item.area.id, name: item.area.name, city: item.area.city?.name || null } : null,
      cooldownEndAt: item.cooldownEndAt,
      onPickupAt: item.onPickupAt,
      // The exact things the customer was handed - the usual dispute is "I got
      // nothing" or "the spot was empty", and this is the evidence for both.
      locationLink: item.locationLink,
      pickupVideoUrl: item.pickupVideoUrl,
      deliveryMedia: parseDeliveryMedia(item.deliveryMedia),
      adminMessage: item.adminMessage,
      adminMessageSentAt: item.adminMessageSentAt,
      // False here means the Telegram copy never landed, which is very often
      // the whole complaint.
      telegramDelivered: item.automatedMessageSent,
      cancellationReason: item.cancellationReason,
      stockItemId: item.stockItemId,
    })),

    disputes: order.disputes.map((dispute: any) => ({
      id: dispute.id,
      reason: dispute.reason,
      status: dispute.status,
      resolutionType: dispute.resolutionType,
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt,
      messages: dispute.messages.map((m: any) => ({
        id: m.id,
        senderRole: m.senderRole,
        senderName: m.senderName,
        message: m.message,
        createdAt: m.createdAt,
      })),
    })),
  };
}
