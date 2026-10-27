/**
 * Choose the principal that may read a hybrid-storage object through the
 * authenticated file route. Never trust the object's owner ID as the caller.
 *
 * A verified marketplace-stem entitlement is the only route-level exception:
 * the storage layer still receives the owner ID because its older interface
 * does not accept an entitlement capability. Callers must establish that
 * entitlement against completed orders before calling this helper.
 */
export function authorizedHybridReadPrincipal(
  requesterId: string,
  metadata: { userId: string; isPublic?: boolean },
  verifiedStemAccess: boolean | null,
): string | null {
  if (!requesterId) return null;
  if (metadata.userId === requesterId || metadata.isPublic === true) {
    return requesterId;
  }
  if (verifiedStemAccess === true) {
    return metadata.userId;
  }
  return null;
}


/**
 * A direct-storage read has no built-in per-user authorization. It must only
 * be attempted when an independent ownership/visibility record authorizes it.
 * Missing hybrid metadata and a missing tracking row are NOT public access.
 */
/** Fail closed when SQL and hybrid metadata disagree about the same key. */
export function hasConflictingStorageOwnership(
  trackedOwnerId: string | null,
  metadata: { userId: string } | null,
): boolean {
  return trackedOwnerId !== null && metadata !== null && trackedOwnerId !== metadata.userId;
}

export function authorizedDirectFallback(
  requesterId: string,
  trackedOwnerId: string | null,
  metadata: { userId: string; isPublic?: boolean } | null,
  verifiedStemAccess: boolean | null,
): boolean {
  if (!requesterId) return false;
  // Entitlements and public flags never override contradictory ownership data.
  if (hasConflictingStorageOwnership(trackedOwnerId, metadata)) return false;
  if (verifiedStemAccess === true) return true;
  // Private records are denied rather than choosing a more permissive owner.
  if (metadata && metadata.userId !== requesterId && metadata.isPublic !== true) {
    return false;
  }
  if (trackedOwnerId && trackedOwnerId !== requesterId && metadata?.isPublic !== true) {
    return false;
  }
  return (
    trackedOwnerId === requesterId ||
    metadata?.userId === requesterId ||
    metadata?.isPublic === true
  );
}
