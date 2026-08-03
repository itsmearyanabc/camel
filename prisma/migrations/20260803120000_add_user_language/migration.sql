-- AlterTable: per-user language preference, used by the Telegram bot.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'EN';
