import type { IncomingHttpHeaders } from "node:http";
import { timingSafeEqual } from "node:crypto";

/**
 * Forward one explicitly supplied credential, never inject an admin credential
 * for an unauthenticated caller. The public application supplies its inherited
 * channel bearer after application/session authorization.
 */
export function modelAuthHeaders(
  headers: IncomingHttpHeaders,
  peer: string | undefined,
  channelToken = process.env.PDIM_LOCAL_CHANNEL_TOKEN ?? "",
): Record<string, string> | null {
  const admin = headers["x-admin-key"];
  const api = headers["x-api-key"];
  const authorization = headers.authorization;
  if (Array.isArray(admin) || Array.isArray(api) || Array.isArray(authorization)) return null;
  // Reject ambiguous mixed schemes rather than upgrading a generation caller.
  if ([admin, api, authorization].filter(Boolean).length !== 1) return null;
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const supplied = admin || api || bearer;
  if (!supplied) return null;
  const privateCredential = channelToken && Buffer.byteLength(supplied) === Buffer.byteLength(channelToken) &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(channelToken));
  if (privateCredential) {
    if (admin || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer ?? "")) return null;
    const owner = headers["x-maxcore-user-id"];
    if (owner !== undefined && (typeof owner !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(owner))) return null;
    return { Authorization: `Bearer ${channelToken}`,
      ...(owner ? { "X-MaxCore-User-Id": owner } : {}) };
  }
  if (admin) return { "X-Admin-Key": admin };
  if (api) return { "X-Api-Key": api };
  return { Authorization: `Bearer ${bearer}` };
}

/** Reserved owner fields are never an independent authority. Python must use
 * the channel-authenticated header, or its own authenticated API-key principal. */
export function modelOwnedBody(body: unknown, auth: Record<string, string>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = { ...body } as Record<string, unknown>;
  for (const key of ["owner_id", "ownerId", "user_id", "userId", "trusted_owner",
    "trustedOwner", "_owner", "_auth", "auth_context"]) delete clean[key];
  const owner = auth["X-MaxCore-User-Id"];
  if (owner) Object.assign(clean, { user_id: owner, userId: owner, owner_id: owner });
  return clean;
}