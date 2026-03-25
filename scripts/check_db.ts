import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  console.log('Tables:', tables.rows.length > 0 ? tables.rows.map((r: any) => r.table_name).join(', ') : 'NONE');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
