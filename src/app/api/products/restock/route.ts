import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET - Check if the current user is subscribed to a product's restock alerts
// Optional areaId: checks a per-area subscription. If omitted, checks product-level (any area).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const areaId = searchParams.get("areaId"); // may be null
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    const sub = await prisma.restockSubscription.findFirst({
      where: { productId, userId: session.userId, areaId: areaId || null },
    });
    return NextResponse.json({ subscribed: !!sub });
  } catch (error) {
    console.error("Error checking restock subscription:", error);
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 });
  }
}

// POST - Subscribe the current user to a product's restock alerts (optionally per-area)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId, areaId } = await req.json();
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    const existing = await prisma.restockSubscription.findFirst({
      where: { productId, userId: session.userId, areaId: areaId || null },
    });
    if (!existing) {
      await prisma.restockSubscription.create({
        data: { productId, userId: session.userId, areaId: areaId || null },
      });
    }
    return NextResponse.json({ success: true, subscribed: true });
  } catch (error) {
    console.error("Error subscribing to restock:", error);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}

// DELETE - Unsubscribe the current user from a product's restock alerts (optionally per-area)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { productId, areaId } = await req.json();
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    await prisma.restockSubscription.deleteMany({
      where: { productId, userId: session.userId, areaId: areaId || null },
    });
    return NextResponse.json({ success: true, subscribed: false });
  } catch (error) {
    console.error("Error unsubscribing from restock:", error);
    return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
  }
}
