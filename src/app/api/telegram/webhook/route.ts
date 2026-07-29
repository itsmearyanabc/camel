import { NextResponse } from 'next/server';
import { webhookCallback } from 'grammy';
import { createTelegramBot } from '@/bots/bot';

// Singleton instances for webhooks to avoid recreating them on every request
let bot1: any = null;
let bot2: any = null;

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const botType = url.searchParams.get('bot'); // ?bot=1 or ?bot=2

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
