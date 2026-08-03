/**
 * Read-only security audit: reports Row Level Security status for every table.
 *
 * Why this matters: this project reaches Postgres directly through Prisma, but
 * the database is hosted on Supabase, which also exposes every table over a
 * public PostgREST API at https://<project>.supabase.co/rest/v1/<Table>. That
 * API is gated only by RLS. Tables created by Prisma migrations have RLS
 * DISABLED by default, so anyone holding the (deliberately public) anon key
 * could read or write them directly, bypassing the app entirely.
 *
 * Run with:  npx tsx --env-file=.env scripts/audit-rls.ts
 * Makes no changes - it only reads catalog metadata.
 */
import { prisma } from "../src/lib/db";

type Row = { tablename: string; rls_enabled: boolean; policy_count: bigint };

async function main() {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT c.relname            AS tablename,
           c.relrowsecurity     AS rls_enabled,
           COUNT(p.polname)     AS policy_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relrowsecurity ASC, c.relname ASC;
  `;

  const unprotected = rows.filter((r) => !r.rls_enabled);

  console.log(`\nRow Level Security audit — ${rows.length} table(s) in "public"\n`);
  for (const r of rows) {
    const mark = r.rls_enabled ? "✅ RLS ON " : "❌ RLS OFF";
    console.log(`  ${mark}  ${r.tablename}  (policies: ${Number(r.policy_count)})`);
  }

  if (unprotected.length > 0) {
    console.log(
      `\n⚠️  ${unprotected.length} table(s) have RLS disabled and are reachable through` +
        `\n    Supabase's public REST API by anyone holding the anon/publishable key.` +
        `\n    Sensitive tables here include User (passwordHash, passwordEncrypted),` +
        `\n    Wallet, Order and Setting.\n`
    );
    process.exitCode = 1;
  } else {
    console.log("\n✅ Every table has RLS enabled.\n");
  }
}

main()
  .catch((e) => {
    console.error("Audit failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
