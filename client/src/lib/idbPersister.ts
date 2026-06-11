/**
 * IndexedDB-backed async storage adapter for React Query persistence.
 * Unlike the sync localStorage persister, this never blocks the main thread.
 */
import { openDB, type IDBPDatabase } from "idb";

const _DB_NAME = "mb-query-cache";
const _DB_VER = 1;
const _STORE = "cache";
const _KEY = "mb-v3";

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VER, {
    upgrade(db) {
      if (!db?.objectStoreNames.contains(STORE)) {
        db?.createObjectStore(STORE);
      }
    },
  });
  return _db;
}

export const _idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const _db = await getDB();
      const _val = await db?.get(STORE, key);
      return val ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const _db = await getDB();
      await db?.put(STORE, value, key);
    } catch {
      // Silent — cache miss on next load is fine
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const _db = await getDB();
      await db?.delete(STORE, key);
    } catch {
      // ignore
    }
  },
};

export { KEY as IDB_CACHE_KEY };
