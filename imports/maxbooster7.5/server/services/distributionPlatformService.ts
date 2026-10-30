import { logger } from "../logger.js";

interface SubmissionResult {
  dispatchId: string;
  status: string;
  message: string;
}

/**
 * Fail closed until a durable provider worker exists. The previous implementation
 * wrote a "queued" dispatch and used setTimeout to mark it "processing" without
 * ever contacting a distributor, which falsely implied delivery had begun.
 */
export async function submitToProvider(
  releaseId: string,
  providerSlug: string,
  userId: string,
): Promise<SubmissionResult> {
  logger.warn(
    { releaseId, providerSlug, userId },
    "Generic distribution dispatch unavailable: no durable provider worker is configured; no dispatch was created and no provider request was sent",
  );
  throw new Error(
    "Distribution dispatch unavailable. No dispatch was created and no provider request was sent; use the verified Too Lost submission route.",
  );
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function spotifySubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("Spotify credentials are required");
  }
  return submitToProvider(releaseId, "spotify", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function appleMusicSubmit(
  releaseId: string,
  credentials: { teamId?: string; keyId?: string; privateKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.teamId || !credentials?.keyId || !credentials?.privateKey) {
    throw new Error("Apple Music credentials are required");
  }
  return submitToProvider(releaseId, "apple-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function youtubeSubmit(
  releaseId: string,
  credentials: { channelId?: string; accessToken?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.channelId || !credentials?.accessToken) {
    throw new Error("YouTube credentials are required");
  }
  return submitToProvider(releaseId, "youtube-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function amazonMusicSubmit(
  releaseId: string,
  credentials: { accessKeyId?: string; secretAccessKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.accessKeyId || !credentials?.secretAccessKey) {
    throw new Error("Amazon Music credentials are required");
  }
  return submitToProvider(releaseId, "amazon-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function deezerSubmit(
  releaseId: string,
  credentials: { appId?: string; secretKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.appId || !credentials?.secretKey) {
    throw new Error("Deezer credentials are required");
  }
  return submitToProvider(releaseId, "deezer", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function tidalSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("Tidal credentials are required");
  }
  return submitToProvider(releaseId, "tidal", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function pandoraSubmit(
  releaseId: string,
  credentials: { partnerId?: string; apiKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.partnerId || !credentials?.apiKey) {
    throw new Error("Pandora credentials are required");
  }
  return submitToProvider(releaseId, "pandora", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function iheartradioSubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.apiKey || !credentials?.partnerId) {
    throw new Error("iHeartRadio credentials are required");
  }
  return submitToProvider(releaseId, "iheartradio", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function soundcloudSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("SoundCloud credentials are required");
  }
  return submitToProvider(releaseId, "soundcloud", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function tiktokSubmit(
  releaseId: string,
  credentials: { clientKey?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientKey || !credentials?.clientSecret) {
    throw new Error("TikTok credentials are required");
  }
  return submitToProvider(releaseId, "tiktok", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function instagramSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.appId || !credentials?.appSecret) {
    throw new Error("Instagram credentials are required");
  }
  return submitToProvider(releaseId, "instagram", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function facebookSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.appId || !credentials?.appSecret) {
    throw new Error("Facebook credentials are required");
  }
  return submitToProvider(releaseId, "facebook", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function tencentMusicSubmit(
  releaseId: string,
  credentials: { appId?: string; appKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.appId || !credentials?.appKey) {
    throw new Error("Tencent Music credentials are required");
  }
  return submitToProvider(releaseId, "tencent-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function neteaseSubmit(
  releaseId: string,
  credentials: { appId?: string; appSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.appId || !credentials?.appSecret) {
    throw new Error("NetEase Cloud Music credentials are required");
  }
  return submitToProvider(releaseId, "netease-cloud-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function jiosaavnSubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.apiKey || !credentials?.partnerId) {
    throw new Error("JioSaavn credentials are required");
  }
  return submitToProvider(releaseId, "jiosaavn", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function gaanaSubmit(
  releaseId: string,
  credentials: { apiKey?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.apiKey) {
    throw new Error("Gaana credentials are required");
  }
  return submitToProvider(releaseId, "gaana", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function anghamiSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("Anghami credentials are required");
  }
  return submitToProvider(releaseId, "anghami", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function boomplaySubmit(
  releaseId: string,
  credentials: { apiKey?: string; partnerId?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.apiKey || !credentials?.partnerId) {
    throw new Error("Boomplay credentials are required");
  }
  return submitToProvider(releaseId, "boomplay", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function yandexMusicSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("Yandex Music credentials are required");
  }
  return submitToProvider(releaseId, "yandex-music", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function melonSubmit(
  releaseId: string,
  credentials: { apiKey?: string; cpCode?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.apiKey || !credentials?.cpCode) {
    throw new Error("Melon credentials are required");
  }
  return submitToProvider(releaseId, "melon", userId);
}

/** Legacy compatibility wrapper; submission is disabled until a durable provider worker is configured. */
export async function kkboxSubmit(
  releaseId: string,
  credentials: { clientId?: string; clientSecret?: string },
  userId: string,
): Promise<SubmissionResult> {
  if (!credentials?.clientId || !credentials?.clientSecret) {
    throw new Error("KKBOX credentials are required");
  }
  return submitToProvider(releaseId, "kkbox", userId);
}

/**
 * Retrieve the current status and logs for a distribution dispatch record.
 * Throws if the dispatch ID does not exist.
 */
export async function getDispatchStatus(dispatchId: string): Promise<unknown> {
  logger.warn({ dispatchId }, "Generic dispatch lookup has no implemented repository");
  throw new Error(
    "Generic dispatch status is unavailable: no persistent dispatch repository is configured. Use the existing release status endpoints for historical records.",
  );
}
