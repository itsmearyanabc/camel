import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTelegramLinksConfig } from "@/lib/telegramLinks";

// Channels change the moment an admin saves them, so this must never be served
// from a cache - a stale list would keep showing a channel that was removed.
export const dynamic = "force-dynamic";

/**
 * Public Telegram links for the signed-in customer: the customer-support bot
 * and the admin-published channel list.
 *
 * Session-gated because both consumers live behind /dashboard, and there is no
 * reason to hand the list to anonymous traffic. It carries no secrets either
 * way - only usernames and t.me URLs, never a bot token.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supportBotUsername, channels } = await getTelegramLinksConfig();
  return NextResponse.json({ supportBotUsername, channels });
}
