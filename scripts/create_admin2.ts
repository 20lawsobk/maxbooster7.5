import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    const hashedPassword = await bcrypt.hash('Iamadmin123!', 10);
    const id = randomUUID();
    
    // Check if exists
    const existing = await client.query("SELECT id, email FROM users WHERE email = $1", ['blawzmusic@gmail.com']);
    
    if (existing.rows.length > 0) {
      console.log('User already exists, updating:', existing.rows[0]);
      await client.query(
        "UPDATE users SET password = $1, role = $2, subscription_tier = $3, subscription_status = $4, is_admin = $5 WHERE email = $6",
        [hashedPassword, 'admin', 'lifetime', 'active', true, 'blawzmusic@gmail.com']
      );
      console.log('✅ Admin credentials updated');
    } else {
      await client.query(
        "INSERT INTO users (id, email, password, first_name, last_name, role, subscription_tier, subscription_status, is_admin, has_completed_onboarding, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())",
        [id, 'blawzmusic@gmail.com', hashedPassword, 'B-Lawz', 'Music', 'admin', 'lifetime', 'active', true, true]
      );
      console.log('✅ Admin user created with id:', id);
    }
    
    const user = await client.query("SELECT id, email, role, subscription_tier, is_admin FROM users WHERE email = $1", ['blawzmusic@gmail.com']);
    console.log('Admin user:', user.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('Error:', e.message); process.exit(1); });
