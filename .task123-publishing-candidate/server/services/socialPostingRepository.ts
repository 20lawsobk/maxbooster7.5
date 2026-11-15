import { db } from "../db.js";
import { posts } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

/** Existing posts JSON holds per-platform receipts without discarding scheduling metadata. */
export async function claimSocialPost(id: string) {
  const [row] = await db.update(posts).set({ status: "posting",
    engagement: sql`COALESCE(${posts.engagement}::jsonb, '{}'::jsonb) || ${JSON.stringify({ postingCheckpointAt: new Date().toISOString() })}::jsonb`,
  })
    .where(and(eq(posts.id, id), eq(posts.status, "pending"),
      sql`COALESCE(${posts.engagement}->>'postingRecoveryRequired', 'false') <> 'true'`,
      sql`NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(${posts.engagement}->'postingResults') = 'array'
          THEN ${posts.engagement}->'postingResults' ELSE '[]'::jsonb END
        ) receipt WHERE receipt->>'outcome' IN ('started','unknown')
      )`,
    )).returning();
  return row;
}

/** Advance only an owned, undispatched row. A racing worker's claim wins over
 * this UPDATE: posting/terminal states and uncertain receipts are never reset. */
export async function requestImmediateSocialPost(userId: string, id: string) {
  const [row] = await db.update(posts).set({ status: "pending", scheduledAt: new Date(),
    engagement: sql`(CASE WHEN jsonb_typeof(${posts.engagement}::jsonb) = 'object' THEN ${posts.engagement}::jsonb ELSE '{}'::jsonb END) || ${JSON.stringify({ _autopilotMeta: true, immediateRequestedAt: new Date().toISOString() })}::jsonb`,
  }).where(and(eq(posts.id, id), eq(posts.userId, userId),
    sql`${posts.status} IN ('draft','scheduled','pending')`,
    sql`COALESCE(${posts.engagement}->>'postingRecoveryRequired', 'false') <> 'true'`,
    sql`NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        (CASE WHEN jsonb_typeof(${posts.engagement}->'postingResults') = 'array' THEN ${posts.engagement}->'postingResults' ELSE '[]'::jsonb END) ||
        (CASE WHEN jsonb_typeof(${posts.engagement}->'results') = 'array' THEN ${posts.engagement}->'results' ELSE '[]'::jsonb END) ||
        (CASE WHEN jsonb_typeof(${posts.engagement}) = 'array' THEN ${posts.engagement} ELSE '[]'::jsonb END)
      ) receipt WHERE receipt->>'outcome' IN ('started','unknown','confirmed') OR receipt->>'success' = 'true'
    )`,
  )).returning({ id: posts.id });
  return row;
}

/** A schedule edit may not turn a concurrently claimed post back into pending. */
export async function updateQueuedSocialPost(userId: string, id: string, expectedStatus: string,
  updates: { platforms: string[]; content: unknown; mediaUrls: string[]; scheduledTime: Date; createdBy: string }) {
  const [row] = await db.update(posts).set({ status: "pending", platform: updates.platforms[0],
    content: typeof updates.content === "string" ? updates.content : JSON.stringify(updates.content),
    mediaUrls: updates.mediaUrls, scheduledAt: updates.scheduledTime,
    engagement: sql`(CASE WHEN jsonb_typeof(${posts.engagement}::jsonb) = 'object' THEN ${posts.engagement}::jsonb ELSE '{}'::jsonb END) || ${JSON.stringify({ _autopilotMeta: true, platforms: updates.platforms, content: updates.content, createdBy: updates.createdBy })}::jsonb`,
  }).where(and(eq(posts.id, id), eq(posts.userId, userId), eq(posts.status, expectedStatus),
    sql`${posts.status} IN ('draft','scheduled','pending','failed')`,
    sql`COALESCE(${posts.engagement}->>'postingRecoveryRequired', 'false') <> 'true'`,
    sql`NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(
        (CASE WHEN jsonb_typeof(${posts.engagement}->'postingResults') = 'array' THEN ${posts.engagement}->'postingResults' ELSE '[]'::jsonb END) ||
        (CASE WHEN jsonb_typeof(${posts.engagement}->'results') = 'array' THEN ${posts.engagement}->'results' ELSE '[]'::jsonb END) ||
        (CASE WHEN jsonb_typeof(${posts.engagement}) = 'array' THEN ${posts.engagement} ELSE '[]'::jsonb END)
      ) receipt WHERE receipt->>'outcome' IN ('started','unknown','confirmed') OR receipt->>'success' = 'true'
    )`,
  )).returning({ id: posts.id });
  return row;
}

export async function checkpointSocialPost(id: string, results: unknown[], status = "posting") {
  await db.update(posts).set({
    status,
    engagement: sql`(CASE WHEN jsonb_typeof(${posts.engagement}::jsonb) = 'object' THEN ${posts.engagement}::jsonb ELSE '{}'::jsonb END) || ${JSON.stringify({ postingResults: results, postingCheckpointAt: new Date().toISOString() })}::jsonb`,
    ...(status === "completed" ? { publishedAt: new Date() } : {}),
  }).where(eq(posts.id, id));
}

/** Never blindly repost stranded external actions; preserve receipts for reconciliation. */
export async function recoverStrandedSocialPosts() {
  return db.update(posts).set({
    status: "failed",
    engagement: sql`COALESCE(${posts.engagement}::jsonb, '{}'::jsonb) || '{"postingRecoveryRequired":true,"postingRecoveryReason":"Worker stopped before durable completion. Reconcile provider receipts before retrying."}'::jsonb`,
  }).where(and(eq(posts.status, "posting"),
    sql`${posts.engagement}->>'_autopilotMeta' = 'true'`,
    sql`(${posts.engagement}->>'postingCheckpointAt' IS NULL OR ${posts.engagement}->>'postingCheckpointAt' < ${new Date(Date.now() - 30 * 60_000).toISOString()})`
  )).returning({ id: posts.id });
}
