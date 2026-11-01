CREATE TYPE "public"."api_tier" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"key_name" varchar(255) NOT NULL,
	"hashed_api_key" text NOT NULL,
	"tier" "api_tier" DEFAULT 'free' NOT NULL,
	"rate_limit" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	CONSTRAINT "api_keys_hashed_api_key_unique" UNIQUE("hashed_api_key")
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_key_id" varchar(255) NOT NULL,
	"endpoint" varchar(500) NOT NULL,
	"method" varchar(10) NOT NULL,
	"status_code" integer NOT NULL,
	"response_time" integer,
	"request_count" integer DEFAULT 1 NOT NULL,
	"date" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_hashed_api_key_idx" ON "api_keys" USING btree ("hashed_api_key");--> statement-breakpoint
CREATE INDEX "api_keys_tier_idx" ON "api_keys" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "api_keys_is_active_idx" ON "api_keys" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "api_keys_user_active_idx" ON "api_keys" USING btree ("user_id","is_active");--> statement-breakpoint
CREATE INDEX "api_usage_api_key_id_idx" ON "api_usage" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_usage_endpoint_idx" ON "api_usage" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "api_usage_date_idx" ON "api_usage" USING btree ("date");--> statement-breakpoint
CREATE INDEX "api_usage_api_key_date_idx" ON "api_usage" USING btree ("api_key_id","date");--> statement-breakpoint
CREATE INDEX "api_usage_api_key_endpoint_date_idx" ON "api_usage" USING btree ("api_key_id","endpoint","date");