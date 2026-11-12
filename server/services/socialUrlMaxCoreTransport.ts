import { MaxCoreAIClient } from "./maxcoreClient.js";
import { MaxCoreControlError } from "./maxcoreControlTransport.js";
import { AIUnavailableError } from "../lib/aiSource.js";

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

export function isSocialUrlSourceRejection(error: unknown): boolean {
  return (
    error instanceof MaxCoreControlError &&
    (error.status === 400 || error.status === 422)
  );
}

export type SocialUrlGenerationFailure =
  | "source_rejected"
  | "service_unavailable"
  | "authorization_failed"
  | "empty_generation"
  | "transport_failed";

/**
 * Collapse per-platform MaxCore outcomes into a safe, actionable UI category.
 * Never return raw provider errors here: they can contain submitted URLs,
 * prompts, or upstream diagnostics.
 */
export function classifySocialUrlGenerationFailure(
  outcomes: readonly PromiseSettledResult<{
    result: SocialUrlMaxCoreVariant | null;
  }>[],
): SocialUrlGenerationFailure {
  const rejected = outcomes.flatMap((outcome) =>
    outcome.status === "rejected" ? [outcome.reason] : [],
  );
  if (
    rejected.length > 0 &&
    rejected.every(isSocialUrlSourceRejection)
  ) {
    return rejected.length === outcomes.length
      ? "source_rejected"
      : "empty_generation";
  }
  if (
    rejected.some(
      (error) =>
        error instanceof AIUnavailableError ||
        (error instanceof MaxCoreControlError && error.status === 503),
    )
  ) {
    return "service_unavailable";
  }
  if (
    rejected.some(
      (error) =>
        error instanceof MaxCoreControlError &&
        (error.status === 401 || error.status === 403),
    )
  ) {
    return "authorization_failed";
  }
  if (rejected.length > 0) {
    return "transport_failed";
  }
  if (
    outcomes.some(
      (outcome) =>
        outcome.status === "fulfilled" && outcome.value.result === null,
    ) ||
    outcomes.length === 0
  ) {
    return "empty_generation";
  }
  return "empty_generation";
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