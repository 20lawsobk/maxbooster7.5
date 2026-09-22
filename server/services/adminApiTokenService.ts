import { randomBytes, createHash } from "node:crypto";
import { db } from "../db.js";
import { apiKeys, auditLogs } from "../../shared/schema.js";
import { and, eq } from "drizzle-orm";

// Adapter to the existing developer API key verifier. These are NOT session,
// JWT, refresh, or delegated admin credentials. Scope is the developer API.
export async function issueAdminApiToken(actorId: string, ip: string) {
  const token = `mb_live_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return db.transaction(async tx => {
    const [record] = await tx.insert(apiKeys).values({
      userId: actorId, name: "Admin-issued developer API credential",
      keyHash: createHash("sha256").update(token).digest("hex"),
      keyPrefix: token.slice(0, 12), scopes: ["developer:full"],
      isActive: true, rateLimit: 100, expiresAt,
    }).returning({ id: apiKeys.id });
    await tx.insert(auditLogs).values({
      userId: actorId, ip, action: "api_token.issue", resource: "api_keys",
      result: "success", risk: "high", details: { tokenId: record.id, expiresAt, scope: "developer:full" },
    });
    return { token, tokenId: record.id, expiresAt, scope: "developer:full" };
  });
}

export async function revokeAdminApiToken(actorId: string, tokenId: string, ip: string) {
  return db.transaction(async tx => {
    const [record] = await tx.update(apiKeys).set({ isActive: false })
      .where(and(eq(apiKeys.id, tokenId), eq(apiKeys.userId, actorId)))
      .returning({ id: apiKeys.id });
    if (!record) throw new Error("Credential not found for current user");
    await tx.insert(auditLogs).values({
      userId: actorId, ip, action: "api_token.revoke", resource: "api_keys",
      result: "success", risk: "high", details: { tokenId },
    });
    return { success: true, tokenId };
  });
}