import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Total Sales (from orders that are at least PAID)
    const paidOrders = await prisma.order.findMany({
      where: {
        status: { in: ["ORDERED", "PROCESSING", "COMPLETED"] }
      }
    });
    const totalSales = paidOrders.reduce((sum, order) => sum + Number(order.totalAmount), 0);

    // 2. Order counts
    const totalOrders = await prisma.order.count();
    const activeOrders = await prisma.order.count({
      where: { status: { notIn: ["COMPLETED", "REFUNDED", "FAILED"] } }
    });

    // 3. User count
    const totalUsers = await prisma.user.count();

    // 4. Source breakdown
    const websiteOrdersCount = await prisma.order.count({ where: { orderSource: "WEBSITE" }});
    const telegramOrdersCount = await prisma.order.count({ where: { orderSource: "TELEGRAM" }});

    return NextResponse.json({
      stats: {
        totalSales,
        totalOrders,
        activeOrders,
        totalUsers,
        websiteOrdersCount,
        telegramOrdersCount,
      }
    });
  } catch (error) {
    console.error("Fetch stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
