import { logger } from '../logger.js';
import { SocialMediaAutopilotAI, type SocialPost } from '../../shared/ml/models/SocialMediaAutopilotAI.js';
import { AdvertisingAutopilotAI_v3, type OrganicCampaign } from '../../shared/ml/models/AdvertisingAutopilotAI_v3.js';
import {
  SOCIAL_MEDIA_MUSIC_PATTERNS,
  MUSIC_ADVERTISING_INTELLIGENCE,
  ORGANIC_AS_ADS_PATTERNS,
  PAID_AD_BENCHMARKS,
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

/**
 * Generates training samples for the zero-spend organic advertising strategy.
 * These samples teach the model how organic content can replicate paid-ad outcomes
 * by exploiting platform algorithms, staging funnel sequences, and coordinating
 * multi-platform bursts. Each sample encodes the organic-as-ads pattern with
 * high algorithmicBoost, high organicReach, and the distinguishing viralCoefficient
 * values that signal algorithm amplification was achieved.
 */
function makeOrganicAsAdsCampaigns(count: number): OrganicCampaign[] {
  const campaigns: OrganicCampaign[] = [];
  const funnelStages = ['awareness', 'consideration', 'conversion'] as const;
  const burstSequence = ORGANIC_AS_ADS_PATTERNS.crossPlatformBurstStrategy.sequencing;
  const burstPlatforms = [
    burstSequence.t0.platform,
    burstSequence.t2h.platform,
    burstSequence.t4h.platform,
    burstSequence.t6h.platform,
    burstSequence.t24h.platform,
  ];
  const mediaMix: Array<'text' | 'image' | 'video' | 'carousel'> = ['video', 'video', 'carousel', 'image'];

  for (let i = 0; i < count; i++) {
    const funnelStage = pick(funnelStages);
    const platformCount = randInt(2, 5);
    const platforms = burstPlatforms.slice(0, platformCount);
    const mediaType = pick(mediaMix);
    const hourOfDay = randInt(9, 21);
    const dayOfWeek = randInt(1, 5);
    const isOptimalTime = true; // organic-as-ads always posts at optimal time

    // Organic-as-ads has high algorithmicBoost because content is engineered to trigger it
    const algoBoost = rand(2.5, 9.5);

    // Algorithm-triggered impressions: organic reach * boost
    const baseReach = randInt(800, 15000);
    const boostedReach = Math.round(baseReach * algoBoost);
    const impressions = Math.round(boostedReach * rand(1.1, 1.6));
    const organicReach = boostedReach; // 100% organic — no paid promotion
    const reach = organicReach;

    // High save/share rates are what trigger the algorithm (these are the "spend")
    const saves = Math.round(impressions * rand(0.04, 0.12));  // above Explore threshold
    const shares = Math.round(impressions * rand(0.02, 0.06)); // above viral threshold
    const likes = Math.round(impressions * rand(0.05, 0.18));
    const comments = Math.round(impressions * rand(0.01, 0.04));
    const engagement = likes + comments + shares + saves;
    const clicks = Math.round(impressions * rand(0.03, 0.08));
    const engagementRate = engagement / Math.max(impressions, 1);

    // Viral coefficient: shares/impressions — higher than paid because content spreads authentically
    const viralCoefficient = shares / Math.max(impressions, 1);
    const wentViral = viralCoefficient > 0.015;

    // Conversions: organic converts better (higher trust) than paid
    const organicCVR = PAID_AD_BENCHMARKS.performanceVsOrganic.conversionComparison.organicCVR;
    const conversions = Math.round(clicks * rand(organicCVR * 0.7, organicCVR * 1.4));

    // Funnel stage determines content type and CTA pattern
    const funnelConfig = ORGANIC_AS_ADS_PATTERNS.funnelReplication[funnelStage];
    const callToAction = funnelStage === 'conversion'
      ? 'Stream Now'
      : funnelStage === 'consideration' ? 'Save for Later' : 'Discover';

    // Engagement velocity (engagement in first 24h / 24) — high velocity = algo trigger
    const engagementVelocity = (engagement * rand(0.7, 0.95)) / 24;

    // Network propagation > 2 means content spread beyond immediate followers
    const networkPropagation = rand(1.8, 4.5);

    campaigns.push({
      campaignId: `organic_ads_${i}_${funnelStage}`,
      platforms,
      content: {
        headline: `Organic ${funnelStage} campaign on ${platforms.join('+')}`,
        body: `${funnelConfig.organicTactic} — engineered for algorithm amplification`,
        hashtags: [
          ...getHashtagsForGenre('hip-hop').slice(0, 2),  // tier1
          ...getHashtagsForGenre('electronic').slice(0, 2),  // tier2
          '#newmusic', '#indieartist', '#musicmarketing',    // tier3 niche
        ],
        mentions: [],
        mediaType,
        callToAction,
      },
      timing: {
        publishedAt: new Date(Date.now() - randInt(0, 45) * 24 * 3600 * 1000),
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
        authenticityScore: rand(0.82, 1.0), // organic scores higher authenticity than paid
      },
      algorithms: {
        engagementVelocity,
        algorithmicBoost: algoBoost,
        decayRate: rand(0.03, 0.18), // organic decays slower — saves/bookmarks extend reach
        peakEngagementTime: randInt(4, 18),
      },
      audience: {
        segmentIds: [`organic_seg_${randInt(0, 7)}`],
        demographicsReached: {
          '18-24': rand(0.35, 0.65),
          '25-34': rand(0.20, 0.40),
        },
        influencersEngaged: [],
        networkPropagation,
      },
      objective: funnelStage === 'conversion' ? 'conversions'
        : funnelStage === 'consideration' ? 'engagement' : 'awareness',
      wentViral,
    });
  }

  return campaigns;
}

/**
 * Generates paid advertising campaign training samples with real CPM/CPC/ROAS
 * patterns from the PAID_AD_BENCHMARKS data. These teach the model what paid
 * campaigns look like so it can identify the performance targets to replicate
 * organically — and know when organic output is actually outperforming paid.
 */
function makePaidAdCampaigns(count: number): OrganicCampaign[] {
  const campaigns: OrganicCampaign[] = [];
  const paidPlatforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter'];
  const campaignTypes = ['newReleaseBlitz', 'fanbaseGrowth', 'eventPromotion'] as const;
  const mediaMix: Array<'text' | 'image' | 'video' | 'carousel'> = ['video', 'image', 'carousel', 'text'];
  const instaBenchmarks = PAID_AD_BENCHMARKS.platformMetrics.meta_instagram;
  const tiktokBenchmarks = PAID_AD_BENCHMARKS.platformMetrics.tiktok_ads;

  for (let i = 0; i < count; i++) {
    const isPrimarilyInstagram = Math.random() > 0.4;
    const benchmarks = isPrimarilyInstagram ? instaBenchmarks : tiktokBenchmarks;
    const campaignType = pick(campaignTypes);
    const mediaType = pick(mediaMix);
    const hourOfDay = randInt(8, 22);
    const dayOfWeek = randInt(0, 6);
    const objective = pick(OBJECTIVES);
    const platformCount = randInt(1, 3);
    const platforms = paidPlatforms.slice(0, platformCount);

    // Paid campaigns use budget-driven reach (no algorithmic amplification)
    const budget = rand(50, 2500);
    const avgCPM = isPrimarilyInstagram
      ? rand(instaBenchmarks.avgCPM.engagement, instaBenchmarks.avgCPM.conversion)
      : rand(tiktokBenchmarks.avgCPM.engagement, tiktokBenchmarks.avgCPM.conversion);
    const impressions = Math.round((budget / avgCPM) * 1000);
    const reach = Math.round(impressions / rand(instaBenchmarks.frequencyOptimal.min, instaBenchmarks.frequencyOptimal.max));
    const organicReach = Math.round(reach * rand(0.05, 0.20)); // paid campaigns get minimal organic lift

    // CTR from benchmarks
    const avgCTR = mediaType === 'video' ? instaBenchmarks.avgCTR.video
      : mediaType === 'carousel' ? instaBenchmarks.avgCTR.carousel : instaBenchmarks.avgCTR.image;
    const clicks = Math.round(impressions * (avgCTR + rand(-0.01, 0.01)));

    // CVR from benchmarks — paid audience is colder than organic
    const avgCVR = instaBenchmarks.avgCVR.coldAudience;
    const conversions = Math.round(clicks * rand(avgCVR * 0.5, avgCVR * 1.5));

    // Engagement metrics — paid gets lower authentic engagement
    const likes = Math.round(impressions * rand(0.01, 0.06));
    const comments = Math.round(impressions * rand(0.002, 0.015));
    const shares = Math.round(impressions * rand(0.001, 0.008)); // paid rarely goes viral organically
    const saves = Math.round(impressions * rand(0.002, 0.02));
    const engagement = likes + comments + shares + saves;
    const engagementRate = engagement / Math.max(impressions, 1);
    const viralCoefficient = shares / Math.max(impressions, 1);

    campaigns.push({
      campaignId: `paid_ad_${i}_${campaignType}`,
      platforms,
      content: {
        headline: `Paid ${campaignType} campaign - $${Math.round(budget)} budget`,
        body: `Ad creative for ${objective} objective targeting cold audience`,
        hashtags: getHashtagsForGenre('pop').slice(0, 3),
        mentions: [],
        mediaType,
        callToAction: objective === 'conversions' ? 'Buy Now' : 'Learn More',
      },
      timing: {
        publishedAt: new Date(Date.now() - randInt(0, 90) * 24 * 3600 * 1000),
        hourOfDay,
        dayOfWeek,
        isOptimalTime: false, // paid ads run 24/7 by schedule, not peak-optimized
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
        authenticityScore: rand(0.25, 0.55), // paid engagement is less authentic
      },
      algorithms: {
        engagementVelocity: engagement / 24,
        algorithmicBoost: rand(1.0, 1.4), // paid ads get minimal organic amplification
        decayRate: rand(0.18, 0.45),       // paid content decays fast when budget stops
        peakEngagementTime: randInt(1, 6),
      },
      audience: {
        segmentIds: [`paid_cold_${randInt(0, 4)}`],
        demographicsReached: {
          '18-24': rand(0.25, 0.50),
          '25-34': rand(0.25, 0.45),
        },
        influencersEngaged: [],
        networkPropagation: rand(1.0, 1.5), // paid rarely propagates beyond targeted audience
      },
      objective,
      wentViral: viralCoefficient > 0.01,
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

    // Dataset 1: General music industry campaigns (original)
    logger.info('[BaseTrainer] Generating 200 general music industry campaigns...');
    const generalCampaigns = makeSyntheticCampaigns(200);

    // Dataset 2: Organic-as-ads campaigns — the zero-spend, paid-results strategy
    // These teach the model algorithm exploitation, funnel replication, and
    // cross-platform burst coordination as a substitute for paid ad spend.
    logger.info('[BaseTrainer] Generating 250 organic-as-ads campaigns (zero-spend, paid-results strategy)...');
    const organicAsAdsCampaigns = makeOrganicAsAdsCampaigns(250);

    // Dataset 3: Real paid ad benchmarks — so the model knows paid performance targets
    // and can learn to match or exceed them organically.
    logger.info('[BaseTrainer] Generating 150 paid advertising benchmark campaigns...');
    const paidAdCampaigns = makePaidAdCampaigns(150);

    // Shuffle all three datasets together so the model sees both patterns interleaved
    const allCampaigns = [...generalCampaigns, ...organicAsAdsCampaigns, ...paidAdCampaigns]
      .sort(() => Math.random() - 0.5);

    logger.info(`[BaseTrainer] Training Advertising Autopilot on ${allCampaigns.length} total campaigns across 3 datasets...`);
    logger.info('[BaseTrainer]   - General music industry: 200 campaigns');
    logger.info('[BaseTrainer]   - Organic-as-ads (zero spend): 250 campaigns');
    logger.info('[BaseTrainer]   - Paid ad benchmarks (target perf): 150 campaigns');

    const model = new AdvertisingAutopilotAI_v3();
    const result = await model.trainOnOrganicCampaigns(allCampaigns);
    logger.info(`[BaseTrainer] Advertising training complete: ${result.campaignsProcessed} campaigns processed`);

    const state = model.serializeMetadata ? model.serializeMetadata() : null;
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
    fs.writeFileSync(ADVERTISING_BASE_WEIGHTS, JSON.stringify({
      trainedAt: new Date().toISOString(),
      version: '2.0',
      datasets: {
        generalCampaigns: 200,
        organicAsAdsCampaigns: 250,
        paidAdBenchmarks: 150,
        total: allCampaigns.length,
      },
      campaignsProcessed: result.campaignsProcessed,
      state,
    }, null, 2));

    logger.info(`[BaseTrainer] Advertising base weights v2.0 saved — organic-as-ads + paid benchmarks trained`);
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
