/** Honor an explicitly stored expiry; do not invent a retention policy for legacy artifacts. */
export function artifactExpired(artifact: { expiresAt?: string } | null, now = Date.now()): boolean {
  if (artifact?.expiresAt === undefined) return false;
  const expiry = Date.parse(artifact.expiresAt);
  return !Number.isFinite(expiry) || expiry <= now;
}