import { MaxCoreAIClient } from "./maxcoreClient.js";

export const SOCIAL_URL_MAXCORE_ENDPOINT = "/api/platform/social/generate";

export interface SocialUrlGenerationOptions {
  url: string;
  topic?: string;
  extraContext?: string;
  platform: string;
  userId: string;
  tone: string;
  format: string;
  targetAudience?: string;
  hashtagStrategy?: string;
  captionLength?: string;
  callToActionStrength?: string;
  genre?: string;
  contentType?: string;
  intent?: unknown;
  direction?: unknown;
  context?: unknown;
  awareness?: unknown;
}

export interface SocialUrlMaxCoreVariant {
  hook: string;
  body: string;
  cta: string;
  caption: string;
  hashtags: string[];
}

interface SocialUrlMaxCoreResponse {
  variants?: Array<{
    hook?: unknown;
    body?: unknown;
    cta?: unknown;
    caption?: unknown;
    hashtags?: unknown;
  }>;
}

const PLATFORM_ALIASES: Record<string, string> = {
  threads: "instagram",
  googlebusiness: "facebook",
};

/**
 * Build the dedicated MaxCore social-generation request.
 *
 * External URLs remain the topic so MaxCore's guarded URL resolver handles
 * them. A first-party page with an internal authoritative source can instead
 * provide a non-URL topic and verified context, avoiding a second network fetch.
 */
export function buildSocialUrlMaxCoreRequest(
  options: SocialUrlGenerationOptions,
): Record<string, unknown> {
  const platform =
    PLATFORM_ALIASES[options.platform] ?? options.platform;
  const body: Record<string, unknown> = {
    user_id: options.userId,
    topic: options.topic?.trim() || options.url.trim(),
    platform,
    tone: options.tone,
    output_format: options.format,
    num_variants: 1,
  };

  if (options.targetAudience) {
    body.target_audience = options.targetAudience;
  }
  if (options.hashtagStrategy) {
    body.hashtag_strategy = options.hashtagStrategy;
  }
  if (options.captionLength) {
    body.caption_length = options.captionLength;
  }
  if (options.callToActionStrength) {
    body.call_to_action_strength = options.callToActionStrength;
  }
  if (options.genre && options.genre !== "default") {
    body.genre = options.genre;
  }
  if (options.contentType) {
    body.content_type = options.contentType;
  }
  if (options.extraContext?.trim()) {
    body.extra_context = options.extraContext.trim();
  }
  if (options.intent !== undefined) body.intent = options.intent;
  if (options.direction !== undefined) body.direction = options.direction;
  if (options.context !== undefined) body.context = options.context;
  if (options.awareness !== undefined) body.awareness = options.awareness;

  return body;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalize MaxCore's documented nested `{ variants: [...] }` social shape. */
export function normalizeSocialUrlMaxCoreResponse(
  response: SocialUrlMaxCoreResponse | null,
): SocialUrlMaxCoreVariant | null {
  const raw = response?.variants?.[0];
  if (!raw) return null;

  const hook = text(raw.hook);
  const body = text(raw.body);
  const cta = text(raw.cta);
  const explicitCaption = text(raw.caption);
  const caption =
    explicitCaption || [hook, body, cta].filter(Boolean).join("\n\n");
  if (!caption) return null;

  const hashtags = Array.isArray(raw.hashtags)
    ? raw.hashtags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return { hook, body, cta, caption, hashtags };
}

export async function generateSocialUrlWithMaxCore(
  options: SocialUrlGenerationOptions,
): Promise<SocialUrlMaxCoreVariant | null> {
  const response = await MaxCoreAIClient.generate<SocialUrlMaxCoreResponse>(
    SOCIAL_URL_MAXCORE_ENDPOINT,
    buildSocialUrlMaxCoreRequest(options),
  );
  return normalizeSocialUrlMaxCoreResponse(response);
}