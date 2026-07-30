import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

// POST - Validate a coupon code
export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code, orderAmount } = await req.json();

    if (!code || !orderAmount) {
      return NextResponse.json({ error: "Coupon code and order amount are required" }, { status: 400 });
    }

    // Find the coupon
    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        couponUsages: {
          where: { userId: session.userId },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json({ error: "Invalid coupon code" }, { status: 404 });
    }

    // Check if coupon is active
    if (!coupon.isActive) {
      return NextResponse.json({ error: "This coupon is no longer active" }, { status: 400 });
    }

    // Check validity dates
    const now = new Date();
    if (coupon.validFrom > now) {
      return NextResponse.json({ error: "This coupon is not yet valid" }, { status: 400 });
    }

    if (coupon.validUntil && coupon.validUntil < now) {
      return NextResponse.json({ error: "This coupon has expired" }, { status: 400 });
    }

    // Check usage limits
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return NextResponse.json({ error: "This coupon has reached its usage limit" }, { status: 400 });
    }

    // Check per-user usage limit
    if (coupon.userLimit && coupon.couponUsages.length >= coupon.userLimit) {
      return NextResponse.json({ error: "You have already used this coupon the maximum number of times" }, { status: 400 });
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && orderAmount < coupon.minOrderAmount) {
      return NextResponse.json({ 
        error: `Minimum order amount of $${coupon.minOrderAmount} required for this coupon` 
      }, { status: 400 });
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === "PERCENTAGE") {
      discount = (orderAmount * Number(coupon.discountValue)) / 100;
      // Apply max discount limit if set
      if (coupon.maxDiscount && discount > Number(coupon.maxDiscount)) {
        discount = Number(coupon.maxDiscount);
      }
    } else if (coupon.discountType === "FIXED_AMOUNT") {
      discount = Number(coupon.discountValue);
      // Don't allow discount to exceed order amount
      if (discount > orderAmount) {
        discount = orderAmount;
      }
    }

    const finalAmount = orderAmount - discount;

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
      },
      discount: parseFloat(discount.toFixed(2)),
      finalAmount: parseFloat(finalAmount.toFixed(2)),
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
