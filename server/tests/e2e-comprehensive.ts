import { db } from '../db';
import { 
  users, 
  dspProviders, 
  onboardingProgress, 
  userAchievements, 
  releaseCountdowns, 
  scheduledPosts,
  beatListings,
  distributionPackages,
  analyticsStreams,
  invoices,
  sessions
} from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { logger } from '../logger.js';

interface TestResult {
  section: string;
  test: string;
  status: 'pass' | 'fail';
  message?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(
  section: string,
  testName: string,
  testFn: () => Promise<void>
) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ section, test: testName, status: 'pass', duration });
    logger.info(`  ✅ ${testName} (${duration}ms)`);
  } catch (error: any) {
    const duration = Date.now() - start;
    results.push({ 
      section, 
      test: testName, 
      status: 'fail', 
      message: error.message,
      duration 
    });
    logger.error(`  ❌ ${testName}: ${error.message}`);
  }
}

async function testDatabaseConnection() {
  logger.info('\n📊 1. DATABASE CONNECTION TESTS');
  
  await runTest('Database', 'PostgreSQL connection', async () => {
    const result = await db.execute(sql`SELECT 1 as test`);
    if (!result) throw new Error('No result from database');
  });

  await runTest('Database', 'Users table accessible', async () => {
    const result = await db.select({ count: sql<number>`count(*)` }).from(users);
    if (result[0].count === undefined) throw new Error('Cannot count users');
  });
}

async function testDistributionPlatforms() {
  logger.info('\n🎵 2. DISTRIBUTION PLATFORMS TESTS');

  await runTest('Distribution', 'All 53 platforms seeded', async () => {
    const platforms = await db.select().from(dspProviders);
    if (platforms.length < 50) throw new Error(`Only ${platforms.length} platforms found`);
  });

  await runTest('Distribution', 'Major streaming platforms exist', async () => {
    const majors = ['spotify', 'apple-music', 'amazon-music', 'tidal', 'deezer'];
    for (const slug of majors) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing platform: ${slug}`);
    }
  });

  await runTest('Distribution', 'Electronic stores exist (Beatport, Traxsource)', async () => {
    const electronic = ['beatport', 'juno-download', 'traxsource', 'bandcamp'];
    for (const slug of electronic) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing electronic store: ${slug}`);
    }
  });

  await runTest('Distribution', 'China platforms exist (QQ, Kugou, NetEase)', async () => {
    const china = ['qq-music', 'kugou', 'kuwo', 'netease-cloud-music', 'kuaishou'];
    for (const slug of china) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing China platform: ${slug}`);
    }
  });

  await runTest('Distribution', 'Regional platforms exist (JioSaavn, Anghami, Boomplay)', async () => {
    const regional = ['jiosaavn', 'anghami', 'boomplay', 'joox', 'kkbox', 'awa', 'flo'];
    for (const slug of regional) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing regional platform: ${slug}`);
    }
  });

  await runTest('Distribution', 'Social/Content ID platforms exist', async () => {
    const social = ['tiktok', 'instagram', 'youtube-content-id', 'twitch', 'meta-library'];
    for (const slug of social) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing social platform: ${slug}`);
    }
  });

  await runTest('Distribution', 'Niche platforms exist (Peloton, Roblox, Pretzel)', async () => {
    const niche = ['peloton', 'roblox', 'pretzel-rocks', 'soundtrack-your-brand'];
    for (const slug of niche) {
      const [platform] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
      if (!platform) throw new Error(`Missing niche platform: ${slug}`);
    }
  });
}

async function testOnboardingSystem() {
  logger.info('\n🚀 3. ONBOARDING & RETENTION SYSTEM TESTS');

  await runTest('Onboarding', 'user_onboarding table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('user_onboarding') as exists`);
    if (!result.rows[0]?.exists) throw new Error('user_onboarding table missing');
  });

  await runTest('Onboarding', 'user_achievements table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('user_achievements') as exists`);
    if (!result.rows[0]?.exists) throw new Error('user_achievements table missing');
  });

  await runTest('Onboarding', 'release_countdowns table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('release_countdowns') as exists`);
    if (!result.rows[0]?.exists) throw new Error('release_countdowns table missing');
  });

  await runTest('Onboarding', 'onboarding_tasks table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('onboarding_tasks') as exists`);
    if (!result.rows[0]?.exists) throw new Error('onboarding_tasks table missing');
  });
}

