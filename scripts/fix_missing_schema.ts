import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Check what's missing
  const check = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('user_storage_files', 'ai_models')
  `);
  console.log('Found tables:', check.rows.map((r: any) => r.table_name));

  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'status'
  `);
  console.log('ai_models.status column exists:', cols.rows.length > 0);

  // Create user_storage_files if missing
  const hasUsf = check.rows.some((r: any) => r.table_name === 'user_storage_files');
  if (!hasUsf) {
    console.log('Creating user_storage_files table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "user_storage_files" (
        "id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "user_id" text NOT NULL,
        "filename" text NOT NULL,
        "original_name" text NOT NULL,
        "mime_type" text NOT NULL,
        "size" integer NOT NULL,
        "storage_path" text NOT NULL,
        "storage_type" text DEFAULT 'local' NOT NULL,
        "url" text,
        "metadata" jsonb,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        "deleted_at" timestamp
      );
      CREATE INDEX IF NOT EXISTS "idx_user_storage_files_user_id" ON "user_storage_files" ("user_id");
      CREATE INDEX IF NOT EXISTS "idx_user_storage_files_deleted_at" ON "user_storage_files" ("deleted_at");
    `);
    console.log('✅ user_storage_files created');
  } else {
    // Add deleted_at if missing
    await pool.query(`ALTER TABLE "user_storage_files" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "idx_user_storage_files_deleted_at" ON "user_storage_files" ("deleted_at")`);
    console.log('✅ user_storage_files updated');
  }

  // Apply 0011 indexes that may have failed
  const idxSqls = [
    `CREATE INDEX IF NOT EXISTS "users_password_reset_token_idx" ON "users" USING btree ("password_reset_token")`,
    `CREATE INDEX IF NOT EXISTS "users_google_id_idx" ON "users" USING btree ("google_id")`,
    `CREATE INDEX IF NOT EXISTS "users_stripe_customer_id_idx" ON "users" USING btree ("stripe_customer_id")`,
    `CREATE INDEX IF NOT EXISTS "ai_models_model_type_idx" ON "ai_models" USING btree ("model_type")`,
  ];
  for (const idx of idxSqls) {
    try {
      await pool.query(idx);
    } catch(e: any) {
      console.warn('Index warning:', e.message.split('\n')[0]);
    }
  }
  console.log('✅ Performance indexes applied');
  
  await pool.end();
  console.log('Schema fix complete');
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
