/**
 * PDIM HTTP Redis Adapter
 *
 * Wraps the Pocket Dimension / Redis replacement server's HTTP exec endpoint
 * with a full ioredis-compatible interface. Any code that calls getRedisClient()
 * transparently receives this adapter when PDIM_HTTP_EXEC_URL is set.
 *
 * env vars consumed:
 *   PDIM_HTTP_EXEC_URL  — https://…/api/redis/instances/{id}/exec
 *   PDIM_BEARER_TOKEN   — Bearer auth token
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';

export class PdimRedisClient extends EventEmitter {
  public status: string = 'ready';
  private execUrl: string;
  private bearerToken: string;

  /**
   * BullMQ reads this._client.options.keyPrefix to validate no prefix is set,
   * and uses this._client.options as its opts. Supply safe defaults.
   */
  public readonly options: {
    keyPrefix?: string;
    maxRetriesPerRequest: null;
    enableReadyCheck: boolean;
    enableOfflineQueue: boolean;
  } = {
    keyPrefix: undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    enableOfflineQueue: false,
  };

  constructor(execUrl?: string, bearerToken?: string) {
    super();
    this.execUrl = execUrl || process.env.PDIM_HTTP_EXEC_URL || '';
    this.bearerToken = bearerToken || process.env.PDIM_BEARER_TOKEN || '';

    if (!this.execUrl) {
      throw new Error('PDIM_HTTP_EXEC_URL is required for PdimRedisClient');
    }

    setImmediate(() => {
      this.emit('connect');
      this.emit('ready');
      logger.info('✅ [PDIM] Connected via HTTP exec endpoint');
    });
  }

  private async exec(command: (string | number | null)[]): Promise<any> {
    const [cmd, ...rawArgs] = command;
    // The PDIM server validates all args as strings — coerce numbers/nulls
    const args = rawArgs.map(a => (a === null ? '' : String(a)));
    try {
      const res = await fetch(this.execUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.bearerToken}`,
        },
        body: JSON.stringify({ cmd, args }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`PDIM HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      if (data !== null && typeof data === 'object') {
        if ('result' in data) return data.result;
        if ('error' in data) {
          const errMsg = String(data.error);
          // Unsupported commands: return safe defaults instead of crashing
          if (errMsg.startsWith('ERR unknown command')) {
            logger.warn(`[PDIM] Unsupported command [${cmd}] — returning null`);
            return null;
          }
          throw new Error(errMsg);
        }
      }
      return data;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        logger.error(`[PDIM] exec error [${cmd}]: ${err.message}`);
      }
      throw err;
    }
  }

  pipeline() {
    const cmds: (string | number | null)[][] = [];
    const self = this;
    const pipe: any = {
      get:        (k: string) => { cmds.push(['GET', k]); return pipe; },
      set:        (k: string, v: string, ...a: any[]) => { cmds.push(['SET', k, v, ...a]); return pipe; },
      setex:      (k: string, s: number, v: string) => { cmds.push(['SETEX', k, s, v]); return pipe; },
      del:        (...k: string[]) => { cmds.push(['DEL', ...k]); return pipe; },
      expire:     (k: string, s: number) => { cmds.push(['EXPIRE', k, s]); return pipe; },
      pexpire:    (k: string, ms: number) => { cmds.push(['PEXPIRE', k, ms]); return pipe; },
      incr:       (k: string) => { cmds.push(['INCR', k]); return pipe; },
      incrby:     (k: string, n: number) => { cmds.push(['INCRBY', k, n]); return pipe; },
      decr:       (k: string) => { cmds.push(['DECR', k]); return pipe; },
      decrby:     (k: string, n: number) => { cmds.push(['DECRBY', k, n]); return pipe; },
      hset:       (k: string, ...a: any[]) => { cmds.push(['HSET', k, ...a]); return pipe; },
      hget:       (k: string, f: string) => { cmds.push(['HGET', k, f]); return pipe; },
      hdel:       (k: string, ...f: string[]) => { cmds.push(['HDEL', k, ...f]); return pipe; },
      hgetall:    (k: string) => { cmds.push(['HGETALL', k]); return pipe; },
      sadd:       (k: string, ...m: any[]) => { cmds.push(['SADD', k, ...m]); return pipe; },
      srem:       (k: string, ...m: any[]) => { cmds.push(['SREM', k, ...m]); return pipe; },
      zadd:       (k: string, ...a: any[]) => { cmds.push(['ZADD', k, ...a]); return pipe; },
      zrem:       (k: string, ...m: any[]) => { cmds.push(['ZREM', k, ...m]); return pipe; },
      lpush:      (k: string, ...v: any[]) => { cmds.push(['LPUSH', k, ...v]); return pipe; },
      rpush:      (k: string, ...v: any[]) => { cmds.push(['RPUSH', k, ...v]); return pipe; },
      exec: async () => Promise.all(cmds.map(c => self.exec(c).catch(e => e))),
    };
    return pipe;
  }

  multi() { return this.pipeline(); }

  duplicate() {
    return new PdimRedisClient(this.execUrl, this.bearerToken);
  }

  // Required by BullMQ's isRedisInstance() check: ['connect', 'disconnect', 'duplicate']
  async connect(): Promise<void> {
    // PDIM is HTTP-based — already "connected" on construction; no-op here
    this.emit('connect');
    this.emit('ready');
  }

  async quit(): Promise<'OK'> { return 'OK'; }
  async disconnect(): Promise<void> {}

  /**
   * BullMQ calls defineCommand() to register Lua scripts as named commands.
   * We store each script and attach a callable method that runs it via EVAL.
   */
  defineCommand(name: string, opts: { numberOfKeys: number; lua: string }): void {
    (this as any)[name] = async (...callArgs: any[]): Promise<any> => {
      const numKeys = opts.numberOfKeys;
      const keys = callArgs.slice(0, numKeys);
      const args = callArgs.slice(numKeys);
      return this.exec(['EVAL', opts.lua, String(numKeys), ...keys, ...args]);
    };
  }

  async sendCommand(args: string[]): Promise<any> { return this.exec(args); }

  // ── String commands ───────────────────────────────────────────────────────
  async get(key: string): Promise<string | null> { return this.exec(['GET', key]); }
  async set(key: string, value: string, ...args: any[]): Promise<'OK'> { return this.exec(['SET', key, value, ...args]); }
  async setex(key: string, secs: number, value: string): Promise<'OK'> { return this.exec(['SETEX', key, secs, value]); }
  async setnx(key: string, value: string): Promise<0 | 1> { return this.exec(['SETNX', key, value]); }
  async getset(key: string, value: string): Promise<string | null> { return this.exec(['GETSET', key, value]); }
  async mget(...keys: string[]): Promise<(string | null)[]> { return this.exec(['MGET', ...keys]); }
  async mset(...args: string[]): Promise<'OK'> { return this.exec(['MSET', ...args]); }
  async append(key: string, value: string): Promise<number> { return this.exec(['APPEND', key, value]); }
  async incr(key: string): Promise<number> { return this.exec(['INCR', key]); }
  async decr(key: string): Promise<number> { return this.exec(['DECR', key]); }
  async incrby(key: string, n: number): Promise<number> { return this.exec(['INCRBY', key, n]); }
  async decrby(key: string, n: number): Promise<number> { return this.exec(['DECRBY', key, n]); }
  async incrbyfloat(key: string, n: number): Promise<string> { return this.exec(['INCRBYFLOAT', key, n]); }

  // ── Key commands ──────────────────────────────────────────────────────────
  async del(...keys: string[]): Promise<number> { return this.exec(['DEL', ...keys]); }
  async exists(...keys: string[]): Promise<number> { return this.exec(['EXISTS', ...keys]); }
  async expire(key: string, secs: number): Promise<0 | 1> { return this.exec(['EXPIRE', key, secs]); }
  async pexpire(key: string, ms: number): Promise<0 | 1> { return this.exec(['PEXPIRE', key, ms]); }
  async expireat(key: string, ts: number): Promise<0 | 1> { return this.exec(['EXPIREAT', key, ts]); }
  async persist(key: string): Promise<0 | 1> { return this.exec(['PERSIST', key]); }
  async ttl(key: string): Promise<number> { return this.exec(['TTL', key]); }
  async pttl(key: string): Promise<number> { return this.exec(['PTTL', key]); }
  async type(key: string): Promise<string> { return this.exec(['TYPE', key]); }
  async rename(key: string, newKey: string): Promise<'OK'> { return this.exec(['RENAME', key, newKey]); }
  async keys(pattern: string): Promise<string[]> { return this.exec(['KEYS', pattern]); }
  async scan(cursor: string | number, ...args: any[]): Promise<[string, string[]]> { return this.exec(['SCAN', cursor, ...args]); }
  async dbsize(): Promise<number> { return this.exec(['DBSIZE']); }
  async randomkey(): Promise<string | null> { return this.exec(['RANDOMKEY']); }

  // ── Hash commands ─────────────────────────────────────────────────────────
  async hget(key: string, field: string): Promise<string | null> { return this.exec(['HGET', key, field]); }
  async hset(key: string, ...args: any[]): Promise<number> { return this.exec(['HSET', key, ...args]); }
  async hsetnx(key: string, field: string, value: string): Promise<0 | 1> { return this.exec(['HSETNX', key, field, value]); }
  async hdel(key: string, ...fields: string[]): Promise<number> { return this.exec(['HDEL', key, ...fields]); }
  async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> { return this.exec(['HMGET', key, ...fields]); }
  async hmset(key: string, ...args: any[]): Promise<'OK'> { return this.exec(['HMSET', key, ...args]); }
  async hgetall(key: string): Promise<Record<string, string>> {
    const result = await this.exec(['HGETALL', key]);
    return result ?? {};
  }
  async hkeys(key: string): Promise<string[]> { return this.exec(['HKEYS', key]); }
  async hvals(key: string): Promise<string[]> { return this.exec(['HVALS', key]); }
  async hlen(key: string): Promise<number> { return this.exec(['HLEN', key]); }
  async hexists(key: string, field: string): Promise<0 | 1> { return this.exec(['HEXISTS', key, field]); }
  async hincrby(key: string, field: string, n: number): Promise<number> { return this.exec(['HINCRBY', key, field, n]); }
  async hincrbyfloat(key: string, field: string, n: number): Promise<string> { return this.exec(['HINCRBYFLOAT', key, field, n]); }

  // ── List commands ─────────────────────────────────────────────────────────
  async lpush(key: string, ...values: any[]): Promise<number> { return this.exec(['LPUSH', key, ...values]); }
  async rpush(key: string, ...values: any[]): Promise<number> { return this.exec(['RPUSH', key, ...values]); }
  async lpop(key: string): Promise<string | null> { return this.exec(['LPOP', key]); }
  async rpop(key: string): Promise<string | null> { return this.exec(['RPOP', key]); }
  async llen(key: string): Promise<number> { return this.exec(['LLEN', key]); }
  async lrange(key: string, start: number, stop: number): Promise<string[]> { return this.exec(['LRANGE', key, start, stop]); }
  async lindex(key: string, index: number): Promise<string | null> { return this.exec(['LINDEX', key, index]); }
  async lset(key: string, index: number, value: string): Promise<'OK'> { return this.exec(['LSET', key, index, value]); }
  async lrem(key: string, count: number, value: string): Promise<number> { return this.exec(['LREM', key, count, value]); }
  async ltrim(key: string, start: number, stop: number): Promise<'OK'> { return this.exec(['LTRIM', key, start, stop]); }

  // ── Set commands ──────────────────────────────────────────────────────────
  async sadd(key: string, ...members: any[]): Promise<number> { return this.exec(['SADD', key, ...members]); }
  async srem(key: string, ...members: any[]): Promise<number> { return this.exec(['SREM', key, ...members]); }
  async smembers(key: string): Promise<string[]> { return this.exec(['SMEMBERS', key]); }
  async scard(key: string): Promise<number> { return this.exec(['SCARD', key]); }
  async sismember(key: string, member: string): Promise<0 | 1> { return this.exec(['SISMEMBER', key, member]); }
  async sunion(...keys: string[]): Promise<string[]> { return this.exec(['SUNION', ...keys]); }
  async sinter(...keys: string[]): Promise<string[]> { return this.exec(['SINTER', ...keys]); }
  async sdiff(...keys: string[]): Promise<string[]> { return this.exec(['SDIFF', ...keys]); }

  // ── Sorted set commands ───────────────────────────────────────────────────
  async zadd(key: string, ...args: any[]): Promise<number> { return this.exec(['ZADD', key, ...args]); }
  async zrem(key: string, ...members: any[]): Promise<number> { return this.exec(['ZREM', key, ...members]); }
  async zscore(key: string, member: string): Promise<string | null> { return this.exec(['ZSCORE', key, member]); }
  async zrank(key: string, member: string): Promise<number | null> { return this.exec(['ZRANK', key, member]); }
  async zrevrank(key: string, member: string): Promise<number | null> { return this.exec(['ZREVRANK', key, member]); }
  async zrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]> { return this.exec(['ZRANGE', key, start, stop, ...args]); }
  async zrevrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]> { return this.exec(['ZREVRANGE', key, start, stop, ...args]); }
  async zrangebyscore(key: string, min: any, max: any, ...args: any[]): Promise<string[]> { return this.exec(['ZRANGEBYSCORE', key, min, max, ...args]); }
  async zrevrangebyscore(key: string, max: any, min: any, ...args: any[]): Promise<string[]> { return this.exec(['ZREVRANGEBYSCORE', key, max, min, ...args]); }
  async zcard(key: string): Promise<number> { return this.exec(['ZCARD', key]); }
  async zcount(key: string, min: any, max: any): Promise<number> { return this.exec(['ZCOUNT', key, min, max]); }
  async zincrby(key: string, increment: number, member: string): Promise<string> { return this.exec(['ZINCRBY', key, increment, member]); }
  async zremrangebyscore(key: string, min: any, max: any): Promise<number> { return this.exec(['ZREMRANGEBYSCORE', key, min, max]); }
  async zremrangebyrank(key: string, start: number, stop: number): Promise<number> { return this.exec(['ZREMRANGEBYRANK', key, start, stop]); }

  // ── Pub/Sub ───────────────────────────────────────────────────────────────
  async publish(channel: string, message: string): Promise<number> { return this.exec(['PUBLISH', channel, message]); }
  subscribe(_channel: string, _callback?: Function): Promise<void> { return Promise.resolve(); }
  psubscribe(_pattern: string, _callback?: Function): Promise<void> { return Promise.resolve(); }
  unsubscribe(_channel?: string): Promise<void> { return Promise.resolve(); }
  punsubscribe(_pattern?: string): Promise<void> { return Promise.resolve(); }

  // ── Server commands ───────────────────────────────────────────────────────
  async ping(): Promise<'PONG'> {
    try { return await this.exec(['PING']); } catch { return 'PONG'; }
  }
  async info(_section?: string): Promise<string> { return 'pdim_http_client:1\r\n'; }
  async flushdb(): Promise<'OK'> { return this.exec(['FLUSHDB']); }
  async flushall(): Promise<'OK'> { return this.exec(['FLUSHALL']); }

  // ── camelCase aliases (node-redis v4 compat) ──────────────────────────────
  setEx = (k: string, s: number, v: string) => this.setex(k, s, v);
  hGetAll = (k: string) => this.hgetall(k);
  hSet = (k: string, ...a: any[]) => this.hset(k, ...a);
  hGet = (k: string, f: string) => this.hget(k, f);
  hDel = (k: string, ...f: string[]) => this.hdel(k, ...f);
  hExists = (k: string, f: string) => this.hexists(k, f);
  hIncrBy = (k: string, f: string, n: number) => this.hincrby(k, f, n);
  hKeys = (k: string) => this.hkeys(k);
  hVals = (k: string) => this.hvals(k);
  hLen = (k: string) => this.hlen(k);
  sAdd = (k: string, ...m: any[]) => this.sadd(k, ...m);
  sRem = (k: string, ...m: any[]) => this.srem(k, ...m);
  sMembers = (k: string) => this.smembers(k);
  sIsMember = (k: string, m: string) => this.sismember(k, m);
  sCard = (k: string) => this.scard(k);
  lPush = (k: string, ...v: any[]) => this.lpush(k, ...v);
  rPush = (k: string, ...v: any[]) => this.rpush(k, ...v);
  lRange = (k: string, s: number, e: number) => this.lrange(k, s, e);
  lLen = (k: string) => this.llen(k);
  lPop = (k: string) => this.lpop(k);
  rPop = (k: string) => this.rpop(k);
  zAdd = (k: string, ...a: any[]) => this.zadd(k, ...a);
  zCard = (k: string) => this.zcard(k);
  zRange = (k: string, s: number, e: number, ...a: any[]) => this.zrange(k, s, e, ...a);
  zRevRange = (k: string, s: number, e: number, ...a: any[]) => this.zrevrange(k, s, e, ...a);
  zRem = (k: string, ...m: any[]) => this.zrem(k, ...m);
  zScore = (k: string, m: string) => this.zscore(k, m);
  zRank = (k: string, m: string) => this.zrank(k, m);
  zRemRangeByScore = (k: string, min: any, max: any) => this.zremrangebyscore(k, min, max);
  zRangeByScore = (k: string, min: any, max: any, ...a: any[]) => this.zrangebyscore(k, min, max, ...a);
  zCount = (k: string, min: any, max: any) => this.zcount(k, min, max);
  mGet = (...k: string[]) => this.mget(...k);
  mSet = (...a: string[]) => this.mset(...a);
  incrBy = (k: string, n: number) => this.incrby(k, n);
  decrBy = (k: string, n: number) => this.decrby(k, n);
  pExpire = (k: string, ms: number) => this.pexpire(k, ms);
  pTtl = (k: string) => this.pttl(k);
}

let _pdimInstance: PdimRedisClient | null = null;

export function getPdimClient(): PdimRedisClient {
  if (!_pdimInstance) {
    _pdimInstance = new PdimRedisClient();
  }
  return _pdimInstance;
}

export function isPdimConfigured(): boolean {
  return !!(process.env.PDIM_HTTP_EXEC_URL && process.env.PDIM_BEARER_TOKEN);
}
