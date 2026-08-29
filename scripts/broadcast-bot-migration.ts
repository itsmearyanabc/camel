/**
 * One-off: announce the new Telegram bot, sent FROM THE OLD BOT.
 *
 * WHY THIS EXISTS AND WHY IT IS URGENT
 * A bot can never send the first message to a Telegram user - the user has to
 * press /start on that specific bot first. So the new bot cannot reach a single
 * existing customer. The old bot can, because those customers already have a
 * chat open with it.
 *
 * The account that owns the old bot has been deleted. The token still answers
 * today, but that is not guaranteed to last. Once it stops, there is no way
 * left to reach these customers on Telegram at all - only the website
 * notification bell (see scripts/notify-bot-migration.ts). Run this while it
 * still works.
 *
 * SAFE BY DEFAULT
 * Sends nothing unless --send is passed. The dry run reports exactly how many
 * customers would be messaged and prints the message text.
 *
 * RESUMABLE
 * Every delivered chat id is recorded in a Setting row, so a run interrupted by
 * a rate limit, a dropped connection or Ctrl-C picks up where it stopped
 * instead of messaging the same people twice.
 *
 *   npx tsx --env-file=.env scripts/broadcast-bot-migration.ts
 *   npx tsx --env-file=.env scripts/broadcast-bot-migration.ts --send
 *
 * Flags:
 *   --send            Actually send. Omit for a dry run.
 *   --token=<token>   Bot to send FROM. Defaults to TELEGRAM_BOT_2_TOKEN (the
 *                     old bot kept in the mirror slot).
 *   --bot=<username>  The NEW bot to point customers at. Defaults to
 *                     NEXT_PUBLIC_TELEGRAM_BOT_USERNAME.
 *   --reset           Clear the resume record and start over.
 */

import { prisma } from "../src/lib/db";

/** Where the resume record lives. A Setting row, so it survives redeploys. */
const PROGRESS_KEY = "bot_migration_broadcast_sent";

/**
 * Telegram tolerates about 30 messages a second to distinct users. 20 leaves
 * headroom, because tripping the limit costs far more time than it saves.
 */
const SENDS_PER_SECOND = 20;
const SEND_INTERVAL_MS = Math.ceil(1000 / SENDS_PER_SECOND);

/**
 * How many times one recipient may be retried after a 429 before being counted
 * as failed and skipped. A failed recipient is NOT recorded as done, so a later
 * run picks them up again.
 */
const MAX_RATE_LIMIT_RETRIES = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const clean = (v: string | undefined) => (v || "").trim().replace(/^["']|["']$/g, "");

async function loadProgress(): Promise<Set<string>> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: PROGRESS_KEY } });
    if (!row?.value) return new Set();
    const parsed = JSON.parse(row.value);
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    // A corrupt or unreadable record must not block the send. Worst case some
    // customers get a second copy, which is far better than none getting one.
    return new Set();
  }
}

async function saveProgress(sent: Set<string>): Promise<void> {
  const value = JSON.stringify([...sent]);
  await prisma.setting.upsert({
    where: { key: PROGRESS_KEY },
    update: { value },
    create: { key: PROGRESS_KEY, value },
  });
}

/**
 * Send one message.
 *
 * Plain text, no parse_mode, deliberately: the codebase has been bitten before
 * by MarkdownV2 rejecting a whole message over one unescaped character, and a
 * broadcast that silently fails for everybody would be the worst outcome here.
 */
async function sendOne(
  token: string,
  chatId: string,
  text: string,
  attempt = 0
): Promise<"sent" | "unreachable" | "failed"> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: false }),
    // Node's fetch has no default timeout; without this one unresponsive
    // request would stall the entire broadcast indefinitely.
    signal: AbortSignal.timeout(15000),
  });

  if (res.ok) return "sent";

  const body: any = await res.json().catch(() => ({}));
  const description = String(body?.description || "");

  // Rate limited: Telegram tells us exactly how long to wait, so wait and retry
  // rather than dropping the customer. Bounded, because an account that is
  // being throttled persistently would otherwise retry forever and the
  // broadcast would never move past this one recipient.
  if (res.status === 429) {
    if (attempt >= MAX_RATE_LIMIT_RETRIES) {
      console.error(`    still rate limited after ${attempt} retries, skipping ${chatId}`);
      return "failed";
    }
    const retryAfter = Number(body?.parameters?.retry_after) || 5;
    console.log(`    rate limited, waiting ${retryAfter}s...`);
    await sleep((retryAfter + 1) * 1000);
    return sendOne(token, chatId, text, attempt + 1);
  }

  // The customer blocked the bot, deleted their account, or never actually
  // started a chat. Nothing to fix and no point retrying.
  if (res.status === 403 || /bot was blocked|user is deactivated|chat not found/i.test(description)) {
    return "unreachable";
  }

  console.error(`    failed for ${chatId}: ${res.status} ${description}`);
  return "failed";
}

