import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Unseen-ticket counter behind the control panel's blinking Disputes badge.
 *
 * This is the one endpoint in the app that is polled on a timer, so it is kept
 * deliberately small: one COUNT, no relations loaded, and a response of a few
 * bytes. Do not grow it into a general disputes summary - the heavy read is
 * /api/disputes/list, which the panel already calls when the tab is opened.
 */

export const dynamic = "force-dynamic";

const STAFF_ROLES = ["ADMIN", "SUPERADMIN", "STAFF"];

/** Ticket states that still need a human. A resolved ticket is never "unseen". */
const OPEN_STATUSES = ["OPEN", "INVESTIGATING"];

/**
 * Polled responses must never be cached.
 *
 * The site sits behind Cloudflare, and a cached count would leave staff
 * looking at a stale badge - either a dead alert that will not clear or, worse,
 * silence while tickets pile up. `private` also keeps one staff member's count
 * out of any shared cache, since the number is specific to who is asking.
 */
const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

/**
 * Count what the customer has sent since this member of staff last looked.
 *
 * Keyed on CUSTOMER messages rather than on Dispute.updatedAt: that column is
 * also bumped when *staff* reply, so using it would make the badge light up for
 * the whole team every time a colleague answered a ticket. What staff need to
 * be alerted to is a customer waiting - a new ticket (whose opening message is
 * seeded as a CUSTOMER message by /api/disputes/submit) or a reply on an
 * existing one. Both are exactly "a CUSTOMER message newer than seenAt".
 */
function unseenWhere(seenAt: Date | null) {
  return {
    status: { in: OPEN_STATUSES },
    messages: {
      some: {
        senderRole: "CUSTOMER",
        // No marker yet means this account has never opened the queue, so every
        // open ticket counts.
        ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
      },
    },
  };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !STAFF_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    // The session cookie carries a role but not this marker, so it is read
    // fresh. A deleted account returns no row - treated as "nothing to show"
    // rather than an error, since the panel polls this continuously.
    const me = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { disputesSeenAt: true },
    });
    if (!me) {
      return NextResponse.json({ unseen: 0, seenAt: null }, { headers: NO_STORE });
    }

    const unseen = await prisma.dispute.count({ where: unseenWhere(me.disputesSeenAt) });

    return NextResponse.json(
      { unseen, seenAt: me.disputesSeenAt?.toISOString() ?? null },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Disputes unseen count error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}

/**
 * Mark the queue as seen, i.e. "I have looked at this".
 *
 * Returns the marker's PREVIOUS value as well as the new one. The panel keeps
 * the previous value to decide which cards still wear a NEW chip: clearing the
 * badge must not also erase the highlight on the very tickets that caused it,
 * or staff would be alerted to something and then be unable to see what.
 */
export async function POST() {
  try {
    const session = await getSession();
    if (!session || !STAFF_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    const before = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { disputesSeenAt: true },
    });
    if (!before) {
      return NextResponse.json({ error: "Account not found" }, { status: 404, headers: NO_STORE });
    }

    const seenAt = new Date();
    await prisma.user.update({
      where: { id: session.userId },
      data: { disputesSeenAt: seenAt },
    });

    return NextResponse.json(
      {
        success: true,
        seenAt: seenAt.toISOString(),
        previousSeenAt: before.disputesSeenAt?.toISOString() ?? null,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    console.error("Disputes mark-seen error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE });
  }
}
