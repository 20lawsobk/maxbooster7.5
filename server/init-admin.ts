import bcrypt from 'bcrypt';
import { storage } from './storage';
import { logger } from './logger.js';
import { db } from './db';
import { userProfiles, artistAnalytics } from '../shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Admin Account Initialization
 * 
 * Creates the admin account if it doesn't exist, using environment variables.
 * Works in both development and production environments.
 */

export async function initializeAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'blawzmusic@gmail.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'MaxBooster2024!Admin';
    const adminUsername = process.env.ADMIN_USERNAME || 'blawzmusic';
    
    logger.info('🔐 Checking for admin account...');
    
    // Check if admin already exists
    const existingAdmin = await storage.getUserByEmail(adminEmail);
    
    if (existingAdmin) {
      logger.info(`✅ Admin account exists: ${adminEmail}`);
      
      // Ensure admin has correct role and subscription
      if (existingAdmin.role !== 'admin' || existingAdmin.subscriptionTier !== 'lifetime') {
        await db.execute(`
          UPDATE users 
          SET role = 'admin', 
              subscription_tier = 'lifetime', 
              subscription_status = 'active'
          WHERE email = '${adminEmail}'
        `);
        logger.info('✅ Admin privileges verified and updated');
      }
      
      // Ensure profile exists
      await ensureAdminProfile(existingAdmin.id, adminUsername);
      
      // Seed plugin catalog
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
    
    // Create admin profile
    await ensureAdminProfile(admin.id, adminUsername);
    
    // Seed plugin catalog
    await seedPluginCatalog();
    
    return admin;
  } catch (error: unknown) {
    logger.error('Error during admin initialization:', error);
    throw error;
  }
}

async function ensureAdminProfile(userId: string, username: string) {
  try {
    // Check if profile exists
    const [existingProfile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    
    if (existingProfile) {
      logger.info('✅ Admin profile exists');
      return existingProfile;
    }
    
    // Create profile
    const [profile] = await db
      .insert(userProfiles)
      .values({
        userId,
        displayName: 'B-Lawz Music',
        bio: 'Founder & CEO of Max Booster - The AI-powered music career management platform. Building the future of independent music.',
        avatarUrl: '/logo.png',
        genre: 'Hip-Hop/R&B',
        location: 'Los Angeles, CA',
        website: 'https://maxbooster.io',
        socialLinks: {
          instagram: 'blawzmusic',
          twitter: 'blawzmusic',
          youtube: 'blawzmusic',
          spotify: 'blawzmusic',
          soundcloud: 'blawzmusic',
          tiktok: 'blawzmusic'
        },
        preferences: {
          theme: 'dark',
          emailNotifications: true,
          pushNotifications: true,
          marketingEmails: false,
          dashboardLayout: 'default',
          language: 'en'
        },
        isPublic: true,
        verifiedArtist: true,
      })
      .returning();
    
    logger.info('✅ Admin profile created');
    
    // Create analytics entry
    await db
      .insert(artistAnalytics)
      .values({
        userId,
        totalStreams: 125000,
        totalRevenue: '4250.00',
        monthlyListeners: 15000,
        followerCount: 8500,
        trackCount: 24,
        topCountries: ['United States', 'United Kingdom', 'Canada', 'Germany', 'Australia'],
        streamHistory: generateStreamHistory(),
        revenueHistory: generateRevenueHistory(),
      })
      .onConflictDoNothing();
    
    logger.info('✅ Admin analytics created');
    
    return profile;
  } catch (error) {
    logger.error('Error creating admin profile:', error);
    // Don't throw - profile creation is not critical
  }
}

function generateStreamHistory(): Record<string, number> {
  const history: Record<string, number> = {};
  const now = new Date();
  
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    history[dateStr] = Math.floor(3000 + Math.random() * 2000);
  }
  
  return history;
}

function generateRevenueHistory(): Record<string, string> {
  const history: Record<string, string> = {};
  const now = new Date();
  
  for (let i = 30; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    history[dateStr] = (100 + Math.random() * 50).toFixed(2);
  }
  
  return history;
}

async function seedPluginCatalog() {
  try {
    logger.info('🎛️ Seeding plugin catalog...');
    await storage.seedPluginCatalog();
    logger.info('✅ Plugin catalog seeded');
  } catch (error) {
    logger.warn('Plugin catalog seeding skipped (may already exist)');
  }
}

/**
 * Secure Admin Bootstrap (Production-Safe)
 * 
 * Creates admin account with environment-provided credentials.
 * Requires strong password validation.
 */
export async function bootstrapAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD environment variables required');
  }

  // Validate strong password
  if (adminPassword.length < 12) {
    throw new Error('Admin password must be at least 12 characters');
  }

  const hasUpperCase = /[A-Z]/.test(adminPassword);
  const hasLowerCase = /[a-z]/.test(adminPassword);
  const hasNumbers = /\d/.test(adminPassword);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(adminPassword);

  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    throw new Error(
      'Admin password must contain uppercase, lowercase, numbers, and special characters'
    );
  }

  // Use the main initialization
  return initializeAdmin();
}
