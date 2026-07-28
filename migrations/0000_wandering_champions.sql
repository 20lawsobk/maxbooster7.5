CREATE TYPE "public"."payment_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."revenue_source" AS ENUM('spotify', 'apple_music', 'youtube', 'soundcloud', 'licensing', 'sync', 'performance', 'mechanical', 'other');--> statement-breakpoint
CREATE TABLE "ad_ai_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" varchar(255) NOT NULL,
	"model_version" varchar(50) NOT NULL,
	"inference_inputs" jsonb,
	"inference_outputs" jsonb,
	"execution_time" integer,
	"deterministic" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_campaign_variants" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" integer NOT NULL,
	"creative_id" varchar(255),
	"platform" varchar(50) NOT NULL,
	"variant_name" varchar(50) NOT NULL,
	"content" jsonb,
	"predicted_ctr" numeric(5, 4),
	"predicted_engagement" numeric(5, 4),
	"predicted_conversion" numeric(5, 4),
	"virality_score" integer,
	"budget_allocation" numeric(10, 2),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"actual_metrics" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"objective" varchar(100) NOT NULL,
	"budget" real NOT NULL,
	"spent" real DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"status" varchar(50) NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"platforms" jsonb NOT NULL,
	"connected_platforms" jsonb,
	"personal_ad_network" jsonb,
	"ai_optimizations" jsonb,
	"organic_metrics" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_creatives" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"campaign_id" integer,
	"content_type" varchar(50) NOT NULL,
	"raw_content" text,
	"normalized_content" text,
	"asset_urls" text[] DEFAULT ARRAY[]::text[],
	"platform_variants" jsonb,
	"compliance_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"compliance_issues" jsonb,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_delivery_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" varchar(255) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"platform_ad_id" varchar(255),
	"delivery_status" varchar(50) NOT NULL,
	"platform_response" jsonb,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_insights" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"recommendations" jsonb NOT NULL,
	"performance_predictions" jsonb,
	"audience_insights" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_kill_rules" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" integer NOT NULL,
	"rule_type" varchar(50) NOT NULL,
	"condition" jsonb NOT NULL,
	"action" varchar(50) NOT NULL,
	"pivot_strategy" jsonb,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"triggered_count" integer DEFAULT 0,
	"last_triggered_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_platform_accounts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"platform_account_id" varchar(255) NOT NULL,
	"oauth_token_id" varchar(255),
	"ad_account_name" varchar(255),
	"currency" varchar(10) DEFAULT 'USD',
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ad_rule_executions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" varchar(255) NOT NULL,
	"variant_id" varchar(255),
	"trigger_reason" text NOT NULL,
	"action_taken" varchar(50) NOT NULL,
	"metrics_snapshot" jsonb,
	"learnings" text,
	"executed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'queued',
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_model_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version_number" varchar(50) NOT NULL,
	"version_hash" varchar(64) NOT NULL,
	"algorithm_changes" text,
	"parameters" jsonb,
	"training_dataset_id" uuid,
	"performance_metrics" jsonb,
	"status" varchar(50) DEFAULT 'development',
	"deployed_at" timestamp,
	"deprecated_at" timestamp,
	"rollback_to_version_id" uuid,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_model_versions_version_hash_unique" UNIQUE("version_hash")
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_name" varchar(255) NOT NULL,
	"model_type" varchar(100) NOT NULL,
	"description" text,
	"category" varchar(100),
	"current_version_id" uuid,
	"is_active" boolean DEFAULT true,
	"is_beta" boolean DEFAULT false,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_models_model_name_unique" UNIQUE("model_name")
);
--> statement-breakpoint
CREATE TABLE "analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"total_streams" integer DEFAULT 0,
	"total_revenue" numeric(10, 2) DEFAULT '0',
	"total_listeners" integer DEFAULT 0,
	"streams" integer DEFAULT 0,
	"revenue" numeric(10, 2) DEFAULT '0',
	"platform" varchar(100),
	"platform_data" jsonb,
	"track_data" jsonb,
	"audience_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_anomalies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"project_id" uuid,
	"metric_type" varchar(50) NOT NULL,
	"anomaly_type" varchar(50) NOT NULL,
	"severity" varchar(50) NOT NULL,
	"baseline_value" numeric(15, 2) NOT NULL,
	"actual_value" numeric(15, 2) NOT NULL,
	"deviation_percentage" numeric(10, 2) NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp,
	"notification_sent" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "asset_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"parent_id" uuid,
	"name" varchar(255) NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"tag" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_id" varchar NOT NULL,
	"kind" varchar(32) NOT NULL,
	"name" varchar(256) NOT NULL,
	"mime" varchar(128) NOT NULL,
	"bytes" integer NOT NULL,
	"storage_uri" text NOT NULL,
	"waveform_json" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audio_clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"file_path" text NOT NULL,
	"original_filename" varchar(255),
	"file_size" bigint,
	"duration" real NOT NULL,
	"sample_rate" integer,
	"channels" integer,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"offset" real DEFAULT 0,
	"gain" real DEFAULT 0,
	"fade_in" real DEFAULT 0,
	"fade_out" real DEFAULT 0,
	"reversed" boolean DEFAULT false,
	"time_stretch" real DEFAULT 1,
	"pitch_shift" real DEFAULT 0,
	"preserve_formants" boolean DEFAULT true,
	"waveform_data" jsonb,
	"peak_data" jsonb,
	"take_number" integer DEFAULT 1,
	"take_group_id" varchar(255),
	"is_comped" boolean DEFAULT false,
	"comp_source_ids" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audio_effects" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar,
	"project_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" varchar(100) NOT NULL,
	"plugin_id" varchar(100),
	"chain_position" integer DEFAULT 0,
	"bypass" boolean DEFAULT false,
	"parameters" jsonb,
	"preset_name" varchar(255),
	"wet_dry_mix" real DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"status_code" integer DEFAULT 200,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb,
	"hash" text NOT NULL,
	"prev_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_data" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" varchar,
	"parameter" varchar(100) NOT NULL,
	"parameter_type" varchar(50),
	"automation_points" jsonb NOT NULL,
	"curve_type" varchar(50) DEFAULT 'linear',
	"enabled" boolean DEFAULT true,
	"read_mode" varchar(50) DEFAULT 'read',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "autosaves" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" varchar NOT NULL,
	"label" varchar(128) DEFAULT 'autosave',
	"state" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "best_posting_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"day_of_week" integer NOT NULL,
	"hour" integer NOT NULL,
	"engagement_score" real NOT NULL,
	"sample_size" integer NOT NULL,
	"last_calculated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "black_box_royalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"source" varchar(100) NOT NULL,
	"track_title" varchar(255),
	"possible_track_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD',
	"period_start" timestamp,
	"period_end" timestamp,
	"claim_status" varchar(50) DEFAULT 'unclaimed',
	"claimed_at" timestamp,
	"match_confidence" real,
	"match_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"start_sec" numeric(12, 4) NOT NULL,
	"duration_sec" numeric(12, 4) NOT NULL,
	"offset_sec" numeric(12, 4) DEFAULT '0',
	"gain_db" numeric(6, 2) DEFAULT '0',
	"fade_in_sec" numeric(6, 3) DEFAULT '0',
	"fade_out_sec" numeric(6, 3) DEFAULT '0',
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "collaboration_cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"cursor_position" real NOT NULL,
	"viewport_start" real,
	"viewport_end" real,
	"selected_track_id" uuid,
	"color" varchar(20),
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaborator_tax_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"tax_id" varchar(20) NOT NULL,
	"tax_id_type" varchar(10) NOT NULL,
	"legal_name" varchar(255) NOT NULL,
	"address" varchar(500) NOT NULL,
	"city" varchar(100) NOT NULL,
	"state" varchar(2) NOT NULL,
	"zip_code" varchar(10) NOT NULL,
	"w9_on_file" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaborators" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"release_id" varchar(255),
	"track_id" varchar(255),
	"user_id" varchar(255),
	"email" varchar(255),
	"name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "competitive_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"competitor_name" varchar(255) NOT NULL,
	"competitor_id" varchar(255),
	"platform" varchar(50) NOT NULL,
	"monthly_listeners" integer,
	"followers" integer,
	"total_streams" bigint,
	"top_playlist_position" integer,
	"social_media_following" jsonb,
	"release_frequency" real,
	"avg_streams_per_release" integer,
	"benchmark_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_calendar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" varchar(255) NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"platforms" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"post_type" varchar(50) NOT NULL,
	"content" text,
	"media_urls" jsonb,
	"hashtags" jsonb,
	"mentions" jsonb,
	"location" varchar(255),
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_id_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"video_id" varchar(255),
	"video_url" varchar(500),
	"video_title" varchar(500),
	"channel_name" varchar(255),
	"claim_type" varchar(50) DEFAULT 'automatic',
	"claim_status" varchar(50) DEFAULT 'claimed',
	"policy" varchar(50) DEFAULT 'monetize',
	"match_duration" integer,
	"total_duration" integer,
	"views" integer DEFAULT 0,
	"estimated_revenue" numeric(10, 2) DEFAULT '0',
	"dispute_reason" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demographic_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"platform" varchar(50) NOT NULL,
	"age_range" varchar(20) NOT NULL,
	"gender" varchar(20),
	"country" varchar(100),
	"city" varchar(255),
	"listeners" integer DEFAULT 0,
	"streams" integer DEFAULT 0,
	"percentage" real,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "distribution_packages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" varchar(255),
	"upc" varchar(20),
	"album_title" varchar(255),
	"release_date" timestamp,
	"label" varchar(255),
	"artwork_url" text,
	"copyright_p" varchar(255),
	"copyright_c" varchar(255),
	"status" varchar(50) DEFAULT 'draft',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distribution_tracks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" varchar(255),
	"track_id" varchar(255),
	"isrc" varchar(20),
	"track_number" integer,
	"title" varchar(255),
	"artist" varchar(255),
	"genre" varchar(100),
	"explicit_content" boolean DEFAULT false,
	"lyrics" text,
	"credits" text,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "distro_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'queued',
	"external_id" varchar(255),
	"logs" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distro_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(64) NOT NULL,
	"slug" varchar(64) NOT NULL,
	"api_base" text,
	"auth_type" varchar(32),
	"delivery_method" varchar(32) DEFAULT 'api',
	"processing_time" varchar(64),
	"region" varchar(64) DEFAULT 'global',
	"category" varchar(32) DEFAULT 'streaming',
	"requirements" jsonb,
	"status" varchar(32) DEFAULT 'active',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "distro_providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "distro_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artist_id" varchar NOT NULL,
	"title" varchar(200) NOT NULL,
	"upc" varchar(32),
	"release_date" timestamp,
	"cover_art_url" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "distro_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"isrc" varchar(32),
	"audio_url" text,
	"metadata" jsonb,
	"track_number" integer
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"release_id" varchar(255),
	"platform" varchar(100),
	"amount" numeric(10, 2),
	"currency" varchar(10),
	"date" timestamp,
	"streams" integer DEFAULT 0,
	"report_date" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "embeddable_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" uuid,
	"player_name" varchar(255) NOT NULL,
	"widget_token" varchar(255) NOT NULL,
	"theme" varchar(50) DEFAULT 'dark',
	"primary_color" varchar(20) DEFAULT '#4ade80',
	"show_waveform" boolean DEFAULT true,
	"show_purchase_button" boolean DEFAULT true,
	"show_social_share" boolean DEFAULT true,
	"autoplay" boolean DEFAULT false,
	"width" integer DEFAULT 400,
	"height" integer DEFAULT 200,
	"embed_code" text,
	"play_count" integer DEFAULT 0,
	"click_through_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "embeddable_players_widget_token_unique" UNIQUE("widget_token")
);
--> statement-breakpoint
CREATE TABLE "explanation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inference_id" uuid NOT NULL,
	"explanation_type" varchar(100) NOT NULL,
	"feature_importance" jsonb,
	"decision_path" jsonb,
	"confidence" real,
	"human_readable" text,
	"visualization_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"export_type" varchar(32) NOT NULL,
	"format" varchar(16) NOT NULL,
	"sample_rate" integer NOT NULL,
	"bit_depth" integer NOT NULL,
	"quality" varchar(16),
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"file_path" varchar(500),
	"options" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flag_name" varchar(255) NOT NULL,
	"flag_type" varchar(50) NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT false,
	"rollout_percentage" integer DEFAULT 0,
	"target_users" jsonb,
	"target_environments" jsonb,
	"model_id" uuid,
	"expires_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "feature_flags_flag_name_unique" UNIQUE("flag_name")
);
--> statement-breakpoint
CREATE TABLE "forecast_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" uuid,
	"granularity" varchar(20) NOT NULL,
	"forecast_periods" jsonb NOT NULL,
	"baseline_period" varchar(50) NOT NULL,
	"confidence_level" integer DEFAULT 95 NOT NULL,
	"algorithm" varchar(50) DEFAULT 'exponential_smoothing' NOT NULL,
	"metadata" jsonb,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_melodies" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" varchar(255),
	"source_type" varchar(50),
	"source_text" text,
	"source_audio_path" text,
	"generated_notes" jsonb,
	"generated_chords" jsonb,
	"parameters" jsonb,
	"audio_file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"hashtag" varchar(100) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"category" varchar(100),
	"popularity" real,
	"competition" real,
	"avg_engagement" real,
	"trending" boolean DEFAULT false,
	"related_tags" jsonb,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service" text NOT NULL,
	"region" text DEFAULT 'global',
	"status" text NOT NULL,
	"latency_ms" integer DEFAULT 0,
	"error" text,
	"checked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "hyper_follow_pages" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"image_url" varchar(500),
	"links" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "hyper_follow_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'open',
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"created_by" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "inference_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"user_id" varchar,
	"inference_type" varchar(100) NOT NULL,
	"input_data" jsonb NOT NULL,
	"output_data" jsonb NOT NULL,
	"confidence_score" real,
	"execution_time_ms" integer NOT NULL,
	"success" boolean DEFAULT true,
	"error_message" text,
	"request_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_blacklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip_address" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"threat_type" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"blocked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"permanent" boolean DEFAULT false,
	"metadata" jsonb,
	CONSTRAINT "ip_blacklist_ip_address_unique" UNIQUE("ip_address")
);
--> statement-breakpoint
CREATE TABLE "isrc_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"isrc" varchar(12) NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"registrant_code" varchar(5) NOT NULL,
	"year_code" varchar(2) NOT NULL,
	"designation" varchar(5) NOT NULL,
	"metadata_hash" varchar(64) NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "isrc_registry_isrc_unique" UNIQUE("isrc")
);
--> statement-breakpoint
CREATE TABLE "jwt_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"access_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "license_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"template_name" varchar(255) NOT NULL,
	"license_type" varchar(50) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"usage_rights" jsonb NOT NULL,
	"distribution_limit" integer,
	"monetization_allowed" boolean DEFAULT true,
	"credit_required" boolean DEFAULT true,
	"exclusivity" boolean DEFAULT false,
	"royalty_split" integer,
	"terms_text" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "listing_stems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"stem_name" varchar(255) NOT NULL,
	"stem_type" varchar(50) NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_size" bigint NOT NULL,
	"format" varchar(20) NOT NULL,
	"sample_rate" integer,
	"bit_depth" integer,
	"price" numeric(10, 2),
	"download_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" varchar NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"price_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd',
	"license_type" varchar(50) NOT NULL,
	"exclusive_stock" integer DEFAULT 1,
	"preview_url" text,
	"download_url" text,
	"cover_art_url" text,
	"is_published" boolean DEFAULT false,
	"tags" jsonb,
	"metadata" jsonb,
	"play_count" integer DEFAULT 0,
	"like_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "log_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" varchar(20) NOT NULL,
	"service" varchar(100) NOT NULL,
	"message" text NOT NULL,
	"user_id" varchar,
	"context" jsonb,
	"stack_trace" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lyric_sync_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" uuid NOT NULL,
	"release_id" uuid,
	"user_id" varchar NOT NULL,
	"lrc_content" text NOT NULL,
	"language" varchar(20) DEFAULT 'en',
	"sync_type" varchar(50) DEFAULT 'line',
	"synced_by" varchar(50) DEFAULT 'manual',
	"line_count" integer,
	"duration" integer,
	"platform_status" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lyrics" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"content" text,
	"entries" jsonb DEFAULT '[]'::json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "markers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"time" real NOT NULL,
	"position" real NOT NULL,
	"color" varchar(50),
	"type" varchar(50) DEFAULT 'marker',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "midi_clips" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"start_time" real NOT NULL,
	"end_time" real NOT NULL,
	"notes" jsonb NOT NULL,
	"velocity" integer DEFAULT 100,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mix_busses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"color" varchar(50),
	"volume" real DEFAULT 0.8,
	"pan" real DEFAULT 0,
	"mute" boolean DEFAULT false,
	"solo" boolean DEFAULT false,
	"effects" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_type" text NOT NULL,
	"version" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"performance_metrics" jsonb,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false,
	"link" varchar(500),
	"metadata" jsonb,
	"email_sent" boolean DEFAULT false,
	"browser_sent" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "optimization_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"description" text NOT NULL,
	"metrics" jsonb,
	"executed_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimizer_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"state" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" varchar,
	"seller_id" varchar,
	"listing_id" uuid,
	"license_type" varchar(50) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd',
	"status" varchar(50) DEFAULT 'pending',
	"stripe_payment_intent_id" varchar(255),
	"stripe_charge_id" varchar(255),
	"license_document_url" text,
	"download_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"script_path" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'pending',
	"applied_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"details" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"order_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'usd',
	"type" varchar(50) NOT NULL,
	"stripe_transfer_id" varchar(255),
	"status" varchar(50) DEFAULT 'initiated',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payout_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"minimum_payout_amount" integer DEFAULT 100,
	"payout_frequency" varchar(20) DEFAULT 'monthly',
	"tax_form_completed" boolean DEFAULT false,
	"tax_country" varchar(100),
	"tax_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payout_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" varchar(255) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"stripe_payout_id" varchar(255),
	"status" varchar(50) DEFAULT 'pending',
	"method" varchar(50) DEFAULT 'stripe',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"metric_type" varchar(100) NOT NULL,
	"metric_value" real NOT NULL,
	"metric_unit" varchar(50),
	"aggregation_period" varchar(50),
	"sample_size" integer,
	"metadata" jsonb,
	"measured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" varchar(50) NOT NULL,
	"resource" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"allowed" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_network_impacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"network_reach" integer DEFAULT 0,
	"organic_impressions" integer DEFAULT 0,
	"organic_engagement" integer DEFAULT 0,
	"organic_shares" integer DEFAULT 0,
	"amplification_factor" real,
	"viral_coefficient" real,
	"cost_savings" numeric(10, 2),
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform_fee_percent" numeric(5, 2) DEFAULT '10.00',
	"currency" varchar(10) DEFAULT 'usd'
);
--> statement-breakpoint
CREATE TABLE "playlist_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"platform" varchar(50) NOT NULL,
	"playlist_name" varchar(255) NOT NULL,
	"playlist_id" varchar(255),
	"playlist_followers" integer,
	"playlist_type" varchar(50),
	"curator_name" varchar(255),
	"position" integer,
	"added_date" timestamp NOT NULL,
	"removed_date" timestamp,
	"streams_generated" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"name" varchar(256) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"version" varchar(32) DEFAULT '1.0.0',
	"manifest" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "plugin_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "plugin_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" uuid,
	"catalog_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"params" jsonb,
	"bypassed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "plugin_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"preset_name" varchar(255) NOT NULL,
	"plugin_type" varchar(100) NOT NULL,
	"plugin_id" varchar(255),
	"parameters" jsonb NOT NULL,
	"category" varchar(100),
	"is_default" boolean DEFAULT false,
	"is_public" boolean DEFAULT false,
	"download_count" integer DEFAULT 0,
	"rating" real,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"schedule_id" uuid,
	"platform" varchar(32) NOT NULL,
	"social_account_id" uuid NOT NULL,
	"variant_id" uuid,
	"status" varchar(32) DEFAULT 'scheduled',
	"external_post_id" varchar(256),
	"error" text,
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pre_release_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"pre_saves" integer DEFAULT 0,
	"pre_orders" integer DEFAULT 0,
	"email_captures" integer DEFAULT 0,
	"social_shares" integer DEFAULT 0,
	"referral_source" varchar(255),
	"country" varchar(100),
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pro_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"pro_name" varchar(100) NOT NULL,
	"work_id" varchar(255),
	"iswc" varchar(50),
	"registration_status" varchar(50) DEFAULT 'pending',
	"submitted_date" timestamp,
	"approved_date" timestamp,
	"writers" jsonb NOT NULL,
	"publishers" jsonb,
	"registration_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "producer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"bio" text,
	"profile_image_url" varchar(500),
	"banner_image_url" varchar(500),
	"location" varchar(255),
	"genres" jsonb,
	"social_links" jsonb,
	"verified_producer" boolean DEFAULT false,
	"total_sales" integer DEFAULT 0,
	"average_rating" real,
	"review_count" integer DEFAULT 0,
	"featured" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "producer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "project_collaborators" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" varchar,
	"role" varchar(50) DEFAULT 'viewer',
	"invited_by" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(32) DEFAULT 'editor'
);
--> statement-breakpoint
CREATE TABLE "project_royalty_splits" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"collaborator_id" varchar(255) NOT NULL,
	"split_percentage" numeric(5, 2) NOT NULL,
	"role" varchar(100),
	"effective_date" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"version_name" varchar(255),
	"description" text,
	"snapshot_data" jsonb NOT NULL,
	"file_references" jsonb,
	"is_auto_save" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"genre" varchar(100),
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"progress" integer DEFAULT 0,
	"duration" integer,
	"file_path" varchar(500),
	"file_name" varchar(255),
	"file_size" integer,
	"artwork_url" varchar(500),
	"streams" integer DEFAULT 0,
	"revenue" numeric(10, 2) DEFAULT '0',
	"type" varchar(50),
	"tags" text,
	"play_count" integer DEFAULT 0,
	"price" numeric(10, 2),
	"quality" varchar(50),
	"like_count" integer DEFAULT 0,
	"is_studio_project" boolean DEFAULT false,
	"is_template" boolean DEFAULT false,
	"bpm" integer DEFAULT 120,
	"time_signature" varchar(10) DEFAULT '4/4',
	"key" varchar(10) DEFAULT 'C',
	"sample_rate" integer DEFAULT 48000,
	"bit_depth" integer DEFAULT 24,
	"master_volume" real DEFAULT 0.8,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radio_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"station_name" varchar(255) NOT NULL,
	"station_call_sign" varchar(50),
	"station_format" varchar(100),
	"market" varchar(255),
	"market_size" varchar(50),
	"estimated_listeners" integer,
	"played_at" timestamp NOT NULL,
	"detection_source" varchar(100),
	"royalty_generated" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "refresh_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"project_id" uuid,
	"title" text NOT NULL,
	"artist" text NOT NULL,
	"album_art" varchar(500),
	"release_date" timestamp,
	"status" varchar(50) DEFAULT 'draft',
	"platforms" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"source" "revenue_source" NOT NULL,
	"source_type" varchar(50),
	"raw_amount" numeric(12, 2),
	"description" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revenue_import_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"filename" varchar(512) NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"rows_succeeded" integer DEFAULT 0 NOT NULL,
	"rows_failed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "revenue_import_history_file_hash_unique" UNIQUE("file_hash")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "royalty_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revenue_event_id" varchar NOT NULL,
	"collaborator_id" varchar(255) NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"split_percentage" numeric(5, 2) NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "royalty_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collaborator_id" varchar(255) NOT NULL,
	"project_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"stripe_payment_id" varchar(255),
	"ledger_entry_ids" text[],
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "royalty_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"recipient_id" varchar NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"kind" varchar(32) DEFAULT 'sale'
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"social_account_id" uuid NOT NULL,
	"scheduled_at" timestamp,
	"cadence_cron" varchar(64),
	"timezone" varchar(64) DEFAULT 'UTC',
	"enabled" boolean DEFAULT true,
	"use_optimizer" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "security_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"component" text NOT NULL,
	"severity" text NOT NULL,
	"description" text NOT NULL,
	"cve" text,
	"status" text DEFAULT 'open',
	"detected_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "security_threats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"threat_type" varchar(100) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"source" varchar(100),
	"ip_address" varchar(50),
	"user_id" varchar(255),
	"request_path" varchar(500),
	"request_method" varchar(10),
	"details" text NOT NULL,
	"blocked" boolean DEFAULT false,
	"healed" boolean DEFAULT false,
	"healing_status" varchar(50),
	"healing_duration" integer,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"healed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"user_agent" text,
	"ip" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_activity" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar NOT NULL,
	"account_id" varchar(256) NOT NULL,
	"username" varchar(256) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"name" varchar(128) NOT NULL,
	"prompt" text NOT NULL,
	"brand_constraints" jsonb,
	"objectives" jsonb,
	"platforms" jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'draft',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"variant_id" uuid,
	"platform" varchar(32) NOT NULL,
	"metric_at" timestamp DEFAULT now(),
	"impressions" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"clicks" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "social_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(32) NOT NULL,
	"name" varchar(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "split_sheet_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" uuid,
	"track_id" uuid,
	"document_name" varchar(255) NOT NULL,
	"document_url" varchar(500),
	"status" varchar(50) DEFAULT 'draft',
	"total_splits" integer NOT NULL,
	"signed_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "split_sheet_signatures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"collaborator_id" varchar,
	"collaborator_email" varchar(255) NOT NULL,
	"collaborator_name" varchar(255) NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"role" varchar(100),
	"signature_token" varchar(255),
	"signed_at" timestamp,
	"signature_data" text,
	"ip_address" varchar(50),
	"user_agent" text,
	"status" varchar(50) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "split_sheet_signatures_signature_token_unique" UNIQUE("signature_token")
);
--> statement-breakpoint
CREATE TABLE "stem_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"track_ids" jsonb NOT NULL,
	"export_format" varchar(20) NOT NULL,
	"sample_rate" integer DEFAULT 48000,
	"bit_depth" integer DEFAULT 24,
	"normalize" boolean DEFAULT true,
	"include_effects" boolean DEFAULT true,
	"zip_archive_url" varchar(500),
	"status" varchar(50) DEFAULT 'pending',
	"progress" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stem_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stem_id" uuid NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"download_token" varchar(255),
	"downloaded_at" timestamp,
	"download_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"story_type" varchar(50) NOT NULL,
	"media_url" varchar(500) NOT NULL,
	"media_type" varchar(50) NOT NULL,
	"duration" integer,
	"caption" text,
	"stickers" jsonb,
	"scheduled_for" timestamp NOT NULL,
	"status" varchar(50) DEFAULT 'scheduled',
	"published_at" timestamp,
	"external_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_collab_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" varchar,
	"awareness_state" jsonb,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "studio_collab_snapshots" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"document_state" text,
	"snapshot_hash" varchar(255),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "studio_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" varchar,
	"source_file_path" text NOT NULL,
	"target_format" varchar(16) NOT NULL,
	"quality_preset" varchar(16) NOT NULL,
	"bitrate" integer,
	"sample_rate" integer,
	"output_file_path" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "studio_tracks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"track_number" integer NOT NULL,
	"track_type" varchar(50) DEFAULT 'audio' NOT NULL,
	"input_channel" integer DEFAULT 1,
	"output_bus" varchar(50) DEFAULT 'master',
	"volume" real DEFAULT 0.8,
	"pan" real DEFAULT 0,
	"mute" boolean DEFAULT false,
	"solo" boolean DEFAULT false,
	"armed" boolean DEFAULT false,
	"effects" jsonb,
	"sends" jsonb,
	"color" varchar(50),
	"height" integer DEFAULT 100,
	"collapsed" boolean DEFAULT false,
	"input_monitoring" boolean DEFAULT false,
	"record_enabled" boolean DEFAULT false,
	"frozen" boolean DEFAULT false,
	"frozen_file_path" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "territory_release_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"release_id" uuid NOT NULL,
	"territory" varchar(100) NOT NULL,
	"release_date" timestamp NOT NULL,
	"timezone" varchar(100) DEFAULT 'UTC',
	"released_at" timestamp,
	"status" varchar(50) DEFAULT 'scheduled',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "territory_royalties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"territory" varchar(100) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"revenue_type" varchar(50) NOT NULL,
	"streams" integer DEFAULT 0,
	"revenue" numeric(10, 2) DEFAULT '0',
	"currency" varchar(10) DEFAULT 'USD',
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"reported_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tiktok_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"track_id" uuid,
	"release_id" uuid,
	"sound_id" varchar(255),
	"video_creations" integer DEFAULT 0,
	"total_views" bigint DEFAULT 0,
	"total_likes" bigint DEFAULT 0,
	"total_shares" integer DEFAULT 0,
	"total_comments" integer DEFAULT 0,
	"trending" boolean DEFAULT false,
	"trending_regions" jsonb,
	"top_creators" jsonb,
	"virality_score" real,
	"snapshot_date" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_revocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"reason" varchar(255),
	"revoked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"track_id" uuid,
	"bpm" numeric(6, 2),
	"musical_key" varchar(20),
	"scale" varchar(20),
	"genre" varchar(100),
	"mood" varchar(100),
	"energy" real,
	"danceability" real,
	"valence" real,
	"instrumentalness" real,
	"acousticness" real,
	"loudness_lufs" real,
	"spectral_centroid" real,
	"duration_seconds" integer,
	"beat_positions" jsonb,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text,
	"track_number" integer,
	"audio_url" varchar(500),
	"gain" real,
	"pan" real,
	"is_muted" boolean DEFAULT false,
	"is_solo" boolean DEFAULT false,
	"effects" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_name" varchar(255) NOT NULL,
	"dataset_type" varchar(100) NOT NULL,
	"description" text,
	"data_size" bigint,
	"record_count" integer,
	"data_location" varchar(500),
	"data_hash" varchar(64),
	"schema" jsonb,
	"metadata" jsonb,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trend_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"description" text NOT NULL,
	"impact" text NOT NULL,
	"metadata" jsonb,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unified_inbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"message_type" varchar(50) NOT NULL,
	"external_id" varchar(255),
	"from_username" varchar(255),
	"from_display_name" varchar(255),
	"content" text NOT NULL,
	"post_url" varchar(500),
	"is_read" boolean DEFAULT false,
	"is_replied" boolean DEFAULT false,
	"reply_text" text,
	"sentiment" varchar(20),
	"priority" varchar(20) DEFAULT 'normal',
	"received_at" timestamp DEFAULT now() NOT NULL,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upc_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"upc" varchar(12) NOT NULL,
	"user_id" varchar NOT NULL,
	"release_id" uuid,
	"prefix" varchar(6) NOT NULL,
	"item_reference" varchar(5) NOT NULL,
	"check_digit" varchar(1) NOT NULL,
	"metadata_hash" varchar(64) NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "upc_registry_upc_unique" UNIQUE("upc")
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"filename" varchar(512) NOT NULL,
	"total_size" bigint NOT NULL,
	"chunk_size" integer DEFAULT 5242880 NOT NULL,
	"total_chunks" integer NOT NULL,
	"uploaded_chunks" integer DEFAULT 0 NOT NULL,
	"chunks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"file_hash" varchar(64),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"final_path" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"folder_id" uuid,
	"project_id" uuid,
	"name" varchar(255) NOT NULL,
	"description" text,
	"asset_type" varchar(50) NOT NULL,
	"file_type" varchar(50) NOT NULL,
	"file_path" text NOT NULL,
	"file_size" bigint NOT NULL,
	"mime_type" varchar(100),
	"duration" real,
	"sample_rate" integer,
	"bit_depth" integer,
	"channels" integer,
	"bpm" integer,
	"key" varchar(10),
	"waveform_data" jsonb,
	"metadata" jsonb,
	"is_public" boolean DEFAULT false,
	"download_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(255),
	"last_name" varchar(255),
	"profile_image_url" varchar(500),
	"is_admin" boolean DEFAULT false,
	"subscription_tier" varchar(50),
	"stripe_customer_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_connected_account_id" varchar(255),
	"stripe_bank_account_id" varchar(255),
	"total_payouts" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"username" varchar(255),
	"password" text,
	"role" varchar(50) DEFAULT 'user',
	"google_id" varchar(255),
	"subscription_plan" varchar(50),
	"subscription_status" varchar(50),
	"trial_ends_at" timestamp,
	"subscription_ends_at" timestamp,
	"facebook_token" text,
	"instagram_token" text,
	"twitter_token" text,
	"youtube_token" text,
	"tiktok_token" text,
	"linkedin_token" text,
	"threads_token" text,
	"google_business_token" text,
	"notification_preferences" jsonb DEFAULT '{"email":true,"browser":true,"releases":true,"earnings":true,"sales":true,"marketing":true,"system":true}'::jsonb,
	"push_subscription" jsonb,
	"has_completed_onboarding" boolean DEFAULT false,
	"onboarding_data" jsonb,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"platform" varchar(32) NOT NULL,
	"title" varchar(256),
	"body" text NOT NULL,
	"media" jsonb,
	"ai_meta" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "virtual_instruments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar NOT NULL,
	"name" varchar(255) NOT NULL,
	"plugin_id" varchar(100) NOT NULL,
	"preset" varchar(255),
	"parameters" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_event_id" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) NOT NULL,
	"response_code" integer,
	"response_body" text,
	"error" text,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempted_at" timestamp DEFAULT now() NOT NULL,
	"next_retry_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "webhook_dead_letter_queue" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"webhook_event_id" integer NOT NULL,
	"attempts" integer NOT NULL,
	"last_error" text NOT NULL,
	"payload" jsonb NOT NULL,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"status" varchar(20) DEFAULT 'queued' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" varchar(50) NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"raw" jsonb NOT NULL,
	"processed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "ad_ai_runs" ADD CONSTRAINT "ad_ai_runs_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_variants" ADD CONSTRAINT "ad_campaign_variants_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_campaign_variants" ADD CONSTRAINT "ad_campaign_variants_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_delivery_logs" ADD CONSTRAINT "ad_delivery_logs_variant_id_ad_campaign_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_campaign_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_insights" ADD CONSTRAINT "ad_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_kill_rules" ADD CONSTRAINT "ad_kill_rules_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_platform_accounts" ADD CONSTRAINT "ad_platform_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_rule_executions" ADD CONSTRAINT "ad_rule_executions_rule_id_ad_kill_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."ad_kill_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_rule_executions" ADD CONSTRAINT "ad_rule_executions_variant_id_ad_campaign_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."ad_campaign_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_versions" ADD CONSTRAINT "ai_model_versions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_versions" ADD CONSTRAINT "ai_model_versions_training_dataset_id_training_datasets_id_fk" FOREIGN KEY ("training_dataset_id") REFERENCES "public"."training_datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_versions" ADD CONSTRAINT "ai_model_versions_rollback_to_version_id_ai_model_versions_id_fk" FOREIGN KEY ("rollback_to_version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_versions" ADD CONSTRAINT "ai_model_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_folders" ADD CONSTRAINT "asset_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_tags" ADD CONSTRAINT "asset_tags_asset_id_user_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."user_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_effects" ADD CONSTRAINT "audio_effects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_data" ADD CONSTRAINT "automation_data_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autosaves" ADD CONSTRAINT "autosaves_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "best_posting_times" ADD CONSTRAINT "best_posting_times_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_box_royalties" ADD CONSTRAINT "black_box_royalties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_box_royalties" ADD CONSTRAINT "black_box_royalties_possible_track_id_tracks_id_fk" FOREIGN KEY ("possible_track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_cursors" ADD CONSTRAINT "collaboration_cursors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaboration_cursors" ADD CONSTRAINT "collaboration_cursors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborator_tax_profiles" ADD CONSTRAINT "collaborator_tax_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitive_analysis" ADD CONSTRAINT "competitive_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_calendar" ADD CONSTRAINT "content_calendar_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_id_claims" ADD CONSTRAINT "content_id_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_id_claims" ADD CONSTRAINT "content_id_claims_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_id_claims" ADD CONSTRAINT "content_id_claims_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demographic_insights" ADD CONSTRAINT "demographic_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demographic_insights" ADD CONSTRAINT "demographic_insights_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demographic_insights" ADD CONSTRAINT "demographic_insights_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_packages" ADD CONSTRAINT "distribution_packages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_tracks" ADD CONSTRAINT "distribution_tracks_package_id_distribution_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."distribution_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_tracks" ADD CONSTRAINT "distribution_tracks_track_id_studio_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."studio_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddable_players" ADD CONSTRAINT "embeddable_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "embeddable_players" ADD CONSTRAINT "embeddable_players_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "explanation_logs" ADD CONSTRAINT "explanation_logs_inference_id_inference_runs_id_fk" FOREIGN KEY ("inference_id") REFERENCES "public"."inference_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_snapshots" ADD CONSTRAINT "forecast_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_melodies" ADD CONSTRAINT "generated_melodies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_melodies" ADD CONSTRAINT "generated_melodies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_research" ADD CONSTRAINT "hashtag_research_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_runs" ADD CONSTRAINT "inference_runs_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_runs" ADD CONSTRAINT "inference_runs_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference_runs" ADD CONSTRAINT "inference_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isrc_registry" ADD CONSTRAINT "isrc_registry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "isrc_registry" ADD CONSTRAINT "isrc_registry_track_id_distro_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."distro_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jwt_tokens" ADD CONSTRAINT "jwt_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license_templates" ADD CONSTRAINT "license_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likes" ADD CONSTRAINT "likes_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_stems" ADD CONSTRAINT "listing_stems_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_events" ADD CONSTRAINT "log_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyric_sync_data" ADD CONSTRAINT "lyric_sync_data_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyric_sync_data" ADD CONSTRAINT "lyric_sync_data_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyric_sync_data" ADD CONSTRAINT "lyric_sync_data_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lyrics" ADD CONSTRAINT "lyrics_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mix_busses" ADD CONSTRAINT "mix_busses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_events" ADD CONSTRAINT "payout_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_settings" ADD CONSTRAINT "payout_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_network_impacts" ADD CONSTRAINT "personal_network_impacts_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_network_impacts" ADD CONSTRAINT "personal_network_impacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracking" ADD CONSTRAINT "playlist_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracking" ADD CONSTRAINT "playlist_tracking_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_tracking" ADD CONSTRAINT "playlist_tracking_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_presets" ADD CONSTRAINT "plugin_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_release_analytics" ADD CONSTRAINT "pre_release_analytics_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_release_analytics" ADD CONSTRAINT "pre_release_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_registrations" ADD CONSTRAINT "pro_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_registrations" ADD CONSTRAINT "pro_registrations_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pro_registrations" ADD CONSTRAINT "pro_registrations_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_royalty_splits" ADD CONSTRAINT "project_royalty_splits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_royalty_splits" ADD CONSTRAINT "project_royalty_splits_collaborator_id_users_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_plays" ADD CONSTRAINT "radio_plays_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_plays" ADD CONSTRAINT "radio_plays_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radio_plays" ADD CONSTRAINT "radio_plays_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_import_history" ADD CONSTRAINT "revenue_import_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_revenue_event_id_revenue_events_id_fk" FOREIGN KEY ("revenue_event_id") REFERENCES "public"."revenue_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_collaborator_id_users_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_ledger" ADD CONSTRAINT "royalty_ledger_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_collaborator_id_users_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_payments" ADD CONSTRAINT "royalty_payments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_splits" ADD CONSTRAINT "royalty_splits_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "royalty_splits" ADD CONSTRAINT "royalty_splits_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_sheet_documents" ADD CONSTRAINT "split_sheet_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_sheet_documents" ADD CONSTRAINT "split_sheet_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_sheet_documents" ADD CONSTRAINT "split_sheet_documents_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_sheet_signatures" ADD CONSTRAINT "split_sheet_signatures_document_id_split_sheet_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."split_sheet_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_sheet_signatures" ADD CONSTRAINT "split_sheet_signatures_collaborator_id_users_id_fk" FOREIGN KEY ("collaborator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stem_exports" ADD CONSTRAINT "stem_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stem_exports" ADD CONSTRAINT "stem_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stem_orders" ADD CONSTRAINT "stem_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stem_orders" ADD CONSTRAINT "stem_orders_stem_id_listing_stems_id_fk" FOREIGN KEY ("stem_id") REFERENCES "public"."listing_stems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_schedules" ADD CONSTRAINT "story_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_collab_sessions" ADD CONSTRAINT "studio_collab_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_collab_sessions" ADD CONSTRAINT "studio_collab_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_collab_snapshots" ADD CONSTRAINT "studio_collab_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_conversions" ADD CONSTRAINT "studio_conversions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_conversions" ADD CONSTRAINT "studio_conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_tracks" ADD CONSTRAINT "studio_tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territory_release_dates" ADD CONSTRAINT "territory_release_dates_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territory_royalties" ADD CONSTRAINT "territory_royalties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territory_royalties" ADD CONSTRAINT "territory_royalties_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "territory_royalties" ADD CONSTRAINT "territory_royalties_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_analytics" ADD CONSTRAINT "tiktok_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_analytics" ADD CONSTRAINT "tiktok_analytics_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_analytics" ADD CONSTRAINT "tiktok_analytics_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "token_revocations" ADD CONSTRAINT "token_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unified_inbox_messages" ADD CONSTRAINT "unified_inbox_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upc_registry" ADD CONSTRAINT "upc_registry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upc_registry" ADD CONSTRAINT "upc_registry_release_id_distro_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."distro_releases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_folder_id_asset_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."asset_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_dead_letter_queue" ADD CONSTRAINT "webhook_dead_letter_queue_webhook_event_id_webhook_events_id_fk" FOREIGN KEY ("webhook_event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_ai_runs_creative_id_idx" ON "ad_ai_runs" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_variants_campaign_id_idx" ON "ad_campaign_variants" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_campaign_variants_platform_idx" ON "ad_campaign_variants" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_campaign_variants_status_idx" ON "ad_campaign_variants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_campaigns_user_id_idx" ON "ad_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_campaigns_status_idx" ON "ad_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_creatives_user_id_idx" ON "ad_creatives" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_campaign_id_idx" ON "ad_creatives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_creatives_status_idx" ON "ad_creatives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_delivery_logs_variant_id_idx" ON "ad_delivery_logs" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "ad_delivery_logs_platform_idx" ON "ad_delivery_logs" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_delivery_logs_status_idx" ON "ad_delivery_logs" USING btree ("delivery_status");--> statement-breakpoint
