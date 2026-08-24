import fs from "node:fs";
import path from "node:path";

export const SOCIAL_AWARENESS_PLATFORMS = [
  "facebook",
  "instagram",
  "youtube",
  "tiktok",
  "threads",
  "google_business",
  "x",
  "linkedin",
] as const;

export type SocialAwarenessPlatform = (typeof SOCIAL_AWARENESS_PLATFORMS)[number];

export interface PlatformOptimization {
  label: string;
  contentShape: string;
  length: { min: number; max: number; unit: string };
  format: string[];
  audienceIntent: string[];
  cadence: string;
  cta: string;
  hashtagKeywordPolicy: string;
  engagementSignals: string[];
  qualityDimensions: string[];
}

interface RegistryFile {
  revision: string;
  platforms: Record<SocialAwarenessPlatform, PlatformOptimization>;
}

const registryPath = path.resolve(process.cwd(), "shared/social-platform-optimization.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as RegistryFile;

if (
  registry.revision === undefined ||
  SOCIAL_AWARENESS_PLATFORMS.some((platform) => !registry.platforms[platform]) ||
  Object.keys(registry.platforms).some(
    (platform) => !SOCIAL_AWARENESS_PLATFORMS.includes(platform as SocialAwarenessPlatform),
  )
) {
  throw new Error("Invalid social awareness optimization registry");
}

const ALIASES: Record<string, SocialAwarenessPlatform> = {
  "google business": "google_business",
  googlebusiness: "google_business",
  "google-business": "google_business",
  twitter: "x",
  "twitter/x": "x",
};

export function normalizeSocialAwarenessPlatform(value: unknown): SocialAwarenessPlatform {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const platform = ALIASES[normalized] ?? normalized;
  if (!SOCIAL_AWARENESS_PLATFORMS.includes(platform as SocialAwarenessPlatform)) {
    throw new Error(`Unsupported social awareness platform: ${String(value)}`);
  }
  return platform as SocialAwarenessPlatform;
}

export function getPlatformOptimization(
  value: unknown,
): PlatformOptimization & { platform: SocialAwarenessPlatform; revision: string } {
  const platform = normalizeSocialAwarenessPlatform(value);
  return { platform, revision: registry.revision, ...registry.platforms[platform] };
}

export function platformAwarenessOptimization(value: unknown): string {
  const profile = getPlatformOptimization(value);
  return [
    `[PLATFORM_OPTIMIZATION platform=${profile.platform} revision=${profile.revision}]`,
    `Content shape: ${profile.contentShape}.`,
    `Length: ${profile.length.min}-${profile.length.max} ${profile.length.unit}. Formats: ${profile.format.join(", ")}.`,
    `Audience intent: ${profile.audienceIntent.join(", ")}.`,
    `Cadence: ${profile.cadence}. CTA: ${profile.cta}.`,
    `Hashtag/keyword policy: ${profile.hashtagKeywordPolicy}.`,
    `Primary engagement signals: ${profile.engagementSignals.join(", ")}.`,
    `Quality dimensions: ${profile.qualityDimensions.join(", ")}.`,
  ].join("\n");
}

export function platformOptimizationRevision(): string {
  return registry.revision;
}