import { NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { createTelegramBot } from '@/bots/bot';

// Singleton instances for webhooks to avoid recreating them on every request
let bot1: any = null;
let bot2: any = null;

/**
 * Shared secret echoed by Telegram in X-Telegram-Bot-Api-Secret-Token.
 *
 * Without it this endpoint accepts any POST that reaches the URL, so anyone who
 * learns the address can forge updates carrying any `from.id` and drive the bot
 * as a linked customer - browsing their orders and reading pickup locations.
 * Set the same value here and on setWebhook (npm run set-webhooks).
 */
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "";
if (!WEBHOOK_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "TELEGRAM_WEBHOOK_SECRET is not set. The Telegram webhook will reject all " +
    "updates in production. Generate one with: openssl rand -hex 32"
  );
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const botType = url.searchParams.get('bot'); // ?bot=1 or ?bot=2

    // Fail closed: an unconfigured secret must not silently disable the check.
    if (!WEBHOOK_SECRET) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
      }
    } else if (req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (botType === '1') {
      const token1 = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
      if (!token1 || token1.startsWith("PLACEHOLDER")) return NextResponse.json({ error: "Bot 1 not configured" });
      if (!bot1) bot1 = createTelegramBot(token1, "Bot #1 (Customer)");

      const handler = webhookCallback(bot1, 'std/http');
      return await handler(req);
    }

    if (botType === '2') {
      const token2 = process.env.TELEGRAM_BOT_2_TOKEN?.trim().replace(/^["']|["']$/g, "");
      if (!token2 || token2.startsWith("PLACEHOLDER")) return NextResponse.json({ error: "Bot 2 not configured" });
      if (!bot2) bot2 = createTelegramBot(token2, "Bot #2 (Mirror)");

      const handler = webhookCallback(bot2, 'std/http');
      return await handler(req);
    }

    return NextResponse.json({ error: "Invalid bot parameter" }, { status: 400 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
