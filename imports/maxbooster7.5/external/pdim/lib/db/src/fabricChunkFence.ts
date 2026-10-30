interface FenceClient {
  query(text: string, values?: string[]): Promise<unknown>;
  on(event: string, handler: (error: Error) => void): unknown;
  removeListener(event: string, handler: (error: Error) => void): unknown;
  release(discard?: boolean): void;
}
interface FencePool {
  connect(): Promise<FenceClient>;
  on(event: string, handler: (error: Error) => void): unknown;
}

/** Works with node-postgres and Neon; explicit transactions also pin PgBouncer. */
export function createFabricChunkFence(source: { options: object; constructor: Function }) {
  let lockPool: FencePool | undefined;
  return async function withFabricChunkLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (!lockPool) {
      const Constructor = source.constructor as new (options: object) => FencePool;
      lockPool = new Constructor({ ...source.options, max: 2, idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000, allowExitOnIdle: true });
      lockPool.on("error", error => console.error("[DB] Idle fabric fence connection lost:", error.message));
    }
    const client = await lockPool.connect();
    let discard = false;
    let fenceError: Error | undefined;
    const onError = (error: Error) => { fenceError = error; discard = true; };
    client.on("error", onError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`fabric-chunk:${id}`]);
      const result = await work();
      if (fenceError) throw fenceError;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { discard = true; }
      throw error;
    } finally {
      client.removeListener("error", onError);
      client.release(discard);
    }
  };
}
