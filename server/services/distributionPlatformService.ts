import { storage } from '../storage';

interface SubmissionResult {
  dispatchId: string;
  status: string;
  message: string;
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

/**
 * TODO: Add function documentation
 */
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false;
  }

  userLimit.count++;
  return true;
}

/**
 * TODO: Add function documentation
 */
export async function submitToProvider(
  releaseId: string,
  providerSlug: string,
  userId: string
): Promise<SubmissionResult> {
  if (!checkRateLimit(userId)) {
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

  setTimeout(async () => {
    await storage.updateDistroDispatch(dispatch.id, {
      status: 'processing',
      logs: `${dispatch.logs}\nProcessing started at ${new Date().toISOString()}`,
    });
  }, 1000);

  return {
    dispatchId: dispatch.id,
    status: 'queued',
    message: `Successfully queued for ${provider.name} distribution`,
  };
}

/**
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
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
 * TODO: Add function documentation
 */
export async function getDispatchStatus(dispatchId: string): Promise<any> {
  const dispatch = await storage.getDistroDispatch(dispatchId);
  if (!dispatch) {
    throw new Error('Dispatch record not found');
  }
  return dispatch;
}
