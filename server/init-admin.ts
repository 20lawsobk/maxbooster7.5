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
    await seedDistributionPlatformsFromFile();
    
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
  
  try {
    await seedStorefrontTemplates();
  } catch (error) {
    logger.warn('Storefront template seeding skipped');
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

/**
 * Seed high-converting storefront templates for marketplace store setup
 * Based on extensive research of successful beat marketplace designs
 */
async function seedStorefrontTemplates() {
  const { storefrontTemplates } = await import('../shared/schema');
  const { nanoid } = await import('nanoid');
  
  // Check if templates already exist
  const existingTemplates = await db.select().from(storefrontTemplates).limit(1);
  if (existingTemplates.length > 0) {
    logger.info('   ✓ Storefront templates already seeded');
    return;
  }
  
  logger.info('🏪 Seeding storefront templates...');
  
  const marketplaceTemplates = [
    // === PREMIUM TIER (High-Converting, Pro Designs) ===
    {
      id: nanoid(),
      name: 'Platinum Producer',
      slug: 'platinum-producer',
      description: 'Premium dark theme with gold accents. Features prominent audio player, trust badges, and urgency indicators. Optimized for high-ticket beat sales.',
      thumbnailUrl: '/templates/platinum-producer-thumb.png',
      previewUrl: '/templates/platinum-producer-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'grid-featured',
        primaryColor: '#D4AF37',
        secondaryColor: '#1C1C1C',
        backgroundColor: '#0D0D0D',
        textColor: '#FFFFFF',
        accentColor: '#FFD700',
        fontFamily: 'Inter',
        headerFont: 'Bebas Neue',
        borderRadius: '8px',
        buttonStyle: 'gradient',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          trustBadges: true,
          socialProof: true,
          urgencyIndicators: true,
          quickPreview: true,
          instantCheckout: true,
          relatedBeats: true,
          testimonials: true,
          producerBio: true,
          statsCounter: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          limitedAvailability: true,
          countdownTimer: true,
          exitIntent: true,
          cartAbandonment: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Midnight Studio',
      slug: 'midnight-studio',
      description: 'Sleek dark mode design inspired by professional DAWs. Perfect for trap and hip-hop producers wanting a studio-quality aesthetic.',
      thumbnailUrl: '/templates/midnight-studio-thumb.png',
      previewUrl: '/templates/midnight-studio-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'masonry',
        primaryColor: '#8B5CF6',
        secondaryColor: '#1F1F23',
        backgroundColor: '#0F0F10',
        textColor: '#E4E4E7',
        accentColor: '#A78BFA',
        fontFamily: 'Space Grotesk',
        headerFont: 'Space Grotesk',
        borderRadius: '12px',
        buttonStyle: 'solid',
        gridColumns: 4,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          trustBadges: true,
          socialProof: true,
          bpmFilter: true,
          moodFilter: true,
          keyFilter: true,
          quickPreview: true,
          instantCheckout: true,
          playlist: true,
          similarBeats: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          limitedAvailability: true,
          floatingPlayer: true,
          stickyCart: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Neon Wave',
      slug: 'neon-wave',
      description: 'Vibrant cyberpunk-inspired design with neon gradients. Eye-catching visuals that stand out in any genre. Great for electronic and trap beats.',
      thumbnailUrl: '/templates/neon-wave-thumb.png',
      previewUrl: '/templates/neon-wave-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'hero-centered',
        primaryColor: '#FF006E',
        secondaryColor: '#00F5FF',
        backgroundColor: '#0A0A0F',
        textColor: '#FFFFFF',
        accentColor: '#8338EC',
        fontFamily: 'Rajdhani',
        headerFont: 'Orbitron',
        borderRadius: '16px',
        buttonStyle: 'neon-glow',
        gridColumns: 3,
        features: {
          heroSection: true,
          videoBackground: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          visualizer: true,
          animatedElements: true,
          quickPreview: true,
          instantCheckout: true,
          beatPacks: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          flashSales: true,
          countdownTimer: true,
          limitedExclusives: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Luxury Gold',
      slug: 'luxury-gold',
      description: 'Premium luxury theme with elegant typography and gold accents. Perfect for high-end producers targeting serious artists.',
      thumbnailUrl: '/templates/luxury-gold-thumb.png',
      previewUrl: '/templates/luxury-gold-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'elegant-grid',
        primaryColor: '#C9A962',
        secondaryColor: '#1A1A1A',
        backgroundColor: '#0C0C0C',
        textColor: '#F5F5F5',
        accentColor: '#E8D48B',
        fontFamily: 'Cormorant Garamond',
        headerFont: 'Playfair Display',
        borderRadius: '4px',
        buttonStyle: 'bordered',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          trustBadges: true,
          clientLogos: true,
          testimonials: true,
          producerCredits: true,
          instantCheckout: true,
          vipSection: true,
        },
        conversionElements: {
          exclusiveAccess: true,
          membershipTiers: true,
          limitedAvailability: true,
          personalizedOffers: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Studio Pro',
      slug: 'studio-pro',
      description: 'Professional recording studio aesthetic with mixing console elements. Communicates expertise and quality production.',
      thumbnailUrl: '/templates/studio-pro-thumb.png',
      previewUrl: '/templates/studio-pro-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'console-inspired',
        primaryColor: '#10B981',
        secondaryColor: '#1E293B',
        backgroundColor: '#0F172A',
        textColor: '#E2E8F0',
        accentColor: '#34D399',
        fontFamily: 'JetBrains Mono',
        headerFont: 'Space Grotesk',
        borderRadius: '6px',
        buttonStyle: 'solid',
        gridColumns: 4,
        features: {
          heroSection: true,
          featuredBeats: true,
          vuMeterPlayer: true,
          licenseTiers: true,
          technicalSpecs: true,
          stemPreviews: true,
          bpmKeyDisplay: true,
          waveformZoom: true,
          quickPreview: true,
          instantCheckout: true,
          formatOptions: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          bulkDiscounts: true,
          stemBundles: true,
          subscriptionOption: true,
        },
      },
    },
    
    // === STANDARD TIER (Clean, Modern Designs) ===
    {
      id: nanoid(),
      name: 'Clean Slate',
      slug: 'clean-slate',
      description: 'Minimalist white theme with bold typography. Maximum focus on your beats with distraction-free browsing experience.',
      thumbnailUrl: '/templates/clean-slate-thumb.png',
      previewUrl: '/templates/clean-slate-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'light',
        layout: 'minimal-grid',
        primaryColor: '#000000',
        secondaryColor: '#F8F8F8',
        backgroundColor: '#FFFFFF',
        textColor: '#1A1A1A',
        accentColor: '#3B82F6',
        fontFamily: 'Inter',
        headerFont: 'Montserrat',
        borderRadius: '8px',
        buttonStyle: 'solid',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          searchBar: true,
          genreFilter: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          socialProof: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Urban Heat',
      slug: 'urban-heat',
      description: 'Bold street-style design with fire gradient accents. High-energy layout perfect for trap, drill, and hip-hop beats.',
      thumbnailUrl: '/templates/urban-heat-thumb.png',
      previewUrl: '/templates/urban-heat-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'grid-cards',
        primaryColor: '#F97316',
        secondaryColor: '#1C1917',
        backgroundColor: '#0C0A09',
        textColor: '#FAFAF9',
        accentColor: '#EF4444',
        fontFamily: 'Bebas Neue',
        headerFont: 'Bebas Neue',
        borderRadius: '4px',
        buttonStyle: 'gradient',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          trendingSection: true,
          newReleases: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          hotDeals: true,
          flashSales: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Ocean Breeze',
      slug: 'ocean-breeze',
      description: 'Calm blue gradient theme. Perfect for R&B, soul, lo-fi, and chill beats. Creates a relaxed shopping experience.',
      thumbnailUrl: '/templates/ocean-breeze-thumb.png',
      previewUrl: '/templates/ocean-breeze-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'light',
        layout: 'wave-flow',
        primaryColor: '#0EA5E9',
        secondaryColor: '#F0F9FF',
        backgroundColor: '#FFFFFF',
        textColor: '#0C4A6E',
        accentColor: '#06B6D4',
        fontFamily: 'Poppins',
        headerFont: 'Quicksand',
        borderRadius: '16px',
        buttonStyle: 'rounded',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          moodFilters: true,
          vibeCategories: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          curatedPlaylists: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Monochrome Pro',
      slug: 'monochrome-pro',
      description: 'Sophisticated grayscale design with subtle gradients. Timeless aesthetic that works across all genres.',
      thumbnailUrl: '/templates/monochrome-pro-thumb.png',
      previewUrl: '/templates/monochrome-pro-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'classic-grid',
        primaryColor: '#A3A3A3',
        secondaryColor: '#262626',
        backgroundColor: '#171717',
        textColor: '#F5F5F5',
        accentColor: '#FFFFFF',
        fontFamily: 'Inter',
        headerFont: 'Oswald',
        borderRadius: '6px',
        buttonStyle: 'outlined',
        gridColumns: 4,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          categorySections: true,
          searchBar: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          recentSales: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Sunset Vibes',
      slug: 'sunset-vibes',
      description: 'Warm orange and pink gradient theme. Creates an inviting atmosphere ideal for pop, R&B, and afrobeat producers.',
      thumbnailUrl: '/templates/sunset-vibes-thumb.png',
      previewUrl: '/templates/sunset-vibes-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'light',
        layout: 'gradient-cards',
        primaryColor: '#F472B6',
        secondaryColor: '#FFF7ED',
        backgroundColor: '#FFFBF5',
        textColor: '#431407',
        accentColor: '#FB923C',
        fontFamily: 'Nunito',
        headerFont: 'Pacifico',
        borderRadius: '20px',
        buttonStyle: 'gradient',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          colorfulTags: true,
          genreFilters: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          summerSales: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Matrix Code',
      slug: 'matrix-code',
      description: 'Hacker-inspired green-on-black design. Unique tech aesthetic for electronic, dubstep, and experimental producers.',
      thumbnailUrl: '/templates/matrix-code-thumb.png',
      previewUrl: '/templates/matrix-code-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'terminal-style',
        primaryColor: '#22C55E',
        secondaryColor: '#052E16',
        backgroundColor: '#000000',
        textColor: '#4ADE80',
        accentColor: '#86EFAC',
        fontFamily: 'Fira Code',
        headerFont: 'Share Tech Mono',
        borderRadius: '0px',
        buttonStyle: 'terminal',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          spectrogramPlayer: true,
          licenseTiers: true,
          technicalFilters: true,
          bpmKeyDisplay: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          cryptoPayments: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Velvet Night',
      slug: 'velvet-night',
      description: 'Rich purple and burgundy tones. Sophisticated dark theme perfect for moody, atmospheric, and alternative beats.',
      thumbnailUrl: '/templates/velvet-night-thumb.png',
      previewUrl: '/templates/velvet-night-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'elegant-flow',
        primaryColor: '#A855F7',
        secondaryColor: '#1E1B4B',
        backgroundColor: '#0F0D1A',
        textColor: '#E9D5FF',
        accentColor: '#C084FC',
        fontFamily: 'Lora',
        headerFont: 'Cinzel',
        borderRadius: '12px',
        buttonStyle: 'soft',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          moodSection: true,
          artistCollabs: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          exclusiveDrops: true,
        },
      },
    },
    
    // === STARTER TIER (Simple, Effective Designs) ===
    {
      id: nanoid(),
      name: 'Basic Black',
      slug: 'basic-black',
      description: 'Simple and effective dark theme. No distractions, just your beats. Perfect for getting started quickly.',
      thumbnailUrl: '/templates/basic-black-thumb.png',
      previewUrl: '/templates/basic-black-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'simple-list',
        primaryColor: '#FFFFFF',
        secondaryColor: '#1F1F1F',
        backgroundColor: '#000000',
        textColor: '#FFFFFF',
        accentColor: '#3B82F6',
        fontFamily: 'Inter',
        headerFont: 'Inter',
        borderRadius: '4px',
        buttonStyle: 'solid',
        gridColumns: 2,
        features: {
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Fresh Start',
      slug: 'fresh-start',
      description: 'Clean white background with simple navigation. Great for new producers building their first store.',
      thumbnailUrl: '/templates/fresh-start-thumb.png',
      previewUrl: '/templates/fresh-start-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'light',
        layout: 'simple-grid',
        primaryColor: '#1F2937',
        secondaryColor: '#F9FAFB',
        backgroundColor: '#FFFFFF',
        textColor: '#111827',
        accentColor: '#2563EB',
        fontFamily: 'Inter',
        headerFont: 'Inter',
        borderRadius: '8px',
        buttonStyle: 'solid',
        gridColumns: 3,
        features: {
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          searchBar: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Street Corner',
      slug: 'street-corner',
      description: 'Gritty urban design with bold red accents. High-impact visuals for drill, Chicago, and UK rap producers.',
      thumbnailUrl: '/templates/street-corner-thumb.png',
      previewUrl: '/templates/street-corner-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'dark',
        layout: 'urban-grid',
        primaryColor: '#DC2626',
        secondaryColor: '#18181B',
        backgroundColor: '#09090B',
        textColor: '#FAFAFA',
        accentColor: '#EF4444',
        fontFamily: 'Barlow Condensed',
        headerFont: 'Anton',
        borderRadius: '2px',
        buttonStyle: 'sharp',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          genreTags: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          urgencyBanner: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Cloud Nine',
      slug: 'cloud-nine',
      description: 'Dreamy pastel gradient design. Soft and inviting for lo-fi, ambient, and bedroom pop producers.',
      thumbnailUrl: '/templates/cloud-nine-thumb.png',
      previewUrl: '/templates/cloud-nine-preview.png',
      isActive: true,
      isPremium: false,
      configuration: {
        theme: 'light',
        layout: 'floating-cards',
        primaryColor: '#818CF8',
        secondaryColor: '#FDF4FF',
        backgroundColor: '#FEFCE8',
        textColor: '#4C1D95',
        accentColor: '#F0ABFC',
        fontFamily: 'Comfortaa',
        headerFont: 'Varela Round',
        borderRadius: '24px',
        buttonStyle: 'pill',
        gridColumns: 3,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          vibeSelector: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          gentleReminders: true,
        },
      },
    },
    {
      id: nanoid(),
      name: 'Industry Standard',
      slug: 'industry-standard',
      description: 'Professional layout inspired by major label aesthetics. Commands respect and communicates serious quality.',
      thumbnailUrl: '/templates/industry-standard-thumb.png',
      previewUrl: '/templates/industry-standard-preview.png',
      isActive: true,
      isPremium: true,
      configuration: {
        theme: 'dark',
        layout: 'professional-grid',
        primaryColor: '#F59E0B',
        secondaryColor: '#1C1917',
        backgroundColor: '#0C0A09',
        textColor: '#FEF3C7',
        accentColor: '#FBBF24',
        fontFamily: 'DM Sans',
        headerFont: 'Archivo Black',
        borderRadius: '6px',
        buttonStyle: 'professional',
        gridColumns: 4,
        features: {
          heroSection: true,
          featuredBeats: true,
          waveformPlayer: true,
          licenseTiers: true,
          trustBadges: true,
          clientLogos: true,
          testimonials: true,
          pressSection: true,
          streamingStats: true,
          creditsSection: true,
          quickPreview: true,
          instantCheckout: true,
        },
        conversionElements: {
          purchaseNotifications: true,
          socialProof: true,
          limitedExclusives: true,
          bulkDiscounts: true,
          referralProgram: true,
        },
      },
    },
  ];
  
  for (const template of marketplaceTemplates) {
    await db.insert(storefrontTemplates).values(template);
  }
  
  logger.info(`   ✓ Seeded ${marketplaceTemplates.length} storefront templates`);
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

/**
 * Seed distribution platforms from the comprehensive distributionPlatforms.ts file
 * This provides 100+ DSP platforms matching DistroKid's full offering
 */
async function seedDistributionPlatformsFromFile() {
  try {
    const { seedDistributionPlatforms } = await import('./seed/distributionPlatforms.js');
    await seedDistributionPlatforms();
  } catch (error: any) {
    logger.warn('Distribution platforms seeding skipped:', error.message);
  }
}
