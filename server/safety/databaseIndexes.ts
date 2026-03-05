/**
 * DATABASE INDEXES
 * 
 * Critical indexes for production performance.
 * Without these, queries will do full table scans at scale.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { logger } from '../logger.js';

interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  description: string;
}

const REQUIRED_INDEXES: IndexDefinition[] = [
  // User lookups
  {
    name: 'idx_users_email',
    table: 'users',
    columns: ['email'],
    unique: true,
    description: 'Fast user lookup by email (login)',
  },
  {
    name: 'idx_users_subscription_tier',
    table: 'users',
    columns: ['subscription_tier'],
    description: 'Filter users by subscription tier',
  },
  {
    name: 'idx_users_created_at',
    table: 'users',
    columns: ['created_at'],
    description: 'User signups over time',
  },

  // Analytics queries
  {
    name: 'idx_analytics_user_id',
    table: 'analytics',
    columns: ['user_id'],
    description: 'User analytics lookup',
  },
  {
    name: 'idx_analytics_date',
    table: 'analytics',
    columns: ['date'],
    description: 'Analytics by date range',
  },
  {
    name: 'idx_analytics_user_date',
    table: 'analytics',
    columns: ['user_id', 'date'],
    description: 'User analytics for date range',
  },

  // Instant payouts
  {
    name: 'idx_instant_payouts_user_id',
    table: 'instant_payouts',
    columns: ['user_id'],
    description: 'User payout history',
  },
  {
    name: 'idx_instant_payouts_status',
    table: 'instant_payouts',
    columns: ['status'],
    description: 'Filter payouts by status',
  },
  {
    name: 'idx_instant_payouts_created_at',
    table: 'instant_payouts',
    columns: ['created_at'],
    description: 'Payouts over time',
  },

  // Releases
  {
    name: 'idx_releases_user_id',
    table: 'releases',
    columns: ['user_id'],
    description: 'User releases lookup',
  },
  {
    name: 'idx_releases_status',
    table: 'releases',
    columns: ['status'],
    description: 'Filter releases by status',
  },
  {
    name: 'idx_releases_release_date',
    table: 'releases',
    columns: ['release_date'],
    description: 'Releases by date',
  },

  // Social campaigns
  {
    name: 'idx_social_campaigns_user_id',
    table: 'social_campaigns',
    columns: ['user_id'],
    description: 'User social campaigns',
  },
  {
    name: 'idx_social_campaigns_scheduled_at',
    table: 'social_campaigns',
    columns: ['scheduled_at'],
    description: 'Scheduled posts queue',
  },
  {
    name: 'idx_social_campaigns_status',
    table: 'social_campaigns',
    columns: ['status'],
    description: 'Filter by campaign status',
  },

  // Listings (uses beat_price column, no generic status/price columns)
  {
    name: 'idx_listings_user_id',
    table: 'listings',
    columns: ['user_id'],
    description: 'User marketplace listings',
  },

  // Analytics streaming (covered by analytics table)
  // Note: streaming_stats table merged into analytics table

  // API keys
  {
    name: 'idx_api_keys_user_id',
    table: 'api_keys',
    columns: ['user_id'],
    description: 'User API keys',
  },
  {
    name: 'idx_api_keys_key_hash',
    table: 'api_keys',
    columns: ['key_hash'],
    unique: true,
    description: 'Fast API key lookup',
  },

  // Sessions are managed by Redis - no database index needed

  // Workspace audit log
  {
    name: 'idx_workspace_audit_log_user_id',
    table: 'workspace_audit_log',
    columns: ['user_id'],
    description: 'User audit trail',
  },
  {
    name: 'idx_workspace_audit_log_action',
    table: 'workspace_audit_log',
    columns: ['action'],
    description: 'Filter by action type',
  },
  {
    name: 'idx_workspace_audit_log_created_at',
    table: 'workspace_audit_log',
    columns: ['created_at'],
    description: 'Audit log time range',
  },
  {
    name: 'idx_ip_blacklist_expires_at',
    table: 'ip_blacklist',
    columns: ['expires_at'],
    description: 'IP blacklist expiry lookups',
  },
  {
    name: 'idx_ip_blacklist_ip',
    table: 'ip_blacklist',
    columns: ['ip'],
    description: 'IP blacklist IP address lookups',
  },
  {
    name: 'idx_ip_blacklist_is_active',
    table: 'ip_blacklist',
    columns: ['is_active'],
    description: 'IP blacklist active status filter',
  },
  {
    name: 'idx_autopilot_learning_data_created_at',
    table: 'autopilot_learning_data',
    columns: ['created_at'],
    description: 'Autopilot learning data time range queries',
  },
  {
    name: 'idx_autopilot_learning_data_posting_day',
    table: 'autopilot_learning_data',
    columns: ['posting_day_of_week', 'posting_hour'],
    description: 'Autopilot learning data posting schedule lookups',
  },
  {
    name: 'idx_autopilot_learning_data_user_platform',
    table: 'autopilot_learning_data',
    columns: ['user_id', 'platform'],
    description: 'Composite index for HyperLearning cycle queries filtering by user and platform',
  },
  // social_accounts — queried every minute by token refresh monitor
  {
    name: 'idx_social_accounts_user_id',
    table: 'social_accounts',
    columns: ['user_id'],
    description: 'Fast social account lookup by user',
  },
  {
    name: 'idx_social_accounts_active_expires',
    table: 'social_accounts',
    columns: ['is_active', 'token_expires_at'],
    description: 'Composite index for token refresh monitor (is_active + token_expires_at range query)',
  },
  {
    name: 'idx_social_accounts_platform_user',
    table: 'social_accounts',
    columns: ['platform', 'user_id'],
    description: 'Platform-specific social account lookups',
  },

  // autopilot_preferences — queried on every autopilot cycle
  {
    name: 'idx_autopilot_preferences_user_id',
    table: 'autopilot_preferences',
    columns: ['user_id'],
    description: 'Fast autopilot preferences lookup by user',
  },
  {
    name: 'idx_autopilot_preferences_active',
    table: 'autopilot_preferences',
    columns: ['is_active'],
    description: 'Filter active autopilot users for scheduler cycles',
  },

  {
    name: 'idx_users_stripe_customer_id',
    table: 'users',
    columns: ['stripe_customer_id'],
    description: 'Fast user lookup by Stripe customer ID in webhook handlers',
  },
  {
    name: 'idx_subscriptions_stripe_subscription_id',
    table: 'subscriptions',
    columns: ['stripe_subscription_id'],
    description: 'Fast subscription lookup by Stripe subscription ID in billing routes',
  },

  // system_logs — write-heavy audit table; indexes support log pruning and dashboard queries
  {
    name: 'idx_system_logs_timestamp',
    table: 'system_logs',
    columns: ['timestamp'],
    description: 'Time-range queries and oldest-first pruning on system_logs',
  },
  {
    name: 'idx_system_logs_level',
    table: 'system_logs',
    columns: ['level'],
    description: 'Fast filter by log level (ERROR, WARN, INFO) in monitoring dashboards',
  },
  {
    name: 'idx_system_logs_user_id',
    table: 'system_logs',
    columns: ['user_id'],
    description: 'Per-user audit log queries',
  },

  // music_workflow_automations
  {
    name: 'idx_music_workflow_automations_user_id',
    table: 'music_workflow_automations',
    columns: ['user_id'],
    description: 'Fast lookup of all automations for a given user',
  },
  {
    name: 'idx_music_workflow_execution_logs_template_id',
    table: 'music_workflow_execution_logs',
    columns: ['template_id'],
    description: 'Execution history lookup per workflow template',
  },
  {
    name: 'idx_music_workflow_execution_logs_user_id',
    table: 'music_workflow_execution_logs',
    columns: ['user_id'],
    description: 'Per-user execution history queries',
  },
  {
    name: 'idx_music_workflow_execution_logs_executed_at',
    table: 'music_workflow_execution_logs',
    columns: ['executed_at'],
    description: 'Time-ordered execution log queries',
  },

  // orders — queried for sales counts and seller dashboard
  {
    name: 'idx_orders_seller_id',
    table: 'orders',
    columns: ['seller_id'],
    description: 'Fast seller order history lookup',
  },
  {
    name: 'idx_orders_seller_id_status',
    table: 'orders',
    columns: ['seller_id', 'status'],
    description: 'Composite index for completed-orders-per-seller count (getProducers)',
  },
  {
    name: 'idx_orders_user_id',
    table: 'orders',
    columns: ['user_id'],
    description: 'Fast buyer order history lookup (user_id = buyer in orders table)',
  },
  {
    name: 'idx_orders_status',
    table: 'orders',
    columns: ['status'],
    description: 'Filter orders by fulfillment status',
  },

  // storefront_follows — queried for follower counts per producer
  {
    name: 'idx_storefront_follows_storefront_id',
    table: 'storefront_follows',
    columns: ['storefront_id'],
    description: 'Follower count aggregation per storefront (getProducers JOIN)',
  },
  {
    name: 'idx_storefront_follows_user_id',
    table: 'storefront_follows',
    columns: ['user_id'],
    description: 'Following list for a given user',
  },

  // storefront_ratings — queried for average rating per producer
  {
    name: 'idx_storefront_ratings_storefront_id',
    table: 'storefront_ratings',
    columns: ['storefront_id'],
    description: 'Rating aggregation per storefront (getProducers JOIN)',
  },

  // storefronts — joined from users.id frequently
  {
    name: 'idx_storefronts_user_id',
    table: 'storefronts',
    columns: ['user_id'],
    description: 'Fast storefront lookup by owner user_id',
  },

  // royalty_transactions — queried in distribution analytics
  {
    name: 'idx_royalty_transactions_user_id',
    table: 'royalty_transactions',
    columns: ['user_id'],
    description: 'User royalty transaction history',
  },
  {
    name: 'idx_royalty_transactions_release_id',
    table: 'royalty_transactions',
    columns: ['release_id'],
    description: 'Per-release revenue aggregation',
  },
];

export interface IndexCreationResult {
  success: boolean;
  created: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
}

/**
 * Create all required database indexes
 * Safe to run multiple times - skips existing indexes
 */
