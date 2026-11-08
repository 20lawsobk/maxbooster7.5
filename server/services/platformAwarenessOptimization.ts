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

export interface PlatformOptimizationSource {
  title: string;
  publisher: string;
  url: string;
  /** 1 = official platform/government source, 2 = reputable independent reporting, 3 = blog/opinion/promotional. */
  tier: 1 | 2 | 3;
  publishedDate: string | null;
}

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
  /**
   * Concrete, source-verified statements about how this platform's ORGANIC
   * (non-paid) ranking/recommendation system actually behaves — distinct
   * from the content-shape/cadence fields above, which are general content
   * strategy rather than researched algorithm mechanics. Paid ad targeting
   * and bidding are intentionally out of scope here; that research lives in
   * a separate subsystem and must not be merged into this registry.
   */
  algorithmSignals: string[];
  /** Provenance for algorithmSignals, so claims can be checked and refreshed. */
  sources: PlatformOptimizationSource[];
  /** ISO date this platform's algorithmSignals were last verified against sources. */
  researchedAt: string;
}

export interface ProfileSourcingQualityPolicy {
  benchmark: "google_veo_generated_content";
  calibrationStatus: "provisional";
  scoreScale: { min: 0; max: 100 };
  minimumEligibleScore: number;
  preferredScoreRange: { min: number; max: number };
  minimumEvidenceCoverage: number;
  exactMatchRequired: false;
  requiredFactors: Array<
    | "creativeQuality"
    | "musicRelevance"
    | "platformFit"
    | "measuredPerformance"
    | "freshness"
    | "sourceProvenance"
  >;
  weights: Record<
    | "creativeQuality"
    | "musicRelevance"
    | "platformFit"
    | "measuredPerformance"
    | "freshness"
    | "sourceProvenance",
    number
  >;
  missingEvidencePolicy: "do_not_impute";
  scoreMeaning: string;
}

interface RegistryFile {
  revision: string;
  registryLastResearched?: string;
  researchMethodology?: string;
  profileSourcingQuality: ProfileSourcingQualityPolicy;
  platforms: Record<SocialAwarenessPlatform, PlatformOptimization>;
}

const registryPath = path.resolve(process.cwd(), "shared/social-platform-optimization.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as RegistryFile;
const profileQuality = registry.profileSourcingQuality;
const profileQualityWeights = Object.values(profileQuality?.weights ?? {});
const profileQualityWeightTotal = profileQualityWeights.reduce(
  (total, weight) => total + weight,
  0,
);
const profileQualityFactorNames = [
  "creativeQuality",
  "musicRelevance",
  "platformFit",
  "measuredPerformance",
  "freshness",
  "sourceProvenance",
];

if (
  registry.revision === undefined ||
  profileQuality?.benchmark !== "google_veo_generated_content" ||
  profileQuality.calibrationStatus !== "provisional" ||
  profileQuality.scoreScale?.min !== 0 ||
  profileQuality.scoreScale?.max !== 100 ||
  !Number.isFinite(profileQuality.minimumEligibleScore) ||
  !Number.isFinite(profileQuality.preferredScoreRange?.min) ||
  !Number.isFinite(profileQuality.preferredScoreRange?.max) ||
  profileQuality.minimumEligibleScore < profileQuality.scoreScale.min ||
  profileQuality.minimumEligibleScore > profileQuality.preferredScoreRange.min ||
  profileQuality.preferredScoreRange.max > profileQuality.scoreScale.max ||
  profileQuality.preferredScoreRange.min > profileQuality.preferredScoreRange.max ||
  !Number.isFinite(profileQuality.minimumEvidenceCoverage) ||
  profileQuality.minimumEvidenceCoverage < 0 ||
  profileQuality.minimumEvidenceCoverage > 1 ||
  profileQuality.exactMatchRequired !== false ||
  profileQuality.missingEvidencePolicy !== "do_not_impute" ||
  Math.abs(profileQualityWeightTotal - 1) > 0.001 ||
  profileQualityWeights.some((weight) => !Number.isFinite(weight) || weight < 0) ||
  Object.keys(profileQuality.weights ?? {}).sort().join(",") !==
    [...profileQualityFactorNames].sort().join(",") ||
  !Array.isArray(profileQuality.requiredFactors) ||
  !profileQuality.requiredFactors.every(
    (factor) => Object.hasOwn(profileQuality.weights, factor),
  ) ||
  SOCIAL_AWARENESS_PLATFORMS.some((platform) => !registry.platforms[platform]) ||
  Object.keys(registry.platforms).some(
    (platform) => !SOCIAL_AWARENESS_PLATFORMS.includes(platform as SocialAwarenessPlatform),
  ) ||
  SOCIAL_AWARENESS_PLATFORMS.some((platform) => {
    const entry = registry.platforms[platform];
    return (
      !Array.isArray(entry.algorithmSignals) ||
      entry.algorithmSignals.length === 0 ||
      !Array.isArray(entry.sources) ||
      entry.sources.length === 0 ||
      !entry.researchedAt
    );
  })
) {
  throw new Error(
    "Invalid social awareness optimization registry: every platform needs non-empty algorithmSignals, sources, and researchedAt",
  );
}

export function getProfileSourcingQualityPolicy(): ProfileSourcingQualityPolicy {
  return JSON.parse(JSON.stringify(profileQuality)) as ProfileSourcingQualityPolicy;
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
    `Documented algorithm signals (organic ranking only, verified ${profile.researchedAt}): ${profile.algorithmSignals.join(" ")}`,
  ].join("\n");
}

export function platformOptimizationRevision(): string {
  return registry.revision;
}