-- Required by user reads and subscription webhook ownership checks.
-- Existing users remain unbound until an authoritative Stripe event supplies it.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_subscription_id text;