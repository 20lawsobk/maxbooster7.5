CREATE TABLE "ad_audience_segments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" integer NOT NULL,
	"segment_name" varchar(255) NOT NULL,
	"segment_index" integer NOT NULL,
	"size" integer NOT NULL,
	"demographics" jsonb,
	"interests" text[],
	"behaviors" jsonb,
	"engagement_history" jsonb,
	"characteristics" text[],
	"targeting_recommendations" jsonb,
	"predicted_value" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_competitor_intelligence" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"competitor_name" varchar(255) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"posting_frequency" numeric(5, 2),
	"avg_engagement_rate" numeric(5, 4),
	"avg_likes" integer,
	"avg_comments" integer,
	"avg_shares" integer,
	"content_types" jsonb,
	"top_hashtags" text[],
	"posting_times" jsonb,
	"strengths" text[],
	"weaknesses" text[],
	"content_gaps" text[],
	"opportunities" text[],
	"analysis_data" jsonb,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_conversions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" varchar(255),
	"creative_id" varchar(255),
	"audience_segment_id" varchar(255),
	"conversion_type" varchar(50) NOT NULL,
	"conversion_value" numeric(10, 2) NOT NULL,
	"attribution_model" varchar(50) DEFAULT 'last_click' NOT NULL,
	"touchpoints" jsonb,
	"cost_per_conversion" numeric(10, 2),
	"roas" numeric(10, 2),
	"metadata" jsonb,
	"converted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_creative_predictions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" varchar(255) NOT NULL,
	"target_audience_id" varchar(255),
	"predicted_ctr" numeric(5, 4) NOT NULL,
	"predicted_engagement_rate" numeric(5, 4) NOT NULL,
	"predicted_conversion_rate" numeric(5, 4) NOT NULL,
	"predicted_virality_score" integer NOT NULL,
	"ctr_confidence_interval" jsonb,
	"engagement_confidence_interval" jsonb,
	"conversion_confidence_interval" jsonb,
	"features" jsonb,
	"comparison_data" jsonb,
	"actual_ctr" numeric(5, 4),
	"actual_engagement_rate" numeric(5, 4),
	"actual_conversion_rate" numeric(5, 4),
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_anomaly_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"anomaly_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"expected_value" numeric(15, 2) NOT NULL,
	"actual_value" numeric(15, 2) NOT NULL,
	"deviation_percentage" real NOT NULL,
	"deviation_score" real NOT NULL,
	"root_cause_analysis" jsonb NOT NULL,
	"correlated_events" jsonb,
	"correlated_campaigns" jsonb,
	"seasonality_factor" real,
	"revenue_impact" numeric(15, 2),
	"user_impact" integer,
	"alert_sent" boolean DEFAULT false,
	"alert_sent_at" timestamp,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"resolution_notes" text,
	"detected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_churn_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"churn_probability" real NOT NULL,
	"risk_level" varchar(20) NOT NULL,
	"time_window" integer NOT NULL,
	"top_risk_factors" jsonb NOT NULL,
	"engagement_score" real,
	"engagement_trend" varchar(20),
	"payment_failures" integer DEFAULT 0,
	"support_tickets" integer DEFAULT 0,
	"last_activity_days" integer,
	"feature_usage_score" real,
	"retention_recommendations" jsonb NOT NULL,
	"confidence_score" real NOT NULL,
	"predicted_at" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_cohort_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"cohort_type" varchar(100) NOT NULL,
	"cohort_identifier" varchar(255) NOT NULL,
	"cohort_start_date" timestamp NOT NULL,
	"cohort_size" integer NOT NULL,
	"metric_type" varchar(100) NOT NULL,
	"days_since_cohort_start" integer NOT NULL,
	"metric_value" numeric(15, 2) NOT NULL,
	"retention_rate" real,
	"average_ltv" numeric(10, 2),
	"average_engagement" real,
	"churn_rate" real,
	"conversion_rate" real,
	"comparison_to_average" real,
	"visualization_data" jsonb,
	"metadata" jsonb,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_metric_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"metric_type" varchar(50) NOT NULL,
	"horizon" varchar(20) NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"predicted_value" numeric(15, 2) NOT NULL,
	"confidence_level" real NOT NULL,
	"lower_bound" numeric(15, 2) NOT NULL,
	"upper_bound" numeric(15, 2) NOT NULL,
	"algorithm" varchar(100) NOT NULL,
	"seasonality_detected" boolean DEFAULT false,
	"trend_direction" varchar(20),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_revenue_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"model_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"forecast_period" varchar(20) NOT NULL,
	"forecast_date" timestamp NOT NULL,
	"revenue_type" varchar(50) NOT NULL,
	"base_case_forecast" numeric(15, 2) NOT NULL,
	"best_case_forecast" numeric(15, 2) NOT NULL,
	"worst_case_forecast" numeric(15, 2) NOT NULL,
	"confidence_level" real NOT NULL,
	"breakdown_by_plan" jsonb,
	"breakdown_by_channel" jsonb,
	"breakdown_by_region" jsonb,
	"breakdown_by_segment" jsonb,
	"seasonality_adjustment" real,
	"month_over_month_growth" real,
	"year_over_year_growth" real,
	"growth_trend" varchar(20),
	"metadata" jsonb,
	"forecasted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_id" varchar(255),
	"action_type" varchar(100) NOT NULL,
	"features" jsonb NOT NULL,
	"anomaly_score" real NOT NULL,
	"anomaly_type" varchar(100),
	"explanation" text,
	"feature_importance" jsonb,
	"auto_blocked" boolean DEFAULT false,
	"false_positive" boolean,
	"reviewed_by" varchar(255),
	"model_version" varchar(50),
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "security_behavior_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_id" varchar(255),
	"login_times" jsonb,
	"locations" jsonb,
	"devices" jsonb,
	"action_sequences" jsonb,
	"typing_patterns" jsonb,
	"risk_score" integer DEFAULT 0,
	"baseline_established" boolean DEFAULT false,
	"profile_version" integer DEFAULT 1,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_compliance_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(255) NOT NULL,
	"standard" varchar(100) NOT NULL,
	"date_range" jsonb NOT NULL,
	"audit_logs" jsonb,
	"security_controls" jsonb,
	"access_controls" jsonb,
	"encryption_status" jsonb,
	"gap_analysis" jsonb,
	"compliance_score" real,
	"passed_controls" integer,
	"failed_controls" integer,
	"findings" jsonb,
	"recommendations" jsonb,
	"export_format" varchar(20),
	"export_path" varchar(500),
	"generated_by" varchar(255),
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "security_compliance_reports_report_id_unique" UNIQUE("report_id")
);
--> statement-breakpoint
CREATE TABLE "security_pen_test_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" varchar(255) NOT NULL,
	"target_endpoint" varchar(500),
	"test_type" varchar(100) NOT NULL,
	"test_payload" jsonb,
	"vulnerability_detected" boolean DEFAULT false,
	"vulnerability_score" real,
	"vulnerability_severity" varchar(20),
	"exploit_success" boolean DEFAULT false,
	"remediation_suggestion" text,
	"affected_components" jsonb,
	"test_duration" integer,
	"requests_sent" integer,
	"response_analysis" jsonb,
	"frequency" varchar(50),
	"scheduled_by" varchar(255),
	"executed_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	CONSTRAINT "security_pen_test_results_test_id_unique" UNIQUE("test_id")
);
--> statement-breakpoint
CREATE TABLE "security_zero_day_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"source" varchar(255) NOT NULL,
	"threat_level" varchar(20) NOT NULL,
	"threat_signatures" jsonb,
	"heuristic_analysis" jsonb,
	"obfuscation_detected" boolean DEFAULT false,
	"suspicious_headers" jsonb,
	"response_recommendation" varchar(255),
	"auto_response" varchar(255),
	"cve_references" jsonb,
	"pattern_match_score" real,
	"model_version" varchar(50),
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "social_influencer_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"influencer_score" real NOT NULL,
	"follower_count" integer DEFAULT 0,
	"engagement_rate" real DEFAULT 0,
	"content_quality_score" real DEFAULT 0,
	"niche_authority" real DEFAULT 0,
	"audience_authenticity" real DEFAULT 0,
	"fake_follower_percentage" real DEFAULT 0,
	"anomaly_patterns" jsonb,
	"category_breakdown" jsonb,
	"collaboration_potential" varchar(50),
	"suggested_collaboration_types" jsonb,
	"last_analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_network_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"connection_count" integer DEFAULT 0,
	"network_value" numeric(15, 2) DEFAULT '0',
	"network_value_model" varchar(50),
	"key_nodes" jsonb,
	"clustering_coefficient" real DEFAULT 0,
	"betweenness_centrality" real DEFAULT 0,
	"eigenvector_centrality" real DEFAULT 0,
	"network_growth_rate" real DEFAULT 0,
	"optimal_connection_strategies" jsonb,
	"reach_multiplier" real DEFAULT 1,
	"community_bridges" jsonb,
	"network_health_score" real DEFAULT 0,
	"predicted_growth" jsonb,
	"last_analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_viral_tracking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" varchar(255) NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" varchar(50) NOT NULL,
	"campaign_id" integer,
	"viral_coefficient" real NOT NULL,
	"cascade_depth" integer DEFAULT 0,
	"total_shares" integer DEFAULT 0,
	"total_impressions" integer DEFAULT 0,
	"conversion_rate" real DEFAULT 0,
	"super_spreaders" jsonb,
	"cascade_levels" jsonb,
	"virality_trend" varchar(50),
	"peak_virality_at" timestamp,
	"current_phase" varchar(50),
	"projected_final_reach" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_brand_voices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"voice_profile" jsonb NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"posts_analyzed" integer DEFAULT 0 NOT NULL,
	"last_analyzed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_brand_voices_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "ad_audience_segments" ADD CONSTRAINT "ad_audience_segments_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_competitor_intelligence" ADD CONSTRAINT "ad_competitor_intelligence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_conversions" ADD CONSTRAINT "ad_conversions_audience_segment_id_ad_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."ad_audience_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative_predictions" ADD CONSTRAINT "ad_creative_predictions_creative_id_ad_creatives_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."ad_creatives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_creative_predictions" ADD CONSTRAINT "ad_creative_predictions_target_audience_id_ad_audience_segments_id_fk" FOREIGN KEY ("target_audience_id") REFERENCES "public"."ad_audience_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_anomaly_detections" ADD CONSTRAINT "ai_anomaly_detections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_anomaly_detections" ADD CONSTRAINT "ai_anomaly_detections_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_anomaly_detections" ADD CONSTRAINT "ai_anomaly_detections_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_anomaly_detections" ADD CONSTRAINT "ai_anomaly_detections_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_churn_predictions" ADD CONSTRAINT "ai_churn_predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_churn_predictions" ADD CONSTRAINT "ai_churn_predictions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_churn_predictions" ADD CONSTRAINT "ai_churn_predictions_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cohort_analysis" ADD CONSTRAINT "ai_cohort_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cohort_analysis" ADD CONSTRAINT "ai_cohort_analysis_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_cohort_analysis" ADD CONSTRAINT "ai_cohort_analysis_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_metric_predictions" ADD CONSTRAINT "ai_metric_predictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_metric_predictions" ADD CONSTRAINT "ai_metric_predictions_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_metric_predictions" ADD CONSTRAINT "ai_metric_predictions_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_revenue_forecasts" ADD CONSTRAINT "ai_revenue_forecasts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_revenue_forecasts" ADD CONSTRAINT "ai_revenue_forecasts_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_revenue_forecasts" ADD CONSTRAINT "ai_revenue_forecasts_version_id_ai_model_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."ai_model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_influencer_scores" ADD CONSTRAINT "social_influencer_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_network_analysis" ADD CONSTRAINT "social_network_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_viral_tracking" ADD CONSTRAINT "social_viral_tracking_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_viral_tracking" ADD CONSTRAINT "social_viral_tracking_campaign_id_ad_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."ad_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_brand_voices" ADD CONSTRAINT "user_brand_voices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_audience_segments_campaign_id_idx" ON "ad_audience_segments" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_audience_segments_segment_index_idx" ON "ad_audience_segments" USING btree ("segment_index");--> statement-breakpoint
