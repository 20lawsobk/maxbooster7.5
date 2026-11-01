-- Migration: Add missing columns to sessions and users tables
-- Date: 2025-11-13
-- Description: Add 'expire' column to sessions table and 'max_tracks' column to users table

-- Add expire column to sessions table
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "expire" timestamp;

-- Add max_tracks column to users table  
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "max_tracks" integer DEFAULT 256;
