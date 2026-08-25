// Relative imports on purpose: this module is shared with the Telegram bot,
// which runs under tsx and does not resolve the "@/" path alias.
import { prisma } from "./db";

/**
 * Signup and referral bonuses.
 *
 * Two payouts, both worth $5, both credited to the customer's wallet:
 *
 *   1. SIGNUP  - paid once, when an account proves ownership of a Telegram
 *                account THROUGH THE BOT. Typing an id into the website
 *                settings form does not qualify; see grantTelegramSignupBonus.
 *   2. REFERRAL - paid once to the REFERRER, when someone who signed up with
 *                their code has their first order reach COMPLETED.
 *
 * Every grant here is idempotent and safe to call concurrently or repeatedly.
 * The pattern throughout is a conditional `updateMany` that claims the payout
 * flag, followed by a check on how many rows actually changed: exactly one
 * caller wins, everybody else sees 0 and returns without paying. Reading the
 * flag and then writing it would let two callers - the cron and a customer
 * tapping "Complete", say - both pass the check and pay twice.
 */

/** Wallet credit for linking a Telegram account, in USD. */
export const SIGNUP_BONUS_AMOUNT = 5;

/** Wallet credit for a referral that results in a completed purchase, in USD. */
export const REFERRAL_BONUS_AMOUNT = 5;

/** Ledger + notification label, so both payouts read the same way everywhere. */
const BONUS_LEDGER_TYPE = "BONUS";

/**
 * Characters a referral code is built from.
 *
 * 0/O and 1/I/L are left out deliberately: codes get read off one screen and
 * typed into another, and a customer who mistypes their friend's code silently
 * loses the referrer their $5 with nothing to show why.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 7;

/** Wallet balances are held in USD; only the display currency ever varies. */
const BONUS_CURRENCY = "USD";

export interface BonusResult {
  granted: boolean;
  amount: number;
}

/** A random code. Uniqueness is enforced by the database, not by this function. */
function randomReferralCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Normalise a code the way both entry points must, so "  camel-7k9f2 " and
 * "CAMEL7K9F2" resolve to the same account.
 */
export function normaliseReferralCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * This account's referral code, generating one the first time it is asked for.
 *
 * Lazy rather than assigned at signup so accounts created before the feature
 * existed get a code simply by their owner opening their profile - no backfill
 * script, and nothing to run against the production database.
 *
 * Collisions are handled by retrying on the unique-constraint violation rather
 * than by checking for a free code first: a check-then-write races, and with a
 * 31-character alphabet over 7 places a collision is rare enough that a retry
 * costs nothing.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string | null> {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!existing) return null;
    if (existing.referralCode) return existing.referralCode;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomReferralCode();
      try {
        const updated = await prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        return updated.referralCode;
      } catch (err: any) {
        // P2002 = unique constraint. Another account already holds this code
        // (or this account won a code on a parallel request); try again.
        if (err?.code !== "P2002") throw err;
        const raced = await prisma.user.findUnique({
          where: { id: userId },
          select: { referralCode: true },
        });
        if (raced?.referralCode) return raced.referralCode;
      }
    }

    console.error("getOrCreateReferralCode: exhausted attempts for user", userId);
    return null;
  } catch (err) {
    // A profile screen must still render if the code cannot be minted.
    console.error("getOrCreateReferralCode error:", err);
    return null;
  }
}

/**
 * Resolve a referral code typed at signup to the account that owns it.
 *
 * Returns null for an unknown code rather than throwing: a mistyped code must
 * never be the reason a signup fails. The would-be customer gets their account;
 * only the referral link is lost.
 */
export async function resolveReferralCode(rawCode: unknown): Promise<string | null> {
  const code = normaliseReferralCode(rawCode);
  if (!code) return null;

  try {
    const owner = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    return owner?.id ?? null;
  } catch (err) {
    console.error("resolveReferralCode error:", err);
    return null;
  }
}

/**
 * Credit a wallet and write the matching ledger row, inside one transaction.
 *
 * The wallet is created if it is somehow missing so a bonus is never silently
 * dropped for an account whose wallet row failed to create at signup.
 */
async function creditWallet(userId: string, amount: number, description: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: { balance: { increment: amount } },
      create: { userId, balance: amount, currency: BONUS_CURRENCY },
    });

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: BONUS_LEDGER_TYPE,
        amount,
        currency: BONUS_CURRENCY,
        description,
      },
    });
  });
}

/**
 * Tell the customer, in the app and on Telegram.
 *
 * Never throws: a notification that fails to send must not roll back money that
 * is already in the wallet, and must not fail the signup or the order
 * completion that triggered it.
 */
async function announceBonus(params: {
  userId: string;
  title: string;
  message: string;
}): Promise<void> {
  const { userId, title, message } = params;

  try {
    await prisma.notification.create({
      data: {
        userId,
        type: "BONUS",
        title,
        message,
        link: "/dashboard?tab=wallet",
      },
    });
  } catch (err) {
    console.error("announceBonus: notification failed:", err);
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_1_TOKEN?.trim().replace(/^["']|["']$/g, "");
    if (!botToken || botToken === "PLACEHOLDER_BOT_1_TOKEN") return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true },
    });
    if (!user?.telegramId) return;

    // Plain text, no parse_mode: these strings carry currency amounts and
    // usernames, and an unescaped "." or "-" in MarkdownV2 makes Telegram
    // reject the whole message.
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.telegramId,
        text: `🎁 ${title}\n\n${message}`,
      }),
      // Bounded on purpose. These grant helpers are awaited inside request
      // handlers - completing an order, an admin updating a status - and Node's
      // fetch has NO default timeout, so an unresponsive api.telegram.org would
      // hold that request open until the socket eventually gave up. The money is
      // already in the wallet and the in-app notification already written by
      // this point, so the Telegram copy is the one part worth abandoning.
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error("announceBonus: telegram send failed:", err);
  }
}

