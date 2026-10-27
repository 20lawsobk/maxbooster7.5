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


/** Fail closed when SQL and hybrid metadata disagree about the same key. */
export function hasConflictingStorageOwnership(
  trackedOwnerId: string | null,
  metadata: { userId: string } | null,
): boolean {
  return trackedOwnerId !== null && metadata !== null && trackedOwnerId !== metadata.userId;
}

/**
 * A direct-storage read has no built-in per-user authorization. It must only
 * be attempted when an independent ownership/visibility record authorizes it.
 * Missing hybrid metadata and a missing tracking row are NOT public access.
 */
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

/**
 * Guard the alternate /hybrid/file route against SQL soft deletes and
 * contradictory SQL/hybrid owners before fetching any bytes. The hybrid
 * service still independently enforces the authenticated reader's identity.
 */
export function trackedHybridReadDenial(
  tracked: { userId: string; deletedAt: Date | null; isPublic?: boolean | null } | null,
  metadata: { userId: string; isPublic?: boolean } | null,
): 403 | 404 | null {
  if (tracked?.deletedAt != null) return 404;
  if (hasConflictingStorageOwnership(tracked?.userId ?? null, metadata)) return 403;
  if (hasConflictingStorageVisibility(tracked, metadata)) return 403;
  return null;
}

/**
 * SQL tracking can mark a key private while a stale hybrid index marks it
 * public. Never let the more permissive hybrid flag override a tracked
 * private file. Untracked hybrid-only uploads keep their existing policy.
 */
export function hasConflictingStorageVisibility(
  tracked: { isPublic?: boolean | null } | null,
  metadata: { isPublic?: boolean } | null,
): boolean {
  return tracked !== null && metadata?.isPublic === true && tracked.isPublic !== true;
}
