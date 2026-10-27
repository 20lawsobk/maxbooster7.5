/**
 * Scope tiering to the requested account. A user-initiated maintenance call
 * must not rewrite metadata belonging to other tenants.
 *
 * This selector never changes deduplication flags or references. Converting
 * already-written physical files to aliases requires a durable byte-retirement
 * journal and cannot be safely done by a metadata-only optimization pass.
 */
export function selectHybridTieringKeys(
  entries: Iterable<{ key: string; userId: string; isDeduplicated: boolean }>,
  userId?: string,
): string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    if (userId !== undefined && entry.userId !== userId) continue;
    if (entry.isDeduplicated) continue;
    keys.push(entry.key);
  }
  return keys;
}
