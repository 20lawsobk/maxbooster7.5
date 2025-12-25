import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { users, userStorage, userTasteProfiles } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Admin Account Initialization
 * 
 * Creates the admin account as a regular user with:
 * - Admin role (for admin-specific abilities)
 * - Lifetime subscription (pre-configured)
 * - Full user initialization (storage, preferences, taste profile)
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
    let isNewAdmin = false;
    
    if (admin) {
      logger.info(`✅ Admin account exists: ${adminEmail}`);
      
      // Sync password, role, subscription, and ensure onboarding is complete
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await db.update(users).set({ 
        password: hashedPassword,
        role: 'admin',
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        onboardingCompleted: true,
        onboardingStep: 100,
        onboardingData: {
          completedAt: new Date().toISOString(),
          skipped: false,
          source: 'admin_init',
        },
      }).where(eq(users.id, admin.id));
      logger.info('✅ Admin credentials and subscription synced');
    } else {
      logger.info('🔐 Creating admin account...');
      isNewAdmin = true;
      
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      admin = await storage.createUser({
        username: adminUsername,
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        subscriptionTier: 'lifetime',
        subscriptionStatus: 'active',
        trialEndsAt: null,
        firstName: 'B-Lawz',
        lastName: 'Music',
      });
      
      // Mark onboarding as complete for new admin
      await db.update(users).set({
        onboardingCompleted: true,
        onboardingStep: 100,
        onboardingData: {
          completedAt: new Date().toISOString(),
          skipped: false,
          source: 'admin_init',
        },
      }).where(eq(users.id, admin.id));
      
      logger.info(`✅ Admin account created: ${admin.email}`);
    }
    
    // Ensure admin has all user resources initialized
    await initializeAdminResources(admin.id, adminEmail, isNewAdmin);
    
    await seedPluginCatalog();
    
    return admin;
  } catch (error: unknown) {
    logger.error('Error during admin initialization:', error);
    throw error;
  }
}

/**
 * Initialize all user resources for the admin account
 * This ensures parity with what new users get during registration
 */
async function initializeAdminResources(adminId: string, adminEmail: string, isNewAdmin: boolean) {
  try {
    // 1. Check and initialize Pocket Dimension storage
    const [existingStorage] = await db
      .select()
      .from(userStorage)
      .where(eq(userStorage.userId, adminId));
    
    if (!existingStorage) {
      try {
        const { userPocketService } = await import('./services/userPocketDimensionService.js');
        await userPocketService.initializeUserStorage(adminId, adminEmail);
        logger.info('   ✓ Admin Pocket Dimension storage initialized');
      } catch (error) {
        logger.warn('   ⚠️ Admin Pocket Dimension storage initialization skipped (non-critical)');
      }
    } else {
      logger.info('   ✓ Admin Pocket Dimension storage exists');
    }
    
    // 2. Check and initialize user taste profile for discovery algorithm
    const [existingTasteProfile] = await db
      .select()
      .from(userTasteProfiles)
      .where(eq(userTasteProfiles.userId, adminId));
    
    if (!existingTasteProfile) {
      await db.insert(userTasteProfiles).values({
        userId: adminId,
        genreScores: { 'hip-hop': 0.8, 'r&b': 0.7, 'trap': 0.6, 'pop': 0.5 },
        moodScores: { energetic: 0.7, chill: 0.6, dark: 0.5, uplifting: 0.5 },
        preferredTempoMin: 80,
        preferredTempoMax: 160,
        preferredKeys: ['C minor', 'G minor', 'A minor'],
        followedProducers: [],
        priceSensitivity: 0.5,
        totalInteractions: 0,
        purchaseCount: 0,
      });
      logger.info('   ✓ Admin taste profile initialized');
    } else {
      logger.info('   ✓ Admin taste profile exists');
    }
    
    logger.info('✅ Admin resources verified/initialized');
  } catch (error) {
    logger.error('Error initializing admin resources:', error);
    // Don't throw - admin account is still functional without these
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
