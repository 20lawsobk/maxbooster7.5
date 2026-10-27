/**
 * Do not evict live ownership metadata to make an index write fit.
 * A failed PDIM index write must not be represented as a successful mutation.
 * This guard is transitional until SQL-backed metadata replaces the monolithic index.
 */
export class HybridIndexCapacityError extends Error {
  constructor() {
    super("Hybrid storage ownership index is at capacity; refusing unsafe eviction");
    this.name = "HybridIndexCapacityError";
  }
}

export async function persistHybridIndex(
  entryCount: number,
  maximumEntries: number,
  writeIndex: () => Promise<unknown>,
): Promise<void> {
  if (
    !Number.isSafeInteger(entryCount) ||
    entryCount < 0 ||
    !Number.isSafeInteger(maximumEntries) ||
    maximumEntries < 1 ||
    entryCount > maximumEntries
  ) {
    throw new HybridIndexCapacityError();
  }
  await writeIndex();
}
