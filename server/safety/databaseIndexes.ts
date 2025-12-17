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

      // Create the index
      const uniqueStr = index.unique ? 'UNIQUE' : '';
      const columnsStr = index.columns.join(', ');
      
      await db.execute(
        sql.raw(`CREATE ${uniqueStr} INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ON ${index.table} (${columnsStr})`)
      );

      created.push(index.name);
      logger.info(`   ✓ ${index.name} on ${index.table}(${columnsStr})`);
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
