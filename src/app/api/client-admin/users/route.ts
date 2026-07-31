import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      include: {
        wallet: true,
        orders: {
          include: {
            items: {
              include: {
                product: {
                  select: { name: true, imageUrl: true }
                }
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" },
    });

    const enrichedUsers = users.map(u => {
      const completedOrders = u.orders.filter(o => ["PAID", "READY", "COMPLETED"].includes(o.status));
      const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);

      return {
        id: u.id,
        username: u.username,
        role: u.role,
        telegramUsername: u.telegramUsername,
        telegramId: u.telegramId,
        createdAt: u.createdAt.toISOString(),
        totalOrders: u.orders.length,
        totalSpent,
        wallet: u.wallet ? { balance: u.wallet.balance } : { balance: 0 },
        orders: u.orders.map(o => ({
          id: o.id,
          status: o.status,
          totalAmount: o.totalAmount,
          currency: o.currency,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt.toISOString(),
          items: o.items.map(item => ({
            id: item.id,
            priceAtPurchase: item.priceAtPurchase,
            status: item.status,
            productName: item.product?.name || "Unknown",
          }))
        })),
      };
    });

    return NextResponse.json({ users: enrichedUsers });
  } catch (error) {
    console.error("Client Admin fetch users error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
