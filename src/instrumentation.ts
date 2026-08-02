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

    // APP_URL is read at runtime; NEXT_PUBLIC_* is frozen at build time, so it
    // is only a fallback here.
    const cronBaseUrl = () =>
      (process.env.APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\/+$/, "");

    // Background Cron: trigger the cooldowns every minute
    const cronInterval = setInterval(() => {
      if (isShuttingDown) return;
      const cronSecret = process.env.CRON_SECRET || "";
      fetch(`${cronBaseUrl()}/api/cron/process-cooldowns`, {
        headers: { "Authorization": `Bearer ${cronSecret}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.processedCount > 0 || data.autoCompletedCount > 0) {
            console.log(`[Cron] Processed ${data.processedCount} cooldowns, ${data.autoCompletedCount} auto-completions.`);
          }
        })
        .catch(err => console.error("[Cron] Failed to process cooldowns:", err));
    }, 60 * 1000);

    // Background Cron: reclaim stock from unpaid crypto orders every 5 minutes.
    // NOWPayments sends no webhook at all when a customer abandons the hosted
    // invoice, so without this the reserved units would stay locked forever and
    // the product would show as permanently out of stock.
    const expirePaymentsInterval = setInterval(() => {
      if (isShuttingDown) return;
      const cronSecret = process.env.CRON_SECRET || "";
      if (!cronSecret) return; // endpoint refuses unauthenticated calls by design
      fetch(`${cronBaseUrl()}/api/cron/expire-payments`, {
        headers: { "Authorization": `Bearer ${cronSecret}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.cancelledCount > 0 || data.rescuedCount > 0) {
            console.log(
              `[Cron] Expired ${data.cancelledCount} unpaid order(s), rescued ${data.rescuedCount}.`
            );
          }
        })
        .catch(err => console.error("[Cron] Failed to expire payments:", err));
    }, 5 * 60 * 1000);

    if (!global.__telegram_bots_shutdown_registered) {
      global.__telegram_bots_shutdown_registered = true;
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`🛑 [Bots] ${signal} received. Stopping bots gracefully...`);
        clearInterval(cronInterval);
        clearInterval(expirePaymentsInterval);
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
