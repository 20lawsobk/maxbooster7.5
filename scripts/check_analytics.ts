import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    // List all tables
    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    console.log('All tables:', tables.rows.map((r: any) => r.table_name).join(', '));

    // Check analytics table
    const analyticsCheck = await client.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(streams),0) as total_streams, COALESCE(SUM(revenue::numeric),0) as total_revenue FROM analytics WHERE user_id = (SELECT id FROM users WHERE email = 'blawzmusic@gmail.com')`);
    console.log('Analytics for admin:', JSON.stringify(analyticsCheck.rows[0]));
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}
main();
