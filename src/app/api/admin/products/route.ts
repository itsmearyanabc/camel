import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true, prefixCode: true } },
      cities: { select: { id: true, name: true } },
      areas: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    products: products.map((p: any) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      formula: p.formula,
      casNumber: p.casNumber,
      imageUrl: p.imageUrl,
      stockQuantity: p.stockQuantity,
      categoryId: p.category.id,
      categoryName: p.category.name,
      cities: p.cities,
      areas: p.areas,
      createdAt: p.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, description, price, formula, casNumber, imageUrl, categoryId, currency, stockQuantity, cityIds, areaIds } = await req.json();

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Product name must be at least 2 characters" }, { status: 400 });
  }
  if (!price || price <= 0) {
    return NextResponse.json({ error: "Price must be a positive number" }, { status: 400 });
  }
  if (!categoryId) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Product with this name already exists" }, { status: 400 });
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId }, include: { products: true } });
  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  let code = null;
  if (category.prefixCode) {
    code = `${category.prefixCode}${category.products.length + 1}`;
  }

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      code,
      description: description?.trim() || null,
      price: parseFloat(price),
      currency: currency || "USD",
      formula: formula?.trim() || null,
      casNumber: casNumber?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      categoryId,
      stockQuantity: parseInt(stockQuantity || "0", 10),
      cities: cityIds && cityIds.length > 0 ? { connect: cityIds.map((id: string) => ({ id })) } : undefined,
      areas: areaIds && areaIds.length > 0 ? { connect: areaIds.map((id: string) => ({ id })) } : undefined,
    },
  });

  return NextResponse.json({ product });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId, name, description, price, formula, casNumber, imageUrl, currency, stockQuantity, cityIds, areaIds } = await req.json();

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

  const updateData: any = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description?.trim() || null;
  if (price !== undefined) updateData.price = parseFloat(price);
  if (currency !== undefined) updateData.currency = currency;
  if (formula !== undefined) updateData.formula = formula?.trim() || null;
  if (casNumber !== undefined) updateData.casNumber = casNumber?.trim() || null;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl?.trim() || null;
  if (stockQuantity !== undefined) updateData.stockQuantity = parseInt(stockQuantity, 10);
  
  if (cityIds !== undefined) {
    updateData.cities = { set: cityIds.map((id: string) => ({ id })) };
  }
  if (areaIds !== undefined) {
    updateData.areas = { set: areaIds.map((id: string) => ({ id })) };
  }

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: updateData,
  });

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
