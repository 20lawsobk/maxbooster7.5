-- Additive: existing merch_orders/catalog remain canonical. Pending application.
CREATE TABLE IF NOT EXISTS growth_merch_payments (
  order_id text PRIMARY KEY,
  buyer_id text NOT NULL,
  command_key text NOT NULL,
  currency text NOT NULL CHECK (currency = 'usd'),
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  collected_cents bigint NOT NULL DEFAULT 0 CHECK (collected_cents >= 0),
  refunded_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= collected_cents),
  checkout_id text UNIQUE,
  checkout_url text,
  state text NOT NULL CHECK (state IN ('reserved','checkout','paid','expired','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id,command_key)
);
CREATE TABLE IF NOT EXISTS growth_merch_payment_events (
  event_id text PRIMARY KEY,
  order_id text NOT NULL REFERENCES growth_merch_payments(order_id),
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);