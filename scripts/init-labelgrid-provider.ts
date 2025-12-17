import { storage } from '../server/storage.js';
import { logger } from '../server/logger.js';

async function initializeLabelGridProvider() {
  logger.info('🎵 Initializing LabelGrid distribution provider...\n');

  try {
    const existing = await storage.getDistributionProvider('labelgrid');

    if (existing) {
      logger.info('✅ LabelGrid provider already exists in database');
      logger.info(`   Provider ID: ${existing.id}`);
      logger.info(`   Name: ${existing.name}`);
      logger.info(`   Base URL: ${existing.apiBase}\n`);
      return;
    }

    const providerData = {
      name: 'LabelGrid',
      slug: 'labelgrid',
      apiBase: process.env.LABELGRID_API_URL || 'https://api.labelgrid.com',
      authType: 'api_key' as const,
      supportedFormats: ['flac', 'wav', 'mp3'],
      maxFileSize: 500 * 1024 * 1024,
      turnaroundDays: 3,
      requirements: {
        endpoints: {
          release: '/v1/releases',
          status: '/v1/releases/:id/status',
          analytics: '/v1/releases/:id/analytics',
          codes: '/v1/codes/generate',
        },
        webhookSecret: process.env.LABELGRID_WEBHOOK_SECRET || '',
      },
    };

    const provider = await storage.upsertDistributionProvider(providerData);

    logger.info('✅ LabelGrid provider initialized successfully!');
    logger.info(`   Provider ID: ${provider.id}`);
    logger.info(`   Name: ${provider.name}`);
    logger.info(`   Base URL: ${provider.apiBase}`);
    logger.info(`   Supported Formats: ${Array.isArray(provider.supportedFormats) ? provider.supportedFormats.join(', ') : 'flac, wav, mp3'}`);
    logger.info(`   Turnaround: ${provider.turnaroundDays || 3} days\n`);

    logger.info('═'.repeat(70));
    logger.info('           LABELGRID PROVIDER INITIALIZED');
    logger.info('═'.repeat(70));
    logger.info('');
    logger.info('  Distribution to DSPs is now configured and ready.');
    logger.info('  Artists can submit releases to Spotify, Apple Music, etc.');
    logger.info('');
    logger.info('  Note: Ensure LABELGRID_API_TOKEN is set in environment');
    logger.info('  for actual distribution functionality.');
    logger.info('═'.repeat(70) + '\n');
  } catch (error) {
    logger.error('❌ Failed to initialize LabelGrid provider:', error);
    process.exit(1);
  }
}

initializeLabelGridProvider();