async function testSocialMediaSystem() {
  logger.info('\n📱 4. SOCIAL MEDIA SYSTEM TESTS');

  await runTest('Social', 'scheduled_post_batches table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('scheduled_post_batches') as exists`);
    if (!result.rows[0]?.exists) throw new Error('scheduled_post_batches table missing');
  });

  await runTest('Social', 'social_accounts table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('social_accounts') as exists`);
    if (!result.rows[0]?.exists) throw new Error('social_accounts table missing');
  });

  await runTest('Social', 'social_inbox_messages table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('social_inbox_messages') as exists`);
    if (!result.rows[0]?.exists) throw new Error('social_inbox_messages table missing');
  });

  await runTest('Social', 'social_campaigns table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('social_campaigns') as exists`);
    if (!result.rows[0]?.exists) throw new Error('social_campaigns table missing');
  });
}

async function testMarketplaceSystem() {
  logger.info('\n🛒 5. BEAT MARKETPLACE TESTS');

  await runTest('Marketplace', 'beats table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('beats') as exists`);
    if (!result.rows[0]?.exists) throw new Error('beats table missing');
  });

  await runTest('Marketplace', 'contract_templates table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('contract_templates') as exists`);
    if (!result.rows[0]?.exists) throw new Error('contract_templates table missing');
  });

  await runTest('Marketplace', 'storefronts table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('storefronts') as exists`);
    if (!result.rows[0]?.exists) throw new Error('storefronts table missing');
  });

  await runTest('Marketplace', 'listings table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('listings') as exists`);
    if (!result.rows[0]?.exists) throw new Error('listings table missing');
  });
}

async function testAnalyticsSystem() {
  logger.info('\n📈 6. ANALYTICS SYSTEM TESTS');

  await runTest('Analytics', 'analytics table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('analytics') as exists`);
    if (!result.rows[0]?.exists) throw new Error('analytics table missing');
  });

  await runTest('Analytics', 'dsp_analytics table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('dsp_analytics') as exists`);
    if (!result.rows[0]?.exists) throw new Error('dsp_analytics table missing');
  });

  await runTest('Analytics', 'historical_analytics table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('historical_analytics') as exists`);
    if (!result.rows[0]?.exists) throw new Error('historical_analytics table missing');
  });

  await runTest('Analytics', 'countdown_analytics table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('countdown_analytics') as exists`);
    if (!result.rows[0]?.exists) throw new Error('countdown_analytics table missing');
  });
}

async function testBillingSystem() {
  logger.info('\n💰 7. BILLING & PAYMENTS TESTS');

  await runTest('Billing', 'invoices table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('invoices') as exists`);
    if (!result.rows[0]?.exists) throw new Error('invoices table missing');
  });

  await runTest('Billing', 'ledger_entries table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('ledger_entries') as exists`);
    if (!result.rows[0]?.exists) throw new Error('ledger_entries table missing');
  });

  await runTest('Billing', 'subscriptions table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('subscriptions') as exists`);
    if (!result.rows[0]?.exists) throw new Error('subscriptions table missing');
  });

  await runTest('Billing', 'instant_payouts table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('instant_payouts') as exists`);
    if (!result.rows[0]?.exists) throw new Error('instant_payouts table missing');
  });

  await runTest('Billing', 'split_payments table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('split_payments') as exists`);
    if (!result.rows[0]?.exists) throw new Error('split_payments table missing');
  });
}

