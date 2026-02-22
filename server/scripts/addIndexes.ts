/**
 * One-time idempotent index migration.
 * Uses CREATE INDEX IF NOT EXISTS — safe to run multiple times.
 * Targets high-traffic userId/FK columns that lack explicit indexes.
 * Run with: npx tsx server/scripts/addIndexes.ts
 */
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const indexes: { name: string; ddl: string }[] = [
  // projects — queried by userId on every dashboard load + churn analysis
  { name: 'idx_projects_user_id',     ddl: 'CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)' },
  { name: 'idx_projects_created_at',  ddl: 'CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at)' },

  // releases — queried by userId and artistId throughout the app
  { name: 'idx_releases_user_id',     ddl: 'CREATE INDEX IF NOT EXISTS idx_releases_user_id ON releases(user_id)' },
  { name: 'idx_releases_artist_id',   ddl: 'CREATE INDEX IF NOT EXISTS idx_releases_artist_id ON releases(artist_id)' },

  // campaigns — queried by userId for ad dashboard
  { name: 'idx_campaigns_user_id',    ddl: 'CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id)' },

  // sessions — queried by userId for auth checks + churn analysis
  { name: 'idx_sessions_user_id',         ddl: 'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)' },
  { name: 'idx_sessions_last_activity',   ddl: 'CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity)' },

  // analytics — queried by userId for dashboard metrics
  { name: 'idx_analytics_user_id',    ddl: 'CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id)' },

  // distro_releases — queried by artist_id throughout distribution flow
  { name: 'idx_distro_releases_artist_id', ddl: 'CREATE INDEX IF NOT EXISTS idx_distro_releases_artist_id ON distro_releases(artist_id)' },

  // royalty_transactions — queried by user_id, release_id, and split_id for royalty reporting
  { name: 'idx_royalty_tx_user_id',    ddl: 'CREATE INDEX IF NOT EXISTS idx_royalty_tx_user_id ON royalty_transactions(user_id)' },
  { name: 'idx_royalty_tx_release_id', ddl: 'CREATE INDEX IF NOT EXISTS idx_royalty_tx_release_id ON royalty_transactions(release_id)' },
  { name: 'idx_royalty_tx_split_id',   ddl: 'CREATE INDEX IF NOT EXISTS idx_royalty_tx_split_id ON royalty_transactions(split_id)' },

  // dsp_analytics — queried by user_id and release_id for streaming analytics
  { name: 'idx_dsp_analytics_user_id',    ddl: 'CREATE INDEX IF NOT EXISTS idx_dsp_analytics_user_id ON dsp_analytics(user_id)' },
  { name: 'idx_dsp_analytics_release_id', ddl: 'CREATE INDEX IF NOT EXISTS idx_dsp_analytics_release_id ON dsp_analytics(release_id)' },

  // posts — queried by user_id, submitted_by, and published_at for social + churn analysis
  { name: 'idx_posts_user_id',       ddl: 'CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id)' },
  { name: 'idx_posts_submitted_by',  ddl: 'CREATE INDEX IF NOT EXISTS idx_posts_submitted_by ON posts(submitted_by)' },
  { name: 'idx_posts_published_at',  ddl: 'CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)' },

  // artist_profiles — queried by user_id for profile management
  { name: 'idx_artist_profiles_user_id', ddl: 'CREATE INDEX IF NOT EXISTS idx_artist_profiles_user_id ON artist_profiles(user_id)' },
];

async function run() {
  console.log(`Creating ${indexes.length} indexes...`);
  let created = 0;
  let failed = 0;

  for (const idx of indexes) {
    try {
      await db.execute(sql.raw(idx.ddl));
      console.log(`  ✓ ${idx.name}`);
      created++;
    } catch (err: any) {
      console.error(`  ✗ ${idx.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${created} succeeded, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
