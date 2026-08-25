-- Signup bonus + referral programme.
--
-- Every column is nullable with no default and no backfill, so on Postgres this
-- is a metadata-only change: it does not rewrite the User table and does not
-- block writes while it runs. That matters here - the database is a Supabase
-- free-tier instance and a full table rewrite would hold connections the app
-- needs to keep serving.
--
-- NULL is the correct starting value for all four:
--   referralCode            - generated lazily the first time an owner looks
--                             at their profile, so existing accounts backfill
--                             themselves with no script to run.
--   referredById            - existing accounts were never referred.
--   signupBonusGrantedAt    - "never paid", which is true for everyone at the
--                             moment this runs. It does NOT retroactively pay
--                             accounts that already linked Telegram: the bonus
--                             is granted by a link event, and those already
--                             happened.
--   referralBonusGrantedAt  - "referrer never paid for this account".
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referredById" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupBonusGrantedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralBonusGrantedAt" TIMESTAMP(3);

-- The unique index is what makes a referral code safe to hand out: two accounts
-- can never share one, so resolving a code always names exactly one referrer.
-- It is also the guard the generator relies on - it retries on collision rather
-- than checking first, which would race.
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- Lookup index for "who did this user invite". Without it, counting a
-- referrer's invitees is a sequential scan of the whole User table.
CREATE INDEX IF NOT EXISTS "User_referredById_idx" ON "User"("referredById");

-- ON DELETE SET NULL, not CASCADE: removing a referrer must never delete the
-- customers they introduced.
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
