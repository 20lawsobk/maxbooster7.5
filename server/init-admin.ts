import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { 
  users, 
  storefronts, 
  membershipTiers,
  workspaces,
  workspaceMembers
} from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Admin Account Initialization
 * 
 * Creates the admin account as the FIRST REAL USER of Max Booster.
 * Sets up the infrastructure (storefront, workspace) ready for real use.
 * 
 * NO FAKE DATA - all analytics, social accounts, projects, and releases
 * will come from real user activity and OAuth connections.
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
      
      // Sync password with environment variable
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, admin.id));
      logger.info('✅ Admin password synced with ADMIN_PASSWORD');
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
    
    // Set up infrastructure (empty, ready for real use)
    await setupAdminInfrastructure(admin.id);
    await seedPluginCatalog();
    
    return admin;
  } catch (error: unknown) {
    logger.error('Error during admin initialization:', error);
    throw error;
  }
}

/**
 * Sets up the infrastructure for the admin user - 
 * Storefront and Workspace ready for REAL use, not fake data
 */
async function setupAdminInfrastructure(adminId: string) {
  logger.info('🏗️ Setting up admin infrastructure...');
  
  try {
    await Promise.all([
      setupStorefront(adminId),
      setupWorkspace(adminId),
    ]);
    logger.info('✅ Admin infrastructure ready');
  } catch (error) {
    logger.error('Error setting up admin infrastructure:', error);
  }
}

/**
 * Creates the storefront with membership tiers - ready for real subscribers
 */
async function setupStorefront(userId: string) {
  const existingStorefront = await db.select().from(storefronts).where(eq(storefronts.userId, userId)).limit(1);
  if (existingStorefront.length > 0) {
    logger.info('🏪 Storefront already exists');
    return;
  }
  
  const [storefront] = await db.insert(storefronts).values({
    userId,
    name: 'B-Lawz Music Store',
    slug: 'blawz-music',
    templateId: 'artist-pro',
    customization: {
      primaryColor: '#8B5CF6',
      secondaryColor: '#EC4899',
      fontFamily: 'Inter',
      bio: 'Official storefront for B-Lawz Music. Get exclusive beats, sample packs, and membership access.',
    },
    isActive: true,
  }).returning();
  
  // Create membership tiers - ready for real subscribers
  const tiersData = [
    {
      storefrontId: storefront.id,
      name: 'Fan Club',
      description: 'Basic membership with early access to releases and exclusive updates',
      priceCents: 499,
      currency: 'usd',
      interval: 'month',
      benefits: ['Early access to new releases', 'Monthly newsletter', 'Exclusive behind-the-scenes content', 'Discord community access'],
      maxSubscribers: null,
      isActive: true,
    },
    {
      storefrontId: storefront.id,
      name: 'VIP Access',
      description: 'Premium membership with exclusive content and discounts',
      priceCents: 1499,
      currency: 'usd',
      interval: 'month',
      benefits: ['All Fan Club benefits', '20% discount on all beats', 'Monthly exclusive beat drops', 'Priority customer support', 'Quarterly merch drops', 'Private livestream access'],
      maxSubscribers: 500,
      isActive: true,
    },
    {
      storefrontId: storefront.id,
      name: 'Inner Circle',
      description: 'Ultimate VIP experience with direct artist access and custom work',
      priceCents: 4999,
      currency: 'usd',
      interval: 'month',
      benefits: ['All VIP Access benefits', '1 custom beat per month', 'Direct DM access to B-Lawz', 'Feature opportunity on upcoming releases', 'Annual meet & greet (virtual or in-person)', 'Free shipping on all merch', 'Name in album credits'],
      maxSubscribers: 25,
      isActive: true,
    },
  ];
  
  await db.insert(membershipTiers).values(tiersData);
  logger.info('✅ Storefront created with membership tiers');
}

/**
 * Creates the workspace for team collaboration - ready for real team members
 */
async function setupWorkspace(userId: string) {
  const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (existingWorkspace.length > 0) {
    logger.info('👥 Workspace already exists');
    return;
  }
  
  const [workspace] = await db.insert(workspaces).values({
    name: 'B-Lawz Music Team',
    ownerId: userId,
    description: 'Official workspace for B-Lawz Music team collaboration, content approval, and project management',
    logoUrl: '/logo.png',
    isActive: true,
    settings: {
      defaultApprovalRequired: true,
      contentGuidelines: 'All content must align with B-Lawz Music brand standards',
      allowedContentTypes: ['social_posts', 'releases', 'marketing', 'collaborations'],
      notificationPreferences: {
        approvalRequests: true,
        contentPublished: true,
        teamUpdates: true,
      },
    },
    metadata: {
      createdBy: 'system',
      tier: 'enterprise',
      features: ['approval_workflows', 'analytics_sharing', 'content_calendar', 'team_chat'],
    },
  }).returning();
  
  // Add owner as first member
  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: 'owner',
  });
  
  logger.info('✅ Workspace created');
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
