import { createHash } from "node:crypto";

interface Release {
  id: string;
  userId: string;
  title: string;
  releaseDate: Date | null;
  artworkUrl: string | null;
}
interface CountdownDependencies {
  loadRelease(userId: string, releaseId: string): Promise<Release | undefined>;
  platforms(userId: string): Promise<string[]>;
  schedule(userId: string, platform: string, content: { text: string; mediaUrl?: string; mediaType: "text" | "image" }, at: Date, key: string): Promise<{ id: string }>;
}

/** Every returned ID comes from the durable publisher, never a description. */
export async function scheduleReleaseCountdown(
  userId: string,
  releaseId: unknown,
  config: Record<string, unknown>,
  deps: CountdownDependencies,
  now = new Date(),
) {
  if (!userId || typeof releaseId !== "string" || !releaseId.trim()) {
    throw new Error("An owned release ID is required for countdown posts");
  }
  const release = await deps.loadRelease(userId, releaseId);
  if (!release || release.userId !== userId) throw new Error("Release not found");
  if (!release.title.trim() || !release.releaseDate ||
      !Number.isFinite(release.releaseDate.getTime())) {
    throw new Error("Release title and a valid release date are required");
  }
  const connected = [...new Set((await deps.platforms(userId)).map(p => p.toLowerCase()))];
  const selected = config.platforms === "all" ? connected :
    typeof config.platforms === "string" ? [config.platforms.toLowerCase()] : [];
  if (!selected.length) throw new Error("Select at least one connected social platform");
  for (const platform of selected) {
    if (!connected.includes(platform)) throw new Error(`Platform is not connected: ${platform}`);
    if (!["twitter", "facebook", "instagram"].includes(platform)) {
      throw new Error(`Release countdown publishing is unavailable for ${platform}: this workflow has no compatible video asset`);
    }
    if (platform === "instagram" && !release.artworkUrl) {
      throw new Error("Instagram countdown posts require release artwork");
    }
  }
  const slots = [
    ["post7Day", 7], ["post3Day", 3], ["post1Day", 1], ["postReleaseDay", 0],
  ] as const;
  const planned: Array<{ days: number; at: Date }> = [];
  const skipped: number[] = [];
  for (const [flag, days] of slots) {
    if (config[flag] !== undefined && typeof config[flag] !== "boolean") {
      throw new Error(`Countdown option ${flag} must be a boolean`);
    }
    if (config[flag] !== true) continue;
    const at = new Date(release.releaseDate.getTime() - days * 86_400_000);
    if (at <= now) skipped.push(days);
    else planned.push({ days, at });
  }
  if (!planned.length) throw new Error("No enabled countdown slots remain in the future");
  const scheduled: Array<{ postId: string; platform: string; scheduledAt: string }> = [];
  for (const { days, at } of planned) {
    for (const platform of selected) {
      // The key deliberately excludes mutable release metadata. Changing dates
      // or copy must conflict at the publisher, never create duplicate slots.
      const key = `countdown-${createHash("sha256")
        .update(JSON.stringify([userId, release.id, platform, days])).digest("hex")}`;
      const text = days
        ? `${release.title} releases on ${release.releaseDate.toISOString().slice(0, 10)} — ${days} day${days === 1 ? "" : "s"} to go.`
        : `${release.title} is scheduled for release today.`;
      const post = await deps.schedule(userId, platform, {
        text,
        mediaType: release.artworkUrl ? "image" : "text",
        ...(release.artworkUrl ? { mediaUrl: release.artworkUrl } : {}),
      }, at, key);
      if (!post?.id) throw new Error("Publisher did not return a persisted post ID");
      scheduled.push({ postId: post.id, platform, scheduledAt: at.toISOString() });
    }
  }
  return { releaseId: release.id, scheduled, skippedPastOffsets: skipped };
}
