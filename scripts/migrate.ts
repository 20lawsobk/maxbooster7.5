import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import * as schema from '../shared/schema.js';
import { sql } from 'drizzle-orm';

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  console.log('Testing DB connection...');
  await db.execute(sql`SELECT 1`);
  console.log('DB connection verified');
  
  // Check tables
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  console.log(`Current tables: ${tables.rows.length > 0 ? tables.rows.map((r: any) => r.table_name).join(', ') : 'NONE'}`);
  
  // We'll create tables by running raw SQL for each table definition
  console.log('Attempting to create core tables...');
  
  // Create users table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    bio TEXT,
    avatar_url VARCHAR(500),
    role VARCHAR(50) DEFAULT 'user',
    subscription_tier VARCHAR(50) DEFAULT 'free',
    subscription_status VARCHAR(50) DEFAULT 'inactive',
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100),
    onboarding_completed BOOLEAN DEFAULT false,
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    email_verified BOOLEAN DEFAULT false,
    google_id VARCHAR(255),
    genre VARCHAR(100),
    location VARCHAR(200),
    website VARCHAR(500),
    spotify_url VARCHAR(500),
    apple_music_url VARCHAR(500),
    soundcloud_url VARCHAR(500),
    instagram_handle VARCHAR(100),
    twitter_handle VARCHAR(100),
    tiktok_handle VARCHAR(100),
    youtube_channel_id VARCHAR(200),
    facebook_page_id VARCHAR(200),
    monthly_listeners INTEGER DEFAULT 0,
    total_streams BIGINT DEFAULT 0,
    followers_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_demo BOOLEAN DEFAULT false,
    demo_expires_at TIMESTAMP WITH TIME ZONE,
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}'
  )`);
  console.log('✓ users table');
  
  // Create sessions table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    data JSONB DEFAULT '{}'
  )`);
  console.log('✓ sessions table');
  
  // Create analytics table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    platform VARCHAR(100),
    streams INTEGER DEFAULT 0,
    revenue DECIMAL(10,4) DEFAULT 0,
    total_listeners INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ analytics table');
  
  // Create projects table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    genre VARCHAR(100),
    bpm INTEGER,
    key VARCHAR(20),
    tags TEXT[],
    cover_art_url VARCHAR(500),
    audio_url VARCHAR(500),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ projects table');
  
  // Create subscriptions table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(200),
    stripe_customer_id VARCHAR(200),
    plan VARCHAR(50),
    status VARCHAR(50),
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ subscriptions table');
  
  // Create releases table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS releases (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    artist_id INTEGER,
    title VARCHAR(255) NOT NULL,
    release_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'draft',
    artwork_url VARCHAR(500),
    genre VARCHAR(100),
    label VARCHAR(200),
    upc VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ releases table');

  // Create campaigns table  
  await db.execute(sql`CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    budget DECIMAL(10,2),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ campaigns table');
  
  // Create royalty_transactions table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS royalty_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,4) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    source VARCHAR(100),
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ royalty_transactions table');
  
  // Create notifications table
  await db.execute(sql`CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    message TEXT,
    read BOOLEAN DEFAULT false,
    data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`);
  console.log('✓ notifications table');
  
  // Verify
  const finalTables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
  console.log(`\nTotal tables created: ${finalTables.rows.length}`);
  console.log('Tables:', finalTables.rows.map((r: any) => r.table_name).join(', '));
}

main().then(() => {
  console.log('\n✅ Migration complete!');
  process.exit(0);
}).catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
