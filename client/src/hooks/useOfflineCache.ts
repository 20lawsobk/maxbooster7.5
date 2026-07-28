import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import {
  offlineCache,
  CacheEntry,
  CacheCategory,
  CacheOptions,
} from "@/lib/offline";

export interface UseOfflineCacheReturn<T = unknown> {
  data: T | null;
  isLoading: boolean;
  isCached: boolean;
  cacheMetadata: CacheEntry<T> | null;
  error: Error | null;
  refresh: () => Promise<void>;
  invalidate: () => Promise<void>;
  set: (data: T, options?: CacheOptions) => Promise<void>;
}

export interface UseOfflineCacheOptions {
  category?: CacheCategory;
  ttlMs?: number;
  fetchOnMount?: boolean;
  fetcher?: () => Promise<unknown>;
  onCacheHit?: (data: unknown) => void;
  onCacheMiss?: () => void;
  staleWhileRevalidate?: boolean;
}

export function useOfflineCache<T = unknown>(
  key: string,
  options: UseOfflineCacheOptions = {},
): UseOfflineCacheReturn<T> {
  const {
    category = "general",
    ttlMs,
    fetchOnMount = true,
    fetcher,
    onCacheHit,
    onCacheMiss,
    staleWhileRevalidate = true,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCached, setIsCached] = useState(false);
  const [cacheMetadata, setCacheMetadata] = useState<CacheEntry<T> | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);

  const loadFromCache = useCallback(async (): Promise<T | null> => {
    try {
      const cached = await offlineCache?.getWithMetadata<T>(key);
      if (cached) {
        setData(cached?.data);
        setCacheMetadata(cached);
        setIsCached(true);
        onCacheHit?.(cached?.data);
        return cached?.data;
      }
      onCacheMiss?.();
      return null;
    } catch (err) {
      logger.error("[useOfflineCache] Failed to load from cache:", err);
      return null;
    }
  }, [key, onCacheHit, onCacheMiss]);

  const fetchAndCache = useCallback(async (): Promise<void> => {
    if (!fetcher) return;

    try {
      setIsLoading(true);
      const freshData = await fetcher();
      await offlineCache?.set(key, freshData, { category, ttlMs });
      setData(freshData as T);
      setIsCached(true);
      setError(null);
    } catch (err) {
      setError(err as Error);
      logger.error("[useOfflineCache] Failed to fetch:", err);
    } finally {
      setIsLoading(false);
    }
  }, [key, fetcher, category, ttlMs]);

  const refresh = useCallback(async (): Promise<void> => {
    if (staleWhileRevalidate) {
      await loadFromCache();
      await fetchAndCache();
    } else {
      setIsLoading(true);
      await fetchAndCache();
    }
  }, [staleWhileRevalidate, loadFromCache, fetchAndCache]);

  const invalidate = useCallback(async (): Promise<void> => {
    try {
      await offlineCache?.delete(key);
      setData(null);
      setIsCached(false);
      setCacheMetadata(null);
    } catch (err) {
      logger.error("[useOfflineCache] Failed to invalidate:", err);
    }
  }, [key]);

  const set = useCallback(
    async (newData: T, cacheOptions?: CacheOptions): Promise<void> => {
      try {
        const entry = await offlineCache?.set(key, newData, {
          category,
          ttlMs,
          ...cacheOptions,
        });
        setData(newData);
        setCacheMetadata(entry as CacheEntry<T>);
        setIsCached(true);
      } catch (err) {
        logger.error("[useOfflineCache] Failed to set cache:", err);
      }
    },
    [key, category, ttlMs],
  );

  useEffect(() => {
    if (!fetchOnMount) {
      setIsLoading(false);
      return;
    }

    const init = async () => {
      setIsLoading(true);
      const cached = await loadFromCache();

      if (cached && !staleWhileRevalidate) {
        setIsLoading(false);
        return;
      }

      if (fetcher && (staleWhileRevalidate || !cached)) {
        await fetchAndCache();
      } else {
        setIsLoading(false);
      }
    };

    init();
  }, [
    fetchOnMount,
    staleWhileRevalidate,
    loadFromCache,
    fetchAndCache,
    fetcher,
  ]);

  return {
    data,
    isLoading,
    isCached,
    cacheMetadata,
    error,
    refresh,
    invalidate,
    set,
  };
}

export function useOfflineCacheCategory(category: CacheCategory) {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadEntries = useCallback(async () => {
    setIsLoading(true);
    try {
      const categoryEntries = await offlineCache?.getByCategory(category);
      setEntries(categoryEntries);
    } catch (err) {
      logger.error("[useOfflineCacheCategory] Failed to load:", err);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  const invalidateAll = useCallback(async () => {
    await offlineCache?.invalidateCategory(category);
    setEntries([]);
  }, [category]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  return {
    entries,
    isLoading,
    refresh: loadEntries,
    invalidateAll,
  };
}

export function useOfflineCacheStats() {
  const [stats, setStats] = useState<{
    totalEntries: number;
    totalSize: number;
    byCategory: Record<CacheCategory, { count: number; size: number }>;
    hitRate: number;
  } | null>(null);

  const loadStats = useCallback(async () => {
    const s = await offlineCache?.getStats();
    setStats(s);
  }, []);

  const clearAll = useCallback(async () => {
    await offlineCache?.clear();
    await loadStats();
  }, [loadStats]);

  const cleanupExpired = useCallback(async () => {
    await offlineCache?.cleanupExpired();
    await loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    refresh: loadStats,
    clearAll,
    cleanupExpired,
  };
}

export default useOfflineCache;
