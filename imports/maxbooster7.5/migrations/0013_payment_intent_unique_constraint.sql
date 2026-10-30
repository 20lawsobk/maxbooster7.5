-- Migration: Add unique constraint to orders.stripe_payment_intent_id
-- Prevents duplicate order records if Stripe retries webhook events simultaneously.
-- Uses IF NOT EXISTS pattern to be safe against re-application.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_stripe_payment_intent_id_unique'
    AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_stripe_payment_intent_id_unique
      UNIQUE (stripe_payment_intent_id);
  END IF;
END $$;
