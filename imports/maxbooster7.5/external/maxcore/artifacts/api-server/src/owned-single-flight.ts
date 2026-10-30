/** Coalesce work per process identity; old completions cannot clear new work. */
export function ownedSingleFlight<Owner, Result>(
  owner: () => Owner,
  work: (current: Owner) => Promise<Result>,
): () => Promise<Result> {
  const pending = new Map<Owner, Promise<Result>>();
  return () => {
    const current = owner();
    const existing = pending.get(current);
    if (existing) return existing;
    const operation = Promise.resolve().then(() => work(current));
    const tracked = operation.finally(() => {
      if (pending.get(current) === tracked) pending.delete(current);
    });
    pending.set(current, tracked);
    return tracked;
  };
}