export async function createRequiredIndexes(): Promise<IndexCreationResult> {
  const created: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];

  logger.info('════════════════════════════════════════════════════════');
  logger.info('📊 CREATING DATABASE INDEXES');
  logger.info('════════════════════════════════════════════════════════');

  for (const index of REQUIRED_INDEXES) {
    try {
      // Check if index already exists
      const existsResult = await db.execute(sql`
        SELECT 1 FROM pg_indexes 
        WHERE indexname = ${index.name}
      `);

      if (existsResult.rows.length > 0) {
        skipped.push(index.name);
        logger.info(`   ⏭️ ${index.name} - already exists`);
        continue;
      }

      // Check if table exists
      const tableExists = await db.execute(sql`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = ${index.table}
      `);

      if (tableExists.rows.length === 0) {
        skipped.push(index.name);
        logger.warn(`   ⚠️ ${index.name} - table '${index.table}' doesn't exist`);
        continue;
      }

      // Create the index using Drizzle sql template with identifiers
      // Note: Values come from hardcoded REQUIRED_INDEXES constant (no user input)
      const indexNameId = sql.identifier(index.name);
      const tableId = sql.identifier(index.table);
      const columnsId = sql.join(index.columns.map(c => sql.identifier(c)), sql`, `);
      
      if (index.unique) {
        await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS ${indexNameId} ON ${tableId} (${columnsId})`);
      } else {
        await db.execute(sql`CREATE INDEX IF NOT EXISTS ${indexNameId} ON ${tableId} (${columnsId})`);
      }

      created.push(index.name);
      logger.info(`   ✓ ${index.name} on ${index.table}(${index.columns.join(', ')})`);
    } catch (error: any) {
      // Some errors are expected (table doesn't exist, etc.)
      if (error.message?.includes('does not exist')) {
        skipped.push(index.name);
        logger.warn(`   ⚠️ ${index.name} - ${error.message}`);
      } else {
        failed.push({ name: index.name, error: error.message });
        logger.error(`   ✗ ${index.name} - ${error.message}`);
      }
    }
  }

  logger.info('────────────────────────────────────────────────────────');
  logger.info(`   Created: ${created.length} | Skipped: ${skipped.length} | Failed: ${failed.length}`);
  logger.info('════════════════════════════════════════════════════════');

  return {
    success: failed.length === 0,
    created,
    skipped,
    failed,
  };
}

/**
 * Get index creation status without modifying anything
 */
export async function getIndexStatus(): Promise<{
  existing: string[];
  missing: string[];
}> {
  const existing: string[] = [];
  const missing: string[] = [];

  for (const index of REQUIRED_INDEXES) {
    try {
      const result = await db.execute(sql`
        SELECT 1 FROM pg_indexes 
        WHERE indexname = ${index.name}
      `);

      if (result.rows.length > 0) {
        existing.push(index.name);
      } else {
        missing.push(index.name);
      }
    } catch {
      missing.push(index.name);
    }
  }

  return { existing, missing };
}
