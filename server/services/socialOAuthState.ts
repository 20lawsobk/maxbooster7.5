import crypto from "node:crypto";
import { getRedisClient } from "../lib/redisClient";

const ttlSeconds = 15 * 60;
export const consumeStateScript = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local value = cjson.decode(raw)
if value.userId ~= ARGV[1] or value.sessionHash ~= ARGV[2] then return nil end
if value.platform ~= ARGV[3] and not (value.platform == 'meta' and (ARGV[3] == 'facebook' or ARGV[3] == 'instagram')) then return nil end
redis.call('DEL', KEYS[1])
return raw
`;
function sessionHash(sessionId: string) {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}
export async function createSocialOAuthState(userId: string, sessionId: string, platform: string, codeVerifier?: string) {
  if (!userId || !sessionId) throw new Error("Authenticated browser session required");
  const state = crypto.randomBytes(32).toString("base64url");
  const stored = await getRedisClient().set(`social-oauth-state:${state}`, JSON.stringify({
    userId, sessionHash: sessionHash(sessionId), platform, codeVerifier,
    expiresAt: Date.now() + ttlSeconds * 1000,
  }), "EX", ttlSeconds, "NX");
  if (stored !== "OK") throw new Error("OAuth state could not be persisted");
  return state;
}
export async function consumeSocialOAuthState(state: unknown, userId: string | undefined, sessionId: string | undefined, platform: string) {
  if (typeof state !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(state) || !userId || !sessionId) return null;
  const raw = await getRedisClient().eval(consumeStateScript, 1,
    `social-oauth-state:${state}`, userId, sessionHash(sessionId), platform);
  if (typeof raw !== "string") return null;
  const result = JSON.parse(raw);
  if (!Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now()) return null;
  return result as { userId: string; platform: string; codeVerifier?: string };
}