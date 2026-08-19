import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normaliseTelegramUsername } from "@/lib/telegramLinks";

/**
 * How a customer's Telegram account is handed to the staff panel.
 *
 * The stored handle is NOT trusted. `/api/auth/update-telegram` writes whatever
 * the customer typed straight into the column - it is only validated when the
 * link is made through the bot - so it is normalised here, on the server, and
 * the panel is given a finished `telegramUrl` rather than being left to build
 * an href out of raw user input.
 *
 * `telegramLinked` covers the case that has no handle at all: Telegram
 * usernames are optional, so an account can be genuinely linked and still have
 * nothing a human can click. Staff need to be able to tell that apart from
 * "never linked", because the two call for different follow-up.
 */
function staffTelegramView(user: {
  username: string;
  telegramUsername: string | null;
  telegramId: string | null;
}) {
  const handle = normaliseTelegramUsername(user.telegramUsername);
  return {
    username: user.username,
    telegramUsername: handle,
    telegramUrl: handle ? `https://t.me/${handle}` : null,
    telegramLinked: Boolean(user.telegramId),
  };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let disputes;

    if (["STAFF", "ADMIN", "SUPERADMIN"].includes(session.role)) {
      const staffDisputes = await prisma.dispute.findMany({
        include: {
          // telegramId is selected to derive `telegramLinked` only; it is
          // mapped away below and never reaches the client, because a numeric
          // id does not let a human open a chat and so buys staff nothing.
          user: { select: { username: true, telegramUsername: true, telegramId: true } },
          order: {
            include: {
              items: {
                include: {
                  product: true,
                }
              },
            },
          },
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });

      disputes = staffDisputes.map((d) => ({ ...d, user: staffTelegramView(d.user) }));
    } else {
      disputes = await prisma.dispute.findMany({
        where: { userId: session.userId },
        include: {
          order: {
            include: {
              items: {
                include: {
                  product: true,
                }
              },
            },
          },
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return NextResponse.json({ disputes });
  } catch (error) {
    console.error("Fetch disputes list error:", error);
    return NextResponse.json({ error: "Internal server error fetching disputes" }, { status: 500 });
  }
}
