-- Add is_daily flag to scores
ALTER TABLE "scores"
ADD COLUMN IF NOT EXISTS "is_daily" BOOLEAN NOT NULL DEFAULT TRUE;