CREATE INDEX "ad_audience_segments_created_at_idx" ON "ad_audience_segments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ad_competitor_intelligence_user_id_idx" ON "ad_competitor_intelligence" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_competitor_intelligence_competitor_name_idx" ON "ad_competitor_intelligence" USING btree ("competitor_name");--> statement-breakpoint
CREATE INDEX "ad_competitor_intelligence_platform_idx" ON "ad_competitor_intelligence" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "ad_competitor_intelligence_analyzed_at_idx" ON "ad_competitor_intelligence" USING btree ("analyzed_at");--> statement-breakpoint
CREATE INDEX "ad_conversions_campaign_id_idx" ON "ad_conversions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "ad_conversions_user_id_idx" ON "ad_conversions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_conversions_creative_id_idx" ON "ad_conversions" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "ad_conversions_audience_segment_id_idx" ON "ad_conversions" USING btree ("audience_segment_id");--> statement-breakpoint
CREATE INDEX "ad_conversions_conversion_type_idx" ON "ad_conversions" USING btree ("conversion_type");--> statement-breakpoint
CREATE INDEX "ad_conversions_converted_at_idx" ON "ad_conversions" USING btree ("converted_at");--> statement-breakpoint
CREATE INDEX "ad_creative_predictions_creative_id_idx" ON "ad_creative_predictions" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "ad_creative_predictions_target_audience_id_idx" ON "ad_creative_predictions" USING btree ("target_audience_id");--> statement-breakpoint
CREATE INDEX "ad_creative_predictions_created_at_idx" ON "ad_creative_predictions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_user_id_idx" ON "ai_anomaly_detections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_metric_name_idx" ON "ai_anomaly_detections" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_anomaly_type_idx" ON "ai_anomaly_detections" USING btree ("anomaly_type");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_severity_idx" ON "ai_anomaly_detections" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_detected_at_idx" ON "ai_anomaly_detections" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_alert_sent_idx" ON "ai_anomaly_detections" USING btree ("alert_sent");--> statement-breakpoint
CREATE INDEX "ai_anomaly_detections_acknowledged_at_idx" ON "ai_anomaly_detections" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE INDEX "ai_churn_predictions_user_id_idx" ON "ai_churn_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_churn_predictions_risk_level_idx" ON "ai_churn_predictions" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "ai_churn_predictions_churn_probability_idx" ON "ai_churn_predictions" USING btree ("churn_probability");--> statement-breakpoint
CREATE INDEX "ai_churn_predictions_predicted_at_idx" ON "ai_churn_predictions" USING btree ("predicted_at");--> statement-breakpoint
CREATE INDEX "ai_churn_predictions_valid_until_idx" ON "ai_churn_predictions" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_user_id_idx" ON "ai_cohort_analysis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_cohort_type_idx" ON "ai_cohort_analysis" USING btree ("cohort_type");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_cohort_identifier_idx" ON "ai_cohort_analysis" USING btree ("cohort_identifier");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_metric_type_idx" ON "ai_cohort_analysis" USING btree ("metric_type");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_analyzed_at_idx" ON "ai_cohort_analysis" USING btree ("analyzed_at");--> statement-breakpoint
CREATE INDEX "ai_cohort_analysis_type_identifier_idx" ON "ai_cohort_analysis" USING btree ("cohort_type","cohort_identifier");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_user_id_idx" ON "ai_metric_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_metric_name_idx" ON "ai_metric_predictions" USING btree ("metric_name");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_forecast_date_idx" ON "ai_metric_predictions" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_horizon_idx" ON "ai_metric_predictions" USING btree ("horizon");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_model_id_idx" ON "ai_metric_predictions" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "ai_metric_predictions_user_metric_horizon_idx" ON "ai_metric_predictions" USING btree ("user_id","metric_name","horizon");--> statement-breakpoint
CREATE INDEX "ai_revenue_forecasts_user_id_idx" ON "ai_revenue_forecasts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_revenue_forecasts_forecast_period_idx" ON "ai_revenue_forecasts" USING btree ("forecast_period");--> statement-breakpoint
CREATE INDEX "ai_revenue_forecasts_forecast_date_idx" ON "ai_revenue_forecasts" USING btree ("forecast_date");--> statement-breakpoint
CREATE INDEX "ai_revenue_forecasts_revenue_type_idx" ON "ai_revenue_forecasts" USING btree ("revenue_type");--> statement-breakpoint
CREATE INDEX "ai_revenue_forecasts_forecasted_at_idx" ON "ai_revenue_forecasts" USING btree ("forecasted_at");--> statement-breakpoint
CREATE INDEX "security_anomalies_user_id_idx" ON "security_anomalies" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_anomalies_session_id_idx" ON "security_anomalies" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "security_anomalies_anomaly_score_idx" ON "security_anomalies" USING btree ("anomaly_score");--> statement-breakpoint
CREATE INDEX "security_anomalies_auto_blocked_idx" ON "security_anomalies" USING btree ("auto_blocked");--> statement-breakpoint
CREATE INDEX "security_anomalies_detected_at_idx" ON "security_anomalies" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "security_behavior_profiles_user_id_idx" ON "security_behavior_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_behavior_profiles_session_id_idx" ON "security_behavior_profiles" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "security_behavior_profiles_risk_score_idx" ON "security_behavior_profiles" USING btree ("risk_score");--> statement-breakpoint
CREATE INDEX "security_behavior_profiles_last_updated_idx" ON "security_behavior_profiles" USING btree ("last_updated");--> statement-breakpoint
CREATE INDEX "security_compliance_reports_report_id_idx" ON "security_compliance_reports" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "security_compliance_reports_standard_idx" ON "security_compliance_reports" USING btree ("standard");--> statement-breakpoint
CREATE INDEX "security_compliance_reports_compliance_score_idx" ON "security_compliance_reports" USING btree ("compliance_score");--> statement-breakpoint
CREATE INDEX "security_compliance_reports_generated_at_idx" ON "security_compliance_reports" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "security_pen_test_results_test_id_idx" ON "security_pen_test_results" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "security_pen_test_results_test_type_idx" ON "security_pen_test_results" USING btree ("test_type");--> statement-breakpoint
CREATE INDEX "security_pen_test_results_vulnerability_detected_idx" ON "security_pen_test_results" USING btree ("vulnerability_detected");--> statement-breakpoint
CREATE INDEX "security_pen_test_results_vulnerability_severity_idx" ON "security_pen_test_results" USING btree ("vulnerability_severity");--> statement-breakpoint
CREATE INDEX "security_pen_test_results_executed_at_idx" ON "security_pen_test_results" USING btree ("executed_at");--> statement-breakpoint
CREATE INDEX "security_zero_day_alerts_threat_level_idx" ON "security_zero_day_alerts" USING btree ("threat_level");--> statement-breakpoint
CREATE INDEX "security_zero_day_alerts_source_idx" ON "security_zero_day_alerts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "security_zero_day_alerts_detected_at_idx" ON "security_zero_day_alerts" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "security_zero_day_alerts_auto_response_idx" ON "security_zero_day_alerts" USING btree ("auto_response");--> statement-breakpoint
CREATE INDEX "social_influencer_scores_user_id_idx" ON "social_influencer_scores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_influencer_scores_platform_idx" ON "social_influencer_scores" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_influencer_scores_influencer_score_idx" ON "social_influencer_scores" USING btree ("influencer_score");--> statement-breakpoint
CREATE INDEX "social_influencer_scores_last_analyzed_idx" ON "social_influencer_scores" USING btree ("last_analyzed_at");--> statement-breakpoint
CREATE INDEX "social_network_analysis_user_id_idx" ON "social_network_analysis" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_network_analysis_platform_idx" ON "social_network_analysis" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_network_analysis_network_value_idx" ON "social_network_analysis" USING btree ("network_value");--> statement-breakpoint
CREATE INDEX "social_network_analysis_last_analyzed_idx" ON "social_network_analysis" USING btree ("last_analyzed_at");--> statement-breakpoint
CREATE INDEX "social_viral_tracking_post_id_idx" ON "social_viral_tracking" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "social_viral_tracking_user_id_idx" ON "social_viral_tracking" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "social_viral_tracking_platform_idx" ON "social_viral_tracking" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "social_viral_tracking_campaign_id_idx" ON "social_viral_tracking" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "social_viral_tracking_viral_coefficient_idx" ON "social_viral_tracking" USING btree ("viral_coefficient");--> statement-breakpoint
CREATE INDEX "user_brand_voices_user_id_idx" ON "user_brand_voices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_brand_voices_confidence_score_idx" ON "user_brand_voices" USING btree ("confidence_score");