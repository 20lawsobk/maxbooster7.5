import { createHash } from "node:crypto";

function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]),
  );
  return value;
}

/** Immutable review snapshot of identity and evidence references, not a claim
 * to have hashed remote file bytes. Replacing storage objects must be forbidden
 * by evidence custody; uploading a new document creates a new evidence ID. */
export function reviewSnapshot(verification: any, documents: any[]) {
  return canonical({
    id: verification.id, userId: verification.userId,
    verificationType: verification.verificationType, status: verification.status,
    metadata: verification.metadata,
    documents: [...documents].sort((a, b) => a.id.localeCompare(b.id)).map(doc => ({
      id: doc.id, userId: doc.userId, documentType: doc.documentType,
      documentUrl: doc.documentUrl, status: doc.status, metadata: doc.metadata,
      verifiedAt: doc.verifiedAt, expiresAt: doc.expiresAt, createdAt: doc.createdAt,
    })),
  });
}

export function reviewRevision(verification: any, documents: any[]): string {
  return createHash("sha256").update(JSON.stringify(reviewSnapshot(verification, documents))).digest("hex");
}

export function assertReviewRevision(expected: string, verification: any, documents: any[]) {
  if (!expected || expected !== reviewRevision(verification, documents)) {
    const error = new Error("Review evidence changed; reload the verification before deciding");
    Object.assign(error, { statusCode: 409 });
    throw error;
  }
}