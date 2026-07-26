import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Helper to get start and end dates based on filter
function getDateRange(filter: string) {
  const now = new Date();
  let start = new Date();
  let end = new Date();
  let prevStart = new Date();
  let prevEnd = new Date();

  switch (filter) {
    case "today":
      start.setHours(0, 0, 0, 0);
      prevStart.setDate(start.getDate() - 1);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(start.getDate() - 1);
      prevEnd.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      
      prevStart.setDate(start.getDate() - 2);
      prevStart.setHours(0, 0, 0, 0);
      prevEnd.setDate(start.getDate() - 2);
      prevEnd.setHours(23, 59, 59, 999);
      break;
    case "last7":
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      prevStart.setDate(start.getDate() - 7);
      prevEnd = new Date(start);
      break;
    case "last30":
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
      prevStart.setDate(start.getDate() - 30);
      prevEnd = new Date(start);
      break;
    case "thisMonth":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    default:
      // "all"
      start = new Date(0); 
      prevStart = new Date(0);
      prevEnd = new Date(0);
      break;
  }
  return { start, end, prevStart, prevEnd };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const timeFilter = searchParams.get("filter") || "last30";
  const { start, end, prevStart, prevEnd } = getDateRange(timeFilter);

  try {
    // Current Period Orders
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: true }
    });

    // Previous Period Orders
    const prevOrders = await prisma.order.findMany({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
      include: { items: true }
    });

    // Calculate Current Revenue (Completed / Paid)
    const currentRevenue = orders
      .filter(o => ["PAID", "COMPLETED"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);
    
    const prevRevenue = prevOrders
      .filter(o => ["PAID", "COMPLETED"].includes(o.status))
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);

    const revenueGrowth = prevRevenue === 0 ? (currentRevenue > 0 ? 100 : 0) : ((currentRevenue - prevRevenue) / prevRevenue) * 100;

    // Order Counts
    const activeOrders = orders.filter(o => ["PENDING_PAYMENT", "PROCESSING"].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === "COMPLETED").length;
    const cancelledOrders = orders.filter(o => ["FAILED", "REFUNDED"].includes(o.status)).length;

    // Average Order Value
    const validOrders = orders.filter(o => ["PAID", "COMPLETED"].includes(o.status));
    const aov = validOrders.length > 0 ? currentRevenue / validOrders.length : 0;

    // Order Sources (Website vs Telegram)
    const websiteOrders = orders.filter(o => o.orderSource === "WEBSITE").length;
    const telegramOrders = orders.filter(o => o.orderSource === "TELEGRAM").length;
    // For simplicity, we just use these two as per current DB schema.

    // Customer Analytics
    const newUsers = await prisma.user.count({ where: { createdAt: { gte: start, lte: end } } });
    const totalUsers = await prisma.user.count();

    // Chart Data (Group revenue and orders by day)
    const chartDataMap: Record<string, { date: string, revenue: number, orders: number }> = {};
    orders.forEach(o => {
      const dateStr = o.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
      if (!chartDataMap[dateStr]) chartDataMap[dateStr] = { date: dateStr, revenue: 0, orders: 0 };
      chartDataMap[dateStr].orders += 1;
      if (["PAID", "COMPLETED"].includes(o.status)) {
        chartDataMap[dateStr].revenue += Number(o.totalAmount);
      }
    });
    // Sort chart data chronologically
    const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));

    // Inventory Snapshot
    const products = await prisma.product.findMany();
    const inStock = products.filter(p => p.stockState === "IN_STOCK").length;
    const lowStock = products.filter(p => p.stockState === "LOW_STOCK").length;
    const outOfStock = products.filter(p => ["OUT_OF_STOCK", "CRITICAL_STOCK"].includes(p.stockState)).length;

    // Recent Orders Table Data
    const recentOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } }
    });

    // Wallet / Payment Stats
    const totalWalletBalance = await prisma.wallet.aggregate({ _sum: { balance: true } });
    
    // Live Activity Feed (Combined recent users and orders)
    const recentUsers = await prisma.user.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, username: true, createdAt: true }});
    const activityFeed = [
      ...recentUsers.map(u => ({ id: `u_${u.id}`, type: 'USER_REGISTERED', title: 'New Registration', description: `${u.username} joined`, time: u.createdAt })),
      ...recentOrders.slice(0, 5).map(o => ({ id: `o_${o.id}`, type: 'NEW_ORDER', title: 'New Order', description: `${o.user.username} placed order for $${o.totalAmount}`, time: o.createdAt }))
    ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 10);

    return NextResponse.json({
      kpis: {
        revenue: currentRevenue,
        revenueGrowth: revenueGrowth,
        totalOrders: orders.length,
        activeOrders,
        completedOrders,
        cancelledOrders,
        newUsers,
        totalUsers,
        aov
      },
      sources: [
        { name: "Website", value: websiteOrders, fill: "#8884d8" },
        { name: "Telegram", value: telegramOrders, fill: "#82ca9d" }
      ],
      chartData,
      inventory: {
        inStock,
        lowStock,
        outOfStock
      },
      payments: {
        totalWalletBalance: totalWalletBalance._sum.balance || 0,
      },
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        customer: o.user.username,
        amount: Number(o.totalAmount),
        status: o.status,
        source: o.orderSource,
        time: o.createdAt
      })),
      activityFeed
    });
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
  }
}
