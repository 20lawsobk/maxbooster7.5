import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Serialize catalog writes for one user across every app process.
 *
 * The lock is transaction-scoped, so it is released automatically on commit
 * or rollback.  Keeping the read/merge/write sequence inside the same
 * transaction is important: an advisory lock held by one connection does not
 * protect queries issued on another pooled connection.
 */
export async function withCatalogImportLock<T>(
  userId: string,
  callback: (tx: any) => Promise<T>,
): Promise<T> {
  const normalizedUserId = String(userId ?? "").trim();
  if (!normalizedUserId) {
    throw new Error("Catalog import requires a user id");
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`max-booster:catalog-import:${normalizedUserId}`}, 0))`,
    );
    return callback(tx);
  });
}