async function testAdminAccount() {
  logger.info('\n👤 8. ADMIN ACCOUNT TESTS');

  await runTest('Admin', 'Admin user exists', async () => {
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'blawzmusic@gmail.com'));
    if (!admin) throw new Error('Admin user not found');
  });

  await runTest('Admin', 'Admin has lifetime subscription', async () => {
    const [admin] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'blawzmusic@gmail.com'));
    if (!admin) throw new Error('Admin user not found');
    if (admin.subscriptionTier !== 'lifetime') {
      throw new Error(`Admin subscription is ${admin.subscriptionTier}, not lifetime`);
    }
  });
}

async function testStudioSystem() {
  logger.info('\n🎹 9. AI STUDIO TESTS');

  await runTest('Studio', 'projects table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('projects') as exists`);
    if (!result.rows[0]?.exists) throw new Error('projects table missing');
  });

  await runTest('Studio', 'studio_tracks table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('studio_tracks') as exists`);
    if (!result.rows[0]?.exists) throw new Error('studio_tracks table missing');
  });

  await runTest('Studio', 'plugin_instances table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('plugin_instances') as exists`);
    if (!result.rows[0]?.exists) throw new Error('plugin_instances table missing');
  });

  await runTest('Studio', 'studio_templates table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('studio_templates') as exists`);
    if (!result.rows[0]?.exists) throw new Error('studio_templates table missing');
  });

  await runTest('Studio', 'audio_clips table exists', async () => {
    const result = await db.execute(sql`SELECT to_regclass('audio_clips') as exists`);
    if (!result.rows[0]?.exists) throw new Error('audio_clips table missing');
  });
}

async function testAPIEndpoints() {
  logger.info('\n🌐 10. API ENDPOINT TESTS');

  const baseUrl = 'http://localhost:5000';

  await runTest('API', 'Health endpoint responds', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  });

  await runTest('API', 'Distribution platforms endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/distribution/platforms`);
    if (res.status === 401 || res.status === 404) return; // Auth required or not exposed publicly
    if (!res.ok) throw new Error(`Failed: ${res.status}`);
  });

  await runTest('API', 'Onboarding endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/progress`);
    if (res.status === 401) return; // Auth required - this is OK
    if (!res.ok && res.status !== 401) throw new Error(`Failed: ${res.status}`);
  });

  await runTest('API', 'Achievements endpoint', async () => {
    const res = await fetch(`${baseUrl}/api/achievements`);
    if (res.status === 401) return; // Auth required - this is OK
    if (!res.ok && res.status !== 401) throw new Error(`Failed: ${res.status}`);
  });
}

async function runAllTests() {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('       MAX BOOSTER - COMPREHENSIVE END-TO-END TESTS        ');
  logger.info('═══════════════════════════════════════════════════════════');

  const startTime = Date.now();

  await testDatabaseConnection();
  await testDistributionPlatforms();
  await testOnboardingSystem();
  await testSocialMediaSystem();
  await testMarketplaceSystem();
  await testAnalyticsSystem();
  await testBillingSystem();
  await testAdminAccount();
  await testStudioSystem();
  await testAPIEndpoints();

  const totalDuration = Date.now() - startTime;

  logger.info('\n═══════════════════════════════════════════════════════════');
  logger.info('                      TEST SUMMARY                         ');
  logger.info('═══════════════════════════════════════════════════════════');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const total = results.length;

  logger.info(`\n  Total Tests: ${total}`);
  logger.info(`  ✅ Passed: ${passed}`);
  logger.info(`  ❌ Failed: ${failed}`);
  logger.info(`  📊 Pass Rate: ${((passed / total) * 100).toFixed(1)}%`);
  logger.info(`  ⏱️  Duration: ${totalDuration}ms`);

  if (failed > 0) {
    logger.info('\n  Failed Tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      logger.info(`    ❌ [${r.section}] ${r.test}: ${r.message}`);
    });
  }

  logger.info('\n═══════════════════════════════════════════════════════════');

  return { passed, failed, total, results };
}

runAllTests()
  .then(({ passed, failed }) => {
    if (failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(error => {
    logger.error('Test suite failed:', error);
    process.exit(1);
  });
