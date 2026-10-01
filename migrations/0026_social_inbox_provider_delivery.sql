-- Persist provider receipt and reconciliation state for social inbox replies.
ALTER TABLE "social_inbox_messages"
  ADD COLUMN IF NOT EXISTS "reply_delivery_state" text NOT NULL DEFAULT 'draft';

ALTER TABLE "social_inbox_messages"
  ADD COLUMN IF NOT EXISTS "provider_reply_id" text;

ALTER TABLE "social_inbox_messages"
  ADD COLUMN IF NOT EXISTS "reply_delivery_error" text;