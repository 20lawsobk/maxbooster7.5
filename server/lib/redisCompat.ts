/**
 * Applies node-redis v4 camelCase method aliases onto an ioredis client.
 *
 * ioredis uses lowercase snake_case commands (setex, hgetall, sadd, …).
 * Many services were written against node-redis v4 which uses camelCase
 * (setEx, hGetAll, sAdd, …).  Rather than rewriting every service, we
 * monkey-patch the aliases once here and apply them whenever a client is
 * created, so both styles work transparently.
 *
 * Argument order is identical between the two libraries for all aliases below.
 */
export function applyIoredisCompatShim(
  client: Record<string, unknown>,
): Record<string, unknown> {
  if (!client || typeof client !== "object") return client;

  // Already patched — idempotent
  if (client?.__ioreidsCompatApplied) return client;

  const aliases: Record<string, string> = {
    setEx: "setex",
    getEx: "getex",
    hGetAll: "hgetall",
    hSet: "hset",
    hGet: "hget",
    hDel: "hdel",
    hExists: "hexists",
    hIncrBy: "hincrby",
    hKeys: "hkeys",
    hVals: "hvals",
    hLen: "hlen",
    sAdd: "sadd",
    sRem: "srem",
    sMembers: "smembers",
    sIsMember: "sismember",
    sCard: "scard",
    lPush: "lpush",
    rPush: "rpush",
    lRange: "lrange",
    lLen: "llen",
    lPop: "lpop",
    rPop: "rpop",
    zAdd: "zadd",
    zCard: "zcard",
    zRange: "zrange",
    zRevRange: "zrevrange",
    zRem: "zrem",
    zScore: "zscore",
    zRank: "zrank",
    zRemRangeByScore: "zremrangebyscore",
    zRangeByScore: "zrangebyscore",
    zCount: "zcount",
    mGet: "mget",
    mSet: "mset",
    incrBy: "incrby",
    decrBy: "decrby",
    pExpire: "pexpire",
    pTtl: "pttl",
    sendCommand: "sendCommand",
  };

  for (const [camel, lower] of Object?.entries(aliases)) {
    if (
      typeof client[lower] === "function" &&
      typeof client[camel] !== "function"
    ) {
      client[camel] = client[lower].bind(client);
    }
  }

  // Special-case: hGetAll on ioredis returns null for missing keys,
  // but node-redis v4 returns {}.  Normalise to {} so callers don't crash
  // doing Object?.entries(result).
  if (typeof client?.hgetall === "function") {
    const _origHgetall = client?.hgetall.bind(client);
    client.hGetAll = async (...args: unknown[]) => {
      const _result = await origHgetall(...args);
      return result ?? {};
    };
    // Also ensure lowercase stays consistent with the above
    client.hgetall = client?.hGetAll;
  }

  client.__ioreidsCompatApplied = true;
  return client;
}
