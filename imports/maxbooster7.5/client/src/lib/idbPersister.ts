/**
 * IndexedDB-backed async storage adapter for React Query persistence.
 * Unlike the sync localStorage persister, this never blocks the main thread.
 */
import { openDB, type IDBPDatabase } from "idb";
import { offlineIdentity, assertOfflineIdentity } from "./offline/identity";
import type { Persister, PersistedClient } from "@tanstack/react-query-persist-client";

const DB_NAME = "mb-query-cache";
const DB_VER = 1;
const STORE = "cache";

let db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VER, {
    upgrade(db) {
      if (!db?.objectStoreNames.contains(STORE)) {
        db?.createObjectStore(STORE);
      }
    },
  });
  return db;
}

export async function clearPrivateQueryCache(): Promise<void> {
  await (await getDB()).clear(STORE);
  // This legacy DB contains expendable response caches, not drafts/outboxes.
  // Never adopt its ownerless records into an authenticated namespace.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("max-booster-offline-cache");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Legacy cache deletion failed"));
    request.onblocked = () => reject(new Error("Close older Max Booster tabs to finish legacy private-cache cleanup"));
  });
}

/** The owner/epoch is captured before throttling, never inferred at flush. */
export function createAccountPersister(identity: ReturnType<typeof offlineIdentity>): Persister & { dispose(): void; activate(): void } {
  if (!identity.owner) throw new Error("Account persistence requires verified identity");
  const key = `${identity.owner}:mb-v4`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    clearTimeout(timer);
    window.removeEventListener("offline-identity-change", dispose);
  };
  return {
    dispose,
    activate() {
      assertOfflineIdentity(identity);
      disposed = false;
      window.addEventListener("offline-identity-change", dispose);
    },
    persistClient(client: PersistedClient) {
      clearTimeout(timer);
      if (disposed) return;
      // Capture both data and owner now. JSON serialization also prevents a
      // later mutable query-state change from entering this queued snapshot.
      const envelope = JSON.stringify({ owner: identity.owner, client });
      timer = setTimeout(() => {
        void (async () => {
          if (disposed) return;
          const database = await getDB();
          assertOfflineIdentity(identity);
          if (!disposed) await database.put(STORE, envelope, key);
        })().catch(error => {
          // Expendable read-cache failure, never a promise that edits persisted.
          window.dispatchEvent(new CustomEvent("offline-cache-error", { detail: error }));
        });
      }, 2000);
    },
    async restoreClient() {
      const database = await getDB();
      const serialized = await database.get(STORE, key);
      assertOfflineIdentity(identity);
      if (disposed || !serialized) return undefined;
      const envelope = JSON.parse(serialized);
      if (envelope.owner !== identity.owner) throw new Error("Cached account identity mismatch");
      const client = envelope.client as PersistedClient;
      // Authentication can never be established or replaced by persistence.
      client.clientState.queries = client.clientState.queries.filter(query =>
        query.queryKey[0] !== "/api/auth/me");
      client.clientState.mutations = [];
      return client;
    },
    async removeClient() {
      clearTimeout(timer);
      await (await getDB()).delete(STORE, key);
    },
  };
}
