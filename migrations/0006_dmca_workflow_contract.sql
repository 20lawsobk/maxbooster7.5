-- Align the DMCA services with the durable columns they already read and write.
-- Idempotent for databases where some of these columns were added manually.
CREATE TABLE IF NOT EXISTS "dmca_notices" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL DEFAULT 'takedown',
  "content_type" text NOT NULL DEFAULT 'other',
  "content_id" varchar NOT NULL DEFAULT '',
  "content_owner_id" varchar,
  "claimant_name" text NOT NULL DEFAULT '',
  "claimant_email" text NOT NULL DEFAULT '',
  "claimant_address" text,
  "claimant_phone" text,
  "original_work_url" text,
  "original_work_description" text,
  "infringing_url" text,
  "signature" text,
  "good_faith_statement" boolean,
  "accuracy_statement" boolean,
  "perjury_statement" boolean,
  "description" text,
  "status" text DEFAULT 'pending',
  "related_notice_id" varchar,
  "counter_notice_reason" text,
  "counter_notice_email_state" text NOT NULL DEFAULT 'not_attempted',
  "counter_notice_email_message_id" text,
  "counter_notice_email_attempted_at" timestamp,
  "submitted_at" timestamp DEFAULT now(),
  "processed_at" timestamp,
  "processed_by" varchar,
  "admin_notes" text,
  "resolved_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'takedown';
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "content_owner_id" varchar;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "claimant_address" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "claimant_phone" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "original_work_url" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "original_work_description" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "infringing_url" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "signature" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "good_faith_statement" boolean;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "accuracy_statement" boolean;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "perjury_statement" boolean;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "related_notice_id" varchar;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "counter_notice_reason" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "counter_notice_email_state" text NOT NULL DEFAULT 'not_attempted';
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "counter_notice_email_message_id" text;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "counter_notice_email_attempted_at" timestamp;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "processed_at" timestamp;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "processed_by" varchar;
--> statement-breakpoint
ALTER TABLE "dmca_notices" ADD COLUMN IF NOT EXISTS "admin_notes" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dmca_notices_content_owner_id_idx" ON "dmca_notices" ("content_owner_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dmca_notices_related_notice_id_idx" ON "dmca_notices" ("related_notice_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dmca_strikes" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "notice_id" varchar,
  "content_type" text NOT NULL DEFAULT 'notice',
  "content_id" varchar NOT NULL DEFAULT '',
  "reason" text,
  "strike_number" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "revoked_at" timestamp,
  "revoked_by" varchar,
  "revoke_reason" text,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dmca_strikes" ADD COLUMN IF NOT EXISTS "strike_number" integer;
--> statement-breakpoint
ALTER TABLE "dmca_strikes" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "dmca_strikes" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp;
--> statement-breakpoint
ALTER TABLE "dmca_strikes" ADD COLUMN IF NOT EXISTS "revoked_by" varchar;
--> statement-breakpoint
ALTER TABLE "dmca_strikes" ADD COLUMN IF NOT EXISTS "revoke_reason" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_holds" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL,
  "content_type" text NOT NULL,
  "content_id" varchar NOT NULL,
  "reason" text,
  "hold_type" text DEFAULT 'dmca',
  "dmca_notice_id" varchar,
  "status" text DEFAULT 'active',
  "expires_at" timestamp,
  "released_at" timestamp,
  "released_by" varchar,
  "created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "legal_holds" ADD COLUMN IF NOT EXISTS "dmca_notice_id" varchar;
--> statement-breakpoint
ALTER TABLE "legal_holds" ADD COLUMN IF NOT EXISTS "released_at" timestamp;
--> statement-breakpoint
ALTER TABLE "legal_holds" ADD COLUMN IF NOT EXISTS "released_by" varchar;
--> statement-breakpoint
