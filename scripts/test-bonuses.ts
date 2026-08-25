/**
 * End-to-end tests for the signup and referral bonuses.
 *
 * RUN AGAINST A THROWAWAY DATABASE ONLY.
 *
 * This script writes users, wallets, orders and ledger rows, so it refuses to
 * start unless it finds a table called "__throwaway_marker". Creating that
 * table is a deliberate act; production does not have it, so pointing this at
 * the live database by accident stops immediately instead of inventing bonus
 * credits in real customer wallets.
 *
 *   node scratchpad/pgtest/server.mjs        # throwaway Postgres on :55444
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/test-bonuses.ts
 *
 * Note both DATABASE_URL *and* DIRECT_URL must be set: prisma.config.ts reads
 * DIRECT_URL first, and src/lib/db.ts loads .env without overriding variables
 * that are already present in the environment.
 */

import { prisma } from "../src/lib/db";
import {
  grantTelegramSignupBonus,
  grantReferralBonusOnFirstPurchase,
  getOrCreateReferralCode,
  resolveReferralCode,
  normaliseReferralCode,
  SIGNUP_BONUS_AMOUNT,
  REFERRAL_BONUS_AMOUNT,
} from "../src/lib/bonuses";

let failures = 0;
const pass = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m ${m}`);
};
const check = (cond: boolean, m: string) => (cond ? pass(m) : fail(m));
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const skip = (m: string) => console.log(`  \x1b[33mSKIP\x1b[0m ${m}`);

let seq = 0;
const uniq = () => `t${Date.now().toString(36)}${seq++}`;

/**
 * Can this database actually serve queries in parallel?
 *
 * The race tests are meaningless without it. PGlite's socket server handles one
 * connection at a time and drops the rest (P1017), and because the bonus
 * helpers catch their own errors, a dropped call is indistinguishable from a
 * call that simply lost the race - so "1 of 8 granted" would PASS on a database
 * where 7 of them merely crashed. Probe first and skip honestly instead.
 */
async function supportsConcurrency(): Promise<boolean> {
  try {
    await Promise.all(
      Array.from({ length: 8 }, () => prisma.$queryRaw`SELECT pg_sleep(0.05)`)
    );
    return true;
  } catch {
    return false;
  }
}

async function makeUser(opts: { referredById?: string | null; telegramId?: string | null } = {}) {
  const name = uniq();
  const user = await prisma.user.create({
    data: {
      username: name,
      passwordHash: "x",
      telegramId: opts.telegramId ?? null,
      referredById: opts.referredById ?? null,
    },
  });
  await prisma.wallet.create({ data: { userId: user.id, balance: 0 } });
  return user;
}

async function balanceOf(userId: string): Promise<number> {
  const w = await prisma.wallet.findUnique({ where: { userId } });
  return Number(w?.balance ?? 0);
}

/** An order in the given state, with one item, for this user. */
async function makeOrder(userId: string, status: string) {
  const category = await prisma.category.create({ data: { name: `cat-${uniq()}` } });
  const product = await prisma.product.create({
    data: { name: `prod-${uniq()}`, price: 10, categoryId: category.id },
  });
  return prisma.order.create({
    data: {
      userId,
      status,
      totalAmount: 10,
      items: { create: [{ productId: product.id, priceAtPurchase: 10, status }] },
    },
  });
}

async function main() {
  // ---------------------------------------------------------------- SAFETY
  const marker = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM information_schema.tables
    WHERE table_name = '__throwaway_marker'`;
  if (Number(marker[0]?.n ?? 0) !== 1) {
    console.error(
      "\x1b[31mREFUSING TO RUN\x1b[0m: no __throwaway_marker table found.\n" +
        "This database is not a throwaway. These tests write real rows.\n"
    );
    process.exit(2);
  }
  console.log("safety marker present — throwaway database confirmed");

  // Belt and braces: never let a test fire a real Telegram message.
  if (process.env.TELEGRAM_BOT_1_TOKEN) {
    console.error("\x1b[31mREFUSING TO RUN\x1b[0m: unset TELEGRAM_BOT_1_TOKEN first.");
    process.exit(2);
  }

  // ================================================================
  section("1. normaliseReferralCode");
  check(normaliseReferralCode("  abc-1234 ") === "ABC1234", "trims, uppercases, strips punctuation");
  check(normaliseReferralCode("ABC1234") === "ABC1234", "already-clean code is unchanged");
  check(normaliseReferralCode(null) === "", "null becomes empty string");
  check(normaliseReferralCode(undefined) === "", "undefined becomes empty string");
  check(normaliseReferralCode("!!!") === "", "punctuation-only becomes empty string");

  // ================================================================
  section("2. getOrCreateReferralCode");
  const u1 = await makeUser();
  const code1 = await getOrCreateReferralCode(u1.id);
  check(!!code1 && code1.length === 7, `mints a 7-character code (got ${code1})`);
  check(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/.test(code1!), "uses only unambiguous characters");
  const code1again = await getOrCreateReferralCode(u1.id);
  check(code1 === code1again, "second call returns the same code, does not mint a new one");

  const u2 = await makeUser();
  const code2 = await getOrCreateReferralCode(u2.id);
  check(code2 !== code1, "a different account gets a different code");

  const codes = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const u = await makeUser();
    codes.add((await getOrCreateReferralCode(u.id))!);
  }
  check(codes.size === 25, `25 accounts produced 25 distinct codes (got ${codes.size})`);

  // ================================================================
  section("3. resolveReferralCode");
  check((await resolveReferralCode(code1!)) === u1.id, "resolves a valid code to its owner");
  check((await resolveReferralCode(code1!.toLowerCase())) === u1.id, "resolves a lowercased code");
  check((await resolveReferralCode(` ${code1} `)) === u1.id, "resolves a code with stray spaces");
  check((await resolveReferralCode("ZZZZZZZ")) === null, "unknown code resolves to null, does not throw");
  check((await resolveReferralCode("")) === null, "empty code resolves to null");

  // ================================================================
  section("4. Signup bonus — pays exactly once");
  const s1 = await makeUser({ telegramId: null });
  const first = await grantTelegramSignupBonus(s1.id);
  check(first.granted && first.amount === SIGNUP_BONUS_AMOUNT, `first call grants $${SIGNUP_BONUS_AMOUNT}`);
  check((await balanceOf(s1.id)) === SIGNUP_BONUS_AMOUNT, "wallet credited");

  const second = await grantTelegramSignupBonus(s1.id);
  check(!second.granted && second.amount === 0, "second call grants nothing");
  check((await balanceOf(s1.id)) === SIGNUP_BONUS_AMOUNT, "wallet unchanged by the second call");

  const ledger = await prisma.walletLedger.findMany({
    where: { wallet: { userId: s1.id } },
  });
  check(ledger.length === 1, `exactly one ledger row (got ${ledger.length})`);
  check(ledger[0]?.type === "BONUS", `ledger row typed BONUS (got ${ledger[0]?.type})`);
  check(Number(ledger[0]?.amount) === SIGNUP_BONUS_AMOUNT, "ledger amount matches the credit");

  const notes = await prisma.notification.findMany({ where: { userId: s1.id } });
  check(notes.length === 1 && notes[0].type === "BONUS", "one BONUS notification raised");
  check(notes[0]?.read === false, "notification starts unread, so the bell blinks");

  section("5. Signup bonus — unlink/relink cannot farm it");
  await prisma.user.update({ where: { id: s1.id }, data: { telegramId: null } });
  const relink = await grantTelegramSignupBonus(s1.id);
  check(!relink.granted, "relinking after an unlink grants nothing");
  check((await balanceOf(s1.id)) === SIGNUP_BONUS_AMOUNT, "balance still exactly one bonus");

  section("6. Signup bonus — concurrent calls pay once");
  const concurrent = await supportsConcurrency();
  if (!concurrent) {
    skip("database serves one connection at a time — race tests need a real Postgres");
    skip("  run these against docker postgres to exercise the updateMany claim");
  } else {
    const s2 = await makeUser();
    const races = await Promise.all(Array.from({ length: 8 }, () => grantTelegramSignupBonus(s2.id)));
    const granted = races.filter((r) => r.granted).length;
    check(granted === 1, `exactly 1 of 8 concurrent calls granted (got ${granted})`);
    check((await balanceOf(s2.id)) === SIGNUP_BONUS_AMOUNT, "wallet credited exactly once");
  }

  // ================================================================
  section("7. Referral bonus — nothing without a completed order");
  const referrer = await makeUser();
  const refCode = (await getOrCreateReferralCode(referrer.id))!;
  const invitee = await makeUser({ referredById: referrer.id });

  let r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(!r.granted, "no order at all -> no payout");

  await makeOrder(invitee.id, "COOLDOWN_ACTIVE");
  r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(!r.granted, "order placed but not completed -> no payout");
  check((await balanceOf(referrer.id)) === 0, "referrer balance still zero");

  await makeOrder(invitee.id, "CANCELLED");
  r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(!r.granted, "cancelled order -> no payout");

  section("8. Referral bonus — pays on COMPLETED, exactly once");
  await makeOrder(invitee.id, "COMPLETED");
  r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(r.granted && r.amount === REFERRAL_BONUS_AMOUNT, `completed order pays $${REFERRAL_BONUS_AMOUNT}`);
  check(r.referrerId === referrer.id, "paid to the referrer, not the invitee");
  check((await balanceOf(referrer.id)) === REFERRAL_BONUS_AMOUNT, "referrer wallet credited");
  check((await balanceOf(invitee.id)) === 0, "invitee gets nothing from the referral");

  r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(!r.granted, "second call grants nothing");

  await makeOrder(invitee.id, "COMPLETED");
  r = await grantReferralBonusOnFirstPurchase(invitee.id);
  check(!r.granted, "invitee's SECOND completed order pays nothing more");
  check((await balanceOf(referrer.id)) === REFERRAL_BONUS_AMOUNT, "referrer still has exactly one bonus");

  section("9. Referral bonus — many invitees each pay once");
  const bigReferrer = await makeUser();
  for (let i = 0; i < 3; i++) {
    const inv = await makeUser({ referredById: bigReferrer.id });
    await makeOrder(inv.id, "COMPLETED");
    await grantReferralBonusOnFirstPurchase(inv.id);
    await grantReferralBonusOnFirstPurchase(inv.id); // repeat must be a no-op
  }
  check(
    (await balanceOf(bigReferrer.id)) === 3 * REFERRAL_BONUS_AMOUNT,
    `3 invitees paid 3 x $${REFERRAL_BONUS_AMOUNT} (got $${await balanceOf(bigReferrer.id)})`
  );

  section("10. Referral bonus — concurrent completions pay once");
  if (!concurrent) {
    skip("database serves one connection at a time — race test needs a real Postgres");
  } else {
    const raceReferrer = await makeUser();
    const raceInvitee = await makeUser({ referredById: raceReferrer.id });
    await makeOrder(raceInvitee.id, "COMPLETED");
    const rr = await Promise.all(
      Array.from({ length: 8 }, () => grantReferralBonusOnFirstPurchase(raceInvitee.id))
    );
    const paid = rr.filter((x) => x.granted).length;
    check(paid === 1, `exactly 1 of 8 concurrent completions paid (got ${paid})`);
    check((await balanceOf(raceReferrer.id)) === REFERRAL_BONUS_AMOUNT, "referrer credited exactly once");
  }

  section("11. Referral bonus — no referrer, and self-referral");
  const lone = await makeUser();
  await makeOrder(lone.id, "COMPLETED");
  check(!(await grantReferralBonusOnFirstPurchase(lone.id)).granted, "unreferred customer pays nobody");

  const selfie = await makeUser();
  await prisma.user.update({ where: { id: selfie.id }, data: { referredById: selfie.id } });
  await makeOrder(selfie.id, "COMPLETED");
  const selfResult = await grantReferralBonusOnFirstPurchase(selfie.id);
  check(!selfResult.granted, "self-referral pays nothing");
  check((await balanceOf(selfie.id)) === 0, "self-referrer balance stays zero");

  section("12. Referral bonus — deleting a referrer does not delete invitees");
  const doomed = await makeUser();
  const orphan = await makeUser({ referredById: doomed.id });
  await prisma.user.delete({ where: { id: doomed.id } });
  const stillThere = await prisma.user.findUnique({ where: { id: orphan.id } });
  check(!!stillThere, "invitee survives the referrer being deleted");
  check(stillThere?.referredById === null, "invitee.referredById is nulled, not cascaded");
  check(
    !(await grantReferralBonusOnFirstPurchase(orphan.id)).granted,
    "orphaned invitee pays nobody"
  );

  section("13. Notification for the referrer");
  const notifiedReferrer = await makeUser();
  const notifiedInvitee = await makeUser({ referredById: notifiedReferrer.id });
  await makeOrder(notifiedInvitee.id, "COMPLETED");
  await grantReferralBonusOnFirstPurchase(notifiedInvitee.id);
  const refNotes = await prisma.notification.findMany({ where: { userId: notifiedReferrer.id } });
  check(refNotes.length === 1, "referrer gets exactly one notification");
  check(refNotes[0]?.type === "BONUS", "typed BONUS so the bell shows the gift icon");
  check(refNotes[0]?.read === false, "unread, so the badge blinks");
  check(
    refNotes[0]?.message?.includes(notifiedInvitee.username) ?? false,
    "notification names who triggered it"
  );
  check(refNotes[0]?.link === "/dashboard?tab=wallet", "links to the wallet tab");

  // Referral code was never used by anyone here, but resolving it must still work.
  check((await resolveReferralCode(refCode)) === referrer.id, "referral code still resolves at the end");

  console.log(
    failures === 0
      ? `\n\x1b[32m\x1b[1mALL BONUS TESTS PASSED\x1b[0m\n`
      : `\n\x1b[31m\x1b[1m${failures} BONUS TEST(S) FAILED\x1b[0m\n`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("\x1b[31mTest run crashed:\x1b[0m", e);
  await prisma.$disconnect();
  process.exit(1);
});
