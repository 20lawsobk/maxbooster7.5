import { storage } from '../storage';
import { logger } from '../logger.js';
import { createGracefulRedisClient } from '../lib/gracefulRedis.js';

interface SubmissionResult {
  dispatchId: string;
  status: string;
  message: string;
}

const redis = createGracefulRedisClient('distributionPlatformService');
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 10;

/**
 * Check if a user has exceeded the distribution submission rate limit.
 * Uses Redis-backed counting so the limit holds across multiple server instances.
 * Gracefully allows the request if Redis is unavailable.
 */
async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `rate_limit:distribution:${userId}`;
  const count = await redis.incr(key);
  if (count === 0) {
    return true;
  }
  if (count === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
  }
  return count <= RATE_LIMIT_MAX;
}

/**
 * Queue a release for distribution to a specific provider.
 * Records a dispatch entry in the database and returns immediately;
 * actual delivery is handled asynchronously.
 */
export async function submitToProvider(
  releaseId: string,
  providerSlug: string,
  userId: string
): Promise<SubmissionResult> {
  if (!await checkRateLimit(userId)) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  const provider = await storage.getDistroProviderBySlug(providerSlug);
  if (!provider) {
    throw new Error(`Provider ${providerSlug} not found`);
  }

  const dispatch = await storage.createDistroDispatch({
    releaseId,
    providerId: provider.id,
    status: 'queued',
    logs: `Queued for ${provider.name} submission at ${new Date().toISOString()}`,
  });

  setTimeout(() => {
    storage.updateDistroDispatch(dispatch.id, {
      status: 'processing',
      logs: `${dispatch.logs}\nProcessing started at ${new Date().toISOString()}`,
    }).catch((err) => {
      logger.warn({ err: err }, `Failed to update dispatch ${dispatch.id} status:`);
    });
  }, 1000);

  return {
    dispatchId: dispatch.id,
    status: 'queued',
    message: `Successfully queued for ${provider.name} distribution`,
  };
}

/**
 * Submit a release to Spotify for Music distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function spotifySubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('Spotify credentials are required');
  }
  return submitToProvider(releaseId, 'spotify', userId);
}

/**
 * Submit a release to Apple Music for distribution.
 * Validates that the MusicKit team ID, key ID, and private key are present.
 */
export async function appleMusicSubmit(
  releaseId: string,
  credentials: { teamId?: string; keyId?: string; privateKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.teamId || !credentials.keyId || !credentials.privateKey) {
    throw new Error('Apple Music credentials are required');
  }
  return submitToProvider(releaseId, 'apple-music', userId);
}

/**
 * Submit a release to YouTube Music for distribution.
 * Validates that the YouTube channel ID and OAuth access token are present.
 */
export async function youtubeSubmit(
  releaseId: string,
  credentials: { channelId?: string; accessToken?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.channelId || !credentials.accessToken) {
    throw new Error('YouTube credentials are required');
  }
  return submitToProvider(releaseId, 'youtube-music', userId);
}

/**
 * Submit a release to Amazon Music for distribution.
 * Validates that the AWS access key and secret key are present.
 */
export async function amazonMusicSubmit(
  releaseId: string,
  credentials: { accessKeyId?: string; secretAccessKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.accessKeyId || !credentials.secretAccessKey) {
    throw new Error('Amazon Music credentials are required');
  }
  return submitToProvider(releaseId, 'amazon-music', userId);
}

/**
 * Submit a release to Deezer for distribution.
 * Validates that the Deezer app ID and secret key are present.
 */
export async function deezerSubmit(
  releaseId: string,
  credentials: { appId?: string; secretKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.appId || !credentials.secretKey) {
    throw new Error('Deezer credentials are required');
  }
  return submitToProvider(releaseId, 'deezer', userId);
}

/**
 * Submit a release to TIDAL for distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function tidalSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('Tidal credentials are required');
  }
  return submitToProvider(releaseId, 'tidal', userId);
}

/**
 * Submit a release to Pandora for distribution.
 * Validates that the Pandora partner ID and API key are present.
 */
export async function pandoraSubmit(
  releaseId: string,
  credentials: { partnerId?: string; apiKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.partnerId || !credentials.apiKey) {
    throw new Error('Pandora credentials are required');
  }
  return submitToProvider(releaseId, 'pandora', userId);
}

/**
 * Submit a release to iHeartRadio for distribution.
 * Validates that the iHeartRadio API key and partner ID are present.
 */
