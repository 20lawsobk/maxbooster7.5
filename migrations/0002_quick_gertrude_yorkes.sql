CREATE TYPE "public"."approval_status" AS ENUM('draft', 'pending_review', 'approved', 'rejected', 'published');--> statement-breakpoint
CREATE TYPE "public"."audio_format" AS ENUM('pcm16', 'pcm24', 'float32');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('content_creator', 'reviewer', 'manager', 'admin');--> statement-breakpoint
CREATE TABLE "ai_canary_deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"rollout_percentage" integer DEFAULT 5 NOT NULL,
	"target_percentage" integer DEFAULT 100 NOT NULL,
	"stage" varchar(50) DEFAULT 'initial' NOT NULL,
	"user_segment" jsonb,
	"performance_comparison" jsonb,
	"success_criteria" jsonb,
	"auto_advance" boolean DEFAULT true,
	"rollback_triggered" boolean DEFAULT false,
	"rollback_reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_advanced_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_deployment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"deployment_type" varchar(50) NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"environment" varchar(50) DEFAULT 'production' NOT NULL,
	"previous_version_id" uuid,
	"canary_deployment_id" uuid,
	"pre_deployment_checks" jsonb,
	"post_deployment_checks" jsonb,
	"performance_before_deployment" jsonb,
	"performance_after_deployment" jsonb,
	"rollback_triggered" boolean DEFAULT false,
	"rollback_reason" text,
	"deployed_by" varchar,
	"approved_by" varchar,
	"deployment_notes" text,
	"affected_users" integer,
	"downtime" integer,
	"deployed_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_retraining_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"previous_version_id" uuid,
	"new_version_id" uuid,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"trigger_reason" text NOT NULL,
	"dataset_info" jsonb,
	"training_metrics" jsonb,
	"validation_metrics" jsonb,
	"quality_checks_passed" boolean,
	"quality_check_results" jsonb,
	"approved_by" varchar,
	"approved_at" timestamp,
	"deployed_to_production" boolean DEFAULT false,
	"execution_time_ms" integer,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_retraining_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"trigger_type" varchar(50) NOT NULL,
	"frequency" varchar(50),
	"performance_threshold" jsonb,
	"drift_threshold" real,
	"is_active" boolean DEFAULT true,
	"last_triggered_at" timestamp,
	"next_scheduled_run" timestamp,
	"requires_approval" boolean DEFAULT false,
	"notification_emails" text[],
	"retraining_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"action" varchar(50) NOT NULL,
	"from_status" "approval_status",
	"to_status" "approval_status" NOT NULL,
	"comment" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" varchar(255),
	"message" text NOT NULL,
	"is_ai" boolean DEFAULT false,
	"is_staff" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255),
	"session_token" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'active',
	"escalated_to_ticket" uuid,
	"assigned_staff" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "chat_sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "compliance_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" varchar(255) NOT NULL,
	"standard" varchar(100) NOT NULL,
	"audit_type" varchar(100) NOT NULL,
	"audit_date" timestamp NOT NULL,
	"auditor" varchar(255),
	"auditor_contact" varchar(255),
	"scope" text,
	"findings" jsonb NOT NULL,
	"status" varchar(50) NOT NULL,
	"overall_score" real,
	"passed_controls" integer DEFAULT 0,
	"failed_controls" integer DEFAULT 0,
	"partial_controls" integer DEFAULT 0,
	"total_controls" integer DEFAULT 0,
	"critical_findings" integer DEFAULT 0,
	"high_findings" integer DEFAULT 0,
	"medium_findings" integer DEFAULT 0,
	"low_findings" integer DEFAULT 0,
	"recommendations" jsonb,
	"action_plan" text,
	"report_url" varchar(1000),
	"report_path" varchar(1000),
	"certificate_issued" boolean DEFAULT false,
	"certificate_valid_until" timestamp,
	"next_audit_date" timestamp,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"metadata" jsonb,
	CONSTRAINT "compliance_audits_audit_id_unique" UNIQUE("audit_id")
);
--> statement-breakpoint
CREATE TABLE "compliance_controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard" varchar(100) NOT NULL,
	"control_id" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'planned' NOT NULL,
	"evidence_urls" jsonb,
	"implementation_notes" text,
	"responsible_party" varchar(255),
	"automated_check" boolean DEFAULT false,
	"check_frequency" varchar(50),
	"last_audit_date" timestamp,
	"next_review_date" timestamp,
	"compliance_score" integer,
	"remediation_plan" text,
	"priority" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"evidence_type" varchar(100) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"file_path" varchar(1000),
	"file_url" varchar(1000),
	"file_size" integer,
	"mime_type" varchar(100),
	"metadata" jsonb,
	"automated" boolean DEFAULT false,
	"collection_method" varchar(255),
	"collected_by" varchar(255),
	"collected_at" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"verified" boolean DEFAULT false,
	"verified_by" varchar(255),
	"verified_at" timestamp,
	"hash_checksum" varchar(255),
	"related_standards" jsonb
);
--> statement-breakpoint
CREATE TABLE "knowledge_base_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" text NOT NULL,
	"category" varchar(100) NOT NULL,
	"tags" jsonb,
	"views" integer DEFAULT 0,
	"helpful_count" integer DEFAULT 0,
	"not_helpful_count" integer DEFAULT 0,
	"is_published" boolean DEFAULT false,
	"author_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_post_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"total_posts" integer NOT NULL,
	"processed_posts" integer DEFAULT 0,
	"successful_posts" integer DEFAULT 0,
	"failed_posts" integer DEFAULT 0,
	"status" varchar(32) DEFAULT 'pending',
	"validation_errors" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "support_ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"is_staff_reply" boolean DEFAULT false,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_ticket_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"tag" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"description" text NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"category" varchar(100),
	"assigned_to" varchar(255),
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"satisfaction" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "content" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "media_urls" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "approval_status" "approval_status" DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "submitted_by" varchar(255);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reviewed_by" varchar(255);--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "retry_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "audio_format" "audio_format" DEFAULT 'pcm24';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "max_tracks" integer DEFAULT 256;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "buffer_size" integer DEFAULT 256;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "social_role" "user_role" DEFAULT 'content_creator';--> statement-breakpoint
ALTER TABLE "ai_canary_deployments" ADD CONSTRAINT "ai_canary_deployments_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_canary_deployments" ADD CONSTRAINT "ai_canary_deployments_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_previous_version_id_ai_model_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_canary_deployment_id_ai_canary_deployments_id_fk" FOREIGN KEY ("canary_deployment_id") REFERENCES "public"."ai_canary_deployments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_deployed_by_users_id_fk" FOREIGN KEY ("deployed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_deployment_history" ADD CONSTRAINT "ai_deployment_history_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_runs" ADD CONSTRAINT "ai_retraining_runs_schedule_id_ai_retraining_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."ai_retraining_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_runs" ADD CONSTRAINT "ai_retraining_runs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_runs" ADD CONSTRAINT "ai_retraining_runs_previous_version_id_ai_model_versions_id_fk" FOREIGN KEY ("previous_version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_runs" ADD CONSTRAINT "ai_retraining_runs_new_version_id_ai_model_versions_id_fk" FOREIGN KEY ("new_version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_runs" ADD CONSTRAINT "ai_retraining_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_retraining_schedules" ADD CONSTRAINT "ai_retraining_schedules_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_escalated_to_ticket_support_tickets_id_fk" FOREIGN KEY ("escalated_to_ticket") REFERENCES "public"."support_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_assigned_staff_users_id_fk" FOREIGN KEY ("assigned_staff") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_base_articles" ADD CONSTRAINT "knowledge_base_articles_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_ticket_tags" ADD CONSTRAINT "support_ticket_tags_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_canary_deployments_model_id_idx" ON "ai_canary_deployments" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_canary_deployments_version_id_idx" ON "ai_canary_deployments" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ai_canary_deployments_stage_idx" ON "ai_canary_deployments" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "ai_canary_deployments_rollout_percentage_idx" ON "ai_canary_deployments" USING btree ("rollout_percentage");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_model_id_idx" ON "ai_deployment_history" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_version_id_idx" ON "ai_deployment_history" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_deployment_type_idx" ON "ai_deployment_history" USING btree ("deployment_type");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_environment_idx" ON "ai_deployment_history" USING btree ("environment");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_deployed_at_idx" ON "ai_deployment_history" USING btree ("deployed_at");--> statement-breakpoint
CREATE INDEX "ai_deployment_history_rollback_triggered_idx" ON "ai_deployment_history" USING btree ("rollback_triggered");--> statement-breakpoint
CREATE INDEX "ai_retraining_runs_schedule_id_idx" ON "ai_retraining_runs" USING btree ("schedule_id");--> statement-breakpoint
CREATE INDEX "ai_retraining_runs_model_id_idx" ON "ai_retraining_runs" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_retraining_runs_status_idx" ON "ai_retraining_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_retraining_runs_created_at_idx" ON "ai_retraining_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_retraining_schedules_model_id_idx" ON "ai_retraining_schedules" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_retraining_schedules_trigger_type_idx" ON "ai_retraining_schedules" USING btree ("trigger_type");--> statement-breakpoint
CREATE INDEX "ai_retraining_schedules_is_active_idx" ON "ai_retraining_schedules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ai_retraining_schedules_next_scheduled_run_idx" ON "ai_retraining_schedules" USING btree ("next_scheduled_run");--> statement-breakpoint
CREATE INDEX "approval_history_post_id_idx" ON "approval_history" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "approval_history_user_id_idx" ON "approval_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "approval_history_action_idx" ON "approval_history" USING btree ("action");--> statement-breakpoint
CREATE INDEX "approval_history_created_at_idx" ON "approval_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "approval_history_post_id_created_at_idx" ON "approval_history" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_sessions_session_token_idx" ON "chat_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "chat_sessions_status_idx" ON "chat_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chat_sessions_created_at_idx" ON "chat_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "compliance_audits_audit_id_idx" ON "compliance_audits" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "compliance_audits_standard_idx" ON "compliance_audits" USING btree ("standard");--> statement-breakpoint
CREATE INDEX "compliance_audits_audit_date_idx" ON "compliance_audits" USING btree ("audit_date");--> statement-breakpoint
CREATE INDEX "compliance_audits_status_idx" ON "compliance_audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compliance_audits_next_audit_date_idx" ON "compliance_audits" USING btree ("next_audit_date");--> statement-breakpoint
CREATE INDEX "compliance_controls_standard_idx" ON "compliance_controls" USING btree ("standard");--> statement-breakpoint
CREATE INDEX "compliance_controls_control_id_idx" ON "compliance_controls" USING btree ("control_id");--> statement-breakpoint
CREATE INDEX "compliance_controls_status_idx" ON "compliance_controls" USING btree ("status");--> statement-breakpoint
CREATE INDEX "compliance_controls_category_idx" ON "compliance_controls" USING btree ("category");--> statement-breakpoint
CREATE INDEX "compliance_controls_next_review_date_idx" ON "compliance_controls" USING btree ("next_review_date");--> statement-breakpoint
CREATE INDEX "compliance_controls_standard_control_idx" ON "compliance_controls" USING btree ("standard","control_id");--> statement-breakpoint
CREATE INDEX "compliance_evidence_control_id_idx" ON "compliance_evidence" USING btree ("control_id");--> statement-breakpoint
CREATE INDEX "compliance_evidence_evidence_type_idx" ON "compliance_evidence" USING btree ("evidence_type");--> statement-breakpoint
CREATE INDEX "compliance_evidence_collected_at_idx" ON "compliance_evidence" USING btree ("collected_at");--> statement-breakpoint
CREATE INDEX "compliance_evidence_valid_until_idx" ON "compliance_evidence" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "compliance_evidence_automated_idx" ON "compliance_evidence" USING btree ("automated");--> statement-breakpoint
CREATE INDEX "kb_articles_category_idx" ON "knowledge_base_articles" USING btree ("category");--> statement-breakpoint
CREATE INDEX "kb_articles_is_published_idx" ON "knowledge_base_articles" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "kb_articles_views_idx" ON "knowledge_base_articles" USING btree ("views");--> statement-breakpoint
CREATE INDEX "kb_articles_helpful_count_idx" ON "knowledge_base_articles" USING btree ("helpful_count");--> statement-breakpoint
CREATE INDEX "scheduled_post_batches_user_id_idx" ON "scheduled_post_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_post_batches_status_idx" ON "scheduled_post_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scheduled_post_batches_created_at_idx" ON "scheduled_post_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scheduled_post_batches_user_status_idx" ON "scheduled_post_batches" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_ticket_id_idx" ON "support_ticket_messages" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_ticket_messages_created_at_idx" ON "support_ticket_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_ticket_tags_ticket_id_idx" ON "support_ticket_tags" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "support_ticket_tags_tag_idx" ON "support_ticket_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "support_tickets_priority_idx" ON "support_tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "support_tickets_assigned_to_idx" ON "support_tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "support_tickets_created_at_idx" ON "support_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "support_tickets_user_status_idx" ON "support_tickets" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "posts_approval_status_idx" ON "posts" USING btree ("approval_status");--> statement-breakpoint
CREATE INDEX "posts_reviewed_by_idx" ON "posts" USING btree ("reviewed_by");--> statement-breakpoint
CREATE INDEX "posts_submitted_by_idx" ON "posts" USING btree ("submitted_by");--> statement-breakpoint
CREATE INDEX "posts_batch_id_idx" ON "posts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "posts_batch_status_idx" ON "posts" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "posts_scheduled_at_status_idx" ON "posts" USING btree ("scheduled_at","status");