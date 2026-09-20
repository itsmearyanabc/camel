import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { resolveWalletDisplay } from "@/lib/exchangeRates";
import { getOrCreateReferralCode, REFERRAL_BONUS_AMOUNT } from "@/lib/bonuses";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: {
        wallet: true,
        orders: {
          select: {
            totalAmount: true,
            status: true,
          },
        },
        // Joined into the query that already runs rather than counted
        // separately. This endpoint is hit on every dashboard load, and the
        // database is a free-tier instance with a small connection pool - two
        // extra COUNT round-trips per load is a real cost for two numbers that
        // are already on the row set being fetched.
        referrals: {
          select: { referralBonusGrantedAt: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const completedOrders = user.orders.filter(o => ["PAID", "READY", "COMPLETED"].includes(o.status));
    const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    // Shared with /api/dashboard/init: both ship a wallet to the same page, so
    // the currency and its rate are resolved in one place rather than twice.
    const { currency, exchangeRate } = await resolveWalletDisplay(user.wallet?.currency);

    // Backfills accounts created before the referral programme existed. The
    // write happens at most once in an account's life - every later load reads
    // the code straight off the row above and touches nothing.
    const referralCode = user.referralCode ?? (await getOrCreateReferralCode(user.id));
    const referralInvited = user.referrals.length;
    const referralEarned =
      user.referrals.filter((r) => r.referralBonusGrantedAt !== null).length * REFERRAL_BONUS_AMOUNT;

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: (user as any).avatarUrl,
        role: user.role,
        telegramUsername: user.telegramUsername,
        telegramId: user.telegramId,
        createdAt: user.createdAt.toISOString(),
        totalOrders: completedOrders.length,
        totalSpent,
        referralCode,
        referralInvited,
        referralEarned,
        wallet: {
          balance: user.wallet?.balance || 0.0,
          currency,
          exchangeRate,
        },
      },
    });
  } catch (error) {
    console.error("Auth /me error:", error);

    // Outside development a database failure must never be papered over with a
    // stand-in account: doing so hands every signed-in visitor the same fake
    // identity, complete with a fake wallet balance.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    // Local testing only: keep the dashboard usable without a database.
    return NextResponse.json({
      user: {
        id: "mock-user-123",
        username: "testcustomer",
        avatarUrl: null,
        role: "CUSTOMER",
        telegramUsername: "testcustomer",
        telegramId: "123456789",
        createdAt: new Date().toISOString(),
        totalOrders: 0,
        totalSpent: 0,
        referralCode: "TESTCODE",
        referralInvited: 0,
        referralEarned: 0,
        wallet: {
          balance: 1000.0,
          currency: "USD",
          exchangeRate: 1,
        },
      }
    });
  }
}
