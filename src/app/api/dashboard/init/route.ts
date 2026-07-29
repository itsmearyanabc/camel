import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        username: true,
        role: true,
        telegramId: true,
        telegramUsername: true,
        balance: true,
        createdAt: true,
      }
    });
    
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const [categories, cities, ledgers, orders, disputes, depositRequests, settings] = await Promise.all([
      prisma.category.findMany({
        include: { products: { include: { locations: true } } },
        orderBy: { sortOrder: "asc" }
      }),
      prisma.city.findMany({
        include: { areas: true },
        orderBy: { name: "asc" }
      }),
      prisma.ledgerEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.order.findMany({
        where: { userId: user.id },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.ticket.findMany({
        where: { userId: user.id },
        include: { messages: true, order: true },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.depositRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.systemSettings.findFirst()
    ]);

    return NextResponse.json({
      user,
      categories,
      cities,
      ledgers,
      orders,
      disputes,
      depositRequests,
      cryptoAddress: settings?.cryptoWalletAddress || "Not configured"
    });
  } catch (error: any) {
    console.error("Dashboard Init Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
