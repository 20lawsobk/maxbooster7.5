import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  // Check key tables
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name IN ('label_settings','achievements','user_achievements','sessions','users') ORDER BY table_name`);
  console.log('Key tables:', tables.rows.map((r: any) => r.table_name).join(', '));
  
  // Check users columns
  const cols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='users' AND table_schema='public' ORDER BY column_name`);
  console.log('Users columns:', cols.rows.map((r: any) => r.column_name).join(', '));
  
  // Check admin user
  const users = await db.execute(sql`SELECT id, email, role, subscription_tier, is_admin FROM users WHERE email = 'blawzmusic@gmail.com'`);
  console.log('Admin user:', users.rows[0] || 'NOT FOUND');
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
