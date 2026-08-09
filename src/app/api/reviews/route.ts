import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  try {
    const reviews = await prisma.review.findMany({
      where: productId ? { productId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: {
          select: { username: true, avatarUrl: true }
        }
      }
    });
    return NextResponse.json(reviews);
  } catch (e) {
    console.error("Error fetching reviews", e);
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { productId, rating, text, location } = await req.json();

    if (!rating || !text) {
      return NextResponse.json({ error: "Rating and text are required" }, { status: 400 });
    }

    // Rating feeds the star averages shown on the storefront; an unclamped
    // value (or a non-number) skews every product score it touches.
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return NextResponse.json({ error: "Rating must be a whole number from 1 to 5" }, { status: 400 });
    }

    if (typeof text !== "string" || text.trim().length < 3 || text.length > 2000) {
      return NextResponse.json({ error: "Review text must be between 3 and 2000 characters" }, { status: 400 });
    }

    // Only buyers may review, and only once per product - otherwise anyone with
    // an account can bulk-post ratings for products they never ordered.
    if (productId) {
      const purchased = await prisma.orderItem.findFirst({
        where: { productId, order: { userId: session.userId } },
        select: { id: true },
      });
      if (!purchased) {
        return NextResponse.json({ error: "You can only review products you have ordered" }, { status: 403 });
      }

      const existing = await prisma.review.findFirst({
        where: { productId, userId: session.userId },
        select: { id: true },
      });
      if (existing) {
        return NextResponse.json({ error: "You have already reviewed this product" }, { status: 400 });
      }
    }

    const review = await prisma.review.create({
      data: {
        productId: productId || null,
        userId: session.userId,
        rating: parsedRating,
        text: text.trim(),
        location: typeof location === "string" ? location.slice(0, 200) : null
      }
    });

    return NextResponse.json(review);
  } catch (e) {
    console.error("Error creating review", e);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
