import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let orders;
    
    // Admins and Staff see all orders in the system
    if (["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      orders = await prisma.order.findMany({
        include: {
          user: { select: { username: true, telegramUsername: true } },
          items: {
            include: { product: true }
          }
        },
        orderBy: { createdAt: "desc" },
      });
    } else {
      // Customers see only their own orders
      orders = await prisma.order.findMany({
        where: { userId: session.userId },
        include: {
          items: {
            include: { product: true }
          }
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Fetch orders list error:", error);
    return NextResponse.json({ error: "Internal server error fetching orders" }, { status: 500 });
  }
}
