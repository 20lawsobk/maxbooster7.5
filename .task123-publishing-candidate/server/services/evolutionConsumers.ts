import type { EvolutionRegistry } from "./evolutionRegistry.js";

type Reader = Pick<EvolutionRegistry, "getContentOptimization" | "getPostingOptimization">;
type Objective = "awareness" | "engagement" | "conversions" | "viral";
const formats: Record<string, "behind-the-scenes" | "engagement" | "announcement"> = {
  video: "behind-the-scenes", reel: "behind-the-scenes", story: "behind-the-scenes",
  carousel: "engagement", image: "announcement", text: "engagement",
};

/** Side-effect-free production consumers, shared by real requests and canaries. */
export const evolutionConsumers = {
  contentRequest(registry: Reader, platform: string, baseObjective: Objective) {
    const content = registry.getContentOptimization(platform.toLowerCase());
    const posting = registry.getPostingOptimization(platform.toLowerCase());
    return {
      objective: posting?.engagementTargeting === "high" ? "engagement" as const : baseObjective,
      variantCount: content?.variantCount ?? 3,
      includeEmojis: content?.visualPriority ?? true,
      hashtagStrategy: content?.hashtagStrategy as "trending" | "niche" | "branded" | "balanced" | undefined,
      captionLength: content?.captionLength as "short" | "optimal" | "long" | undefined,
      callToActionStrength: content?.callToActionStrength as "low" | "medium" | "high" | undefined,
    };
  },

  preferredFormat(priority: readonly string[] | undefined) {
    return priority?.map((format) => formats[format.toLowerCase()]).find(Boolean);
  },

  nextPostTime(now: Date, frequency: string, hours: readonly number[]): Date {
    const next = new Date(now);
    switch (frequency) {
      case "hourly":
        next.setHours(now.getHours() + 1, 0, 0, 0);
        break;
      case "twice-daily": {
        const morning = hours[0] ?? 9;
        const evening = hours[1] ?? 17;
        const future = [morning, evening].sort((a, b) => a - b).find((hour) => hour > now.getHours());
        if (future === undefined) next.setDate(next.getDate() + 1);
        next.setHours(future ?? Math.min(morning, evening), 0, 0, 0);
        break;
      }
      case "daily": {
        const hour = hours[0] ?? 14;
        if (now.getHours() >= hour) next.setDate(next.getDate() + 1);
        next.setHours(hour, 0, 0, 0);
        break;
      }
      case "weekly":
        next.setDate(next.getDate() + 7);
        next.setHours(hours[0] ?? 14, 0, 0, 0);
        break;
      default:
        throw new Error(`Unsupported posting frequency: ${frequency}`);
    }
    return next;
  },
};