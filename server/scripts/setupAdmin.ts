/**
 * ADMIN ACCOUNT SETUP SCRIPT
 * 
 * Creates the initial admin account with lifetime subscription.
 * Run once during initial setup: npx tsx server/scripts/setupAdmin.ts
 * 
 * Uses environment variables for credentials:
 * - ADMIN_EMAIL (default: from env or prompts)
 * - ADMIN_PASSWORD (from env, must be set)
 */

import { db } from '../db';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

async function setupAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    console.error('❌ ADMIN_PASSWORD environment variable must be set');
    console.error('   Example: ADMIN_PASSWORD=yourSecurePassword npx tsx server/scripts/setupAdmin.ts');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('🔐 ADMIN ACCOUNT SETUP');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   Email: ${adminEmail}`);
  console.log('');

  try {
    // Check if admin already exists
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existingAdmin.length > 0) {
      console.log('⚠️  Admin account already exists. Updating...');
      
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      await db.update(users)
        .set({
          password: hashedPassword,
          role: 'admin',
          subscriptionTier: 'lifetime',
          subscriptionStatus: 'active',
          firstName: 'B-Lawz',
          lastName: 'Admin',
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(users.email, adminEmail));
      
      console.log('✅ Admin account updated successfully');
    } else {
      console.log('Creating new admin account...');
      
      const hashedPassword = await bcrypt.hash(adminPassword, 12);
      
      await db.insert(users).values({
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        firstName: 'B-Lawz',
        lastName: 'Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      console.log('✅ Admin account created successfully');
    }

    console.log('');
    console.log('   ✓ Role: admin');
    console.log('   ✓ Subscription: lifetime');
    console.log('   ✓ Status: active');
    console.log('═══════════════════════════════════════════════════════');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Failed to setup admin account:', error.message);
    process.exit(1);
  }
}

setupAdmin();
