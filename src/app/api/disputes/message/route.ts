import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { disputeId, message } = await req.json();

    if (!disputeId || !message || message.trim().length === 0) {
      return NextResponse.json({ error: "Dispute ID and message are required" }, { status: 400 });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { user: true },
    });

    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }

    // Determine sender role
    let senderRole = "CUSTOMER";
    let senderName = dispute.user.username;

    if (session.role === "ADMIN" || session.role === "SUPERADMIN" || session.role === "STAFF") {
      senderRole = "ADMIN";
      senderName = "Support Staff";
    } else {
      // Ensure regular users can only message their own disputes
      if (dispute.userId !== session.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const newMessage = await prisma.disputeMessage.create({
      data: {
        disputeId,
        senderRole,
        senderName,
        message: message.trim(),
      },
    });

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Failed to add dispute message:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
