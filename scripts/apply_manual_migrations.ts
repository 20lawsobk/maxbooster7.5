import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';
import fs from 'fs';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

const migrations = [
  '0006_add_missing_columns.sql',
  '0007_add_2fa_columns.sql',
  '0008_add_password_reset_fields.sql',
  '0009_add_system_logs.sql',
  '0010_add_soft_delete_to_user_storage_files.sql',
  '0011_add_missing_indexes.sql',
  '0012_api_tier_enum_update.sql',
  '0013_payment_intent_unique_constraint.sql',
];

async function main() {
  // Verify connection
  const test = await db.execute(sql`SELECT current_database()`);
  console.log('Connected to:', (test.rows[0] as any).current_database);

  // Check tables exist now
  const tableCount = await db.execute(sql`
    SELECT COUNT(*) as cnt FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  console.log('Tables in DB:', (tableCount.rows[0] as any).cnt);

  for (const file of migrations) {
    const sqlContent = fs.readFileSync(`./migrations/${file}`, 'utf-8');
    console.log(`\nApplying ${file}...`);
    try {
      await pool.query(sqlContent);
      console.log(`  ✅ ${file} applied`);
    } catch (e: any) {
      if (e.message?.includes('already exists') || e.message?.includes('duplicate')) {
        console.log(`  ⏭  ${file} already applied (skipped)`);
      } else {
        console.warn(`  ⚠️  ${file} warning: ${e.message}`);
      }
    }
  }

  console.log('\n✅ All manual migrations complete');
  await pool.end();
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Migration error:', e.message);
  process.exit(1);
});
