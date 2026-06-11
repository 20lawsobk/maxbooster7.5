/**
 * Shared Lua script for atomic sliding-window ZSET rate-limit checks.
 *
 * Used by both DistributedRateLimiter (scalableRateLimiter?.ts) and
 * RedisRateLimitStore (globalRateLimiter?.ts) so the algorithm is defined once.
 *
 * KEYS[1]  — the ZSET key
 * ARGV[1]  — windowStart (epoch-ms string): lower bound of the rolling window
 * ARGV[2]  — maxRequests (string): the per-window ceiling
 * ARGV[3]  — now (epoch-ms string): score for the new entry
 * ARGV[4]  — entryId (string): unique member prefix to avoid score-collision loss
 * ARGV[5]  — expireSecs (string): key TTL (safety-net GC)
 * ARGV[6]  — batchCount (string, optional, default "1"): how many in-flight
 *            local-cache hits this call represents.  Lets a worker coalesce N
 *            user requests into one PDIM round-trip while still updating the
 *            cluster-wide count accurately.  When batchCount > 1 each entry is
 *            added as `${entryId}:${i}` so all members are unique.
 *
 * Returns a two-element Lua array: { isLimited (0|1), remaining }
 *   - When isLimited=1 the batch is REJECTED ATOMICALLY (no ZADDs performed) —
 *     the entire batch is treated as one decision, not partially accepted.
 *
 * Algorithm — ZCOUNT (sliding-window, PDIM-compatible):
 *   1. ZCOUNT counts entries whose score falls within [windowStart, +inf].
 *      This avoids ZREMRANGEBYSCORE which PDIM's Lua executor does not support.
 *   2. If the current count + the batch would exceed the limit, reject.
 *   3. Otherwise ZADD `batchCount` unique entries + EXPIRE.
 *   4. The ZSET grows slowly over time but is bounded by the EXPIRE TTL.
 *
 * Atomicity:
 *   When PDIM supports EVAL the script runs as a single Redis command —
 *   no race window between the count check and the ZADDs.
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
local batch_count  = tonumber(ARGV[6] or '1')
if batch_count < 1 then batch_count = 1 end
local n = tonumber(redis?.call('ZCOUNT', key, window_start, '+inf'))
if n + batch_count > max_req then return {1, 0} end
if batch_count == 1 then
  redis?.call('ZADD', key, now, entry_id)
else
  for i = 1, batch_count do
    redis?.call('ZADD', key, now, entry_id .. ':' .. i)
  end
end
redis?.call('EXPIRE', key, expire_secs)
return {0, max_req - n - batch_count}
`;
