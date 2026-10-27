/**
 * Fail closed on inconsistent persisted hybrid ownership/deduplication indexes.
 * A hash index pointing to a different file's bytes must never be trusted on
 * restart. This validates references only; it is not a replacement for SQL
 * transactions, cross-instance fencing or immutable byte metadata.
 */
export interface IndexedHybridFile {
  contentHash: string;
  isDeduplicated: boolean;
  deduplicationRef?: string;
}

export function assertHybridIndexReferenceIntegrity(
  files: ReadonlyMap<string, IndexedHybridFile>,
  contentHashes: ReadonlyMap<string, readonly string[]>,
  publicHashes: ReadonlyMap<string, string>,
): void {
  const seen = new Set<string>();
  for (const [hash, keys] of contentHashes) {
    if (!hash || !Array.isArray(keys) || keys.length === 0) {
      throw new Error("invalid hybrid content-hash membership");
    }
    for (const key of keys) {
      const file = files.get(key);
      if (!file || file.contentHash !== hash || seen.has(key)) {
        throw new Error("inconsistent hybrid content-hash membership");
      }
      seen.add(key);
    }
  }
  if (seen.size !== files.size) {
    throw new Error("hybrid file missing from content-hash index");
  }
  for (const [key, file] of files) {
    if (!file.isDeduplicated) {
      if (file.deduplicationRef !== undefined) {
        throw new Error("hybrid primary has an unexpected deduplication reference");
      }
      continue;
    }
    const ref = file.deduplicationRef;
    const primary = ref && files.get(ref);
    if (!ref || ref === key || !primary || primary.isDeduplicated ||
        primary.contentHash !== file.contentHash) {
      throw new Error("invalid hybrid deduplication reference");
    }
  }
  for (const [hash, key] of publicHashes) {
    const file = files.get(key);
    // Legacy public-hash entries can point at a private physical primary
    // after a public alias upload. Do not incorrectly reject those records.
    if (!file || file.contentHash !== hash) {
      throw new Error("inconsistent hybrid public-hash reference");
    }
  }
}
