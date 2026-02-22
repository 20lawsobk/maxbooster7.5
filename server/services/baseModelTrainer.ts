import { logger } from '../logger.js';
import { SocialMediaAutopilotAI, type SocialPost } from '../../shared/ml/models/SocialMediaAutopilotAI.js';
import { AdvertisingAutopilotAI_v3, type OrganicCampaign } from '../../shared/ml/models/AdvertisingAutopilotAI_v3.js';
import {
  SOCIAL_MEDIA_MUSIC_PATTERNS,
  MUSIC_ADVERTISING_INTELLIGENCE,
  ENGAGEMENT_PREDICTION_FEATURES,
  getHashtagsForGenre,
} from '../../shared/ml/training/musicIndustryTrainingData.js';
import fs from 'fs';
import path from 'path';

const WEIGHTS_DIR = path.join(process.cwd(), 'ai_model', 'weights');
const SOCIAL_BASE_WEIGHTS = path.join(WEIGHTS_DIR, 'social_base.json');
const ADVERTISING_BASE_WEIGHTS = path.join(WEIGHTS_DIR, 'advertising_base.json');

const PLATFORMS = ['instagram', 'tiktok', 'twitter', 'youtube', 'facebook'];
const MEDIA_TYPES: Array<'text' | 'image' | 'video' | 'carousel'> = ['text', 'image', 'video', 'carousel'];
const OBJECTIVES: Array<'awareness' | 'engagement' | 'conversions' | 'viral'> = ['awareness', 'engagement', 'conversions', 'viral'];

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeSyntheticPosts(count: number): SocialPost[] {
  const posts: SocialPost[] = [];
  const contentFactors = ENGAGEMENT_PREDICTION_FEATURES.contentFactors;
  const temporalFactors = ENGAGEMENT_PREDICTION_FEATURES.temporalFactors;
  const musicFactors = ENGAGEMENT_PREDICTION_FEATURES.musicSpecificFactors;

  for (let i = 0; i < count; i++) {
    const platform = pick(PLATFORMS);
    const mediaType = pick(MEDIA_TYPES);
    const peakHours = temporalFactors.hourOfDay.peakHours;
    const isPeak = Math.random() > 0.4;
    const hour = isPeak ? pick(peakHours) : randInt(0, 23);
    const postedAt = new Date(Date.now() - randInt(0, 90) * 24 * 3600 * 1000);
    postedAt.setHours(hour);

    const hashtagCount = randInt(
      contentFactors.hashtagCount.optimal.min,
      contentFactors.hashtagCount.optimal.max + 3
    );
    const emojiCount = randInt(0, 5);
    const mentionCount = randInt(0, 3);
    const contentLength = randInt(60, 280);
    const hasCallToAction = Math.random() > 0.4;

    const isNewRelease = Math.random() > 0.7;
    const mediaMultiplier = mediaType === 'video'
      ? contentFactors.mediaPresence.videoMultiplier
      : mediaType === 'image' ? contentFactors.mediaPresence.imageMultiplier : 1;
    const releaseMultiplier = isNewRelease ? musicFactors.newRelease.multiplier : 1;
    const peakMultiplier = isPeak ? 1.6 : 0.7;

    const baseEngagement = rand(200, 5000);
    const engagement = Math.round(baseEngagement * mediaMultiplier * releaseMultiplier * peakMultiplier);
    const reach = Math.round(engagement * rand(8, 25));
    const likes = Math.round(engagement * rand(0.6, 0.8));
    const comments = Math.round(engagement * rand(0.1, 0.2));
    const shares = engagement - likes - comments;

    posts.push({
      postId: `synth_${i}_${platform}`,
      platform,
      content: `Music post on ${platform} at ${hour}:00 ${isNewRelease ? 'new release' : 'catalog'}`,
      mediaType,
      postedAt,
      likes,
      comments,
      shares: Math.max(0, shares),
      reach,
      engagement,
      hashtagCount,
      mentionCount,
      emojiCount,
      contentLength,
      hasCallToAction,
    });
  }

  return posts;
}

