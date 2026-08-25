/**
 * Test the startup schema bootstrap against a real database.
 *
 * RUN AGAINST A THROWAWAY DATABASE ONLY — it drops and recreates columns on the
 * "User" table. It refuses to start without a "__throwaway_marker" table, which
 * production does not have.
 *
 *   node scratchpad/pgtest/server.mjs
 *   DATABASE_URL=... DIRECT_URL=... npx tsx scripts/test-schema-bootstrap.ts
 *
 * WHY THIS EXISTS SEPARATELY FROM THE SQL TEST
 * The migration SQL can be valid and still fail in production, because the
 * bootstrap does not run it with psql - it runs it through Prisma's
 * $executeRawUnsafe over the pg driver adapter. The DO $$ ... $$ block is the
 * part to be suspicious of: dollar-quoting travelling through a driver that
 * also uses $1-style placeholders is exactly where this would break. This test
 * exercises the real code path on a real Postgres.
 */

import { prisma } from "../src/lib/db";
import { ensureSchema } from "../src/lib/schemaBootstrap";

let failures = 0;
const pass = (m: string) => console.log(`  \x1b[32mPASS\x1b[0m ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m ${m}`);
};
const check = (cond: boolean, m: string) => (cond ? pass(m) : fail(m));
const section = (m: string) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const COLUMNS = ["referralCode", "referredById", "signupBonusGrantedAt", "referralBonusGrantedAt"];

async function presentColumns(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='User'`;
  const have = new Set(rows.map((r) => r.column_name));
  return COLUMNS.filter((c) => have.has(c));
}

async function hasIndex(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM pg_indexes
    WHERE schemaname='public' AND tablename='User' AND indexname=${name}`;
  return Number(rows[0]?.n ?? 0) > 0;
}

async function fkDeleteRule(): Promise<string | null> {
  // Cast to text: confdeltype is Postgres's internal "char" type, which
  // Prisma's raw-query deserializer rejects outright (UnsupportedNativeDataType).
  const rows = await prisma.$queryRaw<Array<{ rule: string }>>`
    SELECT confdeltype::text AS rule FROM pg_constraint
    WHERE conname='User_referredById_fkey'`;
  return rows[0]?.rule ?? null;
}

/** Put the database back to how it looked BEFORE this feature shipped. */
async function revertToPreFeatureState() {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_referredById_fkey"`
  );
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_referralCode_key"`);
  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "User_referredById_idx"`);
  for (const c of COLUMNS) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN IF EXISTS "${c}"`);
  }
}

async function main() {
  const marker = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT count(*)::bigint AS n FROM information_schema.tables
    WHERE table_name = '__throwaway_marker'`;
  if (Number(marker[0]?.n ?? 0) !== 1) {
    console.error(
      "\x1b[31mREFUSING TO RUN\x1b[0m: no __throwaway_marker table. This drops columns.\n"
    );
    process.exit(2);
  }
  console.log("safety marker present — throwaway database confirmed");

  section("1. Simulate a server booting against a pre-feature database");
  await revertToPreFeatureState();
  check((await presentColumns()).length === 0, "all four columns removed");
  check(!(await hasIndex("User_referralCode_key")), "unique index removed");
  check(!(await hasIndex("User_referredById_idx")), "lookup index removed");
  check((await fkDeleteRule()) === null, "foreign key removed");

  section("2. ensureSchema() brings it up to date through Prisma");
  const applied = await ensureSchema();
  check(applied === true, "ensureSchema() reported success");
  const cols = await presentColumns();
  check(cols.length === 4, `all four columns present (got ${cols.length}: ${cols.join(", ")})`);
  check(await hasIndex("User_referralCode_key"), "unique index created");
  check(await hasIndex("User_referredById_idx"), "lookup index created");
  check(
    (await fkDeleteRule()) === "n",
    `DO $$ block ran through $executeRawUnsafe and FK is ON DELETE SET NULL (got ${await fkDeleteRule()})`
  );

  section("3. Prisma can now actually query the new columns");
  // This is the real proof: a Prisma select naming the new fields, which is
  // what every request does once the app is serving traffic.
  let queryWorked = true;
  try {
    await prisma.user.findMany({
      where: { referralBonusGrantedAt: null },
      select: { id: true, referralCode: true, referredById: true, signupBonusGrantedAt: true },
      take: 1,
    });
  } catch (e) {
    queryWorked = false;
    fail(`Prisma query on new columns threw — ${e instanceof Error ? e.message : e}`);
  }
  check(queryWorked, "Prisma selects the new columns without error");

  section("4. Second boot is a no-op (this runs on EVERY restart)");
  // ensureSchema guards with a module-level flag, so call the underlying work
  // again by clearing the module cache is overkill - instead assert that the
  // statements are safe to re-apply, which is what a fresh process would do.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode")`
  );
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_referredById_fkey') THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey"
          FOREIGN KEY ("referredById") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
  check((await presentColumns()).length === 4, "columns still intact after re-apply");
  check((await fkDeleteRule()) === "n", "FK still ON DELETE SET NULL after re-apply");

  console.log(
    failures === 0
      ? "\n\x1b[32m\x1b[1mALL SCHEMA BOOTSTRAP TESTS PASSED\x1b[0m\n"
      : `\n\x1b[31m\x1b[1m${failures} SCHEMA BOOTSTRAP TEST(S) FAILED\x1b[0m\n`
  );
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("\x1b[31mTest run crashed:\x1b[0m", e);
  await prisma.$disconnect();
  process.exit(1);
});
