import { createHash } from "node:crypto";

export interface RepurposeSource {
  userId: string;
  platform: string;
  text: string;
  publishedAt: Date;
  status: string;
  mediaUrl?: string;
  mediaType?: "text" | "image" | "video";
}
interface Dependencies {
  source(userId: string, postId: string): Promise<RepurposeSource | null>;
  platforms(userId: string): Promise<string[]>;
  existing(id: string): Promise<{ userId: string; content: { text?: string }; status: string } | null>;
  generate(userId: string, platform: string, text: string, seed: number): Promise<string>;
  persist(input: {
    userId: string; platform: string; content: { text: string; mediaUrl?: string; mediaType: string };
    at: Date; key: string; autoSchedule: boolean;
  }): Promise<{ id: string; status: string }>;
}

export async function repurposePublishedCaption(
  userId: string, postId: unknown, config: Record<string, unknown>, deps: Dependencies,
  now = new Date(),
) {
  if (!userId || typeof postId !== "string" || !postId.trim()) throw new Error("An owned published post ID is required");
  const source = await deps.source(userId, postId);
  if (!source || source.userId !== userId) throw new Error("Source post not found");
  if (!["completed", "published"].includes(source.status) ||
      !source.text.trim() || !Number.isFinite(source.publishedAt?.getTime())) {
    throw new Error("Repurposing requires a published source with text and a publication timestamp");
  }
  if (typeof config.autoSchedule !== "boolean") throw new Error("autoSchedule must be a boolean");
  if (source.mediaType && !["text", "image", "video"].includes(source.mediaType)) {
    throw new Error("The source media format is not supported by caption repurposing");
  }
  const hours = config.staggerHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || hours > 168) {
    throw new Error("staggerHours must be greater than zero and at most 168");
  }
  const connected = [...new Set((await deps.platforms(userId)).map(p => p.toLowerCase()))].sort();
  const targets = config.targetPlatforms === "all"
    ? connected.filter(p => p !== source.platform.toLowerCase())
    : typeof config.targetPlatforms === "string" ? [config.targetPlatforms.toLowerCase()] : [];
  if (!targets.length) throw new Error("No connected destination platforms are selected");
  for (const platform of targets) {
    if (!connected.includes(platform) || platform === source.platform.toLowerCase()) {
      throw new Error(`Invalid repurposing destination: ${platform}`);
    }
    if (!["twitter", "facebook", "instagram", "tiktok"].includes(platform)) {
      throw new Error(`Repurposing is unavailable for ${platform}`);
    }
    if (platform === "instagram" && !source.mediaUrl) throw new Error("Instagram requires source media");
    if (platform === "tiktok" && (!source.mediaUrl || source.mediaType !== "video")) {
      throw new Error("TikTok requires source video");
    }
  }
  const artifacts: Array<{ postId: string; platform: string; status: string }> = [];
  const prepared: Array<Parameters<Dependencies["persist"]>[0]> = [];
  for (const [index, platform] of targets.entries()) {
    const digest = createHash("sha256").update(JSON.stringify([userId, postId, platform])).digest("hex");
    const key = `repurpose-${digest}`;
    const at = new Date(source.publishedAt.getTime() + hours * 3_600_000 * (index + 1));
    const prior = await deps.existing(`post_${key}`);
    if (prior && prior.userId !== userId) throw new Error("Existing repurposed post belongs to another owner");
    if (config.autoSchedule && at <= now && (!prior || prior.status === "draft")) {
      throw new Error("The repurposing slot has passed; choose a later stagger interval");
    }
    const text = prior?.content.text ?? await deps.generate(userId, platform, source.text, parseInt(digest.slice(0, 8), 16));
    if (typeof text !== "string" || !text.trim()) throw new Error("MaxCore returned no usable caption");
    if (prior && !config.autoSchedule && prior.status !== "draft") {
      throw new Error("This repurposed post is already scheduled or delivered");
    }
    prepared.push({
      userId, platform, at, key, autoSchedule: config.autoSchedule,
      content: { text, mediaType: source.mediaType || "text", ...(source.mediaUrl ? { mediaUrl: source.mediaUrl } : {}) },
    });
  }
  for (const input of prepared) {
    const saved = await deps.persist(input);
    if (!saved?.id) throw new Error("Repurposed post was not persisted");
    if (!["pending", "scheduled", "draft", "completed", "published"].includes(saved.status)) {
      throw new Error("Repurposed post has no confirmed usable state");
    }
    artifacts.push({ postId: saved.id, platform: input.platform, status: saved.status });
  }
  return { sourcePostId: postId, artifacts };
}
