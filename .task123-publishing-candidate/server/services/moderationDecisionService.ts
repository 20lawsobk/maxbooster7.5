import { db } from "../db.js";
import { posts, users, notifications, auditLogs } from "../../shared/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

/** Local moderation only: remote provider deletion is not implied. */
export async function moderate(input: {
  actorId: string; ip: string; action: string; contentId?: string;
  userId?: string; reason: string; notify?: boolean; idempotencyKey: string; severity?: string;
}) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey || "")) {
    throw Object.assign(new Error("Idempotency-Key (16–128 alphanumeric, dash or underscore characters) is required"), { statusCode: 400 });
  }
  if (!["approve", "remove_content", "warn_user", "ban_user", "dismiss"].includes(input.action)) {
    throw Object.assign(new Error("Invalid moderation action"), { statusCode: 400 });
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    action: input.action, contentId: input.contentId, userId: input.userId,
    reason: input.reason, notify: input.notify === true, severity: input.severity,
  })).digest("hex");
  return db.transaction(async tx => {
    // Transaction-scoped lock serializes retries across all application workers.
    // Hash collisions only serialize unrelated commands; they cannot replay them.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`moderation:${input.actorId}:${input.idempotencyKey}`}, 0))`);
    const [prior] = await tx.select({ details: auditLogs.details }).from(auditLogs)
      .where(and(eq(auditLogs.userId, input.actorId), eq(auditLogs.resource, "moderation"),
        sql`${auditLogs.details}->>'idempotencyKey' = ${input.idempotencyKey}`)).limit(1);
    if (prior) {
      const details = prior.details as any;
      if (details.fingerprint !== fingerprint) throw Object.assign(new Error("Idempotency key already used for a different command"), { statusCode: 409 });
      return details.result as { notifiedUser: boolean; status: string; reviewedAt: string };
    }
    const reviewedAt = new Date();
    let owner = input.userId;
    if (input.contentId) {
      const [post] = await tx.select().from(posts).where(eq(posts.id, input.contentId)).for("update");
      if (!post) throw Object.assign(new Error("Content not found"), { statusCode: 404 });
      owner = post.userId;
      const status = input.action === "remove_content" ? "removed" : "dismissed";
      await tx.update(posts).set({
        status, reviewedBy: input.actorId, reviewedAt,
        rejectionReason: input.reason,
      }).where(eq(posts.id, post.id));
    }
    if (!owner) throw new Error("User is required");
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, owner));
    if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
    if (input.action === "ban_user") {
      if (owner === input.actorId) throw Object.assign(new Error("Cannot ban your own account"), { statusCode: 400 });
      await tx.update(users).set({ subscriptionStatus: "banned" }).where(eq(users.id, owner));
    }
    const notified = input.action === "warn_user" || input.notify === true;
    if (notified) await tx.insert(notifications).values({
      userId: owner, type: "moderation",
      title: input.action === "warn_user" ? "Account warning" : "Content moderation decision",
      message: input.reason, metadata: { action: input.action, contentId: input.contentId, severity: input.severity },
    });
    const result = { notifiedUser: notified, status: input.action === "remove_content" ? "removed" : "dismissed", reviewedAt: reviewedAt.toISOString() };
    await tx.insert(auditLogs).values({
      userId: input.actorId, ip: input.ip, action: `moderation.${input.action}`,
      resource: "moderation", result: "success", risk: "high",
      details: { contentId: input.contentId, affectedUserId: owner, reason: input.reason,
        idempotencyKey: input.idempotencyKey, fingerprint, result, severity: input.severity },
    });
    return result;
  });
}