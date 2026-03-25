import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});
async function main() {
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name IN ('label_settings','achievements','user_achievements','_drizzle_migrations','achievement_badges') ORDER BY table_name`);
  console.log('Key tables:', tables.rows.map((r: any) => r.table_name).join(', ') || 'NONE');
  const count = await db.execute(sql`SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  console.log('Total tables:', count.rows[0]);
  // Check user columns
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND table_schema='public' AND column_name IN ('two_factor_enabled','email_verified','onboarding_completed','bio','avatar_url','artist_name') ORDER BY column_name`);
  console.log('Added columns:', cols.rows.map((r: any) => r.column_name).join(', ') || 'NONE');
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
