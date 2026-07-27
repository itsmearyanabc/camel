import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    include: { products: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    categories: categories.map((c: any) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      productCount: c.products.length,
      createdAt: c.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, description, prefixCode } = await req.json();
  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: "Category name must be at least 2 characters" }, { status: 400 });
  }

  const existing = await prisma.category.findUnique({ where: { name: name.trim() } });
  if (existing) {
    return NextResponse.json({ error: "Category already exists" }, { status: 400 });
  }

  if (prefixCode) {
    const existingPrefix = await prisma.category.findUnique({ where: { prefixCode: prefixCode.trim().toUpperCase() } });
    if (existingPrefix) {
      return NextResponse.json({ error: "Category prefix code already exists" }, { status: 400 });
    }
  }

  const category = await prisma.category.create({
    data: { 
      name: name.trim(), 
      description: description?.trim() || null,
      prefixCode: prefixCode ? prefixCode.trim().toUpperCase() : null
    },
  });

  return NextResponse.json({ category });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { categoryId } = await req.json();
  if (!categoryId) {
    return NextResponse.json({ error: "Category ID is required" }, { status: 400 });
  }

  await prisma.category.delete({ where: { id: categoryId } });
  return NextResponse.json({ success: true });
}
