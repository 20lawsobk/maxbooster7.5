import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { users, userStorage, userTasteProfiles, dspProviders, licenseTemplates, contractTemplates, membershipTiers, storefronts } from '../shared/schema';
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
    const adminEmail = process.env.ADMIN_EMAIL || process.env.Admin_Email;
    const adminPassword = process.env.ADMIN_PASSWORD || process.env.Admin_Password;
    const adminUsername = process.env.ADMIN_USERNAME || process.env.Admin_Username;
    
    if (!adminEmail) {
      logger.warn('⚠️ ADMIN_EMAIL not set - skipping admin initialization');
      await seedPluginCatalog();
      await seedAchievementsData();
      await seedStatusPageServices();
      await seedAIModels();
      await seedSystemSettings();
      await seedAlertRules();
      return null;
    }
    
    if (!adminPassword) {
      logger.warn('⚠️ ADMIN_PASSWORD not set - skipping admin initialization');
      await seedPluginCatalog();
      await seedAchievementsData();
      await seedStatusPageServices();
      await seedAIModels();
      await seedSystemSettings();
      await seedAlertRules();
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
        emailVerified: true,
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
        await seedAchievementsData();
        await seedStatusPageServices();
        await seedAIModels();
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
      
      // Mark onboarding as complete and email as verified for new admin
      await db.update(users).set({
        onboardingCompleted: true,
        onboardingStep: 100,
        emailVerified: true,
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
    await seedAchievementsData();
    await seedStatusPageServices();
    await seedAIModels();
    await seedSystemSettings();
    await seedAlertRules();
    
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
    
    // 3. Check and initialize admin producer storefront
    const { storefronts } = await import('../shared/schema');
    const [existingStorefront] = await db
      .select()
      .from(storefronts)
      .where(eq(storefronts.userId, adminId));
    
    if (!existingStorefront) {
      const adminUsername = process.env.ADMIN_USERNAME || 'blawz';
      const slug = adminUsername.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      await db.insert(storefronts).values({
        userId: adminId,
        name: 'B-Lawz Music',
        slug: slug,
        subdomain: slug,
        description: 'Official B-Lawz Music producer storefront. Premium beats, instrumentals, and sound packs for artists worldwide.',
        branding: {
          primaryColor: '#8B5CF6',
          secondaryColor: '#3B82F6',
          accentColor: '#22C55E',
          fontFamily: 'Inter',
          headerStyle: 'modern',
          layoutStyle: 'grid',
        },
        socialLinks: {
          instagram: 'https://instagram.com/blawzmusic',
          twitter: 'https://twitter.com/blawzmusic',
          youtube: 'https://youtube.com/@blawzmusic',
          spotify: 'https://open.spotify.com/artist/blawzmusic',
        },
        seoSettings: {
          title: 'B-Lawz Music - Premium Beats & Instrumentals',
          description: 'Professional beats and instrumentals for artists. Trap, Hip-Hop, R&B, and more.',
          keywords: ['beats', 'instrumentals', 'hip-hop', 'trap', 'producer', 'music'],
        },
        isPublished: true,
        isVerified: true,
      });
      logger.info('   ✓ Admin producer storefront initialized');
    } else {
      logger.info('   ✓ Admin producer storefront exists');
    }
    
    // 4. Check and initialize default license templates
    const existingLicenses = await db
      .select()
      .from(licenseTemplates)
      .where(eq(licenseTemplates.userId, adminId));

    if (existingLicenses.length === 0) {
      const defaultLicenses = [
        {
          userId: adminId,
          name: 'Basic Lease',
          type: 'non-exclusive',
          priceCents: 2999,
          streams: '100000',
          copies: '5000',
          musicVideos: '1',
          duration: '1 year',
          allowsBroadcast: false,
          allowsProfit: true,
          allowsSync: false,
          fileFormats: 'MP3',
          isActive: true,
          sortOrder: 0,
        },
        {
          userId: adminId,
          name: 'Premium Lease',
          type: 'non-exclusive',
          priceCents: 9999,
          streams: '500000',
          copies: '25000',
          musicVideos: '3',
          duration: '2 years',
          allowsBroadcast: true,
          allowsProfit: true,
          allowsSync: true,
          fileFormats: 'MP3, WAV',
          isActive: true,
          sortOrder: 1,
        },
        {
          userId: adminId,
          name: 'Unlimited Lease',
          type: 'unlimited',
          priceCents: 19999,
          streams: 'unlimited',
          copies: 'unlimited',
          musicVideos: 'unlimited',
          duration: 'Lifetime',
          allowsBroadcast: true,
          allowsProfit: true,
          allowsSync: true,
          fileFormats: 'MP3, WAV, STEMS',
          isActive: true,
          sortOrder: 2,
        },
        {
          userId: adminId,
          name: 'Exclusive Rights',
          type: 'exclusive',
          priceCents: 99999,
          streams: 'unlimited',
          copies: 'unlimited',
          musicVideos: 'unlimited',
          duration: 'Lifetime (Full Ownership)',
          allowsBroadcast: true,
          allowsProfit: true,
          allowsSync: true,
          fileFormats: 'MP3, WAV, STEMS, TRACKOUTS',
          isActive: true,
          sortOrder: 3,
        },
      ];
      await db.insert(licenseTemplates).values(defaultLicenses);
      logger.info('   ✓ Admin license templates seeded (4 templates)');
    } else {
      logger.info(`   ✓ Admin license templates exist (${existingLicenses.length} templates)`);
    }

    // 5. Check and initialize default contract templates
    const existingContractTemplates = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.userId, adminId));

    if (existingContractTemplates.length === 0) {
      const defaultContractTemplates = [
        {
          userId: adminId,
          name: 'Non-Exclusive Beat License',
          description: 'Standard non-exclusive license allowing the artist to use the beat while the producer retains ownership',
          content: 'non_exclusive_license',
          category: 'Beat Licenses',
          variables: ['artistName', 'producerName', 'beatTitle', 'purchasePrice', 'streamLimit', 'salesLimit', 'territory'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Exclusive Beat License',
          description: 'Exclusive rights transfer - beat can no longer be sold to others after purchase',
          content: 'exclusive_license',
          category: 'Beat Licenses',
          variables: ['artistName', 'producerName', 'beatTitle', 'purchasePrice', 'royaltyPercentage', 'territory'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Free Download License',
          description: 'Free promotional use license with attribution requirements',
          content: 'free_download',
          category: 'Beat Licenses',
          variables: ['artistName', 'producerName', 'beatTitle', 'territory'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Non-Disclosure Agreement',
          description: 'Mutual NDA for protecting confidential information during collaborations',
          content: 'nda',
          category: 'Legal',
          variables: ['artistName', 'producerName', 'confidentialPeriodYears', 'effectiveDate'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Session Musician Agreement',
          description: 'Work-for-hire agreement for session musicians including payment terms and rights assignment',
          content: 'session_musician',
          category: 'Collaboration',
          variables: ['artistName', 'producerName', 'projectTitle', 'sessionRate', 'sessionHours', 'royaltyPercentage'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Mixing/Mastering Engineer Agreement',
          description: 'Service agreement for mixing and mastering engineers with deliverables and payment terms',
          content: 'mixer_engineer',
          category: 'Collaboration',
          variables: ['artistName', 'producerName', 'projectTitle', 'mixingFee', 'masteringFee', 'revisions'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Royalty Split Sheet',
          description: 'Official documentation of ownership percentages for publishing and master royalties',
          content: 'split_sheet',
          category: 'Royalties',
          variables: ['beatTitle', 'splits', 'publishingPercentage', 'masterPercentage'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Sync Licensing Agreement',
          description: 'License for use in film, TV, commercials, video games, and other visual media',
          content: 'sync_license',
          category: 'Licensing',
          variables: ['artistName', 'producerName', 'beatTitle', 'syncFee', 'projectTitle', 'projectType', 'territory'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Work For Hire Agreement',
          description: 'Complete rights transfer where the hiring party owns all work product',
          content: 'work_for_hire',
          category: 'Legal',
          variables: ['artistName', 'producerName', 'projectTitle', 'purchasePrice', 'effectiveDate'],
          isDefault: true,
        },
        {
          userId: adminId,
          name: 'Producer Agreement',
          description: 'Comprehensive agreement between artist and producer for album/EP production',
          content: 'producer_agreement',
          category: 'Production',
          variables: ['artistName', 'producerName', 'projectTitle', 'advanceAmount', 'royaltyPercentage', 'publishingPercentage'],
          isDefault: true,
        },
      ];
      await db.insert(contractTemplates).values(defaultContractTemplates);
      logger.info(`   ✓ Admin contract templates seeded (${defaultContractTemplates.length} templates)`);
    } else {
      logger.info(`   ✓ Admin contract templates exist (${existingContractTemplates.length} templates)`);
    }

    // 6. Check and initialize default membership tiers for admin storefront
    const [adminStorefront] = await db
      .select()
      .from(storefronts)
      .where(eq(storefronts.userId, adminId));

    if (adminStorefront) {
      const existingTiers = await db
        .select()
        .from(membershipTiers)
        .where(eq(membershipTiers.storefrontId, adminStorefront.id));

      if (existingTiers.length === 0) {
        const defaultTiers = [
          {
            storefrontId: adminStorefront.id,
            name: 'Beat Club',
            description: 'Access to exclusive beats, 2 free downloads per month, and early access to new releases.',
            priceCents: 999,
            currency: 'usd',
            interval: 'monthly',
            benefits: [
              '2 free beat downloads/month',
              'Early access to new beats',
              'Exclusive members-only beats',
              'Priority customer support',
            ],
            maxSubscribers: 0,
            isActive: true,
          },
          {
            storefrontId: adminStorefront.id,
            name: 'Producer Pro',
            description: 'Full access to the entire beat catalog with unlimited downloads, stems, and trackouts.',
            priceCents: 2999,
            currency: 'usd',
            interval: 'monthly',
            benefits: [
              'Unlimited beat downloads',
              'WAV + STEMS included',
              'Custom beat requests (1/month)',
              'Commercial use license',
              'Priority mixing feedback',
              'Exclusive Discord access',
            ],
            maxSubscribers: 0,
            isActive: true,
          },
          {
            storefrontId: adminStorefront.id,
            name: 'Label Partner',
            description: 'Enterprise-level access for labels and management companies. Bulk licensing, priority support, and custom terms.',
            priceCents: 9999,
            currency: 'usd',
            interval: 'monthly',
            benefits: [
              'Unlimited downloads + trackouts',
              'Bulk licensing discounts',
              'Dedicated account manager',
              'Custom exclusive production',
              'First right of refusal on new beats',
              'White-label rights available',
              'Quarterly sync placement pitches',
            ],
            maxSubscribers: 0,
            isActive: true,
          },
        ];
        await db.insert(membershipTiers).values(defaultTiers);
        logger.info(`   ✓ Admin membership tiers seeded (${defaultTiers.length} tiers)`);
      } else {
        logger.info(`   ✓ Admin membership tiers exist (${existingTiers.length} tiers)`);
      }
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

async function seedAchievementsData() {
  try {
    const { seedAchievements } = await import('./seed/seedAchievements.js');
    await seedAchievements();
    logger.info('   ✓ Achievements seeded');
  } catch (error: any) {
    logger.warn('Achievements seeding skipped:', error.message);
  }
}

async function seedStatusPageServices() {
  try {
    const { statusPageService } = await import('./services/statusPageService.js');
    await statusPageService.initializeDefaultServices();
    logger.info('   ✓ Status page services initialized');
  } catch (error: any) {
    logger.warn('Status page services seeding skipped:', error.message);
  }
}

async function seedAIModels() {
  try {
    const { initializeAIMusicModels } = await import('./seed/initializeAIMusicModels.js');
    await initializeAIMusicModels();
    const { initializeAIInsightsModels } = await import('./seed/initializeAIInsightsModels.js');
    await initializeAIInsightsModels();
    const { initializeAIContentModels } = await import('./seed/initializeAIContentModels.js');
    await initializeAIContentModels();
    logger.info('   ✓ AI models seeded');
  } catch (error: any) {
    logger.warn('AI models seeding skipped:', error.message);
  }
}

async function seedSystemSettings() {
  try {
    const { systemSettings } = await import('../shared/schema.js');
    const existing = await db.select().from(systemSettings);
    if (existing.length > 0) {
      logger.info('   ✓ System settings already seeded');
      return;
    }

    const defaults = [
      { key: 'platform_name', value: JSON.stringify('Max Booster'), description: 'Platform display name' },
      { key: 'maintenance_mode', value: JSON.stringify(false), description: 'Enable/disable maintenance mode' },
      { key: 'user_registration_enabled', value: JSON.stringify(true), description: 'Allow new user registrations' },
      { key: 'max_upload_size_mb', value: JSON.stringify(500), description: 'Maximum file upload size in MB' },
      { key: 'default_currency', value: JSON.stringify('USD'), description: 'Default platform currency' },
      { key: 'currency_rates', value: JSON.stringify({ USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.53, JPY: 149.50 }), description: 'Currency exchange rates (updated periodically)' },
      { key: 'stripe_enabled', value: JSON.stringify(true), description: 'Enable Stripe payment processing' },
      { key: 'email_notifications_enabled', value: JSON.stringify(true), description: 'Enable email notifications globally' },
      { key: 'api_rate_limit', value: JSON.stringify(1000), description: 'API rate limit per hour per user' },
      { key: 'max_social_accounts', value: JSON.stringify(20), description: 'Maximum connected social accounts per user' },
      { key: 'autopilot_enabled', value: JSON.stringify(true), description: 'Enable autopilot posting system' },
      { key: 'distribution_auto_submit', value: JSON.stringify(false), description: 'Auto-submit releases after validation' },
      { key: 'default_royalty_rate', value: JSON.stringify(0.004), description: 'Default per-stream royalty rate in USD' },
      { key: 'min_payout_threshold', value: JSON.stringify(10), description: 'Minimum balance for payout in USD' },
      { key: 'payout_schedule', value: JSON.stringify('monthly'), description: 'Default payout schedule (weekly/monthly/quarterly)' },
      { key: 'max_collaborators_per_release', value: JSON.stringify(20), description: 'Maximum collaborators per release' },
      { key: 'ai_features_enabled', value: JSON.stringify(true), description: 'Enable AI-powered features' },
      { key: 'analytics_retention_days', value: JSON.stringify(365), description: 'Days to retain analytics data' },
      { key: 'session_timeout_hours', value: JSON.stringify(24), description: 'User session timeout in hours' },
      { key: 'two_factor_required', value: JSON.stringify(false), description: 'Require 2FA for all users' },
    ];

    for (const setting of defaults) {
      await db.insert(systemSettings).values(setting).onConflictDoNothing();
    }
    logger.info(`   ✓ System settings seeded (${defaults.length} defaults)`);
  } catch (error: any) {
    logger.warn('System settings seeding skipped:', error.message);
  }
}

async function seedAlertRules() {
  try {
    const { alertRules } = await import('../shared/schema.js');
    const existing = await db.select().from(alertRules);
    if (existing.length > 0) {
      logger.info('   ✓ Alert rules already seeded');
      return;
    }

    const defaults = [
      { name: 'High Error Rate', condition: 'error_rate > threshold', threshold: 5, severity: 'critical', channels: ['email', 'push'], isActive: true, metadata: { description: 'Triggers when API error rate exceeds 5% in 5 minutes' } },
      { name: 'Memory Usage Critical', condition: 'memory_usage > threshold', threshold: 90, severity: 'critical', channels: ['email', 'push'], isActive: true, metadata: { description: 'Triggers when server memory usage exceeds 90%', unit: 'percent' } },
      { name: 'Database Latency High', condition: 'db_latency > threshold', threshold: 500, severity: 'warning', channels: ['email'], isActive: true, metadata: { description: 'Triggers when database query latency exceeds 500ms', unit: 'ms' } },
      { name: 'Failed Login Attempts', condition: 'failed_logins > threshold', threshold: 10, severity: 'warning', channels: ['email', 'push'], isActive: true, metadata: { description: 'Triggers when failed login attempts exceed 10 in 15 minutes' } },
      { name: 'Revenue Drop', condition: 'revenue_change < threshold', threshold: -20, severity: 'warning', channels: ['email'], isActive: true, metadata: { description: 'Triggers when daily revenue drops more than 20% vs prior day', unit: 'percent' } },
      { name: 'Stream Count Spike', condition: 'stream_count > threshold', threshold: 10000, severity: 'info', channels: ['push'], isActive: true, metadata: { description: 'Notification when daily streams exceed 10,000' } },
      { name: 'Payout Processing Failed', condition: 'payout_status == failed', threshold: 1, severity: 'critical', channels: ['email', 'push'], isActive: true, metadata: { description: 'Triggers when any payout processing fails' } },
      { name: 'API Rate Limit Exceeded', condition: 'rate_limit_hits > threshold', threshold: 100, severity: 'warning', channels: ['email'], isActive: true, metadata: { description: 'Triggers when rate limit is hit more than 100 times in an hour' } },
      { name: 'Disk Usage Warning', condition: 'disk_usage > threshold', threshold: 80, severity: 'warning', channels: ['email'], isActive: true, metadata: { description: 'Triggers when disk usage exceeds 80%', unit: 'percent' } },
      { name: 'New Release Milestone', condition: 'release_streams > threshold', threshold: 1000, severity: 'info', channels: ['push', 'email'], isActive: true, metadata: { description: 'Notification when a release reaches 1,000 streams' } },
      { name: 'Social Engagement Spike', condition: 'engagement_rate > threshold', threshold: 10, severity: 'info', channels: ['push'], isActive: true, metadata: { description: 'Notification when social engagement rate exceeds 10%', unit: 'percent' } },
      { name: 'Distribution Status Change', condition: 'release_status_changed', threshold: 1, severity: 'info', channels: ['push', 'email'], isActive: true, metadata: { description: 'Notification when a release distribution status changes' } },
    ];

    for (const rule of defaults) {
      await db.insert(alertRules).values(rule).onConflictDoNothing();
    }
    logger.info(`   ✓ Alert rules seeded (${defaults.length} defaults)`);
  } catch (error: any) {
    logger.warn('Alert rules seeding skipped:', error.message);
  }
}
