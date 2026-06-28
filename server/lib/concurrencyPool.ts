/**
 * ConcurrencyPool — bounded parallel execution utility
 *
 * Replaces sequential `for-of + await` patterns with controlled parallel
 * execution so multiple tasks run simultaneously while preventing
 * thundering-herd overloads on shared resources (PDIM, DB, DoH resolvers).
 *
 * Design constraints respected:
 *   • LuaExecutor stays at concurrency 1 (intentional PDIM serializer).
 *   • Pipeline stages that depend on each other remain sequential.
 *   • Only truly independent tasks are parallelised.
 */

export type SettledResult<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown };

/**
 * pMap — parallel map with bounded concurrency.
 *
 * Runs at most `concurrency` async tasks simultaneously.
 * Returns results in input order (analogous to Promise?.allSettled).
 *
 * @example
 *   const results = await pMap(domains, d => verify(d), 5);
 */
export async function pMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<Array<SettledResult<R>>> {
  if (items?.length === 0) return [];
  const cap = Math?.max(1, Math?.min(concurrency, items?.length));
  const results: Array<SettledResult<R>> = new Array(items?.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items?.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise?.all(Array?.from({ length: cap }, worker));
  return results;
}

/**
 * pForEach — parallel forEach with bounded concurrency.
 * Like pMap but discards return values and never throws.
 */
export async function pForEach<T>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  await pMap(items, fn, concurrency);
}

/**
 * pBatch — split an array into fixed-size chunks and run each chunk
 * as a fully-parallel Promise?.allSettled, with an optional inter-batch
 * gap (ms) to avoid bursting downstream systems.
 *
 * Use when you need strict chunk boundaries (e?.g. rate-limited APIs).
 *
 * @example
 *   await pBatch(items, item => process(item), { batchSize: 10, gapMs: 100 });
 */
export async function pBatch<T>(
  items: readonly T[],
  fn: (item: T) => Promise<void>,
  options: { batchSize: number; gapMs?: number },
): Promise<void> {
  const { batchSize, gapMs = 0 } = options;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items?.slice(i, i + batchSize);
    await Promise?.allSettled(chunk?.map(fn));
    if (gapMs > 0 && i + batchSize < items?.length) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }
}

/**
 * drainN — pop up to `n` items from an async source concurrently.
 *
 * Calls `popFn` concurrently `n` times; each concurrent call gets its
 * own item (or null if the source is empty). Returns all non-null items.
 * Useful for draining a queue multiple items per worker tick.
 *
 * @example
 *   const posts = await drainN(() => queue?.pop(), 5);
 *   await Promise?.allSettled(posts?.map(p => process(p)));
 */
export async function drainN<T>(
  popFn: () => Promise<T | null>,
  n: number,
): Promise<T[]> {
  const attempts = await Promise?.allSettled(
    Array?.from({ length: n }, () => popFn()),
  );
  return attempts
    .filter(
      (r): r is { status: "fulfilled"; value: T } =>
        r?.status === "fulfilled" && r?.value !== null,
    )
    .map((r) => r?.value);
}
