import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  buildChannel,
  getTelegramChannels,
  serialiseChannels,
  MAX_CHANNELS,
  TELEGRAM_CHANNELS_SETTING_KEY,
  type TelegramChannel,
} from "@/lib/telegramLinks";

export const dynamic = "force-dynamic";

/**
 * The Telegram channel directory shown at /dashboard/channels.
 *
 * Admin-only: this is storefront content, and staff manage stock rather than
 * what customers are pointed at - the same split the product routes enforce.
 *
 * Stored as one JSON row in Setting rather than a table of its own. It is a
 * short config list, and keeping it in Setting means publishing a channel needs
 * no schema migration on the production database.
 */

function assertAdmin(role: string | undefined) {
  return Boolean(role && ["ADMIN", "SUPERADMIN"].includes(role));
}

export async function GET() {
  const session = await getSession();
  if (!assertAdmin(session?.role)) {
    return NextResponse.json(
      { error: "Unauthorized. Only admins can manage Telegram channels." },
      { status: 403 }
    );
  }

  return NextResponse.json({ channels: await getTelegramChannels() });
}

/**
 * Replace the whole list.
 *
 * Whole-list rather than per-row so the saved order is exactly the order the
 * admin arranged on screen, and so a removal needs no separate call - the same
 * approach the product-variants endpoint takes.
 *
 * Body: { channels: Array<{ name, url, description }> }
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!assertAdmin(session?.role)) {
    return NextResponse.json(
      { error: "Unauthorized. Only admins can manage Telegram channels." },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const rows = Array.isArray(body?.channels) ? body.channels : null;
  if (!rows) {
    return NextResponse.json({ error: "channels must be an array" }, { status: 400 });
  }

  if (rows.length > MAX_CHANNELS) {
    return NextResponse.json(
      { error: `You can publish at most ${MAX_CHANNELS} channels.` },
      { status: 400 }
    );
  }

  // Validate everything before writing anything, and name the offending row -
  // "invalid link" against a list of ten is not something an admin can act on.
  const cleaned: TelegramChannel[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const name = typeof row.name === "string" ? row.name : "";
    const url = typeof row.url === "string" ? row.url : "";
    const description = typeof row.description === "string" ? row.description : "";

    // An entirely blank row is just an unfinished line in the editor, not an
    // error - drop it rather than making the admin hunt for it.
    if (!name.trim() && !url.trim() && !description.trim()) continue;

    const channel = buildChannel(name, url, description);
    if (!channel) {
      return NextResponse.json(
        {
          error:
            `Row ${i + 1}${name.trim() ? ` ("${name.trim()}")` : ""}: enter a Telegram link — ` +
            `a t.me URL, an @handle, or a +InviteCode for a private channel.`,
        },
        { status: 400 }
      );
    }

    const key = channel.url.toLowerCase();
    if (seen.has(key)) {
      return NextResponse.json(
        { error: `Row ${i + 1}: "${channel.url}" is already in the list.` },
        { status: 400 }
      );
    }
    seen.add(key);
    cleaned.push(channel);
  }

  const value = serialiseChannels(cleaned);

  await prisma.setting.upsert({
    where: { key: TELEGRAM_CHANNELS_SETTING_KEY },
    update: { value },
    create: { key: TELEGRAM_CHANNELS_SETTING_KEY, value },
  });

  return NextResponse.json({ success: true, channels: cleaned });
}
