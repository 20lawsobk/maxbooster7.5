#!/usr/bin/env node
// Direct index creation script — safer than drizzle-kit push for additive-only changes.
// Uses CREATE INDEX CONCURRENTLY IF NOT EXISTS so it never blocks reads/writes.

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 2,
});

// Every index added in the current batch of schema hardening edits.
// CONCURRENTLY is safe: it acquires no table-level lock and runs in the background.
const indexes = [
  // studio
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_templates_user_idx ON studio_templates(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_templates_type_public_idx ON studio_templates(type, is_public)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_recent_files_user_idx ON studio_recent_files(user_id, accessed_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_pinned_folders_user_idx ON studio_pinned_folders(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_projects_user_idx ON studio_projects(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS studio_projects_status_idx ON studio_projects(status)',
  // campaigns
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS campaigns_user_status_idx ON campaigns(user_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS campaigns_type_idx ON campaigns(type, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS social_campaigns_user_status_idx ON social_campaigns(user_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS social_campaigns_platform_idx ON social_campaigns(platform, scheduled_at)',
  // storefronts
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefronts_user_idx ON storefronts(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefronts_slug_idx ON storefronts(slug)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefronts_subdomain_idx ON storefronts(subdomain)',
  // dns
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_record_cache_domain_idx ON dns_record_cache(domain, type)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_domains_storefront_idx ON storefront_domains(storefront_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_domains_domain_idx ON storefront_domains(domain)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_templates_user_idx ON dns_templates(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_provider_credentials_user_idx ON dns_provider_credentials(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_zones_user_idx ON dns_zones(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_zones_domain_idx ON dns_zones(domain)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dns_zone_records_zone_idx ON dns_zone_records(zone_id, type)',
  // membership
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS membership_tiers_storefront_idx ON membership_tiers(storefront_id, is_active)',
  // beats
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS beats_user_idx ON beats(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS beats_genre_idx ON beats(genre, is_published)',
  // hyper-follow
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS hyper_follow_pages_user_idx ON hyper_follow_pages(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS hyper_follow_pages_slug_idx ON hyper_follow_pages(slug)',
  // distro
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distro_releases_user_idx ON distro_releases(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distro_releases_status_idx ON distro_releases(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distro_tracks_release_idx ON distro_tracks(release_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distro_tracks_user_idx ON distro_tracks(user_id)',
  // customer memberships
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS customer_memberships_customer_idx ON customer_memberships(customer_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS customer_memberships_storefront_idx ON customer_memberships(storefront_id, status)',
  // dmca
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dmca_strikes_user_idx ON dmca_strikes(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dmca_strikes_release_idx ON dmca_strikes(release_id)',
  // listings
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_storefront_idx ON listings(storefront_id, is_published)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_user_idx ON listings(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS listings_genre_idx ON listings(genre)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS listing_license_tiers_listing_idx ON listing_license_tiers(listing_id)',
  // storefront social
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_follows_storefront_idx ON storefront_follows(storefront_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_follows_follower_idx ON storefront_follows(follower_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_likes_listing_idx ON storefront_likes(listing_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_likes_user_idx ON storefront_likes(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_ratings_listing_idx ON storefront_ratings(listing_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS beat_likes_beat_idx ON beat_likes(beat_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS beat_likes_user_idx ON beat_likes(user_id)',
  // contracts
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS license_templates_user_idx ON license_templates(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_orders_buyer_idx ON storefront_orders(buyer_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_orders_seller_idx ON storefront_orders(seller_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS storefront_orders_storefront_idx ON storefront_orders(storefront_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS contract_templates_user_idx ON contract_templates(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS generated_contracts_user_idx ON generated_contracts(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS generated_contracts_template_idx ON generated_contracts(template_id)',
  // disputes
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS marketplace_disputes_buyer_idx ON marketplace_disputes(buyer_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS marketplace_disputes_seller_idx ON marketplace_disputes(seller_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_holds_user_idx ON legal_holds(user_id, status)',
  // registries
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS isrc_registry_user_idx ON isrc_registry(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS isrc_registry_isrc_idx ON isrc_registry(isrc)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS upc_registry_user_idx ON upc_registry(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS upc_registry_upc_idx ON upc_registry(upc)',
  // status page
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS status_page_uptime_metrics_service_idx ON status_page_uptime_metrics(service_id, checked_at)',
  // catalog import
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_import_jobs_user_idx ON catalog_import_jobs(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS catalog_import_rows_job_idx ON catalog_import_rows(job_id, status)',
  // release workflow
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS release_workflow_requests_release_idx ON release_workflow_requests(release_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS release_workflow_requests_user_idx ON release_workflow_requests(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS release_version_history_release_idx ON release_version_history(release_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS release_scheduled_actions_release_idx ON release_scheduled_actions(release_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS release_scheduled_actions_execute_idx ON release_scheduled_actions(execute_at)',
  // pre-save
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_save_campaigns_user_idx ON pre_save_campaigns(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_save_entries_campaign_idx ON pre_save_entries(campaign_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS pre_save_entries_user_idx ON pre_save_entries(user_id)',
  // distribution SLA
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distribution_sla_metrics_release_idx ON distribution_sla_metrics(release_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS distribution_sla_metrics_status_idx ON distribution_sla_metrics(status)',
  // content ID
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS content_id_registrations_release_idx ON content_id_registrations(release_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS content_id_registrations_user_idx ON content_id_registrations(user_id)',
  // batch 2: financial
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS sync_license_inquiries_license_idx ON sync_license_inquiries(sync_license_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS sync_license_inquiries_user_idx ON sync_license_inquiries(user_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS sync_license_inquiries_status_idx ON sync_license_inquiries(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_splits_release_idx ON royalty_splits(release_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_splits_user_idx ON royalty_splits(user_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_splits_track_idx ON royalty_splits(track_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS instant_payouts_user_idx ON instant_payouts(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS instant_payouts_status_idx ON instant_payouts(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_order_idx ON refunds(order_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_user_idx ON refunds(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS refunds_status_idx ON refunds(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS ledger_entries_user_created_idx ON ledger_entries(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS ledger_entries_reference_idx ON ledger_entries(reference_type, reference_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS tax_forms_user_year_idx ON tax_forms(user_id, tax_year)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS tax_forms_status_idx ON tax_forms(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_statements_user_idx ON royalty_statements(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_statements_status_idx ON royalty_statements(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_disputes_user_idx ON royalty_disputes(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS royalty_disputes_status_idx ON royalty_disputes(status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS invoices_user_idx ON invoices(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS invoices_status_idx ON invoices(status, due_date)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS split_payments_order_idx ON split_payments(order_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS split_payments_collaborator_idx ON split_payments(collaborator_id, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS kyc_documents_user_idx ON kyc_documents(user_id, status)',
  // notifications & push
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_user_read_idx ON notifications(user_id, is_read)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id)',
  // support
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, priority)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS support_tickets_assigned_idx ON support_tickets(assigned_to, status)',
  // security
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS security_threats_source_ip_idx ON security_threats(source_ip, detected_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS security_threats_severity_status_idx ON security_threats(severity, status)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS security_threats_user_idx ON security_threats(user_id, detected_at)',
  // studio clips & audit
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS audio_clips_project_idx ON audio_clips(project_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS audio_clips_track_idx ON audio_clips(track_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_audit_log_workspace_idx ON workspace_audit_log(workspace_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_audit_log_user_idx ON workspace_audit_log(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS workspace_audit_log_resource_idx ON workspace_audit_log(resource_type, resource_id)',
  // api keys & DSP analytics
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS api_keys_user_idx ON api_keys(user_id, is_active)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS api_keys_key_hash_idx ON api_keys(key_hash)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dsp_analytics_release_platform_date_idx ON dsp_analytics(release_id, platform, date)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dsp_analytics_user_idx ON dsp_analytics(user_id, date)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS dsp_analytics_track_idx ON dsp_analytics(track_id, date)',
  // orders
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_buyer_idx ON orders(user_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_seller_idx ON orders(seller_id, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_listing_idx ON orders(listing_id)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_status_idx ON orders(status, created_at)',
  'CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_stripe_intent_idx ON orders(stripe_payment_intent_id)',
];

let created = 0;
let skipped = 0;
let failed = 0;

const client = await pool.connect();
try {
  for (const sql of indexes) {
    const nameMatch = sql.match(/IF NOT EXISTS (\w+)/);
    const name = nameMatch ? nameMatch[1] : sql;
    try {
      // CONCURRENTLY cannot run inside a transaction block
      await client.query(sql);
      created++;
      process.stdout.write(`  ✓ ${name}\n`);
    } catch (err) {
      if (err.code === '42P07') {
        // 42P07 = duplicate_table — index already exists (shouldn't happen with IF NOT EXISTS but just in case)
        skipped++;
      } else if (err.message?.includes('already exists')) {
        skipped++;
      } else if (err.code === '42P01') {
        // 42P01 = undefined_table — table doesn't exist yet, skip gracefully
        skipped++;
        process.stdout.write(`  ~ ${name} (table not yet created)\n`);
      } else {
        failed++;
        process.stderr.write(`  ✗ ${name}: ${err.message}\n`);
      }
    }
  }
} finally {
  client.release();
  await pool.end();
}

console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed`);
if (failed > 0) process.exit(1);
