// Relative import on purpose: consistent with the other shared lib modules.
import { prisma } from "./db";

/**
 * Apply additive schema changes at startup, so a deploy needs nothing but a
 * restart.
 *
 * WHY THIS EXISTS
 * The database is a Supabase instance and there is no migration step in the
 * deploy: the VPS pulls, builds and restarts. Anything requiring SQL to be
 * pasted into a dashboard by hand is a step that gets skipped or half-done, and
 * a missing column is not a soft failure - Prisma selects every column it knows
 * about, so ONE absent column makes every query against that table throw and
 * the site stops working entirely.
 *
 * WHY NOT `prisma db push`
 * db push diffs the whole schema and will DROP columns, tables and indexes it
 * thinks are surplus. Against a live database holding real orders and wallets
 * that is not a risk worth taking for the sake of adding four nullable columns.
 * Everything below is additive and explicit: it can create, it can never
 * destroy.
 *
 * WHY IT IS SAFE TO RUN ON EVERY BOOT
 * Every statement is IF NOT EXISTS (or a guarded DO block). On a database where
 * the change is already applied, each one is a catalog lookup that changes
 * nothing - microseconds, no locks held, no table rewrite. On Postgres,
 * ADD COLUMN of a NULLable column with no default is metadata-only and does not
 * rewrite the table, so even the first run does not block writes.
 *
 * KEEPING THIS IN STEP
 * Every statement below also lives in prisma/migrations, for anyone running
 * migrations the ordinary way: the referral columns in
 * 20260825000000_add_signup_and_referral_bonuses, the wallet currency default
 * in 20260920010000_wallet_currency_default_back_to_usd (which supersedes the
 * short-lived 20260920000000_default_wallet_currency_aed). The two sides must
 * not drift - when you add a statement here, add a migration for it too.
 */

interface Statement {
  /** Shown in the log when this statement is the one that fails. */
  label: string;
  sql: string;
}

const STATEMENTS: Statement[] = [
  {
    label: "User.referralCode column",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT`,
  },
  {
    label: "User.referredById column",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT`,
  },
  {
    label: "User.signupBonusGrantedAt column",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupBonusGrantedAt" TIMESTAMP(3)`,
  },
  {
    label: "User.referralBonusGrantedAt column",
    sql: `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralBonusGrantedAt" TIMESTAMP(3)`,
  },
  {
    // The unique index is what makes a referral code safe to hand out: two
    // accounts can never hold the same one, so resolving a code always names
    // exactly one referrer. It is also what the code generator relies on - it
    // retries on collision rather than checking first, which would race.
    label: "User.referralCode unique index",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode")`,
  },
  {
    // Without this, counting who a referrer invited is a sequential scan of the
    // whole User table.
    label: "User.referredById lookup index",
    sql: `CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById")`,
  },
  {
    // ON DELETE SET NULL, never CASCADE: removing a referrer must not delete
    // the customers they introduced. Wrapped in a DO block because Postgres has
    // no ADD CONSTRAINT IF NOT EXISTS.
    label: "User.referredById foreign key",
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'User_referredById_fkey'
        ) THEN
          ALTER TABLE "User"
            ADD CONSTRAINT "User_referredById_fkey"
            FOREIGN KEY ("referredById") REFERENCES "User"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$;
    `,
  },
  {
    // Pinned to USD, the unit balances are actually held in, so a customer who
    // never opens the picker sees unconverted numbers. AED and the rest are
    // display options chosen per wallet, not defaults.
    //
    // Stated rather than assumed: a deploy in Sep 2026 briefly set this to
    // 'AED', so databases exist with that default and need moving back. Being
    // explicit is what makes this converge from either starting point.
    //
    // Metadata-only on Postgres: SET DEFAULT rewrites no rows and takes no
    // lasting lock, and re-running it on an already-correct column is a no-op.
    label: "Wallet.currency default of USD",
    sql: `ALTER TABLE "Wallet" ALTER COLUMN "currency" SET DEFAULT 'USD'`,
  },
];

/** Columns this process cannot serve traffic without. */
const REQUIRED_COLUMNS = [
  "referralCode",
  "referredById",
  "signupBonusGrantedAt",
  "referralBonusGrantedAt",
];

/** One run per process. */
let applied = false;

/**
 * Confirm the columns Prisma is about to select actually exist.
 *
 * Done as a catalog read rather than by trusting the ALTERs above: if the
 * database user turns out to lack DDL rights, the ALTER fails and the only
 * symptom otherwise would be every User query throwing at request time, with a
 * stack trace that says nothing about the real cause.
 */
async function verifyColumns(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
  `;
  const present = new Set(rows.map((r) => r.column_name));
  return REQUIRED_COLUMNS.filter((c) => !present.has(c));
}

/**
 * Bring the database up to what this build of the code expects.
 *
 * Never throws. A schema step that fails must not stop the web server booting:
 * the site going down entirely is strictly worse than one feature being broken,
 * and a server that is up is one you can still reach to diagnose the problem.
 * It logs loudly instead, and the log names exactly which statement failed.
 *
 * @returns true when the schema is confirmed ready, false when it is not.
 */
export async function ensureSchema(): Promise<boolean> {
  if (applied) return true;
  applied = true;

  try {
    // Nothing to do in the overwhelmingly common case, and this costs one cheap
    // catalog read to find that out - so a normal restart does no DDL at all.
    const missingBefore = await verifyColumns();
    if (missingBefore.length === 0) {
      return true;
    }

    console.log(
      `🗄️  [Schema] ${missingBefore.length} column(s) missing (${missingBefore.join(", ")}). Applying...`
    );

    let failures = 0;
    for (const statement of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(statement.sql);
      } catch (err: any) {
        failures++;
        console.error(`❌ [Schema] Failed: ${statement.label} — ${err?.message || err}`);
      }
    }

    const missingAfter = await verifyColumns();
    if (missingAfter.length > 0) {
      console.error(
        "❌ [Schema] STILL MISSING after apply: " +
          missingAfter.join(", ") +
          "\n   The signup and referral bonuses will not work, and any query" +
          "\n   touching these columns will fail. Most likely the database user" +
          "\n   lacks DDL permission. Apply this by hand instead:" +
          "\n   prisma/migrations/20260825000000_add_signup_and_referral_bonuses/migration.sql"
      );
      return false;
    }

    console.log(
      `✅ [Schema] Applied successfully${failures > 0 ? ` (${failures} statement(s) reported errors but the result is correct)` : ""}.`
    );
    return true;
  } catch (err) {
    console.error(
      "❌ [Schema] Bootstrap could not run:",
      err instanceof Error ? err.message : err
    );
    console.error(
      "   The server is still starting. If the referral columns are absent," +
        "\n   apply prisma/migrations/20260825000000_add_signup_and_referral_bonuses/migration.sql by hand."
    );
    return false;
  }
}
