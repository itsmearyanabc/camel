import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Merge id-keyed rows (cities/areas), keeping the first of each id. */
function unionById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Map<string, T>();
  for (const list of lists) {
    for (const row of list || []) {
      if (!seen.has(row.id)) seen.set(row.id, row);
    }
  }
  return Array.from(seen.values());
}

/**
 * Roll every option's per-area stock up to the parent, so a product card can
 * still show "Cankaya (4)" when the stock actually sits on its 2g/3g rows.
 */
function mergeAreaDetails(variants: any[]): any[] {
  const byArea = new Map<string, any>();
  for (const variant of variants) {
    for (const detail of variant.areaDetails || []) {
      const existing = byArea.get(detail.areaId);
      if (existing) {
        existing.stockQuantity += detail.stockQuantity;
      } else {
        byArea.set(detail.areaId, { ...detail });
      }
    }
  }
  return Array.from(byArea.values());
}

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: { select: { id: true, name: true, prefixCode: true } },
        cities: { select: { id: true, name: true } },
        areas: { select: { id: true, name: true } },
        areaDetails: { select: { areaId: true, stockQuantity: true, area: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Attach each product's quantity options (2g, 3g, ...) to its parent and
    // drop them from the top level: a variant is bought through its parent's
    // card, never listed as a separate product.
    const variantsByParent = new Map<string, any[]>();
    for (const p of products) {
      if (!p.parentProductId) continue;
      const list = variantsByParent.get(p.parentProductId) || [];
      list.push({
        id: p.id,
        variantLabel: p.variantLabel,
        price: Number(p.price),
        originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
        stockQuantity: p.stockQuantity,
        cities: p.cities,
        areas: p.areas,
        areaDetails: p.areaDetails,
      });
      variantsByParent.set(p.parentProductId, list);
    }

    // Group products by productType (or category name as fallback, or "Other")
    const groupMap: Record<string, { name: string; prefixCode: string | null; products: any[] }> = {};

    for (const p of products) {
      if (p.parentProductId) continue;

      const variants = variantsByParent.get(p.id) || [];
      const groupKey = p.productType || p.category?.name || "Other";
      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          name: groupKey,
          prefixCode: p.category?.prefixCode || null,
          products: [],
        };
      }

      // A parent with options holds no stock of its own - what is buyable is
      // the sum of its options, and that is the number the storefront must
      // gate "out of stock" on. Its cities/areas are unioned from the options
      // for the same reason: the storefront filters on them, and a parent left
      // without locations would be hidden even though its options deliver.
      const stockQuantity =
        variants.length > 0
          ? variants.reduce((sum, v) => sum + v.stockQuantity, 0)
          : p.stockQuantity;

      groupMap[groupKey].products.push({
        ...p,
        variants,
        stockQuantity,
        cities: variants.length > 0 ? unionById(p.cities, variants.flatMap((v) => v.cities)) : p.cities,
        areas: variants.length > 0 ? unionById(p.areas, variants.flatMap((v) => v.areas)) : p.areas,
        areaDetails: variants.length > 0 ? mergeAreaDetails(variants) : p.areaDetails,
        price: Number(p.price),
        originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
      });
    }

    const categories = Object.values(groupMap).map(g => ({
      id: g.name,
      name: g.name,
      prefixCode: g.prefixCode,
      description: null,
      products: g.products,
    }));

    return NextResponse.json({ categories }, {
      headers: {
        // Never cache this. It is the only stock source the product page has,
        // and it is served through Cloudflare - an edge copy kept showing a
        // sold-out product as available for up to 90 seconds, which is exactly
        // the window in which a customer commits to buying something that is
        // already gone.
        "Cache-Control": "no-store",
      }
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
