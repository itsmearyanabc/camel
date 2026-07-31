-- Migration: Rename passwordPlain to passwordEncrypted
-- Date: 2026-07-31
-- Reason: Store encrypted passwords instead of plain text for admin recovery

-- WARNING: This migration assumes you want to keep the password recovery feature
-- but with encryption instead of plain text storage

BEGIN;

-- Step 1: Rename the column
ALTER TABLE "User" RENAME COLUMN "passwordPlain" TO "passwordEncrypted";

-- Step 2: Add a comment to the column
COMMENT ON COLUMN "User"."passwordEncrypted" IS 'AES-256-GCM encrypted password for admin recovery';

-- Step 3: Verify the column was renamed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'passwordEncrypted'
    ) THEN
        RAISE EXCEPTION 'Failed to rename passwordPlain column';
    ELSE
        RAISE NOTICE 'Successfully renamed passwordPlain to passwordEncrypted';
    END IF;
END $$;

COMMIT;

-- IMPORTANT: After running this migration, you MUST:
-- 1. Set PASSWORD_ENCRYPTION_KEY in your .env file
-- 2. Run the password encryption script to encrypt existing plain passwords
-- 3. Regenerate Prisma client: npx prisma generate

-- Post-migration verification query:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'User';
