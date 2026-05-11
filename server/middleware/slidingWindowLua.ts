/**
 * Shared Lua script for atomic sliding-window ZSET rate-limit checks.
 *
 * Used by both DistributedRateLimiter (scalableRateLimiter.ts) and
 * RedisRateLimitStore (globalRateLimiter.ts) so the algorithm is defined once.
 *
 * KEYS[1]  — the ZSET key
 * ARGV[1]  — windowStart (epoch-ms string): lower bound of the rolling window
 * ARGV[2]  — maxRequests (string): the per-window ceiling
 * ARGV[3]  — now (epoch-ms string): score for the new entry
 * ARGV[4]  — entryId (string): unique member to avoid score-collision loss
 * ARGV[5]  — expireSecs (string): key TTL (safety-net GC)
 *
 * Returns a two-element Lua array: { isLimited (0|1), remaining }
 *
 * Algorithm — ZCOUNT (sliding-window, PDIM-compatible):
 *   1. ZCOUNT counts entries whose score falls within [windowStart, +inf].
 *      This avoids ZREMRANGEBYSCORE which PDIM's Lua executor does not support.
 *   2. If the count is at the limit, reject; otherwise ZADD + EXPIRE.
 *   3. The ZSET grows slowly over time but is bounded by the EXPIRE TTL.
 *      High-traffic keys stay bounded because rejected requests are not added.
 *
 * Atomicity:
 *   When PDIM supports EVAL the script runs as a single Redis command —
 *   no race window between the count check and the ZADD.
 *   If EVAL is unavailable callers fall back to sequential
 *   ZCOUNT + ZADD, serialised through PDIM's single-chain HTTP queue.
 */
export const SLIDING_WINDOW_LUA = `
local key          = KEYS[1]
local window_start = tonumber(ARGV[1])
local max_req      = tonumber(ARGV[2])
local now          = tonumber(ARGV[3])
local entry_id     = ARGV[4]
local expire_secs  = tonumber(ARGV[5])
local n = tonumber(redis.call('ZCOUNT', key, window_start, '+inf'))
if n >= max_req then return {1, 0} end
redis.call('ZADD', key, now, entry_id)
redis.call('EXPIRE', key, expire_secs)
return {0, max_req - n - 1}
`;
