import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { sql } from 'drizzle-orm';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, {});

async function main() {
  console.log('Checking database connection...');
  
  // First verify we can connect
  const test = await db.execute(sql`SELECT current_database(), current_user`);
  console.log('Connected to:', test.rows[0]);

  // Check if orders table exists
  const tableCheck = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'orders'
    ) as exists
  `);
  const ordersExists = (tableCheck.rows[0] as any).exists;
  console.log('orders table exists:', ordersExists);

  if (!ordersExists) {
    console.log('orders table not found — skipping unique constraint (will apply after full migration)');
    await pool.end();
    return;
  }

  // Apply the unique constraint
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'orders_stripe_payment_intent_id_unique'
        AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_stripe_payment_intent_id_unique
          UNIQUE (stripe_payment_intent_id);
        RAISE NOTICE 'Unique constraint added successfully';
      ELSE
        RAISE NOTICE 'Unique constraint already exists — skipping';
      END IF;
    END $$
  `);
  
  console.log('✅ Migration 0013 applied successfully');
  await pool.end();
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Migration 0013 failed:', e.message);
  process.exit(1);
});
