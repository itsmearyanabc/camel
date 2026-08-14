import dotenv from "dotenv";
import path from "path";

// MUST run before any module that reads process.env (e.g. prisma/db)
const envPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: envPath });

function isUsableToken(token: string | undefined, placeholder: string): token is string {
  return Boolean(token && token !== placeholder && token.length > 10);
}

let isShuttingDown = false;
const activeBots: any[] = [];

/**
 * Telegram allows exactly one long-poller per bot token, so a 409 means
 * another process holds the poll - usually the embedded bots in the web
 * server (see src/instrumentation.ts), or a previous run still exiting.
 */
function isPollConflict(err: any): boolean {
  return (
    err?.error_code === 409 ||
    /\b409\b|terminated by other getUpdates/i.test(String(err?.message || ""))
  );
}

function startBotWithRetry(bot: any, name: string, attempt = 0) {
  if (isShuttingDown) return;
  bot
    .start({
      onStart: (info: any) => {
        console.log(`🤖 [${name}] @${info.username} running (long-polling).`);
      },
    })
    .catch((err: any) => {
      if (isShuttingDown) return;

      // A conflict retried every 5s makes the two pollers fight indefinitely
      // and neither serves customers. Back off so the other side can finish,
      // and say plainly what is wrong - the usual cause is running `npm run
      // bots` while the website is already running them embedded.
      const conflict = isPollConflict(err);
      const delay = conflict ? Math.min(30000, 5000 * 2 ** attempt) : 5000;

      if (conflict) {
        console.warn(`⚠️ [${name}] Another poller holds this bot token (409).`);
        console.warn(`   Set DISABLE_EMBEDDED_BOTS=true on the website if you run bots here.`);
        console.log(`🔄 [${name}] Retrying in ${delay / 1000} seconds...`);
      } else {
        console.error(`❌ [${name}] Error:`, err.message);
        console.log(`🔄 [${name}] Retrying in 5 seconds...`);
      }

      setTimeout(() => startBotWithRetry(bot, name, conflict ? attempt + 1 : 0), delay);
    });
}

async function startBots() {
  // Dynamic import so dotenv runs before db.ts evaluates DATABASE_URL
  const { createTelegramBot } = await import("./bot");

  const token1 = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
  const token2 = process.env.TELEGRAM_BOT_2_TOKEN?.trim().replace(/^["']|["']$/g, "");

  console.log("=========================================");
  console.log("   Camel971TELEGRAM BOTS INITIATOR   ");
  console.log("=========================================");
  console.log(`📂 Loading env from: ${envPath}`);
  console.log(`🔑 Bot #1 token: ${isUsableToken(token1, "PLACEHOLDER_BOT_1_TOKEN") ? "present" : "MISSING"}`);
  console.log(`🔑 Bot #2 token: ${isUsableToken(token2, "PLACEHOLDER_BOT_2_TOKEN") ? "present" : "missing (optional)"}`);
  console.log(`🗄️  DATABASE_URL: ${process.env.DATABASE_URL ? "present" : "MISSING"}`);

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is required. Bots cannot start without a database.");
    process.exit(1);
  }

  if (isUsableToken(token1, "PLACEHOLDER_BOT_1_TOKEN")) {
    const bot1 = createTelegramBot(token1, "Bot #1 (Customer)");
    activeBots.push(bot1);
    startBotWithRetry(bot1, "Bot #1 - Customer");
  } else {
    console.log("⚠️ [Bot #1 - Customer] Token is missing or placeholder. Skipping boot.");
    console.log("   Set TELEGRAM_BOT_1_TOKEN in .env, then run: npm run bots");
  }

  if (isUsableToken(token2, "PLACEHOLDER_BOT_2_TOKEN")) {
    const bot2 = createTelegramBot(token2, "Bot #2 (Mirror)");
    activeBots.push(bot2);
    startBotWithRetry(bot2, "Bot #2 - Mirror");
  } else {
    console.log("⚠️ [Bot #2 - Mirror] Token is missing or placeholder. Skipping boot.");
  }

  console.log("=========================================");
  console.log("💡 Keep this process running. The website (npm run dev) does NOT start bots.");
  console.log("=========================================");

  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`🛑 [Bots] ${signal} received. Stopping bots gracefully...`);
    for (const bot of activeBots) {
      try {
        await bot.stop();
      } catch (e) {
        console.error("Error stopping bot:", e);
      }
    }
    console.log(`✅ [Bots] Bots stopped successfully.`);
    process.exit(0);
  };

  process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.once("SIGINT", () => gracefulShutdown("SIGINT"));
}

startBots().catch((err) => {
  console.error("Fatal bot runner error:", err);
  process.exit(1);
});
