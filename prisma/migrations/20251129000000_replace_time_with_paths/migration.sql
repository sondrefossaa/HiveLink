-- Replace time_elapsed with paths_found in scores table
ALTER TABLE scores DROP COLUMN IF EXISTS time_elapsed;
ALTER TABLE scores ADD COLUMN paths_found INTEGER NOT NULL DEFAULT 1;