CREATE INDEX "ad_insights_user_id_idx" ON "ad_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_insights_created_at_idx" ON "ad_insights" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ad_kill_rules_campaign_id_idx" ON "ad_kill_rules" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_kill_rules_status_idx" ON "ad_kill_rules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ad_platform_accounts_user_id_idx" ON "ad_platform_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_platform_accounts_platform_idx" ON "ad_platform_accounts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_rule_executions_rule_id_idx" ON "ad_rule_executions" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "ad_rule_executions_variant_id_idx" ON "ad_rule_executions" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "ai_model_versions_model_id_idx" ON "ai_model_versions" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_model_versions_version_hash_idx" ON "ai_model_versions" USING btree ("version_hash");--> statement-breakpoint
CREATE INDEX "ai_model_versions_status_idx" ON "ai_model_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_model_versions_deployed_at_idx" ON "ai_model_versions" USING btree ("deployed_at");--> statement-breakpoint
CREATE INDEX "ai_models_model_name_idx" ON "ai_models" USING btree ("model_name");--> statement-breakpoint
CREATE INDEX "ai_models_model_type_idx" ON "ai_models" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "ai_models_category_idx" ON "ai_models" USING btree ("category");--> statement-breakpoint
CREATE INDEX "ai_models_is_active_idx" ON "ai_models" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "analytics_user_id_idx" ON "analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_date_idx" ON "analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "analytics_user_date_idx" ON "analytics" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "analytics_user_created_at_idx" ON "analytics" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_user_id_idx" ON "analytics_anomalies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_project_id_idx" ON "analytics_anomalies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_metric_type_idx" ON "analytics_anomalies" USING btree ("metric_type");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_severity_idx" ON "analytics_anomalies" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_detected_at_idx" ON "analytics_anomalies" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "analytics_anomalies_acknowledged_at_idx" ON "analytics_anomalies" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE INDEX "asset_folders_user_id_idx" ON "asset_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "asset_folders_parent_id_idx" ON "asset_folders" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "asset_folders_user_path_idx" ON "asset_folders" USING btree ("user_id","path");--> statement-breakpoint
CREATE INDEX "asset_tags_asset_id_idx" ON "asset_tags" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "asset_tags_tag_idx" ON "asset_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "asset_tags_asset_tag_idx" ON "asset_tags" USING btree ("asset_id","tag");--> statement-breakpoint
CREATE INDEX "audio_clips_track_id_idx" ON "audio_clips" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "audio_clips_take_group_id_idx" ON "audio_clips" USING btree ("take_group_id");--> statement-breakpoint
CREATE INDEX "best_posting_times_user_id_idx" ON "best_posting_times" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "best_posting_times_platform_idx" ON "best_posting_times" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "best_posting_times_user_platform_idx" ON "best_posting_times" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "black_box_royalties_user_id_idx" ON "black_box_royalties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "black_box_royalties_source_idx" ON "black_box_royalties" USING btree ("source");--> statement-breakpoint
CREATE INDEX "black_box_royalties_claim_status_idx" ON "black_box_royalties" USING btree ("claim_status");--> statement-breakpoint
CREATE INDEX "black_box_royalties_possible_track_id_idx" ON "black_box_royalties" USING btree ("possible_track_id");--> statement-breakpoint
CREATE INDEX "collaboration_cursors_project_id_idx" ON "collaboration_cursors" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "collaboration_cursors_user_id_idx" ON "collaboration_cursors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collaboration_cursors_project_user_idx" ON "collaboration_cursors" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "collaborator_tax_profiles_user_id_idx" ON "collaborator_tax_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitive_analysis_user_id_idx" ON "competitive_analysis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "competitive_analysis_competitor_name_idx" ON "competitive_analysis" USING btree ("competitor_name");--> statement-breakpoint
CREATE INDEX "competitive_analysis_platform_idx" ON "competitive_analysis" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "competitive_analysis_benchmark_date_idx" ON "competitive_analysis" USING btree ("benchmark_date");--> statement-breakpoint
CREATE INDEX "content_calendar_user_id_idx" ON "content_calendar" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_calendar_scheduled_for_idx" ON "content_calendar" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "content_calendar_status_idx" ON "content_calendar" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_id_claims_user_id_idx" ON "content_id_claims" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_id_claims_track_id_idx" ON "content_id_claims" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "content_id_claims_video_id_idx" ON "content_id_claims" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "content_id_claims_claim_status_idx" ON "content_id_claims" USING btree ("claim_status");--> statement-breakpoint
CREATE INDEX "demographic_insights_user_id_idx" ON "demographic_insights" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "demographic_insights_track_id_idx" ON "demographic_insights" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "demographic_insights_platform_idx" ON "demographic_insights" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "demographic_insights_country_idx" ON "demographic_insights" USING btree ("country");--> statement-breakpoint
CREATE INDEX "demographic_insights_snapshot_date_idx" ON "demographic_insights" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "distribution_packages_project_id_idx" ON "distribution_packages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "distribution_packages_user_id_idx" ON "distribution_packages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "distribution_packages_status_idx" ON "distribution_packages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "distribution_packages_user_status_created_idx" ON "distribution_packages" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "distribution_tracks_package_id_idx" ON "distribution_tracks" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "distribution_tracks_track_id_idx" ON "distribution_tracks" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "embeddable_players_user_id_idx" ON "embeddable_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "embeddable_players_listing_id_idx" ON "embeddable_players" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "embeddable_players_widget_token_idx" ON "embeddable_players" USING btree ("widget_token");--> statement-breakpoint
CREATE INDEX "explanation_logs_inference_id_idx" ON "explanation_logs" USING btree ("inference_id");--> statement-breakpoint
CREATE INDEX "explanation_logs_explanation_type_idx" ON "explanation_logs" USING btree ("explanation_type");--> statement-breakpoint
CREATE INDEX "explanation_logs_created_at_idx" ON "explanation_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "export_jobs_project_id_idx" ON "export_jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "export_jobs_user_id_idx" ON "export_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "feature_flags_flag_name_idx" ON "feature_flags" USING btree ("flag_name");--> statement-breakpoint
CREATE INDEX "feature_flags_is_enabled_idx" ON "feature_flags" USING btree ("is_enabled");--> statement-breakpoint
CREATE INDEX "feature_flags_model_id_idx" ON "feature_flags" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "forecast_snapshots_user_id_idx" ON "forecast_snapshots" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "forecast_snapshots_project_id_idx" ON "forecast_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "forecast_snapshots_granularity_idx" ON "forecast_snapshots" USING btree ("granularity");--> statement-breakpoint
CREATE INDEX "generated_melodies_project_id_idx" ON "generated_melodies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "generated_melodies_user_id_idx" ON "generated_melodies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hashtag_research_user_id_idx" ON "hashtag_research" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hashtag_research_hashtag_idx" ON "hashtag_research" USING btree ("hashtag");--> statement-breakpoint
CREATE INDEX "hashtag_research_platform_idx" ON "hashtag_research" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "hashtag_research_trending_idx" ON "hashtag_research" USING btree ("trending");--> statement-breakpoint
CREATE INDEX "inference_runs_model_id_idx" ON "inference_runs" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "inference_runs_version_id_idx" ON "inference_runs" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "inference_runs_user_id_idx" ON "inference_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "inference_runs_inference_type_idx" ON "inference_runs" USING btree ("inference_type");--> statement-breakpoint
CREATE INDEX "inference_runs_created_at_idx" ON "inference_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inference_runs_request_id_idx" ON "inference_runs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "ip_blacklist_ip_address_idx" ON "ip_blacklist" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "ip_blacklist_expires_at_idx" ON "ip_blacklist" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "isrc_registry_isrc_idx" ON "isrc_registry" USING btree ("isrc");--> statement-breakpoint
CREATE INDEX "isrc_registry_user_id_idx" ON "isrc_registry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "isrc_registry_track_id_idx" ON "isrc_registry" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "jwt_tokens_user_id_idx" ON "jwt_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "jwt_tokens_expires_at_idx" ON "jwt_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "license_templates_user_id_idx" ON "license_templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "license_templates_license_type_idx" ON "license_templates" USING btree ("license_type");--> statement-breakpoint
CREATE INDEX "license_templates_is_active_idx" ON "license_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "likes_user_listing_idx" ON "likes" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "likes_unique_user_listing" ON "likes" USING btree ("user_id","listing_id");--> statement-breakpoint
CREATE INDEX "listing_stems_listing_id_idx" ON "listing_stems" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_stems_stem_type_idx" ON "listing_stems" USING btree ("stem_type");--> statement-breakpoint
CREATE INDEX "listings_owner_id_idx" ON "listings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "listings_is_published_idx" ON "listings" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "listings_created_at_idx" ON "listings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "listings_owner_published_idx" ON "listings" USING btree ("owner_id","is_published");--> statement-breakpoint
CREATE INDEX "log_events_level_idx" ON "log_events" USING btree ("level");--> statement-breakpoint
CREATE INDEX "log_events_service_idx" ON "log_events" USING btree ("service");--> statement-breakpoint
CREATE INDEX "log_events_user_id_idx" ON "log_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "log_events_timestamp_idx" ON "log_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "log_events_level_service_idx" ON "log_events" USING btree ("level","service");--> statement-breakpoint
CREATE INDEX "lyric_sync_data_track_id_idx" ON "lyric_sync_data" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "lyric_sync_data_release_id_idx" ON "lyric_sync_data" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "lyric_sync_data_user_id_idx" ON "lyric_sync_data" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "model_versions_model_type_idx" ON "model_versions" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "model_versions_is_active_idx" ON "model_versions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "model_versions_created_at_idx" ON "model_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "optimization_tasks_task_type_idx" ON "optimization_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "optimization_tasks_status_idx" ON "optimization_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "optimization_tasks_created_at_idx" ON "optimization_tasks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_id_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "orders_seller_id_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "orders_listing_id_idx" ON "orders" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_email_idx" ON "password_reset_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "payment_methods_user_id_idx" ON "payment_methods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_methods_is_default_idx" ON "payment_methods" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "payout_settings_user_id_idx" ON "payout_settings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payouts_user_id_idx" ON "payouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payouts_status_idx" ON "payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payouts_created_at_idx" ON "payouts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "performance_metrics_model_id_idx" ON "performance_metrics" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "performance_metrics_version_id_idx" ON "performance_metrics" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "performance_metrics_metric_type_idx" ON "performance_metrics" USING btree ("metric_type");--> statement-breakpoint
CREATE INDEX "performance_metrics_measured_at_idx" ON "performance_metrics" USING btree ("measured_at");--> statement-breakpoint
CREATE INDEX "permissions_role_resource_action_idx" ON "permissions" USING btree ("role","resource","action");--> statement-breakpoint
CREATE INDEX "personal_network_impacts_campaign_id_idx" ON "personal_network_impacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "personal_network_impacts_user_id_idx" ON "personal_network_impacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "personal_network_impacts_platform_idx" ON "personal_network_impacts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "personal_network_impacts_snapshot_date_idx" ON "personal_network_impacts" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "playlist_tracking_user_id_idx" ON "playlist_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playlist_tracking_track_id_idx" ON "playlist_tracking" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "playlist_tracking_platform_idx" ON "playlist_tracking" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "playlist_tracking_is_active_idx" ON "playlist_tracking" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "playlist_tracking_added_date_idx" ON "playlist_tracking" USING btree ("added_date");--> statement-breakpoint
CREATE INDEX "plugin_presets_user_id_idx" ON "plugin_presets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plugin_presets_plugin_type_idx" ON "plugin_presets" USING btree ("plugin_type");--> statement-breakpoint
CREATE INDEX "plugin_presets_category_idx" ON "plugin_presets" USING btree ("category");--> statement-breakpoint
CREATE INDEX "plugin_presets_is_public_idx" ON "plugin_presets" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "posts_campaign_id_idx" ON "posts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "posts_platform_idx" ON "posts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "posts_status_idx" ON "posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "posts_social_account_id_idx" ON "posts" USING btree ("social_account_id");--> statement-breakpoint
CREATE INDEX "posts_campaign_platform_scheduled_idx" ON "posts" USING btree ("campaign_id","platform","scheduled_at");--> statement-breakpoint
CREATE INDEX "posts_social_account_status_idx" ON "posts" USING btree ("social_account_id","status");--> statement-breakpoint
CREATE INDEX "pre_release_analytics_release_id_idx" ON "pre_release_analytics" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "pre_release_analytics_user_id_idx" ON "pre_release_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pre_release_analytics_platform_idx" ON "pre_release_analytics" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "pre_release_analytics_snapshot_date_idx" ON "pre_release_analytics" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "pro_registrations_user_id_idx" ON "pro_registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pro_registrations_track_id_idx" ON "pro_registrations" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "pro_registrations_pro_name_idx" ON "pro_registrations" USING btree ("pro_name");--> statement-breakpoint
CREATE INDEX "pro_registrations_work_id_idx" ON "pro_registrations" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "pro_registrations_status_idx" ON "pro_registrations" USING btree ("registration_status");--> statement-breakpoint
CREATE INDEX "producer_profiles_user_id_idx" ON "producer_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "producer_profiles_verified_idx" ON "producer_profiles" USING btree ("verified_producer");--> statement-breakpoint
CREATE INDEX "producer_profiles_featured_idx" ON "producer_profiles" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "project_collaborators_project_id_idx" ON "project_collaborators" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_collaborators_user_id_idx" ON "project_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_collaborators_project_user_idx" ON "project_collaborators" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_royalty_splits_project_id_idx" ON "project_royalty_splits" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_royalty_splits_collaborator_id_idx" ON "project_royalty_splits" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "project_versions_project_id_idx" ON "project_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_versions_user_id_idx" ON "project_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_versions_version_number_idx" ON "project_versions" USING btree ("version_number");--> statement-breakpoint
CREATE INDEX "project_versions_created_at_idx" ON "project_versions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_is_studio_project_idx" ON "projects" USING btree ("is_studio_project");--> statement-breakpoint
CREATE INDEX "projects_user_status_idx" ON "projects" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "projects_user_status_created_idx" ON "projects" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "radio_plays_user_id_idx" ON "radio_plays" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "radio_plays_track_id_idx" ON "radio_plays" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "radio_plays_station_name_idx" ON "radio_plays" USING btree ("station_name");--> statement-breakpoint
CREATE INDEX "radio_plays_played_at_idx" ON "radio_plays" USING btree ("played_at");--> statement-breakpoint
CREATE INDEX "radio_plays_market_idx" ON "radio_plays" USING btree ("market");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "releases_user_id_idx" ON "releases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "releases_status_idx" ON "releases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "releases_user_status_release_date_idx" ON "releases" USING btree ("user_id","status","release_date");--> statement-breakpoint
CREATE INDEX "revenue_events_project_id_idx" ON "revenue_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "revenue_events_occurred_at_idx" ON "revenue_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "revenue_events_source_idx" ON "revenue_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "revenue_events_project_created_at_idx" ON "revenue_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "revenue_import_history_user_id_idx" ON "revenue_import_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revenue_import_history_file_hash_idx" ON "revenue_import_history" USING btree ("file_hash");--> statement-breakpoint
CREATE INDEX "revenue_import_history_status_idx" ON "revenue_import_history" USING btree ("status");--> statement-breakpoint
CREATE INDEX "royalty_ledger_revenue_event_id_idx" ON "royalty_ledger" USING btree ("revenue_event_id");--> statement-breakpoint
CREATE INDEX "royalty_ledger_collaborator_id_idx" ON "royalty_ledger" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "royalty_ledger_project_id_idx" ON "royalty_ledger" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "royalty_ledger_is_paid_idx" ON "royalty_ledger" USING btree ("is_paid");--> statement-breakpoint
CREATE INDEX "royalty_ledger_collaborator_paid_created_idx" ON "royalty_ledger" USING btree ("collaborator_id","is_paid","created_at");--> statement-breakpoint
CREATE INDEX "royalty_payments_collaborator_id_idx" ON "royalty_payments" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "royalty_payments_project_id_idx" ON "royalty_payments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "royalty_payments_status_idx" ON "royalty_payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "royalty_payments_created_at_idx" ON "royalty_payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "royalty_payments_collaborator_status_created_idx" ON "royalty_payments" USING btree ("collaborator_id","status","created_at");--> statement-breakpoint
CREATE INDEX "security_threats_threat_type_idx" ON "security_threats" USING btree ("threat_type");--> statement-breakpoint
CREATE INDEX "security_threats_severity_idx" ON "security_threats" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "security_threats_ip_address_idx" ON "security_threats" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "security_threats_detected_at_idx" ON "security_threats" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_session_id_idx" ON "sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_last_activity_idx" ON "sessions" USING btree ("last_activity");--> statement-breakpoint
CREATE INDEX "social_campaigns_user_id_idx" ON "social_campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_campaigns_status_idx" ON "social_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "social_campaigns_user_status_created_idx" ON "social_campaigns" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "split_sheet_documents_user_id_idx" ON "split_sheet_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "split_sheet_documents_project_id_idx" ON "split_sheet_documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "split_sheet_documents_status_idx" ON "split_sheet_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "split_sheet_signatures_document_id_idx" ON "split_sheet_signatures" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "split_sheet_signatures_collaborator_id_idx" ON "split_sheet_signatures" USING btree ("collaborator_id");--> statement-breakpoint
CREATE INDEX "split_sheet_signatures_status_idx" ON "split_sheet_signatures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "split_sheet_signatures_signature_token_idx" ON "split_sheet_signatures" USING btree ("signature_token");--> statement-breakpoint
CREATE INDEX "stem_exports_project_id_idx" ON "stem_exports" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "stem_exports_user_id_idx" ON "stem_exports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stem_exports_status_idx" ON "stem_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stem_orders_order_id_idx" ON "stem_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stem_orders_stem_id_idx" ON "stem_orders" USING btree ("stem_id");--> statement-breakpoint
CREATE INDEX "story_schedules_user_id_idx" ON "story_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "story_schedules_platform_idx" ON "story_schedules" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "story_schedules_scheduled_for_idx" ON "story_schedules" USING btree ("scheduled_for");--> statement-breakpoint
CREATE INDEX "story_schedules_status_idx" ON "story_schedules" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_collab_sessions_project_id_idx" ON "studio_collab_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_collab_sessions_user_id_idx" ON "studio_collab_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_collab_snapshots_project_id_idx" ON "studio_collab_snapshots" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_collab_snapshots_created_at_idx" ON "studio_collab_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "studio_conversions_project_id_idx" ON "studio_conversions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_conversions_user_id_idx" ON "studio_conversions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_conversions_status_idx" ON "studio_conversions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_tracks_project_id_idx" ON "studio_tracks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "studio_tracks_track_number_idx" ON "studio_tracks" USING btree ("track_number");--> statement-breakpoint
CREATE INDEX "territory_release_dates_release_id_idx" ON "territory_release_dates" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "territory_release_dates_territory_idx" ON "territory_release_dates" USING btree ("territory");--> statement-breakpoint
CREATE INDEX "territory_release_dates_release_date_idx" ON "territory_release_dates" USING btree ("release_date");--> statement-breakpoint
CREATE INDEX "territory_release_dates_status_idx" ON "territory_release_dates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "territory_royalties_user_id_idx" ON "territory_royalties" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "territory_royalties_track_id_idx" ON "territory_royalties" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "territory_royalties_territory_idx" ON "territory_royalties" USING btree ("territory");--> statement-breakpoint
CREATE INDEX "territory_royalties_platform_idx" ON "territory_royalties" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "territory_royalties_period_start_idx" ON "territory_royalties" USING btree ("period_start");--> statement-breakpoint
CREATE INDEX "tiktok_analytics_user_id_idx" ON "tiktok_analytics" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tiktok_analytics_track_id_idx" ON "tiktok_analytics" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "tiktok_analytics_trending_idx" ON "tiktok_analytics" USING btree ("trending");--> statement-breakpoint
CREATE INDEX "tiktok_analytics_snapshot_date_idx" ON "tiktok_analytics" USING btree ("snapshot_date");--> statement-breakpoint
CREATE INDEX "token_revocations_token_id_idx" ON "token_revocations" USING btree ("token_id");--> statement-breakpoint
CREATE INDEX "token_revocations_user_id_idx" ON "token_revocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "track_analysis_project_id_idx" ON "track_analysis" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "track_analysis_track_id_idx" ON "track_analysis" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "training_datasets_dataset_name_idx" ON "training_datasets" USING btree ("dataset_name");--> statement-breakpoint
CREATE INDEX "training_datasets_dataset_type_idx" ON "training_datasets" USING btree ("dataset_type");--> statement-breakpoint
CREATE INDEX "training_datasets_is_active_idx" ON "training_datasets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "trend_events_source_idx" ON "trend_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "trend_events_event_type_idx" ON "trend_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "trend_events_impact_idx" ON "trend_events" USING btree ("impact");--> statement-breakpoint
CREATE INDEX "trend_events_detected_at_idx" ON "trend_events" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "unified_inbox_user_id_idx" ON "unified_inbox_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "unified_inbox_platform_idx" ON "unified_inbox_messages" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "unified_inbox_is_read_idx" ON "unified_inbox_messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "unified_inbox_received_at_idx" ON "unified_inbox_messages" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "unified_inbox_user_platform_idx" ON "unified_inbox_messages" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "upc_registry_upc_idx" ON "upc_registry" USING btree ("upc");--> statement-breakpoint
CREATE INDEX "upc_registry_user_id_idx" ON "upc_registry" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upc_registry_release_id_idx" ON "upc_registry" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_user_id_idx" ON "upload_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_status_idx" ON "upload_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "upload_sessions_created_at_idx" ON "upload_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_assets_user_id_idx" ON "user_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_assets_folder_id_idx" ON "user_assets" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "user_assets_project_id_idx" ON "user_assets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "user_assets_asset_type_idx" ON "user_assets" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "user_assets_user_asset_type_idx" ON "user_assets" USING btree ("user_id","asset_type");--> statement-breakpoint
CREATE INDEX "user_assets_created_at_idx" ON "user_assets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "webhook_attempts_webhook_event_id_idx" ON "webhook_attempts" USING btree ("webhook_event_id");--> statement-breakpoint
CREATE INDEX "webhook_attempts_status_idx" ON "webhook_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_attempts_next_retry_at_idx" ON "webhook_attempts" USING btree ("next_retry_at");--> statement-breakpoint
CREATE INDEX "webhook_dlq_webhook_event_id_idx" ON "webhook_dead_letter_queue" USING btree ("webhook_event_id");--> statement-breakpoint
CREATE INDEX "webhook_dlq_status_idx" ON "webhook_dead_letter_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "webhook_dlq_enqueued_at_idx" ON "webhook_dead_letter_queue" USING btree ("enqueued_at");