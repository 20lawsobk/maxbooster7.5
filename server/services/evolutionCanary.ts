import type { EvolutionEnhancement, EvolutionRegistry } from "./evolutionRegistry.js";
import { evolutionConsumers } from "./evolutionConsumers.js";

export type ConsumerCanaryResult = {
  passed: boolean;
  checkedAt: string;
  contract: "consumer-request-v1";
  observations: string[];
  error?: string;
};

/**
 * No publishing, generation or provider call: exercises exactly the scheduling,
 * request-shaping and format-selection functions used by live consumers.
 * This certifies request construction, not provider quality or delivery.
 */
export function runEvolutionConsumerCanary(
  registry: EvolutionRegistry,
  entries: readonly EvolutionEnhancement[],
): ConsumerCanaryResult {
  const result: ConsumerCanaryResult = {
    passed: false, checkedAt: new Date().toISOString(),
    contract: "consumer-request-v1", observations: [],
  };
  const require = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  try {
    require(entries.length > 0, "No active candidate enhancements");
    for (const entry of entries) {
      require(registry.isCategoryConsumed(entry.category), "Candidate has no live consumer");
      const platforms = typeof entry.payload.platform === "string"
        ? [entry.payload.platform]
        : ["twitter", "instagram", "facebook", "linkedin", "tiktok", "youtube"];
      for (const platform of platforms) {
        const hours = registry.getOptimalHoursOverride(platform);
        if (entry.category === "posting_optimization" && entry.payload.optimalHours !== undefined) {
          require(!!hours?.length && hours.every((h) => Number.isInteger(h) && h >= 0 && h <= 23),
            `${platform}: invalid posting windows`);
          for (const frequency of ["daily", "twice-daily", "weekly"]) {
            // Includes after-midnight and end-of-day; zero is a valid hour.
            for (const hour of [0, 12, 23]) {
              const now = new Date(2026, 0, 15, hour, 30);
              const next = evolutionConsumers.nextPostTime(now, frequency, hours!);
              const expectedHours = frequency === "twice-daily"
                ? [hours![0], hours![1] ?? 17] : [hours![0]];
              require(Number.isFinite(next.getTime()) && next > now &&
                next.getTime() - now.getTime() <= 8 * 86400000 &&
                expectedHours.includes(next.getHours()) && next.getMinutes() === 0,
              `${platform}: ${frequency} scheduler violated posting window`);
            }
          }
          result.observations.push(`${platform}:posting-windows`);
        }
        const content = registry.getContentOptimization(platform);
        const posting = registry.getPostingOptimization(platform);
        const request = evolutionConsumers.contentRequest(registry, platform, "conversions");
        require(request.variantCount === (content?.variantCount ?? 3) &&
          Number.isInteger(request.variantCount) && request.variantCount >= 1 && request.variantCount <= 5,
        `${platform}: variant count mismatch`);
        require(request.includeEmojis === (content?.visualPriority ?? true),
          `${platform}: visual preference mismatch`);
        for (const field of ["hashtagStrategy", "captionLength", "callToActionStrength"] as const) {
          require(request[field] === content?.[field], `${platform}: ${field} request mismatch`);
        }
        require(request.objective === (posting?.engagementTargeting === "high" ? "engagement" : "conversions"),
          `${platform}: objective mismatch`);
        if (posting?.contentFormatPriority?.length) {
          const expected: Record<string, string> = {
            video: "behind-the-scenes", reel: "behind-the-scenes", story: "behind-the-scenes",
            carousel: "engagement", image: "announcement", text: "engagement",
          };
          const format = evolutionConsumers.preferredFormat(posting.contentFormatPriority);
          require(format === expected[posting.contentFormatPriority[0]],
            `${platform}: preferred format mismatch`);
        }
        result.observations.push(`${platform}:content-request`);
      }
    }
    result.passed = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}