export async function iheartradioSubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.apiKey || !credentials.partnerId) {
    throw new Error('iHeartRadio credentials are required');
  }
  return submitToProvider(releaseId, 'iheartradio', userId);
}

/**
 * Submit a release to SoundCloud for distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function soundcloudSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('SoundCloud credentials are required');
  }
  return submitToProvider(releaseId, 'soundcloud', userId);
}

/**
 * Submit a release to TikTok Music for distribution.
 * Validates that the TikTok client key and secret are present.
 */
export async function tiktokSubmit(
  releaseId: string,
  credentials: { clientKey?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientKey || !credentials.clientSecret) {
    throw new Error('TikTok credentials are required');
  }
  return submitToProvider(releaseId, 'tiktok', userId);
}

/**
 * Submit a release to Instagram for distribution.
 * Validates that the Meta app ID and secret are present.
 */
export async function instagramSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('Instagram credentials are required');
  }
  return submitToProvider(releaseId, 'instagram', userId);
}

/**
 * Submit a release to Facebook for distribution.
 * Validates that the Meta app ID and secret are present.
 */
export async function facebookSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('Facebook credentials are required');
  }
  return submitToProvider(releaseId, 'facebook', userId);
}

/**
 * Submit a release to Tencent Music (QQ Music / Kugou / Kuwo) for distribution.
 * Validates that the Tencent app ID and key are present.
 */
export async function tencentMusicSubmit(
  releaseId: string,
  credentials: { appId?: string; appKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.appId || !credentials.appKey) {
    throw new Error('Tencent Music credentials are required');
  }
  return submitToProvider(releaseId, 'tencent-music', userId);
}

/**
 * Submit a release to NetEase Cloud Music for distribution.
 * Validates that the NetEase app ID and secret are present.
 */
export async function neteaseSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.appId || !credentials.appSecret) {
    throw new Error('NetEase Cloud Music credentials are required');
  }
  return submitToProvider(releaseId, 'netease-cloud-music', userId);
}

/**
 * Submit a release to JioSaavn for distribution.
 * Validates that the JioSaavn API key and partner ID are present.
 */
export async function jiosaavnSubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.apiKey || !credentials.partnerId) {
    throw new Error('JioSaavn credentials are required');
  }
  return submitToProvider(releaseId, 'jiosaavn', userId);
}

/**
 * Submit a release to Gaana for distribution.
 * Validates that the Gaana API key is present.
 */
export async function gaanaSubmit(
  releaseId: string,
  credentials: { apiKey?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.apiKey) {
    throw new Error('Gaana credentials are required');
  }
  return submitToProvider(releaseId, 'gaana', userId);
}

/**
 * Submit a release to Anghami for distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function anghamiSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('Anghami credentials are required');
  }
  return submitToProvider(releaseId, 'anghami', userId);
}

/**
 * Submit a release to Boomplay for distribution.
 * Validates that the Boomplay API key and partner ID are present.
 */
export async function boomplaySubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.apiKey || !credentials.partnerId) {
    throw new Error('Boomplay credentials are required');
  }
  return submitToProvider(releaseId, 'boomplay', userId);
}

/**
 * Submit a release to Yandex Music for distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function yandexMusicSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('Yandex Music credentials are required');
  }
  return submitToProvider(releaseId, 'yandex-music', userId);
}

/**
 * Submit a release to Melon for distribution.
 * Validates that the Melon API key and CP code are present.
 */
export async function melonSubmit(
  releaseId: string,
  credentials: { apiKey?: string; cpCode?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.apiKey || !credentials.cpCode) {
    throw new Error('Melon credentials are required');
  }
  return submitToProvider(releaseId, 'melon', userId);
}

/**
 * Submit a release to KKBOX for distribution.
 * Validates that OAuth client credentials are present before queuing.
 */
export async function kkboxSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string
): Promise<SubmissionResult> {
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error('KKBOX credentials are required');
  }
  return submitToProvider(releaseId, 'kkbox', userId);
}

/**
 * Retrieve the current status and logs for a distribution dispatch record.
 * Throws if the dispatch ID does not exist.
 */
export async function getDispatchStatus(dispatchId: string): Promise<any> {
  const dispatch = await storage.getDistroDispatch(dispatchId);
  if (!dispatch) {
    throw new Error('Dispatch record not found');
  }
  return dispatch;
}
