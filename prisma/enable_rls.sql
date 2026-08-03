-- ============================================================================
-- Lock down the Supabase public REST API.
--
-- WHY THIS IS NEEDED
-- This app reaches Postgres directly through Prisma, but the database is hosted
-- on Supabase, which ALSO publishes every table in the "public" schema over a
-- REST API at https://<project>.supabase.co/rest/v1/<Table>. That API is gated
-- by nothing except Row Level Security.
--
-- Tables created by Prisma migrations have RLS DISABLED by default. With RLS
-- off, anybody holding the anon / publishable key - which is designed to be
-- public and ships in client apps - can read and write every row directly,
-- bypassing the application completely. That includes "User" (passwordHash and
-- passwordEncrypted), "Wallet", "Order" and "Setting".
--
-- WHAT THIS DOES
-- Enables RLS on every table in "public" and creates NO policies. With RLS on
-- and zero policies, the anon and authenticated roles can see nothing at all.
--
-- WHY IT WON'T BREAK THE APP
-- The application connects as the table owner (the "postgres" role), and table
-- owners / superusers bypass RLS unless FORCE ROW LEVEL SECURITY is set - which
-- this script deliberately does not do. Prisma keeps full access; only the
-- public REST API is shut out.
--
-- HOW TO RUN
-- Supabase Dashboard -> SQL Editor -> paste -> Run. Safe to run more than once.
-- ============================================================================

-- 1. Report current state before changing anything.
SELECT c.relname                          AS table_name,
       c.relrowsecurity                   AS rls_enabled,
       COUNT(p.polname)                   AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relrowsecurity ASC, c.relname ASC;

-- 2. Enable RLS on every table in the public schema.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
    RAISE NOTICE 'RLS enabled on %', r.relname;
  END LOOP;
END $$;

-- 3. Belt and braces: make sure the public API roles hold no direct grants.
--    Supabase grants these by default on new tables in some project templates.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- Stop future Prisma migrations from re-granting access to those roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 4. Confirm the result — every row should now show rls_enabled = true.
SELECT c.relname        AS table_name,
       c.relrowsecurity AS rls_enabled,
       COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname ASC;
