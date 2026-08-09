import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyRestockSubscribersForArea } from "@/lib/restock";

export async function GET() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true, prefixCode: true } },
      cities: { select: { id: true, name: true } },
      areas: { select: { id: true, name: true } },
      areaDetails: {
        include: {
          area: { select: { id: true, name: true } },
          stockItems: { where: { status: "AVAILABLE" }, orderBy: { createdAt: "asc" as const } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    products: products.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      originalPrice: p.originalPrice ?? null,
      currency: p.currency,
      formula: p.formula,
      casNumber: p.casNumber,
      imageUrl: p.imageUrl,
      stockQuantity: p.stockQuantity,
      productType: p.productType || null,
      categoryId: p.category?.id || null,
      categoryName: p.category?.name || null,
      cities: p.cities,
      areas: p.areas,
      areaDetails: p.areaDetails,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized. Only admins can create products." }, { status: 403 });
  }

  const { name, description, price, originalPrice, formula, casNumber, imageUrl, productType, currency, stockQuantity, cityIds, areaIds, areaStocks } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Product name must be at least 2 characters" }, { status: 400 });
  }
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Product with this name already exists" }, { status: 400 });
  }

  let totalStock = parseInt(stockQuantity || "0", 10);
  if (areaStocks && Array.isArray(areaStocks)) {
    totalStock = areaStocks.reduce((sum: number, a: any) => sum + (parseInt(a.quantity, 10) || 0), 0);
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      price: parseFloat(price),
      originalPrice: originalPrice !== undefined && originalPrice !== null && originalPrice !== "" ? parseFloat(originalPrice) : null,
      currency: currency || "USD",
      formula: formula?.trim() || null,
      casNumber: casNumber?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      productType: productType?.trim() || null,
      stockQuantity: totalStock,
      cities: cityIds && cityIds.length > 0 ? { connect: cityIds.map((id: string) => ({ id })) } : undefined,
      areas: areaIds && areaIds.length > 0 ? { connect: areaIds.map((id: string) => ({ id })) } : undefined,
    },
  });

  if (areaStocks && Array.isArray(areaStocks)) {
    for (const { areaId, quantity } of areaStocks) {
      await prisma.productAreaDetail.create({
        data: {
          productId: product.id,
          areaId,
          stockQuantity: parseInt(quantity, 10) || 0,
        },
      });
    }
  }

  return NextResponse.json({ product });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { productId, name, description, price, originalPrice, formula, casNumber, imageUrl, currency, stockQuantity, cityIds, areaIds, productType, areaStocks } = await req.json();

  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  const existingProduct = await prisma.product.findUnique({ where: { id: productId } });
  if (!existingProduct) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  if (name && name.trim() !== existingProduct.name) {
    const nameConflict = await prisma.product.findUnique({ where: { name: name.trim() } });
    if (nameConflict) {
      return NextResponse.json({ error: "Another product with this name already exists" }, { status: 400 });
    }
  }

  if (price !== undefined && price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }

  // Staff run inventory, not the catalogue: they may move stock and change where
  // a product is offered, but every descriptive/pricing field is admin-only.
  // Enforced here and not only in the UI, since the panel is just one caller.
  const isStaff = session.role === "STAFF";

  const updateData: any = {};

  if (!isStaff) {
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (originalPrice !== undefined) {
      updateData.originalPrice = originalPrice === null || originalPrice === "" ? null : parseFloat(originalPrice);
    }
    if (currency !== undefined) updateData.currency = currency;
    if (formula !== undefined) updateData.formula = formula?.trim() || null;
    if (casNumber !== undefined) updateData.casNumber = casNumber?.trim() || null;
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
    if (productType !== undefined) updateData.productType = productType?.trim() || null;
  }

  if (cityIds !== undefined) {
    updateData.cities = { set: cityIds.map((id: string) => ({ id })) };
  }
  if (areaIds !== undefined) {
    updateData.areas = { set: areaIds.map((id: string) => ({ id })) };
  }

  // Un-selecting an area only detaches the `areas` relation, but the storefront
  // and the Telegram bot both offer delivery straight from ProductAreaDetail
  // rows. Left alone, a de-selected area keeps taking orders. Empty it out so
  // "not available here" actually means it - the ledger rows are kept.
  if (Array.isArray(areaIds)) {
    const orphaned = await prisma.productAreaDetail.findMany({
      where: { productId, areaId: { notIn: areaIds } },
      select: { id: true },
    });
    if (orphaned.length > 0) {
      const orphanedIds = orphaned.map((d) => d.id);
      await prisma.stockItem.deleteMany({
        where: { productAreaDetailId: { in: orphanedIds }, status: "AVAILABLE" },
      });
      await prisma.productAreaDetail.updateMany({
        where: { id: { in: orphanedIds } },
        data: { stockQuantity: 0 },
      });
    }
  }

  // Handle area-wise stock allocation
  const restockedAreaIds: string[] = [];

  if (areaStocks && Array.isArray(areaStocks)) {
    // Upsert stock for each area
    for (const { areaId, quantity } of areaStocks) {
      const newQty = parseInt(quantity, 10) || 0;

      // Read the previous quantity first: this is the only place in the save
      // that still sees the "before" value, so both the stock ledger and the
      // out-of-stock -> in-stock detection have to happen here.
      const before = await prisma.productAreaDetail.findUnique({
        where: { productId_areaId: { productId, areaId } },
        select: { id: true, stockQuantity: true },
      });
      const prevQty = before?.stockQuantity ?? 0;

      const saved = await prisma.productAreaDetail.upsert({
        where: { productId_areaId: { productId, areaId } },
        update: { stockQuantity: newQty },
        create: { productId, areaId, stockQuantity: newQty },
      });

      if (newQty !== prevQty) {
        await prisma.stockEntry.create({
          data: {
            productAreaDetailId: saved.id,
            quantity: newQty - prevQty,
            type: newQty > prevQty ? "RESTOCK" : "ADJUSTMENT",
            notes: `Inventory edit - stock set to ${newQty} unit(s)`,
            createdBy: session.userId,
          },
        });
      }

      if (prevQty <= 0 && newQty > 0) {
        restockedAreaIds.push(areaId);
      }
    }
    // Auto-compute total stock as sum of all area stocks
    const allAreaDetails = await prisma.productAreaDetail.findMany({ where: { productId } });
    const totalStock = allAreaDetails.reduce((sum: number, d: any) => sum + (d.stockQuantity || 0), 0);
    updateData.stockQuantity = totalStock;
  } else if (stockQuantity !== undefined) {
    // Fallback: direct stock quantity if no areaStocks provided
    updateData.stockQuantity = parseInt(stockQuantity, 10);
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: updateData,
  });

  // Fire-and-forget once the write has landed: customers waiting on this
  // product in this area hear about it as soon as stock is added, exactly as
  // they used to when restocking went through the old stock-entry screen.
  for (const areaId of restockedAreaIds) {
    void notifyRestockSubscribersForArea(productId, areaId);
  }

  return NextResponse.json({ product: updatedProduct });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId } = await req.json();
  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
  }

  await prisma.product.delete({ where: { id: productId } });
  return NextResponse.json({ success: true });
}
