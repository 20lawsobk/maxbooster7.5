-- Migration: Update api_tier enum from ['free', 'paid'] to ['free', 'pro', 'enterprise']
-- This migration safely adds new tier values and migrates existing 'paid' tier to 'pro'

-- Add 'pro' value to the enum (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pro' AND enumtypid = 'api_tier'::regtype) THEN
    ALTER TYPE api_tier ADD VALUE 'pro';
  END IF;
END $$;

-- Add 'enterprise' value to the enum (if it doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'enterprise' AND enumtypid = 'api_tier'::regtype) THEN
    ALTER TYPE api_tier ADD VALUE 'enterprise';
  END IF;
END $$;

-- Update existing 'paid' tier API keys to 'pro' tier
-- This maintains backward compatibility as 'pro' has the same rate limit (1000 req/sec)
UPDATE api_keys 
SET tier = 'pro' 
WHERE tier = 'paid';

-- Note: We cannot directly remove the 'paid' value from the enum in PostgreSQL
-- However, since we've migrated all existing data, the 'paid' value will remain
-- but will not be used. Future schema changes can recreate the enum without it.
