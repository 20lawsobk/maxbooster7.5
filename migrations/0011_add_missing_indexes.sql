-- Add index on users.password_reset_token for fast password-reset lookups
CREATE INDEX IF NOT EXISTS "users_password_reset_token_idx" ON "users" USING btree ("password_reset_token");

-- Add index on users.google_id for fast OAuth lookups
CREATE INDEX IF NOT EXISTS "users_google_id_idx" ON "users" USING btree ("google_id");

-- Add index on users.stripe_customer_id for fast Stripe webhook lookups
CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx" ON "users" USING btree ("stripe_customer_id");

-- Add index on ai_models.model_type for fast model queries
CREATE INDEX IF NOT EXISTS "ai_models_model_type_idx" ON "ai_models" USING btree ("model_type");

-- Add index on ai_models.status for filtering active models
CREATE INDEX IF NOT EXISTS "ai_models_status_idx" ON "ai_models" USING btree ("status");
