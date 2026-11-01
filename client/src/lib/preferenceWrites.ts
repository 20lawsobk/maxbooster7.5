import { apiRequest } from "./queryClient";
import { offlineIdentity, assertOfflineIdentity } from "./offline/identity";

// All appearance/preferences controls share one ordered transport. The server
// merges a JSON object, so different-key writes must also be ordered.
let tail: Promise<unknown> = Promise.resolve();
let pending = 0;
export function preferencesPending() { return pending > 0; }
export function writePreference(key: string, value: unknown): Promise<void> {
  const identity = offlineIdentity();
  pending++;
  const operation = tail.then(async () => {
    assertOfflineIdentity(identity);
    await apiRequest("PUT", "/api/auth/preferences", { [key]: value });
    assertOfflineIdentity(identity);
  });
  tail = operation.catch(() => undefined);
  return operation.finally(() => { pending--; });
}