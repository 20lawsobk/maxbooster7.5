import { db } from "../db.js";
import { posts } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

/** Existing posts JSON holds per-platform receipts without discarding scheduling metadata. */
export async function claimSocialPost(id: string) {
  const [row] = await db.update(posts).set({ status: "posting",
    engagement: sql`COALESCE(${posts.engagement}::jsonb, '{}'::jsonb) || ${JSON.stringify({ postingCheckpointAt: new Date().toISOString() })}::jsonb`,
  })
    .where(and(eq(posts.id, id), eq(posts.status, "pending"))).returning();
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