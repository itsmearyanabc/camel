import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { escapeTelegramMarkdown } from "@/lib/stock";

/**
 * Push a support reply into the customer's Telegram chat.
 *
 * Sent from the SUPPORT bot when one is configured, because that is the chat
 * the customer raised the ticket in; it falls back to the shop bot so
 * customers who only ever linked there still hear back.
 *
 * Never throws and never blocks the response: the reply is already saved and
 * visible on the website, so a Telegram outage must not fail the request or
 * make an admin think their message was lost.
 */
async function notifyCustomerOfReply(
  telegramId: string | null,
  disputeId: string,
  body: string
): Promise<void> {
  if (!telegramId) return;

  const clean = (value: string | undefined) => value?.trim().replace(/^["']|["']$/g, "") || "";
  const token = clean(process.env.TELEGRAM_SUPPORT_BOT_TOKEN) || clean(process.env.TELEGRAM_BOT_1_TOKEN);
  if (!token || token.startsWith("PLACEHOLDER")) return;

  const text =
    `💬 *Support replied to ticket* \`${escapeTelegramMarkdown(disputeId.slice(0, 8))}\`\n\n` +
    `${escapeTelegramMarkdown(body.slice(0, 1500))}\n\n` +
    `_Open the bot and choose "My Tickets" to reply._`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text, parse_mode: "Markdown" }),
    });
    if (!res.ok) {
      console.error("Dispute reply notify failed:", res.status, await res.text());
    }
  } catch (err) {
    console.error("Dispute reply notify error:", err);
  }
}

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

    // Sort the ticket back to the top of the admin list, which orders by
    // updatedAt - creating the message alone leaves the parent row untouched.
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { updatedAt: new Date() },
    });

    // Tell the customer in Telegram that support answered. Without this a
    // ticket raised from the support bot is one-way: the reply only appears if
    // they happen to reopen the dashboard.
    if (senderRole === "ADMIN") {
      await notifyCustomerOfReply(dispute.user.telegramId, disputeId, message.trim());
    }

    return NextResponse.json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Failed to add dispute message:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
