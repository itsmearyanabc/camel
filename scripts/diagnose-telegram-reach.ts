/**
 * Diagnose WHY a broadcast could not reach customers.
 *
 * Read-only. Sends no messages, writes nothing. It calls getChat, which tells
 * you whether a bot can reach a given user without messaging them.
 *
 * WHY THIS EXISTS
 * broadcast-bot-migration.ts reports "unreachable" for several genuinely
 * different situations, and they call for opposite responses:
 *
 *   chat not found       - that id never started a chat with this bot. Either
 *                          the customer typed it into the website settings form
 *                          (which verifies nothing - see
 *                          src/app/api/auth/update-telegram/route.ts), or it is
 *                          simply wrong. Nothing to fix by retrying.
 *   bot was blocked      - a real customer who blocked the bot.
 *   user is deactivated  - the Telegram account is gone.
 *   Forbidden / Unauthorized on EVERY id - the sending bot itself is
 *                          restricted, which is a different problem entirely
 *                          and means no broadcast will ever work from it.
 *
 * Telling those apart is the difference between "these customers are
 * unreachable" and "this bot is broken".
 *
 *   npx tsx --env-file=.env scripts/diagnose-telegram-reach.ts
 *
 * Flags:
 *   --limit=<n>   Only probe the first n customers (default: all).
 *   --show-ids    Print full Telegram ids instead of masking them.
 */

import { prisma } from "../src/lib/db";

const clean = (v: string | undefined) => (v || "").trim().replace(/^["']|["']$/g, "");

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const showIds = process.argv.includes("--show-ids");

/** Telegram ids are personal data; masked unless explicitly asked for. */
const mask = (id: string) =>
  showIds || id.length < 5 ? id : `${id.slice(0, 3)}***${id.slice(-2)}`;

interface Probe {
  ok: boolean;
  /** Telegram's own words, e.g. "Bad Request: chat not found". */
  description: string;
}

async function getChat(token: string, chatId: string): Promise<Probe> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId }),
      signal: AbortSignal.timeout(15000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (body?.ok) return { ok: true, description: "reachable" };
    return { ok: false, description: String(body?.description || `HTTP ${res.status}`) };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : "network error" };
  }
}

async function whoAmI(token: string, label: string): Promise<string | null> {
  if (!token) {
    console.log(`  ${label}: not configured`);
    return null;
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`).catch(() => null);
  const body: any = res ? await res.json().catch(() => null) : null;
  if (!body?.ok) {
    console.log(`  ${label}: TOKEN INVALID (${body?.description || "unreachable"})`);
    return null;
  }
  console.log(`  ${label}: @${body.result.username} (id ${body.result.id})`);
  return token;
}

async function main() {
  const oldToken = clean(process.env.TELEGRAM_BOT_2_TOKEN);
  const newToken = clean(process.env.TELEGRAM_BOT_1_TOKEN);
  const limit = Number(arg("limit")) || 0;

  console.log("\nBots:");
  const oldOk = await whoAmI(oldToken, "old (BOT_2)");
  const newOk = await whoAmI(newToken, "new (BOT_1)");

  const users = await prisma.user.findMany({
    where: { telegramId: { not: null } },
    select: { username: true, telegramId: true, telegramUsername: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const sample = limit > 0 ? users.slice(0, limit) : users;
  console.log(`\nProbing ${sample.length} of ${users.length} Telegram-linked customers...\n`);

  // A Telegram user id is a positive integer, nine or ten digits for any
  // account created in recent years. Anything else was almost certainly typed
  // by hand into the website form rather than captured from the bot.
  const looksLikeRealId = (id: string) => /^\d{6,12}$/.test(id);

  const reasons = new Map<string, number>();
  const malformed: string[] = [];
  let reachableOld = 0;
  let reachableNew = 0;

  for (const u of sample) {
    const id = String(u.telegramId);

    if (!looksLikeRealId(id)) {
      malformed.push(`${u.username} -> "${mask(id)}"`);
      reasons.set("malformed id (not a Telegram user id)", (reasons.get("malformed id (not a Telegram user id)") || 0) + 1);
      continue;
    }

    const viaOld = oldOk ? await getChat(oldOk, id) : { ok: false, description: "old bot unavailable" };
    const viaNew = newOk ? await getChat(newOk, id) : { ok: false, description: "new bot unavailable" };

    if (viaOld.ok) reachableOld++;
    if (viaNew.ok) reachableNew++;

    const key = viaOld.ok ? "reachable via old bot" : viaOld.description;
    reasons.set(key, (reasons.get(key) || 0) + 1);

    console.log(
      `  ${u.username.padEnd(18)} ${mask(id).padEnd(12)} old: ${viaOld.ok ? "OK" : viaOld.description}` +
        `  |  new: ${viaNew.ok ? "OK" : viaNew.description}`
    );

    await new Promise((r) => setTimeout(r, 60));
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`Reachable via OLD bot (@camel_971_bot): ${reachableOld}/${sample.length}`);
  console.log(`Reachable via NEW bot:                  ${reachableNew}/${sample.length}`);

  console.log(`\nBreakdown by reason:`);
  for (const [reason, count] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }

  if (malformed.length > 0) {
    console.log(`\nMalformed ids (typed into the website form, never verified):`);
    for (const m of malformed.slice(0, 20)) console.log(`  ${m}`);
    if (malformed.length > 20) console.log(`  ...and ${malformed.length - 20} more`);
  }

  console.log(`\nHow to read this:`);
  console.log(`  "chat not found" on nearly all  -> those ids never started a chat with`);
  console.log(`     the bot. They were typed into the website settings form, which`);
  console.log(`     verifies nothing. Telegram was never a working channel for them,`);
  console.log(`     and the website notification is the only way to reach them.`);
  console.log(`  "Forbidden" / same error on ALL -> the sending bot itself is`);
  console.log(`     restricted. No broadcast will work from it.`);
  console.log(`  A mix                           -> normal; those are real customers.`);
}

main()
  .catch((err) => {
    console.error("\nFailed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
