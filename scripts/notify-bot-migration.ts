/**
 * One-off: tell customers the Telegram bot has moved.
 *
 * WHY THIS EXISTS
 * The Telegram account that owned the original bots was deleted, which deletes
 * the bots with it and kills their tokens. That removes the only way to message
 * the customers who linked their Telegram account - a bot can never send the
 * first message to someone, so the replacement bot cannot reach them either
 * until they press /start on it themselves.
 *
 * The website is the one channel left. Every affected customer has an account,
 * and the notification bell (src/components/NotificationBell.tsx) renders
 * whatever is in the Notification table, so a row per customer reaches them the
 * next time they sign in. `link` is handed straight to window.location.href, so
 * a t.me URL works and one tap takes them into the new bot.
 *
 * SAFE BY DEFAULT
 * Writes nothing unless --send is passed. Without it the script reports exactly
 * who would receive a row and prints the message, so the blast radius is
 * visible before anything is written.
 *
 * IDEMPOTENT
 * Customers who already hold this notice are skipped, so re-running after a
 * partial failure tops up the gap instead of posting a second copy. The Notification
 * table has no unique constraint to lean on, so the check is an explicit lookup
 * of (userId, type, title).
 *
 *   npx tsx --env-file=.env scripts/notify-bot-migration.ts --bot=new_bot_name
 *   npx tsx --env-file=.env scripts/notify-bot-migration.ts --bot=new_bot_name --send
 *
 * Flags:
 *   --bot=<username>  Bare username of the NEW bot (no @). Required.
 *   --send            Actually write the rows. Omit for a dry run.
 *   --all             Target every customer, not just Telegram-linked ones.
 */

import { prisma } from "../src/lib/db";

/** Identifies this notice so a re-run can recognise what it already sent. */
const TITLE = "Our Telegram bot has moved";

/**
 * Falls through NotificationBell's icon switch to the default bell. Chosen over
 * inventing a new type so an unrecognised string never renders as a blank.
 */
const TYPE = "GENERAL";

/** Rows per insert. Small on purpose - this talks to a free-tier pooler. */
const CHUNK_SIZE = 200;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const botUsername = (arg("bot") || "").trim().replace(/^@/, "");
  const send = hasFlag("send");
  const all = hasFlag("all");

  if (!botUsername) {
    console.error("Missing --bot=<new_bot_username>. Nothing was written.");
    process.exit(1);
  }

  const link = `https://t.me/${botUsername}`;
  const message =
    `Our Telegram bot has changed. Your account, wallet balance and order ` +
    `history are all unchanged - open the new bot and press Start, and it will ` +
    `recognise you straight away. The old bot no longer works.`;

  console.log(`\nMessage that will be posted:\n`);
  console.log(`  ${TITLE}`);
  console.log(`  ${message}`);
  console.log(`  -> ${link}\n`);

  // Telegram-linked customers are the ones who lost something: they used the
  // old bot and it has gone silent on them. --all widens it to everybody, which
  // is only worth doing if the bot is being promoted rather than replaced.
  const audience = await prisma.user.findMany({
    where: all ? {} : { telegramId: { not: null } },
    select: { id: true, username: true },
  });

  if (audience.length === 0) {
    console.log("No customers matched. Nothing to do.");
    return;
  }

  // One query for the whole audience rather than one per customer: this runs
  // against a free-tier pooler and a per-user round trip would dominate.
  const already = await prisma.notification.findMany({
    where: { userId: { in: audience.map((u) => u.id) }, type: TYPE, title: TITLE },
    select: { userId: true },
  });
  const alreadySent = new Set(already.map((n) => n.userId));
  const targets = audience.filter((u) => !alreadySent.has(u.id));

  console.log(`Audience:       ${audience.length}${all ? " (all customers)" : " (Telegram-linked)"}`);
  console.log(`Already notified: ${alreadySent.size}`);
  console.log(`Will notify:      ${targets.length}`);

  if (!send) {
    console.log(`\nDry run - nothing written. Re-run with --send to post these.`);
    return;
  }

  if (targets.length === 0) {
    console.log("\nEveryone already has this notice.");
    return;
  }

  let written = 0;
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    // A failed chunk stops the run rather than being swallowed: the idempotency
    // check above means re-running resumes from where it stopped, so stopping
    // loudly is strictly better than pressing on and hiding a systemic fault.
    const result = await prisma.notification.createMany({
      data: chunk.map((u) => ({ userId: u.id, type: TYPE, title: TITLE, message, link })),
    });
    written += result.count;
    console.log(`  ${written}/${targets.length}`);
  }

  console.log(`\nDone. ${written} notification(s) posted.`);
}

main()
  .catch((err) => {
    console.error("\nFailed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
