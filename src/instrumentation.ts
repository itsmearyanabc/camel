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

/** Every timer this module owns, so shutdown can clear them in one place. */
const activeTimers: NodeJS.Timeout[] = [];

/**
 * Telegram allows exactly one long-poller per bot token.
 *
 * A 409 therefore means someone else holds the poll - almost always the
 * previous deploy still shutting down, occasionally a second instance. It is
 * not a fault in this process and it resolves on its own.
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

      // Retrying a conflict every 5 seconds makes the two pollers fight
      // indefinitely and neither one serves customers. Backing off lets the
      // outgoing process finish exiting, and the next attempt takes the poll
      // over cleanly. Every other error keeps the original 5s retry.
      const conflict = isPollConflict(err);
      const delay = conflict ? Math.min(30000, 5000 * 2 ** attempt) : 5000;

      if (conflict) {
        console.warn(
          `⚠️ [${name}] Another poller holds this bot token (409). Retrying in ${delay / 1000}s...`
        );
      } else {
        console.error(`❌ [${name}] Error:`, err.message);
        console.log(`🔄 [${name}] Retrying in 5 seconds...`);
      }

      const timer = setTimeout(
        () => startBotWithRetry(bot, name, conflict ? attempt + 1 : 0),
        delay
      );
      activeTimers.push(timer);
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

    // Schema first, and awaited, before anything else touches the database.
    //
    // Dynamically imported for the same reason the bot modules are: a static
    // import would pull Prisma into the Edge compilation of this file.
    //
    // THE TIMEOUT IS NOT OPTIONAL. Next.js documents that register() "must
    // complete before the server is ready to handle requests" - so anything
    // that hangs in here does not degrade a feature, it stops the entire site
    // from ever coming up. The database is a Supabase free-tier instance
    // reached over the network, and a saturated pooler or a blip during a
    // deploy is exactly the kind of thing that hangs rather than fails.
    //
    // Racing a timer bounds the worst case: the site boots regardless, at most
    // SCHEMA_BOOT_TIMEOUT_MS later than it otherwise would. The losing promise
    // is not cancelled, so a slow-but-working bootstrap still finishes and
    // applies moments after boot - the situation heals itself.
    const SCHEMA_BOOT_TIMEOUT_MS = 30_000;
    try {
      const { ensureSchema } = await import("./lib/schemaBootstrap");

      let timer: NodeJS.Timeout | undefined;
      const timedOut = Symbol("timeout");
      const timeout = new Promise<typeof timedOut>((resolve) => {
        timer = setTimeout(() => resolve(timedOut), SCHEMA_BOOT_TIMEOUT_MS);
        // Never let this timer be the reason the process stays alive.
        timer.unref?.();
      });

      const result = await Promise.race([ensureSchema(), timeout]);
      if (timer) clearTimeout(timer);

      if (result === timedOut) {
        console.error(
          `⚠️ [Schema] Bootstrap did not finish within ${SCHEMA_BOOT_TIMEOUT_MS / 1000}s. ` +
            "Starting the server anyway - it is still running in the background."
        );
      }
    } catch (e) {
      console.error("❌ [Schema] Bootstrap module failed to load:", e);
    }

    // Bots and cron are started independently below.
    //
    // They used to share one code path, and every early return in the bot
    // setup - bots switched off, no token configured - also skipped the cron
    // timers further down. That silently disabled order delivery: cooldowns
    // were never released, so a customer only ever got their pickup details
    // while they happened to have the dashboard open, and abandoned crypto
    // orders held their stock forever. The cron jobs have nothing to do with
    // Telegram and must run whether or not a bot does.
    await startEmbeddedBots();
    startCronTimers();
  }
}

/**
 * Boot the Telegram bots in this process.
 *
 * Never throws: a bot that cannot start must not take the web server or the
 * cron timers down with it.
 */
async function startEmbeddedBots() {
  if (process.env.DISABLE_EMBEDDED_BOTS === "true") {
    console.log("⚠️ [Bots] Embedded bots disabled via DISABLE_EMBEDDED_BOTS=true");
    return;
  }

  const token1 = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
  const token2 = process.env.TELEGRAM_BOT_2_TOKEN?.trim().replace(/^["']|["']$/g, "");
  const supportToken = process.env.TELEGRAM_SUPPORT_BOT_TOKEN?.trim().replace(/^["']|["']$/g, "");

  const hasBot1 = isUsableToken(token1, "PLACEHOLDER_BOT_1_TOKEN");
  const hasBot2 = isUsableToken(token2, "PLACEHOLDER_BOT_2_TOKEN");

  // The support bot MUST be a different bot from the shop bots. Telegram allows
  // exactly one long-poller per token, so reusing one here would put two
  // pollers on it: they trade 409s and neither answers customers. Refusing to
  // start is far better than half-breaking the shop bot that already works.
  let hasSupport = isUsableToken(supportToken, "PLACEHOLDER_SUPPORT_BOT_TOKEN");
  if (hasSupport && (supportToken === token1 || supportToken === token2)) {
    console.error(
      "❌ [Bot #3 - Support] TELEGRAM_SUPPORT_BOT_TOKEN is the same token as a shop bot. " +
      "Create a separate bot with @BotFather. Support bot NOT started."
    );
    hasSupport = false;
  }

  if (!hasBot1 && !hasBot2 && !hasSupport) {
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

  // Separate import and separate try/catch from the shop bots above: the
  // support bot is a different bot with a different job, and a fault in it
  // must never stop the shop bot from serving customers.
  if (hasSupport) {
    try {
      const { createSupportBot } = await import("./bots/supportBot");
      const supportBot = createSupportBot(supportToken!, "Bot #3 (Support)");
      activeBots.push(supportBot);
      if (process.env.USE_WEBHOOK !== "true") {
        startBotWithRetry(supportBot, "Bot #3 - Support");
      } else {
        console.log("🤖 [Bot #3 - Support] Running in Webhook mode.");
      }
    } catch (e) {
      console.error("❌ Failed to import support bot module:", e);
    }
  }

  console.log("=========================================");
}

/**
 * Start the background jobs this process owns, and register the shutdown hook.
 */
function startCronTimers() {
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

  activeTimers.push(cronInterval, expirePaymentsInterval, cleanupMediaKickoff, cleanupMediaInterval);

  if (!global.__telegram_bots_shutdown_registered) {
    global.__telegram_bots_shutdown_registered = true;
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`🛑 [Bots] ${signal} received. Stopping bots gracefully...`);

      // Clearing the shared list also cancels any pending bot-retry timer,
      // which the previous explicit clears could not reach - a retry that
      // fired mid-shutdown used to start a poller nothing would ever stop.
      for (const timer of activeTimers) clearTimeout(timer);
      activeTimers.length = 0;

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