/**
 * Pay the $5 signup bonus for linking a Telegram account.
 *
 * CALL THIS ONLY FROM THE BOT. The bot learns the Telegram id from
 * `ctx.from.id`, which Telegram itself supplies - that is what makes the link
 * proof of ownership. The website's settings form takes a number the visitor
 * types, verifies nothing, and must never trigger a payout: a fresh made-up id
 * per account would mint $5 at a time (ids are unique, but there are billions
 * of unused ones).
 *
 * Paid at most once per account, ever. The flag is a timestamp on the User row
 * rather than a test for "has a telegramId", so unlinking and relinking - from
 * the bot or the website - cannot produce a second payout.
 *
 * Never throws: a bonus that cannot be paid must not break the signup or the
 * account link that earned it.
 */
export async function grantTelegramSignupBonus(userId: string): Promise<BonusResult> {
  const none: BonusResult = { granted: false, amount: 0 };

  try {
    // Claim the payout. `signupBonusGrantedAt: null` in the predicate is what
    // makes this a one-shot: the second caller updates 0 rows and stops here.
    const claimed = await prisma.user.updateMany({
      where: { id: userId, signupBonusGrantedAt: null },
      data: { signupBonusGrantedAt: new Date() },
    });
    if (claimed.count === 0) return none;

    try {
      await creditWallet(
        userId,
        SIGNUP_BONUS_AMOUNT,
        `Welcome bonus - Telegram account linked`
      );
    } catch (err) {
      // The money did not land, so release the claim: leaving the flag set
      // would mark this customer as paid when they never were, and they could
      // never earn it again.
      console.error("grantTelegramSignupBonus: credit failed, releasing claim:", err);
      await prisma.user
        .updateMany({ where: { id: userId }, data: { signupBonusGrantedAt: null } })
        .catch(() => {});
      return none;
    }

    await announceBonus({
      userId,
      title: "Welcome bonus received",
      message:
        `$${SIGNUP_BONUS_AMOUNT.toFixed(2)} has been added to your wallet for linking your Telegram account. ` +
        `Spend it on your first order.`,
    });

    return { granted: true, amount: SIGNUP_BONUS_AMOUNT };
  } catch (err) {
    console.error("grantTelegramSignupBonus error:", err);
    return none;
  }
}

/**
 * Pay the referrer $5 once the customer they invited completes a first order.
 *
 * Safe to call after ANY order completion, for any customer: it returns without
 * paying when the customer was not referred, when the referrer has already been
 * paid for them, or when no order of theirs has reached COMPLETED. That is why
 * every completion path can call it unconditionally instead of each one
 * re-deriving the rules.
 *
 * COMPLETED is the trigger rather than "paid" on purpose: an order that is
 * cancelled or refunded after payment never reaches COMPLETED, so the shop
 * never pays a bonus on a sale that fell through.
 *
 * The flag lives on the INVITED account, not the referrer - the promise is $5
 * per person introduced, so a referrer with ten invitees earns ten payouts, but
 * one invitee ordering ten times still only earns one.
 *
 * Never throws: a bonus must not be able to fail an order completion.
 */
export async function grantReferralBonusOnFirstPurchase(
  inviteeUserId: string
): Promise<BonusResult & { referrerId?: string }> {
  const none: BonusResult = { granted: false, amount: 0 };

  try {
    const invitee = await prisma.user.findUnique({
      where: { id: inviteeUserId },
      select: {
        id: true,
        username: true,
        referredById: true,
        referralBonusGrantedAt: true,
      },
    });

    // Not referred, or the referrer has already been paid for this person.
    if (!invitee?.referredById || invitee.referralBonusGrantedAt) return none;

    // Self-referral earns nothing. The signup paths reject it too; this is the
    // backstop, because paying it here would be paying real money.
    if (invitee.referredById === invitee.id) return none;

    // Has anything of theirs actually completed? `some` rather than a count:
    // the first matching row is enough and Postgres can stop looking there.
    const hasCompletedOrder = await prisma.order.findFirst({
      where: { userId: invitee.id, status: "COMPLETED" },
      select: { id: true },
    });
    if (!hasCompletedOrder) return none;

    // Claim the payout against the invitee row.
    const claimed = await prisma.user.updateMany({
      where: { id: invitee.id, referralBonusGrantedAt: null },
      data: { referralBonusGrantedAt: new Date() },
    });
    if (claimed.count === 0) return none;

    const referrerId = invitee.referredById;

    try {
      await creditWallet(
        referrerId,
        REFERRAL_BONUS_AMOUNT,
        `Referral bonus - ${invitee.username} completed their first order`
      );
    } catch (err) {
      console.error("grantReferralBonusOnFirstPurchase: credit failed, releasing claim:", err);
      await prisma.user
        .updateMany({ where: { id: invitee.id }, data: { referralBonusGrantedAt: null } })
        .catch(() => {});
      return none;
    }

    await announceBonus({
      userId: referrerId,
      title: "Referral bonus received",
      message:
        `${invitee.username} signed up with your referral code and completed their first order. ` +
        `$${REFERRAL_BONUS_AMOUNT.toFixed(2)} has been added to your wallet.`,
    });

    return { granted: true, amount: REFERRAL_BONUS_AMOUNT, referrerId };
  } catch (err) {
    console.error("grantReferralBonusOnFirstPurchase error:", err);
    return none;
  }
}
