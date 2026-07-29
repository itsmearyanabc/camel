import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deposits = await prisma.depositRequest.findMany({
      include: {
        user: {
          select: {
            username: true,
            telegramUsername: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ deposits });
  } catch (error: any) {
    console.error("Fetch deposits error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "SUPERADMIN", "STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { depositRequestId, action } = await req.json();

    if (!depositRequestId || !["APPROVE", "REJECT"].includes(action)) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    if (action === "REJECT") {
      const rejected = await prisma.depositRequest.updateMany({
        where: { id: depositRequestId, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      if (rejected.count !== 1) {
        return NextResponse.json({ error: "Deposit request was not found or has already been processed" }, { status: 400 });
      }
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    // Approve action. Claiming the pending request inside the transaction makes
    // manual approval idempotent even if two administrators act at the same time.
    const result = await prisma.$transaction(async (tx) => {
      const depositRequest = await tx.depositRequest.findUnique({
        where: { id: depositRequestId },
        include: { user: { include: { wallet: true } } },
      });
      if (!depositRequest) throw new Error("Deposit request not found");

      const claimed = await tx.depositRequest.updateMany({
        where: { id: depositRequestId, status: "PENDING" },
        data: { status: "PROCESSING" },
      });
      if (claimed.count !== 1) throw new Error("Deposit request has already been processed");

      const wallet = depositRequest.user.wallet;
      if (!wallet) {
        throw new Error("User does not have a wallet");
      }

      // 1. Increment balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: depositRequest.amount } },
      });

      // 2. Create Ledger
      await tx.walletLedger.create({
        data: {
          walletId: wallet.id,
          type: "DEPOSIT",
          amount: depositRequest.amount,
          description: `Crypto Deposit Approved (Req: ${depositRequest.id.slice(0, 8)})`,
        },
      });

      // 3. Mark request as approved
      const updatedRequest = await tx.depositRequest.update({
        where: { id: depositRequestId },
        data: { status: "APPROVED" },
      });

      return { wallet: updatedWallet, request: updatedRequest };
    });

    return NextResponse.json({ success: true, status: result.request.status, newBalance: result.wallet.balance });
  } catch (error: any) {
    console.error("Process deposit error:", error);
    // Don't leak internal error details to the client
    return NextResponse.json({ error: "Internal server error during deposit processing" }, { status: 500 });
  }
}
