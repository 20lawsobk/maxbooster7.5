import { storage } from '../server/storage';

const labelGridConfig = {
  providerName: 'LabelGrid',
  providerSlug: 'labelgrid',
  baseUrl: 'https://api.labelgrid.com',
  apiVersion: 'v1',

  endpoints: {
    createRelease: '/v1/releases',
    getReleaseStatus: '/v1/releases/:id/status',
    updateRelease: '/v1/releases/:id',
    takedownRelease: '/v1/releases/:id/takedown',
    generateISRC: '/v1/codes/isrc',
    generateUPC: '/v1/codes/upc',
    getReleaseAnalytics: '/v1/releases/:id/analytics',
    getArtistAnalytics: '/v1/artists/:id/analytics',
  },

  authType: 'bearer_token',
  authHeaderName: 'Authorization',
  authHeaderFormat: 'Bearer {token}',

  webhookEvents: ['release.status.changed', 'release.live', 'release.failed', 'analytics.updated'],

  supportedPlatforms: [
    'spotify',
    'apple',
    'youtube',
    'tiktok',
    'instagram',
    'facebook',
    'deezer',
    'tidal',
    'amazon',
    'pandora',
  ],

  features: {
    isrcGeneration: true,
    upcGeneration: true,
    analytics: true,
    royaltySplits: true,
    byoDeals: true,
  },

  isActive: true,
  isDefault: true,
};

async function insertConfig() {
  try {
    console.log('🔧 Inserting LabelGrid configuration...');
    const provider = await storage.upsertDistributionProvider(labelGridConfig);
    console.log('✅ LabelGrid configuration inserted successfully!');
    console.log(`   Provider ID: ${provider.id}`);
    console.log(`   Name: ${provider.providerName}`);
    console.log(`   Slug: ${provider.providerSlug}`);
    console.log(`   Base URL: ${provider.baseUrl}`);
    console.log(`   Endpoints: ${Object.keys(provider.endpoints).length} configured`);
    console.log(`   Is Active: ${provider.isActive}`);
    console.log(`   Is Default: ${provider.isDefault}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to insert LabelGrid configuration:', error);
    process.exit(1);
  }
}

insertConfig();
