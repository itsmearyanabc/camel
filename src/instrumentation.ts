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

    // These endpoints live in THIS process, so call them on the loopback
    // interface instead of routing back out through DNS, TLS and the reverse
    // proxy. Going out to the public hostname meant that a restart, or any
    // brief proxy hiccup, answered with an HTML error page - which arrived here
    // as `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`
    // and lost that run. scripts/vps-cron.sh already calls 127.0.0.1 for
    // exactly this reason. CRON_BASE_URL overrides it if the app is ever split
    // across hosts.
    const cronBaseUrl = () =>
      (process.env.CRON_BASE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`)
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\/+$/, "");

    /**
     * Call one cron endpoint and return its JSON.
     *
     * Throws on a non-2xx rather than parsing the body: an error page is HTML,
     * and reading it as JSON raises a SyntaxError that says nothing about what
     * actually went wrong.
     */
    const callCron = async (path: string) => {
      const cronSecret = process.env.CRON_SECRET || "";
      if (!cronSecret) return null; // the endpoints refuse unauthenticated calls by design

      const res = await fetch(`${cronBaseUrl()}${path}`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      if (!res.ok) {
        throw new Error(`${path} returned HTTP ${res.status}`);
      }
      return res.json();
    };

    // Background Cron: trigger the cooldowns every minute
    const cronInterval = setInterval(() => {
      if (isShuttingDown) return;
      callCron("/api/cron/process-cooldowns")
        .then(data => {
          if (data && (data.processedCount > 0 || data.autoCompletedCount > 0)) {
            console.log(`[Cron] Processed ${data.processedCount} cooldowns, ${data.autoCompletedCount} auto-completions.`);
          }
        })
        .catch(err => console.error("[Cron] Failed to process cooldowns:", err.message));
    }, 60 * 1000);

    // Background Cron: reclaim stock from unpaid crypto orders every 5 minutes.
    // NOWPayments sends no webhook at all when a customer abandons the hosted
    // invoice, so without this the reserved units would stay locked forever and
    // the product would show as permanently out of stock.
    const expirePaymentsInterval = setInterval(() => {
      if (isShuttingDown) return;
      callCron("/api/cron/expire-payments")
        .then(data => {
          if (data && (data.cancelledCount > 0 || data.rescuedCount > 0)) {
            console.log(
              `[Cron] Expired ${data.cancelledCount} unpaid order(s), rescued ${data.rescuedCount}.`
            );
          }
        })
        .catch(err => console.error("[Cron] Failed to expire payments:", err.message));
    }, 5 * 60 * 1000);

    // Background Cron: delete delivery photos/videos from orders that finished
    // outside the order-history retention window (see src/lib/orderHistory.ts).
    // This is disk housekeeping and nothing breaks if a run is missed, so it
    // runs daily rather than often.
    const runMediaCleanup = () => {
      if (isShuttingDown) return;
      callCron("/api/cron/cleanup-media")
        .then(data => {
          if (data && data.filesDeleted > 0) {
            console.log(`[Cron] Deleted ${data.filesDeleted} expired delivery file(s).`);
          }
        })
        .catch(err => console.error("[Cron] Failed to clean up delivery media:", err.message));
    };

    // A plain 24h interval only fires 24h after boot, so on a server that is
    // redeployed even once a day the timer resets and the cleanup effectively
    // never runs - media would accumulate forever, which is the exact thing it
    // exists to prevent. Running once shortly after startup makes it immune to
    // restart frequency; the job only ever deletes past-retention files, so
    // running it more often than needed is harmless.
    const cleanupMediaKickoff = setTimeout(runMediaCleanup, 5 * 60 * 1000);
    const cleanupMediaInterval = setInterval(runMediaCleanup, 24 * 60 * 60 * 1000);

    if (!global.__telegram_bots_shutdown_registered) {
      global.__telegram_bots_shutdown_registered = true;
      const gracefulShutdown = async (signal: string) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`🛑 [Bots] ${signal} received. Stopping bots gracefully...`);
        clearInterval(cronInterval);
        clearInterval(expirePaymentsInterval);
        clearTimeout(cleanupMediaKickoff);
        clearInterval(cleanupMediaInterval);
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
