import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { splitSheets } from "@shared/schema";
import { validateSplitAllocation } from "./splitAgreementValidation";

export class SplitAgreementError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const rows = (result: any): any[] => result.rows ?? result;

export async function createSplitAgreement(input: {
  releaseId: string; creatorId: string; contractName: string;
  participants: unknown; effectiveDate: Date;
}) {
  const invalid = validateSplitAllocation(input.participants);
  if (invalid) throw new SplitAgreementError(400, invalid);
  if (!Number.isFinite(input.effectiveDate.getTime()))
    throw new SplitAgreementError(400, "Invalid effective date");
  return db.transaction(async tx => {
    const participants = input.participants as Array<{ userId: string }>;
    const [sheet] = await tx.insert(splitSheets).values({
      ...input, participants: participants as any,
      signatures: participants.map(p => ({ userId: p.userId })),
      status: "pending_signature",
    }).returning();
    const content = { contractName: sheet.contractName, releaseId: sheet.releaseId,
      effectiveDate: sheet.effectiveDate, participants: sheet.participants };
    const contentHash = hash(content);
    await tx.execute(sql`INSERT INTO growth_split_revisions(sheet_id,revision,content,content_hash)
      VALUES (${sheet.id},1,${JSON.stringify(content)}::jsonb,${contentHash})`);
    return { ...sheet, revision: 1, contentHash };
  });
}

// The parent row is the serialization lock for both revisions and assents.
// Historical mutable signatures remain historical, never revision-bound evidence.
export async function mutateSplitAgreement(
  sheetId: string, actorId: string,
  command: { type: "sign"; revision: number; signature: string } |
    { type: "amend"; revision: number; participants: unknown },
) {
  return db.transaction(async (tx) => {
    const [sheet] = await tx.select().from(splitSheets)
      .where(eq(splitSheets.id, sheetId)).for("update");
    if (!sheet) throw new SplitAgreementError(404, "Split sheet not found");
    const existing = rows(await tx.execute(sql`
      SELECT * FROM growth_split_revisions WHERE sheet_id = ${sheetId}
      ORDER BY revision DESC LIMIT 1`))[0];
    const currentRevision = existing ? Number(existing.revision) : 0;
    if (command.revision !== currentRevision)
      throw new SplitAgreementError(409, "Revision changed; reload and review before submitting");
    if (command.type === "amend" && sheet.creatorId !== actorId)
      throw new SplitAgreementError(403, "Only the creator can amend this sheet");
    const participants = command.type === "amend" ? command.participants : sheet.participants;
    const invalid = validateSplitAllocation(participants);
    if (invalid) throw new SplitAgreementError(400, invalid);
    const members = participants as Array<{ userId: string }>;
    if (command.type === "sign" && !members.some(p => p.userId === actorId))
      throw new SplitAgreementError(403, "You are not a participant");
    if (command.type === "sign" && (!command.signature || !command.signature.trim()))
      throw new SplitAgreementError(400, "Explicit signature is required");
    let revision = currentRevision;
    let contentHash = existing?.content_hash;
    if (!existing || command.type === "amend") {
      revision++;
      const content = { contractName: sheet.contractName, releaseId: sheet.releaseId,
        effectiveDate: sheet.effectiveDate, participants,
        ...(!existing ? { historicalUnverifiedSignatures: sheet.signatures } : {}) };
      contentHash = hash(content);
      await tx.execute(sql`INSERT INTO growth_split_revisions
        (sheet_id, revision, content, content_hash)
        VALUES (${sheetId}, ${revision}, ${JSON.stringify(content)}::jsonb, ${contentHash})`);
    }
    if (command.type === "sign") {
      await tx.execute(sql`INSERT INTO growth_split_assents
        (sheet_id, revision, user_id, signature_hash)
        VALUES (${sheetId}, ${revision}, ${actorId},
          ${hash({ contentHash, revision, actorId, signature: command.signature })})
        ON CONFLICT (sheet_id, revision, user_id) DO NOTHING`);
    }
    const assents = rows(await tx.execute(sql`SELECT user_id, signed_at, signature_hash
      FROM growth_split_assents WHERE sheet_id = ${sheetId} AND revision = ${revision}`));
    const signatures = members.map(p => {
      const assent = assents.find(a => a.user_id === p.userId);
      return { userId: p.userId, ...(assent ? {
        signedAt: new Date(assent.signed_at).toISOString(), signatureHash: assent.signature_hash,
      } : {}) };
    });
    const [updated] = await tx.update(splitSheets).set({
      participants: participants as any, signatures,
      status: signatures.every(s => s.signedAt) ? "active" : "pending_signature",
      updatedAt: new Date(),
    }).where(and(eq(splitSheets.id, sheetId))).returning();
    return { ...updated, revision, contentHash };
  });
}

export async function getSplitRevision(sheetId: string) {
  const revision = rows(await db.execute(sql`SELECT revision, content_hash
    FROM growth_split_revisions WHERE sheet_id = ${sheetId} ORDER BY revision DESC LIMIT 1`))[0];
  return { revision: Number(revision?.revision ?? 0), contentHash: revision?.content_hash ?? null };
}