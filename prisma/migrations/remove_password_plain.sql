-- Migration: Remove passwordPlain column from User table
-- Date: 2026-07-31
-- Reason: CRITICAL SECURITY FIX - Remove plain text password storage

-- WARNING: This will permanently delete all plain text passwords
-- Make sure you have a database backup before running this migration

BEGIN;

-- Remove the passwordPlain column
ALTER TABLE "User" DROP COLUMN IF EXISTS "passwordPlain";

-- Verify the column was removed
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'User' 
        AND column_name = 'passwordPlain'
    ) THEN
        RAISE EXCEPTION 'Failed to remove passwordPlain column';
    ELSE
        RAISE NOTICE 'Successfully removed passwordPlain column';
    END IF;
END $$;

COMMIT;

-- Post-migration verification query
-- Run this to verify no plain text passwords remain:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'User';
