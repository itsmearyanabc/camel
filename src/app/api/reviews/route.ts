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

    const review = await prisma.review.create({
      data: {
        productId: productId || null,
        userId: session.userId,
        rating: Number(rating),
        text,
        location: location || null
      }
    });

    return NextResponse.json(review);
  } catch (e) {
    console.error("Error creating review", e);
    return NextResponse.json({ error: "Failed to create review" }, { status: 500 });
  }
}
