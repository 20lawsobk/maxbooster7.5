/**
 * Vitest global teardown — deletes all test accounts created during the
 * integration test run so the production NEON DB stays clean.
 *
 * Test accounts are identified by email domain patterns that all test suites
 * use when creating users:
 *   *@maxbooster-test.com
 *   *@maxbooster-test.invalid
 *   *@test.invalid
 *   *@test.com          (smoke / session / verify prefixes only)
 *   *@maxbooster.test
 *
 * The admin (blawzmusic@gmail.com) and demo (demo@maxbooster.ai) accounts are
 * never touched.
 */

import pg from "pg";

const { Pool } = pg;

const TEST_EMAIL_PATTERNS = [
  "%@maxbooster-test.com",
  "%@maxbooster-test.invalid",
  "%@test.invalid",
  "%@maxbooster.test",
  "smoke_%@test.com",
  "session_%@test.com",
  "verify_%@test.com",
  "paidtest_%@test.com",
  "ai_analytics_test_%@test.com",
];

const CHILD_TABLES = [
  "workspace_audit_log","workspace_members","venue_contacts",
  "user_streaks","user_taste_profiles","user_storage_files","user_storage",
  "user_onboarding","user_brand_voices","user_achievements",
  "tax_forms","system_logs","sync_submissions","sync_placements",
  "sync_licenses","sync_license_inquiries","support_tickets",
  "subscriptions","studio_templates","studio_samples","studio_recent_files",
  "studio_projects","studio_pinned_folders","storefront_ratings",
  "storefront_likes","storefront_follows","storefronts",
  "stem_exports","spotify_canvases","split_payments","songwriting_sessions",
  "social_pattern_aggregates","social_mentions","social_keywords",
  "social_inbox_messages","social_campaigns","social_autopilot_content",
  "social_accounts","shows","share_links","sessions","setlists",
  "sent_emails","security_threats","search_history",
  "scheduled_post_batches","sample_clearances","royalty_transactions",
  "royalty_statements","royalty_splits","royalty_disputes",
  "revenue_forecasts","release_countdowns","releases","refunds","refresh_tokens",
  "radio_pitches","push_subscriptions","publishing_rights",
  "projects","project_members","project_budgets","promo_cards",
  "press_kits","pre_save_pages","pre_save_campaigns","posts",
  "plugin_presets","playlist_pitches","playlist_journeys",
  "playlist_attributions","platform_data_sources",
  "organic_roi_snapshots","organic_channels","organic_assets",
  "organic_asset_lifetime","orders","nps_responses","notifications",
  "nlp_query_logs","music_workflow_execution_logs",
  "music_workflow_automations","music_video_productions",
  "music_impact_metrics","mobile_device_tokens","mini_videos",
  "merch_orders","merch_items","marketplace_recommendations",
  "lyrics_syncs","listings","listing_stems","license_templates",
  "legal_holds","ledger_entries","label_submissions","kyc_verifications",
  "kyc_documents","jwt_tokens","invoices","instant_payouts",
  "inference_runs","hyperfollow_pages","hns_auctions",
  "historical_analytics","hashtag_research","global_rankings",
  "generated_contracts","filter_presets","feature_events",
  "fan_subscribers","fan_segments","fan_messages","fan_campaigns",
  "explanation_logs","email_preferences","email_messages","dunning_state",
  "dsp_user_platform_status","dsp_analytics","dns_zones","dns_zone_records",
  "dns_templates","dns_provider_credentials","dmca_strikes",
  "distributor_history_imports","domain_events","domain_contacts",
  "claimed_domains","customer_health_scores","custom_workflows",
  "contract_templates","content_id_registrations","content_calendar",
  "competitor_profiles","collaboration_comments","campaigns",
  "cancellation_feedback","career_goals","career_coach_recommendations",
  "budget_line_items","bogo_promotions","best_posting_times",
  "beats","beat_promotions","beat_likes","beat_interactions",
  "beat_discovery_scores","batch_templates","autopilot_preferences",
  "autopilot_learning_data","autopilot_insights","autopilot_cross_insights",
  "audit_logs","assistant_conversations","artist_scores",
  "artist_progress_snapshots","artist_profiles","api_keys","analytics",
  "approval_history","ad_creatives","ad_campaigns",
];

export async function teardown() {
  const connStr = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connStr) {
    console.warn("[globalTeardown] No database URL — skipping test user cleanup");
    return;
  }

  const pool = new Pool({ connectionString: connStr });
  const client = await pool.connect();

  try {
    const conditions = TEST_EMAIL_PATTERNS.map((p) => `email LIKE '${p}'`).join(" OR ");
    const { rows } = await client.query(
      `SELECT id FROM users WHERE ${conditions}`
    );
    if (rows.length === 0) {
      console.log("[globalTeardown] No test users to clean up");
      return;
    }

    const ids = rows.map((r: { id: string }) => r.id);
    const CHUNK = 200;
    console.log(`[globalTeardown] Removing ${ids.length} test user(s)...`);

    await client.query("BEGIN");

    for (const table of CHILD_TABLES) {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const ph = chunk.map((_: unknown, j: number) => `$${j + 1}`).join(",");
        try {
          await client.query(`DELETE FROM ${table} WHERE user_id IN (${ph})`, chunk);
        } catch {
          // table doesn't exist in this schema version — skip
        }
      }
    }

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const ph = chunk.map((_: unknown, j: number) => `$${j + 1}`).join(",");
      await client.query(`DELETE FROM users WHERE id IN (${ph})`, chunk);
    }

    await client.query("COMMIT");
    console.log(`[globalTeardown] Cleanup complete — removed ${ids.length} test user(s)`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[globalTeardown] Cleanup failed (rolled back):", err);
  } finally {
    client.release();
    await pool.end();
  }
}
