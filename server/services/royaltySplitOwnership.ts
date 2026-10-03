import { db } from "../db";
import { royaltySplits } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

export class RoyaltySplitError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type RoyaltyTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function authorize(tx: RoyaltyTransaction, userId: string, releaseId: string) {
  if (typeof releaseId !== "string" || !releaseId)
    throw new RoyaltySplitError(400, "A resource ID is required");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`royalty:${releaseId === "general" ? userId : releaseId}`}))`);
  if (releaseId === "general") return; // Personal unassigned templates, never sale terms.
  const result = await tx.execute<{user_id: string}>(sql`
    SELECT user_id FROM listings WHERE id=${releaseId}
    UNION ALL SELECT user_id FROM beats WHERE id=${releaseId}
    UNION ALL SELECT user_id FROM releases WHERE id=${releaseId}
    UNION ALL SELECT user_id FROM projects WHERE id=${releaseId}`);
  const owners = result.rows ?? result;
  if (!owners.length || owners.some(row => row.user_id !== userId))
    throw new RoyaltySplitError(403, "You do not own this royalty resource");
}
async function enforceCap(tx: RoyaltyTransaction, userId: string, releaseId: string, percentage: number, exclude = "") {
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)
    throw new RoyaltySplitError(400, "Percentage must be between 1 and 100");
  const rows = await tx.select().from(royaltySplits).where(eq(royaltySplits.releaseId, releaseId));
  // Ignore unauthorized pending legacy rows, but count approved beneficiaries.
  const total = rows.filter(row => row.id !== exclude &&
    (row.userId === userId || (releaseId !== "general" && ["active","verified"].includes(row.status ?? ""))))
    .reduce((sum, row) => sum + Number(row.percentage), 0);
  if (!Number.isFinite(total) || total + percentage > 100.000001)
    throw new RoyaltySplitError(400, "Royalty splits cannot exceed 100%");
}
export async function createOwnedRoyaltySplit(userId: string, values: {
  releaseId: string; collaboratorEmail: string; collaboratorName: string; role: string; percentage: number;
}) {
  return db.transaction(async tx => {
    await authorize(tx, userId, values.releaseId);
    await enforceCap(tx, userId, values.releaseId, values.percentage);
    const [split] = await tx.insert(royaltySplits).values({...values,userId,status:"pending"}).returning();
    return split;
  });
}
export async function updateOwnedRoyaltySplit(userId: string, id: string, values: {
  collaboratorName?: string; collaboratorEmail?: string; role?: string; percentage?: number;
}) {
  return db.transaction(async tx => {
    const [initial] = await tx.select().from(royaltySplits)
      .where(and(eq(royaltySplits.id,id),eq(royaltySplits.userId,userId)));
    if (!initial) throw new RoyaltySplitError(404,"Royalty split not found");
    await authorize(tx,userId,initial.releaseId);
    const [current] = await tx.select().from(royaltySplits)
      .where(and(eq(royaltySplits.id,id),eq(royaltySplits.userId,userId)));
    if (!current) throw new RoyaltySplitError(404,"Royalty split not found");
    await enforceCap(tx,userId,current.releaseId,values.percentage ?? current.percentage,id);
    const [split] = await tx.update(royaltySplits).set({...values,updatedAt:new Date()})
      .where(and(eq(royaltySplits.id,id),eq(royaltySplits.userId,userId))).returning();
    return split;
  });
}