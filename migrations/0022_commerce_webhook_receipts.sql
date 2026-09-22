-- PENDING APPLICATION: additive only. No TTL; event receipts survive restarts.
-- Existing schema has no Stripe event processing receipt table.
CREATE TABLE IF NOT EXISTS commerce_webhook_receipts (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS commerce_webhook_inbox (
 event_id text PRIMARY KEY, event_type text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending', lease_until timestamptz, lease_token text,
 attempts integer NOT NULL DEFAULT 0, error text, received_at timestamptz NOT NULL DEFAULT now()
);