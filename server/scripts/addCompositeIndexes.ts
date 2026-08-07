/**
 * Composite Index Migration
 *
 * Adds missing (userId, createdAt) and (userId, status) composite indexes
 * to all major user-data tables for 90M-scale performance.
 *
 * These indexes are CRITICAL for pagination queries: every list endpoint does
 *   WHERE user_id = $1 ORDER BY created_at DESC LIMIT N
 * Without a composite index, Postgres does a userId index scan then filesort.
 * With the composite index, it does a single efficient index range scan.
 *
 * Safe to run multiple times — all indexes use IF NOT EXISTS.
 * Uses CREATE INDEX (not CONCURRENTLY) because the database is typically
 * small during migrations; switch to CONCURRENTLY for live production tables.
 */

import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { logger } from "../logger.js";

const COMPOSITE_INDEXES: Array<{
  name: string;
  table: string;
  columns: string;
  where?: string;
}> = [
  // Analytics
  {
    name: "analytics_user_id_date_idx",
    table: "analytics",
    columns: "user_id, date DESC",
  },

  // Projects
  {
    name: "projects_user_id_created_at_idx",
    table: "projects",
    columns: "user_id, created_at DESC",
  },
  {
    name: "projects_user_id_status_idx",
    table: "projects",
    columns: "user_id, status",
  },

  // Releases
  {
    name: "releases_user_id_created_at_idx",
    table: "releases",
    columns: "user_id, created_at DESC",
  },
  {
    name: "releases_user_id_status_idx",
    table: "releases",
    columns: "user_id, status",
  },

  // Campaigns
  {
    name: "campaigns_user_id_created_at_idx",
    table: "campaigns",
    columns: "user_id, created_at DESC",
  },

  // Social campaigns
  {
    name: "social_campaigns_user_id_created_at_idx",
    table: "social_campaigns",
    columns: "user_id, created_at DESC",
  },

  // Beats
  {
    name: "beats_user_id_created_at_idx",
    table: "beats",
    columns: "user_id, created_at DESC",
  },

  // Listings — no status column in this table
  {
    name: "listings_user_id_created_at_idx",
    table: "listings",
    columns: "user_id, created_at DESC",
  },

  // Storefront orders — uses buyer_id/seller_id, not user_id
  {
    name: "storefront_orders_buyer_id_created_at_idx",
    table: "storefront_orders",
    columns: "buyer_id, created_at DESC",
  },
  {
    name: "storefront_orders_buyer_id_status_idx",
    table: "storefront_orders",
    columns: "buyer_id, status",
  },

  // Royalty transactions
  {
    name: "royalty_transactions_user_id_created_at_idx",
    table: "royalty_transactions",
    columns: "user_id, created_at DESC",
  },

  // Royalty splits
  {
    name: "royalty_splits_user_id_created_at_idx",
    table: "royalty_splits",
    columns: "user_id, created_at DESC",
  },

  // Instant payouts
  {
    name: "instant_payouts_user_id_created_at_idx",
    table: "instant_payouts",
    columns: "user_id, created_at DESC",
  },

  // Invoices
  {
    name: "invoices_user_id_created_at_idx",
    table: "invoices",
    columns: "user_id, created_at DESC",
  },

  // Notifications — column is is_read, not read
  {
    name: "notifications_user_id_created_at_idx",
    table: "notifications",
    columns: "user_id, created_at DESC",
  },
  {
    name: "notifications_user_id_is_read_idx",
    table: "notifications",
    columns: "user_id, is_read",
  },

  // Distro releases — partitioned by artist_id, not user_id
  {
    name: "distro_releases_artist_id_created_at_idx",
    table: "distro_releases",
    columns: "artist_id, created_at DESC",
  },

  // Distro tracks — partitioned by release_id, not user_id
  {
    name: "distro_tracks_release_id_created_at_idx",
    table: "distro_tracks",
    columns: "release_id, created_at DESC",
  },

  // Content ID registrations
  {
    name: "content_id_registrations_user_id_created_at_idx",
    table: "content_id_registrations",
    columns: "user_id, created_at DESC",
  },

  // Sync licenses
  {
    name: "sync_licenses_user_id_created_at_idx",
    table: "sync_licenses",
    columns: "user_id, created_at DESC",
  },

  // Sync submissions
  {
    name: "sync_submissions_user_id_created_at_idx",
    table: "sync_submissions",
    columns: "user_id, created_at DESC",
  },

  // Label submissions — CRITICAL: full-scan without composite
  {
    name: "label_submissions_user_id_created_at_idx",
    table: "label_submissions",
    columns: "user_id, created_at DESC",
  },

  // Radio pitches
  {
    name: "radio_pitches_user_id_created_at_idx",
    table: "radio_pitches",
    columns: "user_id, created_at DESC",
  },

  // Venue contacts
  {
    name: "venue_contacts_user_id_created_at_idx",
    table: "venue_contacts",
    columns: "user_id, created_at DESC",
  },

  // Project budgets
  {
    name: "project_budgets_user_id_created_at_idx",
    table: "project_budgets",
    columns: "user_id, created_at DESC",
  },

  // Sample clearances
  {
    name: "sample_clearances_user_id_created_at_idx",
    table: "sample_clearances",
    columns: "user_id, created_at DESC",
  },

  // Music video productions
  {
    name: "music_video_productions_user_id_created_at_idx",
    table: "music_video_productions",
    columns: "user_id, created_at DESC",
  },

  // Songwriting sessions
  {
    name: "songwriting_sessions_user_id_created_at_idx",
    table: "songwriting_sessions",
    columns: "user_id, created_at DESC",
  },

  // Fan campaigns
  {
    name: "fan_campaigns_user_id_created_at_idx",
    table: "fan_campaigns",
    columns: "user_id, created_at DESC",
  },

  // Fan subscribers
  {
    name: "fan_subscribers_user_id_created_at_idx",
    table: "fan_subscribers",
    columns: "user_id, created_at DESC",
  },

  // Fan messages
  {
    name: "fan_messages_user_id_created_at_idx",
    table: "fan_messages",
    columns: "user_id, created_at DESC",
  },

  // Press kits
  {
    name: "press_kits_user_id_created_at_idx",
    table: "press_kits",
    columns: "user_id, created_at DESC",
  },

  // Playlist pitches
  {
    name: "playlist_pitches_user_id_created_at_idx",
    table: "playlist_pitches",
    columns: "user_id, created_at DESC",
  },

  // Shows
  {
    name: "shows_user_id_created_at_idx",
    table: "shows",
    columns: "user_id, created_at DESC",
  },
  { name: "shows_user_id_date_idx", table: "shows", columns: "user_id, date" },

  // Setlists
  {
    name: "setlists_user_id_created_at_idx",
    table: "setlists",
    columns: "user_id, created_at DESC",
  },

  // Merch items
  {
    name: "merch_items_user_id_created_at_idx",
    table: "merch_items",
    columns: "user_id, created_at DESC",
  },

  // Merch orders
  {
    name: "merch_orders_user_id_created_at_idx",
    table: "merch_orders",
    columns: "user_id, created_at DESC",
  },

  // Custom workflows
  {
    name: "custom_workflows_user_id_created_at_idx",
    table: "custom_workflows",
    columns: "user_id, created_at DESC",
  },

  // Pre-save campaigns
  {
    name: "pre_save_campaigns_user_id_created_at_idx",
    table: "pre_save_campaigns",
    columns: "user_id, created_at DESC",
  },

  // Publishing rights
  {
    name: "publishing_rights_user_id_created_at_idx",
    table: "publishing_rights",
    columns: "user_id, created_at DESC",
  },

  // DSP analytics
  {
    name: "dsp_analytics_user_id_created_at_idx",
    table: "dsp_analytics",
    columns: "user_id, created_at DESC",
  },

  // API keys
  {
    name: "api_keys_user_id_created_at_idx",
    table: "api_keys",
    columns: "user_id, created_at DESC",
  },

  // Support tickets
  {
    name: "support_tickets_user_id_created_at_idx",
    table: "support_tickets",
    columns: "user_id, created_at DESC",
  },

  // Orders
  {
    name: "orders_user_id_created_at_idx",
    table: "orders",
    columns: "user_id, created_at DESC",
  },

  // Subscriptions
  {
    name: "subscriptions_user_id_created_at_idx",
    table: "subscriptions",
    columns: "user_id, created_at DESC",
  },
];

async function addCompositeIndexes(): Promise<void> {
  logger.info(
    `[IndexMigration] Adding ${COMPOSITE_INDEXES?.length} composite indexes for 90M-scale performance`,
  );

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const idx of COMPOSITE_INDEXES) {
    try {
      const whereClause = idx?.where ? ` WHERE ${idx?.where}` : "";
      await db.execute(
        sql?.raw(
          `CREATE INDEX IF NOT EXISTS ${idx?.name} ON ${idx?.table} (${idx?.columns})${whereClause}`,
        ),
      );
      logger.info(`  ✓ ${idx?.name}`);
      created++;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error?.message : String(error);
      if (msg?.includes("already exists")) {
        logger.info(`  - ${idx?.name} (already exists)`);
        skipped++;
      } else {
        logger.warn(`  ✗ ${idx?.name}: ${msg}`);
        failed++;
      }
    }
  }

  logger.info(
    `[IndexMigration] Done: ${created} created, ${skipped} skipped, ${failed} failed`,
  );

  if (failed > 0) {
    throw new Error(`${failed} index(es) failed to create — check logs above`);
  }
}

addCompositeIndexes().catch((err) => {
  logger.warn({ err: err }, "[IndexMigration] Fatal:");
  process.exit(1);
});
