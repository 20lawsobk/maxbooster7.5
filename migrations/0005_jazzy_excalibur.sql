CREATE TYPE "public"."alert_condition" AS ENUM('gt', 'lt', 'outside', 'inside');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('triggered', 'resolved', 'acknowledged');--> statement-breakpoint
CREATE TYPE "public"."email_event_type" AS ENUM('delivered', 'bounce', 'spam', 'unsubscribe', 'open', 'click', 'deferred', 'dropped');--> statement-breakpoint
CREATE TABLE "alert_incidents" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" varchar(255) NOT NULL,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"status" "alert_status" DEFAULT 'triggered' NOT NULL,
	"context" jsonb
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"condition" "alert_condition" NOT NULL,
	"threshold" numeric(20, 4) NOT NULL,
	"duration_secs" integer DEFAULT 300 NOT NULL,
	"channels" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" varchar NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"content_id" varchar(255) NOT NULL,
	"content_owner_id" varchar,
	"reason" varchar(100) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"resolution" text,
	"action_taken" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"user_email" text NOT NULL,
	"deletion_type" text NOT NULL,
	"requested_at" timestamp NOT NULL,
	"deleted_at" timestamp DEFAULT now(),
	"deleted_by" varchar,
	"reason" text,
	"cascaded_records" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distribution_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_name" varchar(100) NOT NULL,
	"provider_slug" varchar(50) NOT NULL,
	"base_url" varchar(255) NOT NULL,
	"api_version" varchar(20),
	"endpoints" jsonb NOT NULL,
	"auth_type" varchar(50) NOT NULL,
	"auth_header_name" varchar(100),
	"auth_header_format" varchar(255),
	"webhook_events" jsonb,
	"webhook_secret_key" varchar(255),
	"supported_platforms" jsonb,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_providers_provider_slug_unique" UNIQUE("provider_slug")
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"event_type" "email_event_type" NOT NULL,
	"event_at" timestamp NOT NULL,
	"smtp_response" text,
	"reason" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" varchar(255) NOT NULL,
	"user_id" varchar(255),
	"category" varchar(100),
	"template" varchar(100),
	"to_email" varchar(255) NOT NULL,
	"subject" varchar(500),
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"initial_status" varchar(50) DEFAULT 'sent',
	"metadata" jsonb,
	CONSTRAINT "email_messages_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_posts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"platforms" jsonb NOT NULL,
	"content" jsonb NOT NULL,
	"scheduled_time" timestamp NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"results" jsonb,
	"created_by" varchar(50) DEFAULT 'manual' NOT NULL,
	"viral_prediction" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_metrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"source" varchar(100) NOT NULL,
	"tags" jsonb,
	"bucket_start" timestamp NOT NULL,
	"resolution_secs" integer DEFAULT 60 NOT NULL,
	"avg_value" numeric(20, 4),
	"min_value" numeric(20, 4),
	"max_value" numeric(20, 4),
	"sample_count" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "user_ai_models" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"model_type" varchar(100) NOT NULL,
	"weights" jsonb NOT NULL,
	"trained_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tier" SET DEFAULT 'free'::text;--> statement-breakpoint
DROP TYPE "public"."api_tier";--> statement-breakpoint
CREATE TYPE "public"."api_tier" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tier" SET DEFAULT 'free'::"public"."api_tier";--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "tier" SET DATA TYPE "public"."api_tier" USING "tier"::"public"."api_tier";--> statement-breakpoint
ALTER TABLE "analytics" ADD COLUMN "total_followers" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "analytics" ADD COLUMN "engagement_rate" real DEFAULT 0;--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "upc" varchar(20);--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "labelgrid_release_id" varchar(255);--> statement-breakpoint
ALTER TABLE "releases" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birthdate" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marked_for_deletion" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_content_owner_id_users_id_fk" FOREIGN KEY ("content_owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_flags" ADD CONSTRAINT "content_flags_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_incidents_rule_id_idx" ON "alert_incidents" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "alert_incidents_status_idx" ON "alert_incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "alert_incidents_triggered_at_idx" ON "alert_incidents" USING btree ("triggered_at");--> statement-breakpoint
CREATE INDEX "alert_rules_metric_idx" ON "alert_rules" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX "alert_rules_active_idx" ON "alert_rules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "content_flags_reporter_id_idx" ON "content_flags" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "content_flags_content_type_idx" ON "content_flags" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "content_flags_content_id_idx" ON "content_flags" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_flags_status_idx" ON "content_flags" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_flags_content_owner_id_idx" ON "content_flags" USING btree ("content_owner_id");--> statement-breakpoint
CREATE INDEX "content_flags_type_content_idx" ON "content_flags" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "distribution_providers_provider_slug_idx" ON "distribution_providers" USING btree ("provider_slug");--> statement-breakpoint
CREATE INDEX "distribution_providers_is_active_idx" ON "distribution_providers" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "distribution_providers_is_default_idx" ON "distribution_providers" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "email_events_message_id_idx" ON "email_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_events_event_type_idx" ON "email_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "email_events_event_at_idx" ON "email_events" USING btree ("event_at");--> statement-breakpoint
CREATE INDEX "email_events_message_event_idx" ON "email_events" USING btree ("message_id","event_type");--> statement-breakpoint
CREATE INDEX "email_messages_message_id_idx" ON "email_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "email_messages_user_id_idx" ON "email_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_messages_to_email_idx" ON "email_messages" USING btree ("to_email");--> statement-breakpoint
CREATE INDEX "email_messages_sent_at_idx" ON "email_messages" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "scheduled_posts_user_id_idx" ON "scheduled_posts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_posts_status_idx" ON "scheduled_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_posts_scheduled_time_idx" ON "scheduled_posts" USING btree ("scheduled_time");--> statement-breakpoint
CREATE INDEX "scheduled_posts_created_by_idx" ON "scheduled_posts" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "system_metrics_metric_bucket_idx" ON "system_metrics" USING btree ("metric_name","bucket_start");--> statement-breakpoint
CREATE INDEX "system_metrics_source_idx" ON "system_metrics" USING btree ("source");--> statement-breakpoint
CREATE INDEX "system_metrics_bucket_idx" ON "system_metrics" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "system_metrics_unique_idx" ON "system_metrics" USING btree ("metric_name","source","bucket_start","resolution_secs");--> statement-breakpoint
CREATE INDEX "user_ai_models_user_model_type_idx" ON "user_ai_models" USING btree ("user_id","model_type");--> statement-breakpoint
CREATE INDEX "releases_labelgrid_release_id_idx" ON "releases" USING btree ("labelgrid_release_id");