function makeSyntheticCampaigns(count: number): OrganicCampaign[] {
  const campaigns: OrganicCampaign[] = [];

  for (let i = 0; i < count; i++) {
    const platformCount = randInt(1, 3);
    const platforms = PLATFORMS.slice(0, platformCount);
    const mediaType = pick(MEDIA_TYPES);
    const objective = pick(OBJECTIVES);
    const hourOfDay = randInt(8, 22);
    const dayOfWeek = randInt(0, 6);
    const isOptimalTime = hourOfDay >= 10 && hourOfDay <= 20 && dayOfWeek >= 2 && dayOfWeek <= 5;

    const impressions = randInt(500, 50000);
    const reach = Math.round(impressions * rand(0.6, 0.9));
    const organicReach = Math.round(reach * rand(0.7, 1));
    const likes = Math.round(impressions * rand(0.02, 0.12));
    const comments = Math.round(impressions * rand(0.005, 0.03));
    const shares = Math.round(impressions * rand(0.001, 0.02));
    const saves = Math.round(impressions * rand(0.005, 0.04));
    const engagement = likes + comments + shares + saves;
    const clicks = Math.round(impressions * rand(0.01, 0.05));
    const conversions = Math.round(clicks * rand(0.02, 0.15));
    const engagementRate = engagement / Math.max(impressions, 1);
    const viralCoefficient = shares / Math.max(impressions, 1);
    const wentViral = viralCoefficient > 0.01;

    campaigns.push({
      campaignId: `synth_campaign_${i}`,
      platforms,
      content: {
        headline: `Music promotion on ${platforms.join('/')}`,
        body: `Artist content for ${objective} objective featuring ${mediaType} media`,
        hashtags: getHashtagsForGenre('hip-hop').slice(0, 5),
        mentions: [],
        mediaType,
        callToAction: objective === 'conversions' ? 'Shop Now' : 'Listen Now',
      },
      timing: {
        publishedAt: new Date(Date.now() - randInt(0, 60) * 24 * 3600 * 1000),
        hourOfDay,
        dayOfWeek,
        isOptimalTime,
      },
      performance: {
        impressions,
        reach,
        organicReach,
        clicks,
        engagement,
        likes,
        comments,
        shares,
        saves,
        conversions,
        engagementRate,
        viralCoefficient,
        authenticityScore: rand(0.6, 1),
      },
      algorithms: {
        engagementVelocity: engagement / 24,
        algorithmicBoost: rand(1, 4),
        decayRate: rand(0.05, 0.3),
        peakEngagementTime: randInt(2, 12),
      },
      audience: {
        segmentIds: [`seg_${randInt(0, 5)}`],
        demographicsReached: { '18-24': rand(0.3, 0.6), '25-34': rand(0.2, 0.4) },
        influencersEngaged: [],
        networkPropagation: rand(1, 3),
      },
      objective,
      wentViral,
    });
  }

  return campaigns;
}

async function trainAndSaveSocialBase(): Promise<boolean> {
  try {
    if (fs.existsSync(SOCIAL_BASE_WEIGHTS)) {
      logger.info('[BaseTrainer] Social base weights already exist, skipping re-training');
      return true;
    }

    logger.info('[BaseTrainer] Generating 300 synthetic music industry posts for social autopilot training...');
    const posts = makeSyntheticPosts(300);

    const model = new SocialMediaAutopilotAI();
    logger.info('[BaseTrainer] Training Social Autopilot on music industry data...');

    const result = await model.trainOnUserEngagementData(posts);
    logger.info(`[BaseTrainer] Social training complete: ${result.postsProcessed} posts, models: ${result.modelsTrained.join(', ')}`);

    const state = model.serializeMetadata ? model.serializeMetadata() : null;
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
    fs.writeFileSync(SOCIAL_BASE_WEIGHTS, JSON.stringify({
      trainedAt: new Date().toISOString(),
      postsProcessed: result.postsProcessed,
      modelsTrained: result.modelsTrained,
      accuracy: result.accuracy,
      state,
    }, null, 2));

    logger.info(`[BaseTrainer] Social base weights saved to ${SOCIAL_BASE_WEIGHTS}`);
    return true;
  } catch (err) {
    logger.error('[BaseTrainer] Social autopilot training failed:', err);
    return false;
  }
}

