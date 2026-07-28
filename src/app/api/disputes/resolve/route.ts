import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Forbidden. Admin privileges required." }, { status: 403 });
    }

    const { disputeId, resolutionType } = await req.json();

    if (!disputeId || !resolutionType) {
      return NextResponse.json({ error: "Dispute ID and resolution type are required" }, { status: 400 });
    }

    if (!["REFUND", "CREDIT", "REPLACEMENT", "REJECTED"].includes(resolutionType)) {
      return NextResponse.json({ error: "Invalid resolution type" }, { status: 400 });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    const resolvedDispute = await prisma.$transaction(async (tx) => {
      // Atomic guard: claim the dispute as not-resolved inside the transaction
      // to prevent double-refund race condition between concurrent admin requests
      const claimed = await tx.dispute.updateMany({
        where: { id: disputeId, status: { not: "RESOLVED" } },
        data: { status: "RESOLVED" },
      });
      if (claimed.count !== 1) {
        throw new Error("ALREADY_RESOLVED");
      }

      // 1. Process resolution
      if (resolutionType === "REFUND" || resolutionType === "CREDIT") {
        const wallet = await tx.wallet.findUnique({
          where: { userId: dispute.userId },
        });

        if (!wallet) {
          throw new Error("User wallet not found");
        }

        // Add funds back
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: dispute.order.totalAmount } },
        });

        // Add ledger record
        await tx.walletLedger.create({
          data: {
            walletId: wallet.id,
            type: "REFUND",
            amount: dispute.order.totalAmount,
            description: `Refund for order #${dispute.orderId} (Dispute resolved as ${resolutionType})`,
          },
        });

        // Update order status to REFUNDED
        await tx.order.update({
          where: { id: dispute.orderId },
          data: { status: "REFUNDED" },
        });

        await tx.orderItem.updateMany({
          where: { orderId: dispute.orderId },
          data: { status: "REFUNDED" },
        });
      } else if (resolutionType === "REPLACEMENT") {
        // We need to replace every item in the order
        for (const item of dispute.order.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId }
          });

          if (!product || product.stockQuantity < 1) {
            throw new Error(`No replacement items in stock for product ${item.productId}. Please resolve with REFUND instead.`);
          }

          // Deduct stock for replacement
          await tx.product.update({
            where: { id: product.id },
            data: { stockQuantity: { decrement: 1 } },
          });

          // Update order item status to READY
          await tx.orderItem.update({
            where: { id: item.id },
            data: { status: "READY" },
          });
        }

        await tx.order.update({
          where: { id: dispute.orderId },
          data: { status: "READY" },
        });
      }

      // 2. Update dispute with resolution type (status already set atomically above)
      const updatedDispute = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          resolutionType,
        },
      });

      return updatedDispute;
    });

    return NextResponse.json({ success: true, dispute: resolvedDispute });
  } catch (error: any) {
    console.error("Resolve dispute error:", error);
    if (error.message === "ALREADY_RESOLVED") {
      return NextResponse.json({ error: "Dispute has already been resolved" }, { status: 400 });
    }
    if (error.message.includes("No replacement items in stock")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Don't leak internal error details to the client
    return NextResponse.json({ error: "Internal server error resolving dispute" }, { status: 500 });
  }
}
