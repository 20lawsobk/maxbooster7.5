import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dns_zones (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id varchar NOT NULL,
      domain text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'pending',
      verification_token text DEFAULT gen_random_uuid()::text,
      is_verified boolean DEFAULT false,
      nameserver1 text DEFAULT 'ns1.maxboostermusic.com',
      nameserver2 text DEFAULT 'ns2.maxboostermusic.com',
      notes text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);
  console.log('dns_zones created/verified');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dns_zone_records (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
      zone_id varchar NOT NULL,
      user_id varchar NOT NULL,
      domain text NOT NULL,
      type text NOT NULL,
      name text NOT NULL,
      value text NOT NULL,
      ttl integer DEFAULT 3600,
      priority integer,
      weight integer,
      port integer,
      tag text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);
  console.log('dns_zone_records created/verified');
  await pool.end();
  console.log('Done!');
}
main().catch(e => { console.error(e); process.exit(1); });