async function trainAndSaveAdvertisingBase(): Promise<boolean> {
  try {
    if (fs.existsSync(ADVERTISING_BASE_WEIGHTS)) {
      logger.info('[BaseTrainer] Advertising base weights already exist, skipping re-training');
      return true;
    }

    logger.info('[BaseTrainer] Generating 200 synthetic campaigns for advertising autopilot training...');
    const campaigns = makeSyntheticCampaigns(200);

    const model = new AdvertisingAutopilotAI_v3();
    logger.info('[BaseTrainer] Training Advertising Autopilot on music industry data...');

    const result = await model.trainOnOrganicCampaigns(campaigns);
    logger.info(`[BaseTrainer] Advertising training complete: ${result.campaignsProcessed} campaigns, models: ${result.modelsTrained?.join(', ') ?? 'done'}`);

    const state = model.serializeMetadata ? model.serializeMetadata() : null;
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
    fs.writeFileSync(ADVERTISING_BASE_WEIGHTS, JSON.stringify({
      trainedAt: new Date().toISOString(),
      campaignsProcessed: result.campaignsProcessed,
      state,
    }, null, 2));

    logger.info(`[BaseTrainer] Advertising base weights saved to ${ADVERTISING_BASE_WEIGHTS}`);
    return true;
  } catch (err) {
    logger.error('[BaseTrainer] Advertising autopilot training failed:', err);
    return false;
  }
}

async function trainMusicGenerator(): Promise<boolean> {
  try {
    logger.info('[BaseTrainer] Music generator uses embedded theory data — loading genre taxonomy and BPM ranges...');
    const { AdvancedMusicAI } = await import('../../shared/ml/audio/AdvancedMusicAI.js');
    const musicAI = new AdvancedMusicAI();
    logger.info('[BaseTrainer] Music generator initialized with full harmonic/rhythmic knowledge base');
    return true;
  } catch (err) {
    logger.warn('[BaseTrainer] Music generator warm-up skipped:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function runBaseModelTraining(): Promise<void> {
  try {
    await import('@tensorflow/tfjs-node');
    logger.info('[BaseTrainer] TF.js Node.js native backend loaded (10-50x faster)');
  } catch {
    logger.info('[BaseTrainer] Using default TF.js backend (install @tensorflow/tfjs-node for faster training)');
  }

  logger.info('[BaseTrainer] ═══════════════════════════════════════════════════');
  logger.info('[BaseTrainer] Starting base model training with music industry data');
  logger.info('[BaseTrainer] ═══════════════════════════════════════════════════');

  const [socialOk, adsOk, musicOk] = await Promise.allSettled([
    trainAndSaveSocialBase(),
    trainAndSaveAdvertisingBase(),
    trainMusicGenerator(),
  ]);

  const results = {
    social: socialOk.status === 'fulfilled' && socialOk.value,
    advertising: adsOk.status === 'fulfilled' && adsOk.value,
    music: musicOk.status === 'fulfilled' && musicOk.value,
  };

  logger.info(`[BaseTrainer] Training complete — social: ${results.social ? 'OK' : 'FAILED'}, advertising: ${results.advertising ? 'OK' : 'FAILED'}, music: ${results.music ? 'OK' : 'FAILED'}`);
}

export function loadSocialBaseState(): any | null {
  try {
    if (!fs.existsSync(SOCIAL_BASE_WEIGHTS)) return null;
    return JSON.parse(fs.readFileSync(SOCIAL_BASE_WEIGHTS, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadAdvertisingBaseState(): any | null {
  try {
    if (!fs.existsSync(ADVERTISING_BASE_WEIGHTS)) return null;
    return JSON.parse(fs.readFileSync(ADVERTISING_BASE_WEIGHTS, 'utf-8'));
  } catch {
    return null;
  }
}
