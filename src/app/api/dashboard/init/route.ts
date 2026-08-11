import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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
        wallet: { select: { balance: true, currency: true } },
        createdAt: true,
      }
    });
    
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const walletInfo = await prisma.wallet.findUnique({ where: { userId: user.id } });

    // The storefront only ever renders an area's name and its stock count.
    // Selecting the whole ProductAreaDetail row instead would ship every
    // pickup location, delivery message and uploaded photo/video to any
    // logged-in customer - i.e. hand out for free exactly what an order is
    // supposed to pay for. Keep this narrow.
    const publicAreaDetails = {
      select: {
        areaId: true,
        stockQuantity: true,
        area: { select: { id: true, name: true } },
      },
    } as const;

    const [categories, uncategorizedProducts, variantRows, cities, ledgers, orders, disputes, depositRequests, settings] = await Promise.all([
      prisma.category.findMany({
        include: { products: { include: { cities: true, areas: true, areaDetails: publicAreaDetails } } },
        orderBy: { createdAt: "asc" }
      }),
      prisma.product.findMany({
        where: { categoryId: null },
        include: { cities: true, areas: true, areaDetails: publicAreaDetails },
        orderBy: { createdAt: "asc" }
      }),
      // Quantity options (2g, 3g, ...) are separate Product rows. They are
      // fetched once here and folded into their parent below so the shop shows
      // one card per product with its options, not a card per option.
      prisma.product.findMany({
        where: { parentProductId: { not: null } },
        include: { cities: true, areas: true, areaDetails: publicAreaDetails },
        orderBy: { createdAt: "asc" }
      }),
      prisma.city.findMany({
        include: { areas: true },
        orderBy: { name: "asc" }
      }),
      walletInfo ? prisma.walletLedger.findMany({
        where: { walletId: walletInfo.id },
        orderBy: { createdAt: "desc" }
      }) : Promise.resolve([]),
      prisma.order.findMany({
        where: { userId: user.id },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.dispute.findMany({
        where: { userId: user.id },
        include: { messages: true, order: true },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.depositRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" }
      }),
      prisma.setting.findMany()
    ]);

    const cryptoSetting = settings.find(s => s.key === "cryptoWalletAddress");

    const variantsByParent = new Map<string, any[]>();
    for (const v of variantRows) {
      if (!v.parentProductId) continue;
      const list = variantsByParent.get(v.parentProductId) || [];
      list.push({
        id: v.id,
        variantLabel: v.variantLabel,
        price: v.price,
        originalPrice: v.originalPrice,
        stockQuantity: v.stockQuantity,
        cities: v.cities,
        areas: v.areas,
        areaDetails: v.areaDetails,
      });
      variantsByParent.set(v.parentProductId, list);
    }

    /**
     * Drop variant rows from a category listing and fold them into their
     * parent. A parent with options carries no stock itself, so what the shop
     * must gate on is the total across its options - and likewise its
     * cities/areas are unioned from the options, since the storefront's
     * location filter reads them and would otherwise hide a product whose
     * options are perfectly deliverable.
     */
    const withVariants = (list: any[]) =>
      list
        .filter((p: any) => !p.parentProductId)
        .map((p: any) => {
          const variants = variantsByParent.get(p.id) || [];
          if (variants.length === 0) return { ...p, variants };
          return {
            ...p,
            variants,
            stockQuantity: variants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0),
            cities: unionById(p.cities, variants.flatMap((v: any) => v.cities)),
            areas: unionById(p.areas, variants.flatMap((v: any) => v.areas)),
            areaDetails: mergeAreaDetails(variants),
          };
        });

    const allCategories: any[] = categories.map((c: any) => ({
      ...c,
      products: withVariants(c.products),
    }));

    // Add uncategorized products as an "Other" category if any exist
    const uncategorized = withVariants(uncategorizedProducts);
    if (uncategorized.length > 0) {
      allCategories.push({
        id: "other",
        name: "Other",
        prefixCode: null,
        description: null,
        products: uncategorized,
        createdAt: new Date(),
      } as any);
    }

    return NextResponse.json({
      user,
      categories: allCategories,
      cities,
      ledgers,
      orders,
      disputes,
      depositRequests,
      cryptoAddress: cryptoSetting?.value || "Not configured"
    });
  } catch (error: any) {
    console.error("Dashboard Init Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
