/**
 * Next.js Instrumentation — runs once when the server starts.
 *
 * We use this to boot the Telegram bots inside the same process as the
 * web server, avoiding the need for a separate background worker service
 * (which Render's free plan does not support).
 */

function isUsableToken(token: string | undefined, placeholder: string): token is string {
  return Boolean(token && token !== placeholder && token.length > 10);
}

let isShuttingDown = false;
const activeBots: any[] = [];

function startBotWithRetry(bot: any, name: string) {
  if (isShuttingDown) return;
  bot
    .start({
      onStart: (info: any) => {
        console.log(`🤖 [${name}] @${info.username} running (long-polling).`);
      },
    })
    .catch((err: any) => {
      if (isShuttingDown) return;
      console.error(`❌ [${name}] Error:`, err.message);
      console.log(`🔄 [${name}] Retrying in 5 seconds...`);
      setTimeout(() => startBotWithRetry(bot, name), 5000);
    });
}

declare global {
  var __telegram_bots_started: boolean;
  var __telegram_bots_shutdown_registered: boolean;
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (
      process.env.NEXT_PHASE === "phase-production-build" || 
      process.env.npm_lifecycle_event === "build" || 
      process.argv.includes("build")
    ) {
      return;
    }
    
    if (global.__telegram_bots_started) {
      return;
    }
    global.__telegram_bots_started = true;

    if (process.env.DISABLE_EMBEDDED_BOTS === "true") {
      console.log("⚠️ [Bots] Embedded bots disabled via DISABLE_EMBEDDED_BOTS=true");
      return;
    }

    const token1 = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
    const token2 = process.env.TELEGRAM_BOT_2_TOKEN?.trim().replace(/^["']|["']$/g, "");

    const hasBot1 = isUsableToken(token1, "PLACEHOLDER_BOT_1_TOKEN");
    const hasBot2 = isUsableToken(token2, "PLACEHOLDER_BOT_2_TOKEN");

    if (!hasBot1 && !hasBot2) {
      console.log("⚠️ [Bots] No Telegram bot tokens configured. Bots will not start.");
      return;
    }

    console.log("=========================================");
    console.log("   Camel971TELEGRAM BOTS (embedded)   ");
    console.log("=========================================");

    try {
      const { createTelegramBot } = await import("./bots/bot");

      if (hasBot1) {
        const bot1 = createTelegramBot(token1, "Bot #1 (Customer)");
        activeBots.push(bot1);
        if (process.env.USE_WEBHOOK !== "true") {
          startBotWithRetry(bot1, "Bot #1 - Customer");
        } else {
          console.log("🤖 [Bot #1 - Customer] Running in Webhook mode.");
        }
      }

      if (hasBot2) {
        const bot2 = createTelegramBot(token2, "Bot #2 (Mirror)");
        activeBots.push(bot2);
        if (process.env.USE_WEBHOOK !== "true") {
          startBotWithRetry(bot2, "Bot #2 - Mirror");
        } else {
          console.log("🤖 [Bot #2 - Mirror] Running in Webhook mode.");
        }
      }
    } catch (e) {
      console.error("❌ Failed to import bot module:", e);
    }

    console.log("=========================================");

    // Background Cron: trigger the cooldowns every minute
    const cronInterval = setInterval(() => {
      if (isShuttingDown) return;
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      fetch(`${baseUrl}/api/cron/process-cooldowns`)
        .then(res => res.json())
        .then(data => {
          if (data.processedCount > 0 || data.autoCompletedCount > 0) {
            console.log(`[Cron] Processed ${data.processedCount} cooldowns, ${data.autoCompletedCount} auto-completions.`);
          }
        })
        .catch(err => console.error("[Cron] Failed to process cooldowns:", err));
    }, 60 * 1000);

    if (!global.__telegram_bots_shutdown_registered) {
      global.__telegram_bots_shutdown_registered = true;
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`🛑 [Bots] ${signal} received. Stopping bots gracefully...`);
        clearInterval(cronInterval);
        for (const bot of activeBots) {
          try {
            await bot.stop();
          } catch (e) {
            console.error("Error stopping bot:", e);
          }
        }
        console.log(`✅ [Bots] Bots stopped successfully.`);
      };

      process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
      process.once("SIGINT", () => gracefulShutdown("SIGINT"));
    }
  }
}
