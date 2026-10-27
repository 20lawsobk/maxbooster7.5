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
export function authorizedDirectFallback(
  requesterId: string,
  trackedOwnerId: string | null,
  metadata: { userId: string; isPublic?: boolean } | null,
  verifiedStemAccess: boolean | null,
): boolean {
  if (!requesterId) return false;
  if (verifiedStemAccess === true) return true;
  // Conflicting private records are denied, not resolved by choosing the more
  // permissive record. A public hybrid object is the explicit exception.
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
