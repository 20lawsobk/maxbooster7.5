import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  const cols = await db.execute(sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public' ORDER BY ordinal_position`);
  cols.rows.forEach((r: any) => console.log(`  ${r.column_name} (${r.data_type}, ${r.is_nullable})`));
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
