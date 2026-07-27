import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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

  // Helper for "Today" specific metrics
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    // 1. ORDERS
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
      include: { items: true, user: true }
    });
    const prevOrders = await prisma.order.findMany({
      where: { createdAt: { gte: prevStart, lte: prevEnd } },
    });

    const currentRevenue = orders.filter(o => ["PAID", "COMPLETED"].includes(o.status)).reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const prevRevenue = prevOrders.filter(o => ["PAID", "COMPLETED"].includes(o.status)).reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const revenueGrowth = prevRevenue === 0 ? (currentRevenue > 0 ? 100 : 0) : ((currentRevenue - prevRevenue) / prevRevenue) * 100;

    const activeOrders = orders.filter(o => ["PENDING_PAYMENT", "PROCESSING"].includes(o.status)).length;
    const completedOrders = orders.filter(o => o.status === "COMPLETED").length;
    const cancelledOrders = orders.filter(o => ["FAILED", "REFUNDED"].includes(o.status)).length;
    const validOrders = orders.filter(o => ["PAID", "COMPLETED"].includes(o.status));
    const aov = validOrders.length > 0 ? currentRevenue / validOrders.length : 0;

    const websiteOrders = orders.filter(o => o.orderSource === "WEBSITE").length;
    const telegramOrders = orders.filter(o => o.orderSource === "TELEGRAM").length;

    // 2. USERS
    const newUsers = await prisma.user.count({ where: { createdAt: { gte: start, lte: end } } });
    const newUsersToday = await prisma.user.count({ where: { createdAt: { gte: startOfToday } } });
    const totalUsers = await prisma.user.count();

    // 3. CHART DATA
    const chartDataMap: Record<string, { date: string, revenue: number, orders: number }> = {};
    orders.forEach(o => {
      const dateStr = o.createdAt.toISOString().split("T")[0];
      if (!chartDataMap[dateStr]) chartDataMap[dateStr] = { date: dateStr, revenue: 0, orders: 0 };
      chartDataMap[dateStr].orders += 1;
      if (["PAID", "COMPLETED"].includes(o.status)) {
        chartDataMap[dateStr].revenue += Number(o.totalAmount);
      }
    });
    const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));

    // 4. INVENTORY
    const products = await prisma.product.findMany();
    const inStock = products.filter(p => p.stockQuantity >= 10).length;
    const lowStock = products.filter(p => p.stockQuantity > 0 && p.stockQuantity < 10).length;
    const outOfStock = products.filter(p => p.stockQuantity === 0).length;
    const productsNeedingRestock = lowStock + outOfStock;

    // Inventory Value
    const inventoryValue = products.reduce((sum, item) => sum + (Number(item.price) * item.stockQuantity), 0);

    // 5. TOP PRODUCTS
    const allOrderItems = await prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: start, lte: end }, status: { in: ["PAID", "COMPLETED"] } } },
      include: { product: true }
    });
    const productSalesMap: Record<string, { id: string, name: string, quantity: number, revenue: number }> = {};
    allOrderItems.forEach(item => {
      if (!productSalesMap[item.productId]) {
        productSalesMap[item.productId] = { id: item.productId, name: item.product.name, quantity: 0, revenue: 0 };
      }
      productSalesMap[item.productId].quantity += 1;
      productSalesMap[item.productId].revenue += Number(item.priceAtPurchase);
    });
    const topProducts = Object.values(productSalesMap).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    // 6. PAYMENTS & WALLET
    const totalWalletBalance = await prisma.wallet.aggregate({ _sum: { balance: true } });
    const depositsTodayData = await prisma.walletLedger.aggregate({
      where: { type: "DEPOSIT", createdAt: { gte: startOfToday } },
      _sum: { amount: true }
    });
    const depositsToday = depositsTodayData._sum.amount ? Number(depositsTodayData._sum.amount) : 0;
    
    // Overall Orders for payment breakdown & alerts
    const allTimeOrders = await prisma.order.findMany();
    const pendingCryptoPayments = allTimeOrders.filter(o => o.status === "PENDING_PAYMENT" && o.paymentMethod === "DIRECT_CRYPTO").length;
    const failedPayments = allTimeOrders.filter(o => o.status === "FAILED").length;
    
    const paymentBreakdownMap: Record<string, number> = {};
    validOrders.forEach(o => {
      const key = o.paymentMethod === "DIRECT_CRYPTO" ? (o.cryptoCurrency || "Crypto") : "Wallet";
      paymentBreakdownMap[key] = (paymentBreakdownMap[key] || 0) + 1;
    });
    const paymentBreakdown = Object.entries(paymentBreakdownMap).map(([name, value]) => ({ name, value }));

    // 7. CUSTOMER ANALYTICS
    const userOrderCounts: Record<string, { totalOrders: number, totalSpend: number, lastOrderTime: Date }> = {};
    allTimeOrders.forEach(o => {
      if (!userOrderCounts[o.userId]) {
        userOrderCounts[o.userId] = { totalOrders: 0, totalSpend: 0, lastOrderTime: o.createdAt };
      }
      userOrderCounts[o.userId].totalOrders += 1;
      if (["PAID", "COMPLETED"].includes(o.status)) {
        userOrderCounts[o.userId].totalSpend += Number(o.totalAmount);
      }
      if (o.createdAt > userOrderCounts[o.userId].lastOrderTime) {
        userOrderCounts[o.userId].lastOrderTime = o.createdAt;
      }
    });

    const activeCustomerIds = Object.keys(userOrderCounts);
    const totalCustomers = activeCustomerIds.length;
    const newCustomers = activeCustomerIds.filter(id => userOrderCounts[id].totalOrders === 1).length;
    const returningCustomers = totalCustomers - newCustomers;
    const totalLifetimeSpend = activeCustomerIds.reduce((sum, id) => sum + userOrderCounts[id].totalSpend, 0);
    const avgCustomerSpend = totalCustomers > 0 ? totalLifetimeSpend / totalCustomers : 0;
    
    let highestSpendingCustomer = { name: "N/A", amount: 0 };
    for (const [userId, stats] of Object.entries(userOrderCounts)) {
      if (stats.totalSpend > highestSpendingCustomer.amount) {
        const u = await prisma.user.findUnique({ where: { id: userId } });
        if (u) highestSpendingCustomer = { name: u.username, amount: stats.totalSpend };
      }
    }

    const thirtyDaysAgo = new Date(startOfToday);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const inactiveCustomers = activeCustomerIds.filter(id => userOrderCounts[id].lastOrderTime < thirtyDaysAgo).length;

    // 8. ALERTS
    const alerts = [];
    if (productsNeedingRestock > 0) {
      alerts.push({ type: "warning", message: `${productsNeedingRestock} product(s) need restocking soon.` });
    }
    if (pendingCryptoPayments > 0) {
      alerts.push({ type: "info", message: `${pendingCryptoPayments} pending crypto payment(s) awaiting blockchain confirmation.` });
    }
    const overdueOrders = allTimeOrders.filter(o => o.status === "PENDING_PAYMENT" && (new Date().getTime() - o.createdAt.getTime() > 86400000)).length;
    if (overdueOrders > 0) {
      alerts.push({ type: "danger", message: `${overdueOrders} order(s) are overdue (pending payment > 24h).` });
    }
    if (failedPayments > 5) {
      alerts.push({ type: "danger", message: `High number of failed payments (${failedPayments}). Check gateways.` });
    }

    // 9. RECENT ORDERS & ACTIVITY
    const recentOrders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } }
    });

    const recentUsers = await prisma.user.findMany({ take: 10, orderBy: { createdAt: 'desc' }, select: { id: true, username: true, createdAt: true }});
    const activityFeed = [
      ...recentUsers.map(u => ({ id: `u_${u.id}`, type: 'USER_REGISTERED', title: 'New Registration', description: `${u.username} joined`, time: u.createdAt })),
      ...recentOrders.slice(0, 10).map(o => ({ id: `o_${o.id}`, type: 'NEW_ORDER', title: 'New Order', description: `${o.user.username} placed order for $${o.totalAmount}`, time: o.createdAt }))
    ].sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 15);

    return NextResponse.json({
      kpis: {
        revenue: currentRevenue,
        revenueGrowth,
        totalOrders: orders.length,
        activeOrders,
        completedOrders,
        cancelledOrders,
        totalUsers,
        newUsersToday, // Specifically requested
        aov
      },
      sources: [
        { name: "Website Checkout", value: websiteOrders, fill: "#8884d8" },
        { name: "Telegram Bot", value: telegramOrders, fill: "#82ca9d" }
      ],
      chartData,
      inventory: {
        inStock,
        lowStock,
        outOfStock,
        value: inventoryValue,
        needingRestock: productsNeedingRestock
      },
      payments: {
        totalWalletBalance: Number(totalWalletBalance._sum.balance || 0),
        depositsToday,
        pendingCryptoPayments,
        failedPayments,
        breakdown: paymentBreakdown
      },
      customerAnalytics: {
        totalCustomers,
        newCustomers,
        returningCustomers,
        avgSpend: avgCustomerSpend,
        highestSpendingCustomer,
        inactiveCustomers
      },
      topProducts,
      alerts,
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

