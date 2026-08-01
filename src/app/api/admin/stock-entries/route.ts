import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyRestockSubscribers, notifyRestockSubscribersForArea } from "@/lib/restock";

// GET - Fetch stock entries for a product area detail
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const productAreaDetailId = searchParams.get("productAreaDetailId");
  const productId = searchParams.get("productId");
  const areaId = searchParams.get("areaId");

  try {
    let whereClause: any = {};

    if (productAreaDetailId) {
      whereClause.productAreaDetailId = productAreaDetailId;
    } else if (productId && areaId) {
      // Find the ProductAreaDetail first
      const pad = await prisma.productAreaDetail.findUnique({
        where: { productId_areaId: { productId, areaId } }
      });
      if (!pad) {
        return NextResponse.json({ entries: [] });
      }
      whereClause.productAreaDetailId = pad.id;
    } else if (productId) {
      // Get all entries for all areas of this product
      const pads = await prisma.productAreaDetail.findMany({
        where: { productId },
        select: { id: true }
      });
      whereClause.productAreaDetailId = { in: pads.map(p => p.id) };
    }

    const entries = await prisma.stockEntry.findMany({
      where: whereClause,
      include: {
        productAreaDetail: {
          include: {
            product: { select: { id: true, name: true } },
            area: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { createdAt: "desc" },
      take: 100 // Limit to last 100 entries
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Error fetching stock entries:", error);
    return NextResponse.json({ error: "Failed to fetch stock entries" }, { status: 500 });
  }
}

// POST - Create a new stock entry (restock, adjustment, damage, return)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId, areaId, quantity, type, notes } = await req.json();

  if (!productId || !areaId || quantity === undefined || !type) {
    return NextResponse.json({ 
      error: "Missing required fields: productId, areaId, quantity, type" 
    }, { status: 400 });
  }

  const validTypes = ["RESTOCK", "SALE", "ADJUSTMENT", "DAMAGE", "RETURN"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ 
      error: `Invalid type. Must be one of: ${validTypes.join(", ")}` 
    }, { status: 400 });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty)) {
    return NextResponse.json({ error: "Quantity must be a valid number" }, { status: 400 });
  }

  try {
    // Capture the product's total stock before this entry
    const prevProduct = await prisma.product.findUnique({
      where: { id: productId },
      select: { stockQuantity: true }
    });
    const prevTotalStock = prevProduct?.stockQuantity ?? 0;

    // Use a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Find or create the ProductAreaDetail
      let pad = await tx.productAreaDetail.findUnique({
        where: { productId_areaId: { productId, areaId } }
      });

      if (!pad) {
        pad = await tx.productAreaDetail.create({
          data: {
            productId,
            areaId,
            stockQuantity: 0
          }
        });
      }

      // Create the stock entry
      const entry = await tx.stockEntry.create({
        data: {
          productAreaDetailId: pad.id,
          quantity: qty,
          type,
          notes: notes || null,
          createdBy: session.userId
        }
      });

      // Capture this area's stock before the update
      const prevAreaStock = pad.stockQuantity;

      // Update the stock quantity
      const newQuantity = pad.stockQuantity + qty;
      if (newQuantity < 0) {
        throw new Error("Insufficient stock for this operation");
      }

      await tx.productAreaDetail.update({
        where: { id: pad.id },
        data: { stockQuantity: newQuantity }
      });

      // Update the product's total stock quantity
      const allAreaDetails = await tx.productAreaDetail.findMany({
        where: { productId }
      });
      const totalStock = allAreaDetails.reduce((sum, detail) => sum + detail.stockQuantity, 0);
      
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: totalStock }
      });

      return { entry, newQuantity, totalStock, prevAreaStock };
    });

    // If this restock brought THIS AREA from out-of-stock back in stock,
    // notify per-area subscribers (and product-level "any area" subscribers).
    if (type === "RESTOCK" && qty > 0 && result.prevAreaStock <= 0 && result.newQuantity > 0) {
      // Fire-and-forget; do not block the response
      void notifyRestockSubscribersForArea(productId, areaId);
    } else if (type === "RESTOCK" && qty > 0 && prevTotalStock <= 0 && result.totalStock > 0) {
      // Fallback: product-level restock brought the whole product back in stock
      void notifyRestockSubscribers(productId);
    }

    return NextResponse.json({ 
      success: true, 
      entry: result.entry,
      newAreaStock: result.newQuantity,
      totalProductStock: result.totalStock
    });
  } catch (error: any) {
    console.error("Error creating stock entry:", error);
    if (error.message === "Insufficient stock for this operation") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create stock entry" }, { status: 500 });
  }
}

// DELETE - Delete a stock entry (admin only, for corrections)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !["ADMIN", "SUPERADMIN"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entryId } = await req.json();

  if (!entryId) {
    return NextResponse.json({ error: "Entry ID is required" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Get the entry to delete
      const entry = await tx.stockEntry.findUnique({
        where: { id: entryId },
        include: { productAreaDetail: true }
      });

      if (!entry) {
        throw new Error("Stock entry not found");
      }

      // Reverse the stock quantity change
      const pad = entry.productAreaDetail;
      const newQuantity = pad.stockQuantity - entry.quantity;
      
      if (newQuantity < 0) {
        throw new Error("Cannot delete entry: would result in negative stock");
      }

      // Delete the entry
      await tx.stockEntry.delete({
        where: { id: entryId }
      });

      // Update the area detail stock
      await tx.productAreaDetail.update({
        where: { id: pad.id },
        data: { stockQuantity: newQuantity }
      });

      // Update the product's total stock
      const allAreaDetails = await tx.productAreaDetail.findMany({
        where: { productId: pad.productId }
      });
      const totalStock = allAreaDetails.reduce((sum, detail) => sum + detail.stockQuantity, 0);
      
      await tx.product.update({
        where: { id: pad.productId },
        data: { stockQuantity: totalStock }
      });

      return { newQuantity, totalStock };
    });

    return NextResponse.json({ 
      success: true,
      newAreaStock: result.newQuantity,
      totalProductStock: result.totalStock
    });
  } catch (error: any) {
    console.error("Error deleting stock entry:", error);
    return NextResponse.json({ error: error.message || "Failed to delete stock entry" }, { status: 500 });
  }
}
