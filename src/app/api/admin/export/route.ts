import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // orders, products, payments, users
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  let startDate: Date | undefined;
  let endDate: Date | undefined;

  if (start && end) {
    startDate = new Date(start);
    endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
  }

  let csvRows: string[] = [];

  try {
    if (type === "orders") {
      const orders = await prisma.order.findMany({
        where: startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : undefined,
        include: {
          user: true,
          items: { include: { product: true } }
        },
        orderBy: { createdAt: "desc" }
      });

      // We will create a detailed row for each order item, or just the order if no items
      csvRows.push(["Order ID", "Date", "Customer", "Customer ID", "Order Source", "Order Status", "Total Amount", "Currency", "Payment Method", "Product Name", "Product Price", "Item Status"].join(","));

      for (const order of orders) {
        const baseRow = [
          order.id,
          order.createdAt.toISOString(),
          `"${order.user.username}"`,
          order.user.id,
          order.orderSource,
          order.status,
          order.totalAmount.toString(),
          order.currency,
          order.paymentMethod
        ];

        if (order.items.length === 0) {
          csvRows.push([...baseRow, "", "", ""].join(","));
        } else {
          for (const item of order.items) {
            csvRows.push([
              ...baseRow,
              `"${item.product.name}"`,
              item.priceAtPurchase.toString(),
              item.status
            ].join(","));
          }
        }
      }

    } else if (type === "products") {
      const products = await prisma.product.findMany({
        include: { category: true, cities: true, areas: true }
      });
      csvRows.push(["Product ID", "Type/Category", "Name", "Stock Quantity", "Price", "Currency", "Cities", "Areas", "Created At"].join(","));
      
      for (const p of products) {
        csvRows.push([
          p.id,
          `"${p.productType || p.category?.name || ""}"`,
          `"${p.name}"`,
          p.stockQuantity.toString(),
          p.price.toString(),
          p.currency,
          `"${p.cities.map(c => c.name).join("; ")}"`,
          `"${p.areas.map(a => a.name).join("; ")}"`,
          p.createdAt.toISOString()
        ].join(","));
      }

    } else if (type === "payments") {
      const ledgers = await prisma.walletLedger.findMany({
        where: startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : undefined,
        include: { wallet: { include: { user: true } } },
        orderBy: { createdAt: "desc" }
      });
      csvRows.push(["Transaction ID", "Date", "User", "Type", "Amount", "Currency", "Description"].join(","));

      for (const l of ledgers) {
        csvRows.push([
          l.id,
          l.createdAt.toISOString(),
          `"${l.wallet.user.username}"`,
          l.type,
          l.amount.toString(),
          l.currency,
          `"${l.description || ""}"`
        ].join(","));
      }

    } else if (type === "users") {
      const users = await prisma.user.findMany({
        where: startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : undefined,
        orderBy: { createdAt: "desc" }
      });
      csvRows.push(["User ID", "Username", "Role", "Joined Date"].join(","));

      for (const u of users) {
        csvRows.push([
          u.id,
          `"${u.username}"`,
          u.role,
          u.createdAt.toISOString()
        ].join(","));
      }
    } else {
      return new NextResponse("Invalid report type", { status: 400 });
    }

    const csvContent = csvRows.join("\n");
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="export-${type}-${new Date().getTime()}.csv"`
      }
    });
  } catch (error) {
    console.error(error);
    return new NextResponse("Error generating report", { status: 500 });
  }
}
