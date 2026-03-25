import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  // Drop all tables I incorrectly created
  const tables = ['notifications', 'royalty_transactions', 'campaigns', 'releases', 'subscriptions', 'projects', 'analytics', 'sessions', 'users'];
  for (const t of tables) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS ${t} CASCADE`));
    console.log(`Dropped: ${t}`);
  }
  const remaining = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  console.log('Tables remaining:', remaining.rows.length === 0 ? 'NONE' : remaining.rows.map((r: any) => r.table_name).join(', '));
}

main().then(() => { console.log('Done'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
