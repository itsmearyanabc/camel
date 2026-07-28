import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: { select: { id: true, name: true, prefixCode: true } },
        cities: { select: { id: true, name: true } },
        areas: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Group products by productType (or category name as fallback, or "Other")
    const groupMap: Record<string, { name: string; prefixCode: string | null; products: any[] }> = {};

    for (const p of products) {
      const groupKey = p.productType || p.category?.name || "Other";
      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          name: groupKey,
          prefixCode: p.category?.prefixCode || null,
          products: [],
        };
      }
      groupMap[groupKey].products.push({
        ...p,
        price: Number(p.price),
      });
    }

    const categories = Object.values(groupMap).map(g => ({
      id: g.name,
      name: g.name,
      prefixCode: g.prefixCode,
      description: null,
      products: g.products,
    }));

    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
