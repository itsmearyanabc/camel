import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { getCurrencyMultiplier } from "@/lib/exchangeRates";

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
      },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    const completedOrders = user.orders.filter(o => ["PAID", "READY", "COMPLETED"].includes(o.status));
    const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const currency = user.wallet?.currency || "USD";
    const exchangeRate = await getCurrencyMultiplier(currency);

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
        wallet: {
          balance: 1000.0,
          currency: "USD",
          exchangeRate: 1,
        },
      }
    });
  }
}
