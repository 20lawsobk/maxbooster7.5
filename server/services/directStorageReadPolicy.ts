/**
 * Authorization for the legacy direct-object fallback of the authenticated
 * /api/storage/file route. The hybrid repository owns hybrid-file decisions;
 * a missing hybrid record is not permission to fetch an arbitrary object key.
 */
export interface TrackedDirectFile {
  userId: string;
  deletedAt?: Date | string | null;
}

export function mayReadDirectStorageObject(
  requesterId: string,
  key: string,
  tracked: TrackedDirectFile | undefined,
  verifiedStemAccess: boolean | null,
): boolean {
  if (!requesterId || !key || verifiedStemAccess === false) return false;
  // Soft-deleted files stay inaccessible even to their former owner or buyer.
  if (tracked?.deletedAt) return false;
  if (verifiedStemAccess === true) return true;
  // A tracked key's database owner takes precedence over a forged path prefix.
  if (tracked) return tracked.userId === requesterId;
  // Preserve reads of legacy user-prefixed objects that predate SQL tracking.
  // Untracked keys outside this prefix are never safe to fetch by guessing.
  const segments = key.split("/");
  return segments.length >= 3 && segments[0] === "users" &&
    segments[1] === requesterId && segments.slice(2).every(Boolean);
}
