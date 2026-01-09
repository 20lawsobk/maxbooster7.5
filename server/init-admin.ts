import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { users, userStorage, userTasteProfiles, dspProviders } from '../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { DSP_POLICIES } from './services/dspPolicyChecker';

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
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminUsername = process.env.ADMIN_USERNAME;
    
    if (!adminEmail) {
      logger.warn('⚠️ ADMIN_EMAIL not set - skipping admin initialization');
      await seedPluginCatalog();
      return null;
    }
    
    if (!adminPassword) {
      logger.warn('⚠️ ADMIN_PASSWORD not set - skipping admin initialization');
      await seedPluginCatalog();
      return null;
    }
    
    logger.info('🔐 Checking for admin account...');
    
    // Check by email using direct DB query to avoid any caching/case issues
    const [existingAdmin] = await db.select().from(users).where(eq(users.email, adminEmail));
    let admin = existingAdmin;
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
      if (!adminUsername) {
        logger.warn('⚠️ ADMIN_USERNAME not set - cannot create new admin account');
        await seedPluginCatalog();
        return null;
      }
      
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
    await seedDSPProviders();
    
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
  
  try {
    await seedStudioTemplates();
  } catch (error) {
    logger.warn('Template seeding skipped');
  }
}

async function seedStudioTemplates() {
  const { studioTemplates } = await import('../shared/schema');
  const { nanoid } = await import('nanoid');
  
  // Check if templates already exist
  const existingTemplates = await db.select().from(studioTemplates).limit(1);
  if (existingTemplates.length > 0) {
    logger.info('   ✓ Studio templates already seeded');
    return;
  }
  
  logger.info('📋 Seeding studio templates...');
  
  const builtInTemplates = [
    {
      id: nanoid(),
      name: 'Empty Song',
      description: 'Start with a blank canvas',
      category: 'recording',
      genre: null,
      bpm: 120,
      timeSignature: '4/4',
      trackCount: 0,
      templateData: { tracks: [] },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Hip Hop Beat',
      description: 'Pre-configured for hip hop production',
      category: 'production',
      genre: 'Hip Hop',
      bpm: 90,
      timeSignature: '4/4',
      trackCount: 8,
      templateData: { 
        tracks: [
          { name: 'Kick', type: 'audio' },
          { name: 'Snare', type: 'audio' },
          { name: 'Hi-Hats', type: 'audio' },
          { name: 'Bass', type: 'midi' },
          { name: 'Keys', type: 'midi' },
          { name: 'Melody', type: 'midi' },
          { name: 'Vocals', type: 'audio' },
          { name: 'FX', type: 'audio' },
        ]
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Pop Production',
      description: 'Modern pop production setup',
      category: 'production',
      genre: 'Pop',
      bpm: 120,
      timeSignature: '4/4',
      trackCount: 10,
      templateData: { 
        tracks: [
          { name: 'Drums', type: 'audio' },
          { name: 'Bass', type: 'midi' },
          { name: 'Piano', type: 'midi' },
          { name: 'Synth Lead', type: 'midi' },
          { name: 'Synth Pad', type: 'midi' },
          { name: 'Guitar', type: 'audio' },
          { name: 'Lead Vocal', type: 'audio' },
          { name: 'Harmony 1', type: 'audio' },
          { name: 'Harmony 2', type: 'audio' },
          { name: 'FX', type: 'audio' },
        ]
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Electronic/EDM',
      description: 'Electronic dance music production',
      category: 'production',
      genre: 'Electronic',
      bpm: 128,
      timeSignature: '4/4',
      trackCount: 12,
      templateData: { 
        tracks: [
          { name: 'Kick', type: 'audio' },
          { name: 'Clap/Snare', type: 'audio' },
          { name: 'Hi-Hats', type: 'audio' },
          { name: 'Percussion', type: 'audio' },
          { name: 'Sub Bass', type: 'midi' },
          { name: 'Bass', type: 'midi' },
          { name: 'Lead Synth', type: 'midi' },
          { name: 'Pad', type: 'midi' },
          { name: 'Pluck', type: 'midi' },
          { name: 'Arp', type: 'midi' },
          { name: 'Riser/FX', type: 'audio' },
          { name: 'Vocal Chops', type: 'audio' },
        ]
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'R&B Soul',
      description: 'Smooth R&B production',
      category: 'production',
      genre: 'R&B',
      bpm: 85,
      timeSignature: '4/4',
      trackCount: 8,
      templateData: { 
        tracks: [
          { name: 'Drums', type: 'audio' },
          { name: 'Bass', type: 'midi' },
          { name: 'Electric Piano', type: 'midi' },
          { name: 'Strings', type: 'midi' },
          { name: 'Guitar', type: 'audio' },
          { name: 'Lead Vocal', type: 'audio' },
          { name: 'Background Vocals', type: 'audio' },
          { name: 'FX', type: 'audio' },
        ]
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Podcast/Voice Recording',
      description: 'Optimized for voice recording and podcasts',
      category: 'recording',
      genre: null,
      bpm: 120,
      timeSignature: '4/4',
      trackCount: 4,
      templateData: { 
        tracks: [
          { name: 'Host', type: 'audio' },
          { name: 'Guest 1', type: 'audio' },
          { name: 'Guest 2', type: 'audio' },
          { name: 'Music/SFX', type: 'audio' },
        ]
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Mastering Session',
      description: 'Setup for mastering your tracks',
      category: 'mastering',
      genre: null,
      bpm: 120,
      timeSignature: '4/4',
      trackCount: 1,
      templateData: { 
        tracks: [
          { name: 'Master', type: 'audio' },
        ],
        mastering: true,
      },
      isBuiltIn: true,
    },
    {
      id: nanoid(),
      name: 'Album Mastering',
      description: 'Multi-track mastering for albums',
      category: 'mastering',
      genre: null,
      bpm: 120,
      timeSignature: '4/4',
      trackCount: 12,
      templateData: { 
        tracks: [
          { name: 'Track 01', type: 'audio' },
          { name: 'Track 02', type: 'audio' },
          { name: 'Track 03', type: 'audio' },
          { name: 'Track 04', type: 'audio' },
          { name: 'Track 05', type: 'audio' },
          { name: 'Track 06', type: 'audio' },
          { name: 'Track 07', type: 'audio' },
          { name: 'Track 08', type: 'audio' },
          { name: 'Track 09', type: 'audio' },
          { name: 'Track 10', type: 'audio' },
          { name: 'Track 11', type: 'audio' },
          { name: 'Track 12', type: 'audio' },
        ],
        mastering: true,
      },
      isBuiltIn: true,
    },
  ];
  
  for (const template of builtInTemplates) {
    await db.insert(studioTemplates).values(template);
  }
  
  logger.info(`   ✓ Seeded ${builtInTemplates.length} built-in templates`);
}

export async function bootstrapAdmin() {
  return initializeAdmin();
}

/**
 * Seed DSP providers from DSP_POLICIES if the table is empty
 */
export async function seedDSPProviders() {
  try {
    logger.info('🔧 Syncing DSP providers...');
    
    const dspList = Object.entries(DSP_POLICIES).map(([slug, policy]) => ({
      id: `dsp_${slug}`,
      name: policy.name,
      slug: slug.toLowerCase(),
      isActive: true,
      metadata: {
        category: getCategoryFromSlug(slug),
        region: 'global',
        processingTime: '3-7 days',
        requirements: {
          isrc: true,
          upc: true,
          metadata: policy.metadata?.requiredFields || ['title', 'artist'],
          audioFormats: policy.audio?.formats || ['WAV', 'FLAC'],
        },
        deliveryMethod: 'api',
        coverArtRequirements: policy.coverArt,
        audioRequirements: policy.audio,
      },
    }));
    
    for (const dsp of dspList) {
      await db.insert(dspProviders).values(dsp).onConflictDoNothing();
    }
    
    logger.info(`✅ Seeded ${dspList.length} DSP providers`);
  } catch (error: any) {
    logger.error('Failed to seed DSP providers:', error.message);
  }
}

function getCategoryFromSlug(slug: string): string {
  const socialPlatforms = ['tiktok', 'instagram', 'snapchat', 'facebook', 'youtube'];
  const electronicPlatforms = ['beatport', 'traxsource', 'juno'];
  const regionalPlatforms = ['netease', 'qq', 'jiosaavn', 'gaana', 'anghami', 'boomplay', 'yandex', 'vk'];
  
  if (socialPlatforms.some(p => slug.toLowerCase().includes(p))) return 'social';
  if (electronicPlatforms.some(p => slug.toLowerCase().includes(p))) return 'electronic';
  if (regionalPlatforms.some(p => slug.toLowerCase().includes(p))) return 'regional';
  
  return 'streaming';
}
