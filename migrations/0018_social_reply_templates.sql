-- =============================================================================
-- 0018: Social inbox reply templates
-- Adds durable per-user storage for canned inbox replies so
-- GET/POST/DELETE /api/social/inbox/templates work against real data
-- instead of a hardcoded 500.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "social_reply_templates" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" varchar NOT NULL,
  "name" text NOT NULL,
  "content" text NOT NULL,
  "category" text DEFAULT 'general',
  "created_at" timestamp DEFAULT now()
);

-- Every read is scoped to a single user's templates, ordered by recency.
CREATE INDEX IF NOT EXISTS "social_reply_templates_user_id_created_at_idx"
  ON "social_reply_templates" ("user_id", "created_at" DESC);

-- ── social_inbox_messages reply persistence ─────────────────────────────────
-- POST /inbox/:id/reply has no platform-delivery integration yet. These
-- columns durably persist what the user actually typed (instead of
-- discarding it once the message is marked "replied") and record that it
-- was saved but not delivered, so the control cannot silently lose data or
-- falsely claim delivery.
ALTER TABLE "social_inbox_messages"
  ADD COLUMN IF NOT EXISTS "reply_content" text;

ALTER TABLE "social_inbox_messages"
  ADD COLUMN IF NOT EXISTS "reply_delivered" boolean DEFAULT false;
