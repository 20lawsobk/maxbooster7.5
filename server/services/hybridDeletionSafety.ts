/**
 * Fail closed when an indexed hybrid object cannot be safely deleted.
 *
 * Hybrid deduplication currently stores the physical bytes under the first
 * uploaded key. Reassigning a different key as primary without copying the
 * bytes would strand all dependent reads. Until durable reference migration
 * is implemented, reject such deletions before touching the index or bytes.
 */
export class HybridStorageReferenceConflictError extends Error {
  constructor() {
    super("Hybrid storage object still has live references or an inconsistent index");
    this.name = "HybridStorageReferenceConflictError";
  }
}

export function assertSafeHybridDeletion(
  key: string,
  isDeduplicated: boolean,
  contentHashKeys: readonly string[] | undefined,
): void {
  // Missing, duplicated, or inconsistent index entries are not proof that a
  // physical object can be safely removed.
  if (
    !contentHashKeys ||
    contentHashKeys.filter((candidate) => candidate === key).length !== 1 ||
    new Set(contentHashKeys).size !== contentHashKeys.length
  ) {
    throw new HybridStorageReferenceConflictError();
  }

  if (!isDeduplicated && contentHashKeys.some((candidate) => candidate !== key)) {
    throw new HybridStorageReferenceConflictError();
  }
}