async function main() {
  const token = clean(arg("token") || process.env.TELEGRAM_BOT_2_TOKEN);
  const newBot = clean(arg("bot") || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME).replace(/^@/, "");
  const send = hasFlag("send");

  if (!token) {
    console.error(
      "No sending token. Set TELEGRAM_BOT_2_TOKEN to the OLD bot token, or pass --token=<token>."
    );
    process.exit(1);
  }
  if (!newBot) {
    console.error("No target bot. Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME, or pass --bot=<username>.");
    process.exit(1);
  }

  // Confirm which bot is about to speak before messaging anybody. Sending this
  // from the NEW bot would reach nobody and would look, from the logs, like it
  // had worked.
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`).catch(() => null);
  const me: any = meRes ? await meRes.json().catch(() => null) : null;
  if (!me?.ok) {
    console.error(
      "The sending token is not valid any more. If this was the old bot, that channel is gone -" +
        "\nuse scripts/notify-bot-migration.ts to reach customers on the website instead."
    );
    process.exit(1);
  }
  console.log(`Sending from: @${me.result.username} (id ${me.result.id})`);
  console.log(`Pointing at:  @${newBot}`);

  if (me.result.username === newBot) {
    console.error(
      "\nRefusing to run: the sending bot IS the new bot. A bot cannot message customers" +
        "\nwho have not started it, so this would reach nobody. Send from the OLD bot."
    );
    process.exit(1);
  }

  const text =
    `We have moved to a new Telegram bot.\n\n` +
    `Please open @${newBot} and press Start.\n` +
    `https://t.me/${newBot}\n\n` +
    `Your account, wallet balance and order history are completely unchanged - ` +
    `the new bot will recognise you as soon as you press Start.\n\n` +
    `This old bot will stop working soon, so please switch over now.`;

  console.log(`\nMessage:\n\n${text}\n`);

  if (hasFlag("reset")) {
    await prisma.setting.deleteMany({ where: { key: PROGRESS_KEY } });
    console.log("Resume record cleared.\n");
  }

  const users = await prisma.user.findMany({
    where: { telegramId: { not: null } },
    select: { telegramId: true, username: true },
  });

  const alreadySent = await loadProgress();
  const targets = users
    .map((u) => u.telegramId as string)
    .filter((id) => id && !alreadySent.has(id));

  console.log(`Telegram-linked customers: ${users.length}`);
  console.log(`Already messaged:          ${alreadySent.size}`);
  console.log(`Will message:              ${targets.length}`);

  if (!send) {
    console.log(`\nDry run - nothing sent. Re-run with --send to broadcast.`);
    return;
  }
  if (targets.length === 0) {
    console.log(`\nNothing left to send.`);
    return;
  }

  const estimate = Math.ceil((targets.length * SEND_INTERVAL_MS) / 1000);
  console.log(`\nSending (about ${estimate}s at ${SENDS_PER_SECOND}/sec)...\n`);

  let sent = 0;
  let unreachable = 0;
  let failed = 0;

  for (const [i, chatId] of targets.entries()) {
    let outcome: "sent" | "unreachable" | "failed";
    try {
      outcome = await sendOne(token, chatId, text);
    } catch (err) {
      outcome = "failed";
      console.error(`    error for ${chatId}:`, err instanceof Error ? err.message : err);
    }

    if (outcome === "sent") {
      sent++;
      alreadySent.add(chatId);
    } else if (outcome === "unreachable") {
      unreachable++;
      // Recorded as done: retrying someone who blocked the bot will never
      // succeed, and leaving them unrecorded would retry them on every run.
      alreadySent.add(chatId);
    } else {
      failed++;
    }

    // Checkpoint periodically rather than after every message: this writes to a
    // free-tier pooler, and one write per send would be slower than the sending.
    if ((i + 1) % 25 === 0) {
      await saveProgress(alreadySent);
      console.log(`  ${i + 1}/${targets.length}  (sent ${sent}, unreachable ${unreachable}, failed ${failed})`);
    }

    await sleep(SEND_INTERVAL_MS);
  }

  await saveProgress(alreadySent);

  console.log(`\nDone.`);
  console.log(`  delivered:   ${sent}`);
  console.log(`  unreachable: ${unreachable}  (blocked the bot, or never started it)`);
  console.log(`  failed:      ${failed}  (re-run to retry just these)`);
}

main()
  .catch((err) => {
    console.error("\nFailed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
