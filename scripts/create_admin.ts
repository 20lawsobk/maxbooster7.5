import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import ws from 'ws';
import * as schema from '../shared/schema.js';
import bcrypt from 'bcrypt';
import { createId } from '@paralleldrive/cuid2';

neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const hashedPassword = await bcrypt.hash('Iamadmin123!', 10);
  
  // Check if user already exists
  const existing = await db.select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.email, 'blawzmusic@gmail.com'));
  
  if (existing.length > 0) {
    console.log('Admin user already exists, updating:', existing[0]);
    await db.update(schema.users)
      .set({ 
        password: hashedPassword, 
        role: 'admin', 
        subscriptionTier: 'lifetime', 
        subscriptionStatus: 'active',
        emailVerified: true,
        onboardingCompleted: true,
      })
      .where(eq(schema.users.email, 'blawzmusic@gmail.com'));
    console.log('Updated admin credentials');
  } else {
    const crypto = await import('crypto');
    const id = crypto.randomUUID();
    await db.insert(schema.users).values({ 
      id,
      email: 'blawzmusic@gmail.com',
      password: hashedPassword,
      firstName: 'B-Lawz',
      lastName: 'Music',
      role: 'admin',
      subscriptionTier: 'lifetime',
      subscriptionStatus: 'active',
      emailVerified: true,
      onboardingCompleted: true,
    });
    console.log('✅ Admin user created with id:', id);
  }
  
  const user = await db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, subscriptionTier: schema.users.subscriptionTier })
    .from(schema.users)
    .where(eq(schema.users.email, 'blawzmusic@gmail.com'));
  console.log('Admin user:', user[0]);
}

main().then(() => process.exit(0)).catch(e => { console.error('Error:', e.message); process.exit(1); });
