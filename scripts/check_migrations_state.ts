import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  try {
    const migrations = await db.execute(sql`SELECT * FROM __drizzle_migrations ORDER BY created_at`);
    console.log('Ran migrations:', migrations.rows.map((r: any) => r.hash).length, 'total');
    migrations.rows.forEach((r: any) => console.log(' -', r.hash?.substring(0, 20)));
  } catch(e: any) {
    console.log('No __drizzle_migrations table:', e.message);
    // Try alternative
    try {
      const migrations2 = await db.execute(sql`SELECT * FROM drizzle_migrations ORDER BY created_at`);
      console.log('drizzle_migrations:', migrations2.rows);
    } catch(e2: any) {
      console.log('No drizzle_migrations either:', e2.message);
    }
  }
  
  // Check if 2FA columns exist
  const twofaCols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND table_schema='public' AND column_name IN ('two_factor_enabled', 'two_factor_secret', 'email_verified', 'password_reset_token', 'max_tracks', 'onboarding_completed')`);
  console.log('Added migration columns:', twofaCols.rows.map((r: any) => r.column_name).join(', ') || 'NONE');
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
