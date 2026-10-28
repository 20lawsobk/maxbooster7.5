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
 * Authorize bytes before either hybrid or direct PDIM fetch. An authenticated
 * session is not an authorization grant for an arbitrary unscoped object key.
 * Prefer durable tracking ownership, then hybrid metadata, then the explicit
 * legacy users/<requester>/ namespace. Never infer public access from absence
 * of metadata. Paid stems and explicitly public metadata are separate grants.
 */
export function canReadStoredFile(
  requesterId: string,
  key: string,
  trackedOwnerId: string | null,
  hybridOwnerId: string | null,
  explicitlyPublic: boolean,
  verifiedStemAccess: boolean | null,
  trackedIsPublic: boolean | null = null,
): boolean {
  if (!requesterId || !key) return false;
  if (verifiedStemAccess === true) return true;
  // A durable private row must not be overridden by stale hybrid public metadata.
  if (trackedOwnerId !== null) {
    return trackedOwnerId === requesterId ||
      (trackedIsPublic === true && explicitlyPublic);
  }
  if (explicitlyPublic) return true;
  if (hybridOwnerId !== null) return hybridOwnerId === requesterId;
  return key.startsWith(`users/${requesterId}/`);
}
