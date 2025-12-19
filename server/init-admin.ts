import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';

/**
 * Admin Account Initialization
 * 
 * Creates the admin account if it doesn't exist, using environment variables.
 * Works in both development and production environments.
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
    
    // Check if admin already exists
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    
    if (existingAdmin) {
      logger.info(`✅ Admin account exists: ${adminEmail}`);
      await seedPluginCatalog();
      return existingAdmin;
    }
    
    // Create admin account
    logger.info('🔐 Creating admin account...');
    
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const admin = await storage.createUser({
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
    
    // Create profile via storage
    try {
      await storage.createUserProfile(admin.id, {
        displayName: 'B-Lawz Music',
        bio: 'Founder & CEO of Max Booster',
        avatarUrl: '/logo.png',
        genre: 'Hip-Hop/R&B',
        location: 'Los Angeles, CA',
        website: 'https://maxbooster.io',
        isPublic: true,
        verifiedArtist: true,
      });
      logger.info('✅ Admin profile created');
    } catch (e) {
      logger.warn('Profile creation skipped (may already exist)');
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
