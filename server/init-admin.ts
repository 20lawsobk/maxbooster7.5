import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Admin Account Initialization
 * 
 * Creates the admin account as a regular user with:
 * - Admin role (for admin-specific abilities)
 * - Lifetime subscription (pre-configured)
 * 
 * Everything else is the same as any other user - they create their own
 * projects, releases, connect their own social accounts, etc.
 */

export async function initializeAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUsername = process.env.ADMIN_USERNAME || 'blawzmusic';
    
    if (!adminPassword) {
      logger.warn('⚠️ ADMIN_PASSWORD not set - skipping admin initialization');
      await seedPluginCatalog();
      return null;
    }
    
    logger.info('🔐 Checking for admin account...');
    
    let admin = await storage.getUserByEmail(adminEmail);
    
    if (admin) {
      logger.info(`✅ Admin account exists: ${adminEmail}`);
      
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, admin.id));
      logger.info('✅ Admin password synced');
    } else {
      logger.info('🔐 Creating admin account...');
      
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      admin = await storage.createUser({
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        subscriptionPlan: 'lifetime',
        subscriptionStatus: 'active',
        trialEndsAt: null,
        firstName: 'B-Lawz',
        lastName: 'Music',
      });
      
      logger.info(`✅ Admin account created: ${admin.email}`);
    }
    
    await seedPluginCatalog();
    
    return admin;
  } catch (error: unknown) {
    logger.error('Error during admin initialization:', error);
    throw error;
  }
}

async function seedPluginCatalog() {
  try {
    logger.info('🎛️ Seeding plugin catalog...');
    await storage.seedPluginCatalog();
    logger.info('✅ Plugin catalog seeded');
  } catch (error) {
    logger.warn('Plugin catalog seeding skipped');
  }
}

export async function bootstrapAdmin() {
  return initializeAdmin();
}
