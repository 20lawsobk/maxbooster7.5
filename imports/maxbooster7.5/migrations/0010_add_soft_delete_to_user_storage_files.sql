-- Migration: Add soft delete support to user_storage_files table
-- This allows files to be marked as deleted rather than permanently removed

ALTER TABLE "user_storage_files" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;

-- Create index for efficient filtering of non-deleted files
CREATE INDEX IF NOT EXISTS "idx_user_storage_files_deleted_at" ON "user_storage_files" ("deleted_at");

-- Create index for finding recently deleted files by user (for trash/recovery features)
CREATE INDEX IF NOT EXISTS "idx_user_storage_files_user_deleted" ON "user_storage_files" ("user_id", "deleted_at") WHERE "deleted_at" IS NOT NULL;
