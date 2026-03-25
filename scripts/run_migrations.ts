import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import * as schema from '../shared/schema.js';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  console.log('Running migrations from ./migrations folder...');
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('✅ All migrations applied!');
  
  // Verify tables
  const result = await db.execute(
    // @ts-ignore
    { text: "SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" }
  );
  console.log('Tables in DB:', result.rows[0]);
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
