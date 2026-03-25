import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  
  try {
    const tables = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name LIMIT 15`);
    console.log('Tables:', tables.rows.map(r => r.table_name).join(', '));

    const agg = await client.query(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(amount::numeric),0) as total, COALESCE(SUM(stream_count),0) as streams
      FROM royalty_transactions rt
      JOIN users u ON u.id = rt.user_id
      WHERE u.email = 'blawzmusic@gmail.com'
    `);
    console.log('Admin royalty data:', JSON.stringify(agg.rows[0]));
  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
