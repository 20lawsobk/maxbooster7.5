// Identity is established only by AuthProvider, never by a persisted query.
let owner: string | null = null;
let epoch = 0;
export function offlineIdentity() { return { owner, epoch }; }
export function setOfflineIdentity(next: string | null) {
  if (next !== owner) {
    owner = next;
    epoch++;
    window.dispatchEvent(new Event("offline-identity-change"));
  }
}
export function accountDatabase(base: string): string {
  if (!owner) throw new Error("Sign in before accessing private offline storage");
  return `${base}:account:${encodeURIComponent(owner)}`;
}
export function assertOfflineIdentity(expected: ReturnType<typeof offlineIdentity>) {
  if (!owner || owner !== expected.owner || epoch !== expected.epoch) {
    throw new Error("Account changed during offline operation");
  }
}

/** Fence every IDB result, including list/stat readers and transaction stores. */
export function guardDatabase<T extends object>(database: T, identity = offlineIdentity()): T {
  const fence = (target: object): object => new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key, object);
      if (key === "done" && value?.then) return value.then((result: unknown) => {
        assertOfflineIdentity(identity); return result;
      });
      if (key === "store" && value) return fence(value);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        assertOfflineIdentity(identity);
        const result = value.apply(object, args);
        if (key === "transaction" || key === "objectStore") return fence(result);
        if (result?.then) return result.then((data: unknown) => {
          assertOfflineIdentity(identity); return data;
        });
        assertOfflineIdentity(identity);
        return result;
      };
    },
  });
  return fence(database) as T;
}