import { NativeAcmeClient } from "./acmeCrypto.js";

/**
 * Share initialization, not an unregistered client. A failed initialization
 * never enters the cache and the next caller can retry using the persisted key.
 * Account URLs are resolved using that key against the configured directory,
 * never adopted from a global setting belonging to another ACME environment.
 */
export function createAcmeClientProvider(options: {
  directoryUrl: string;
  contactEmail: string;
  loadAccountKey: () => Promise<string>;
  persistAccountUrl: (url: string) => Promise<void>;
  fetchFn?: typeof fetch;
}): () => Promise<NativeAcmeClient> {
  let ready: NativeAcmeClient | undefined;
  let initializing: Promise<NativeAcmeClient> | undefined;

  return async () => {
    if (ready) return ready;
    if (!initializing) {
      initializing = (async () => {
        const accountKeyPem = await options.loadAccountKey();
        const candidate = new NativeAcmeClient({
          directoryUrl: options.directoryUrl,
          accountKeyPem,
          ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
        });
        // newAccount is idempotent for a key, and retrieves its account in
        // THIS directory even after switching between staging and production.
        const accountUrl = await candidate.registerAccount(options.contactEmail);
        await options.persistAccountUrl(accountUrl);
        ready = candidate;
        return candidate;
      })();
    }
    const attempt = initializing;
    try {
      return await attempt;
    } finally {
      if (initializing === attempt) initializing = undefined;
    }
  };
}