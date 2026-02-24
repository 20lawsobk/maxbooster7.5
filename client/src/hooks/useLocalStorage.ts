import { logger } from '../lib/logger';
import { useState, useEffect, useCallback, useRef } from 'react';

type SetValue<T> = T | ((prevValue: T) => T);

export interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  syncTabs?: boolean;
  onError?: (error: Error) => void;
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (value: SetValue<T>) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    syncTabs = true,
    onError,
  } = options;

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? deserializer(item) : initialValue;
    } catch (error) {
      logger.error(`[useLocalStorage] Error reading key "${key}":`, error);
      onError?.(error as Error);
      return initialValue;
    }
  });

  const keyRef = useRef(key);
  keyRef.current = key;

  const setValue = useCallback((value: SetValue<T>) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(keyRef.current, serializer(valueToStore));

      window.dispatchEvent(new StorageEvent('storage', {
        key: keyRef.current,
        newValue: serializer(valueToStore),
      }));
    } catch (error) {
      logger.error(`[useLocalStorage] Error setting key "${keyRef.current}":`, error);
      onError?.(error as Error);
    }
  }, [storedValue, serializer, onError]);

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(keyRef.current);
      setStoredValue(initialValue);
    } catch (error) {
      logger.error(`[useLocalStorage] Error removing key "${keyRef.current}":`, error);
      onError?.(error as Error);
    }
  }, [initialValue, onError]);

  useEffect(() => {
    if (!syncTabs) return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === keyRef.current && event.newValue !== null) {
        try {
          setStoredValue(deserializer(event.newValue));
        } catch (error) {
          logger.error(`[useLocalStorage] Error syncing key "${keyRef.current}":`, error);
          onError?.(error as Error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [syncTabs, deserializer, onError]);

  return [storedValue, setValue, removeValue];
}

export function useLocalStorageObject<T extends Record<string, unknown>>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (updates: Partial<T>) => void, () => void] {
  const [value, setValue, remove] = useLocalStorage<T>(key, initialValue, options);

  const updateValue = useCallback((updates: Partial<T>) => {
    setValue(prev => ({ ...prev, ...updates }));
  }, [setValue]);

  return [value, updateValue, remove];
}

export function useSessionStorage<T>(
  key: string,
  initialValue: T,
  options: Omit<UseLocalStorageOptions<T>, 'syncTabs'> = {}
): [T, (value: SetValue<T>) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    onError,
  } = options;

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.sessionStorage.getItem(key);
      return item ? deserializer(item) : initialValue;
    } catch (error) {
      logger.error(`[useSessionStorage] Error reading key "${key}":`, error);
      onError?.(error as Error);
      return initialValue;
    }
  });

  const keyRef = useRef(key);
  keyRef.current = key;

  const setValue = useCallback((value: SetValue<T>) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.sessionStorage.setItem(keyRef.current, serializer(valueToStore));
    } catch (error) {
      logger.error(`[useSessionStorage] Error setting key "${keyRef.current}":`, error);
      onError?.(error as Error);
    }
  }, [storedValue, serializer, onError]);

  const removeValue = useCallback(() => {
    try {
      window.sessionStorage.removeItem(keyRef.current);
      setStoredValue(initialValue);
    } catch (error) {
      logger.error(`[useSessionStorage] Error removing key "${keyRef.current}":`, error);
      onError?.(error as Error);
    }
  }, [initialValue, onError]);

  return [storedValue, setValue, removeValue];
}

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  storage: 'local' | 'session' = 'local'
): [T, (value: SetValue<T>) => void, () => void] {
  if (storage === 'session') {
    return useSessionStorage(key, initialValue);
  }
  return useLocalStorage(key, initialValue);
}

export default useLocalStorage;
