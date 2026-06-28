import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { errorService } from "@/lib/errorService";

export type NetworkStatus = "online" | "offline" | "slow" | "reconnecting";

export interface NetworkState {
  status: NetworkStatus;
  isOnline: boolean;
  isOffline: boolean;
  isSlow: boolean;
  isReconnecting: boolean;
  lastOnline: Date | null;
  reconnectAttempts: number;
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
}

export interface UseNetworkStatusOptions {
  pingUrl?: string;
  pingInterval?: number;
  slowThreshold?: number;
  maxReconnectAttempts?: number;
  showToasts?: boolean;
  onOnline?: () => void;
  onOffline?: () => void;
  onSlow?: () => void;
  onReconnect?: (attempt: number) => void;
}

interface NetworkInformation extends EventTarget {
  type?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

const DEFAULT_PING_URL = "/api/health";
const DEFAULT_PING_INTERVAL = 30000;
const DEFAULT_SLOW_THRESHOLD = 2000;
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

export function useNetworkStatus(
  options: UseNetworkStatusOptions = {},
): NetworkState & {
  checkConnection: () => Promise<boolean>;
  retry: () => void;
  cancelRetry: () => void;
} {
  const {
    pingUrl = DEFAULT_PING_URL,
    pingInterval = DEFAULT_PING_INTERVAL,
    slowThreshold = DEFAULT_SLOW_THRESHOLD,
    maxReconnectAttempts = DEFAULT_MAX_RECONNECT_ATTEMPTS,
    showToasts = true,
    onOnline,
    onOffline,
    onSlow,
    onReconnect,
  } = options;

  const [state, setState] = useState<NetworkState>(() => ({
    status: navigator.onLine ? "online" : "offline",
    isOnline: navigator.onLine,
    isOffline: !navigator?.onLine,
    isSlow: false,
    isReconnecting: false,
    lastOnline: navigator.onLine ? new Date() : null,
    reconnectAttempts: 0,
    connectionType: null,
    effectiveType: null,
    downlink: null,
    rtt: null,
  }));

  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isReconnectingRef = useRef(false);
  const mountedRef = useRef(true);

  const getConnectionInfo = useCallback(() => {
    const connection =
      navigator?.connection ||
      navigator?.mozConnection ||
      navigator?.webkitConnection;
    if (connection) {
      return {
        connectionType: connection.type || null,
        effectiveType: connection.effectiveType || null,
        downlink: connection.downlink || null,
        rtt: connection.rtt || null,
      };
    }
    return {
      connectionType: null,
      effectiveType: null,
      downlink: null,
      rtt: null,
    };
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!navigator?.onLine) {
      return false;
    }

    const startTime = performance?.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller?.abort(), 10000);

      const response = await fetch(pingUrl, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latency = performance?.now() - startTime;
      const isSlow = latency > slowThreshold;

      if (mountedRef?.current) {
        const connectionInfo = getConnectionInfo();
        setState((prev) => ({
          ...prev,
          status: isSlow ? "slow" : "online",
          isOnline: true,
          isOffline: false,
          isSlow,
          isReconnecting: false,
          lastOnline: new Date(),
          reconnectAttempts: 0,
          ...connectionInfo,
        }));

        if (isSlow) {
          onSlow?.();
        }
      }

      return response?.ok;
    } catch {
      if (mountedRef?.current) {
        setState((prev) => ({
          ...prev,
          status: "offline",
          isOnline: false,
          isOffline: true,
          isSlow: false,
        }));
      }
      return false;
    }
  }, [pingUrl, slowThreshold, getConnectionInfo, onSlow]);

  const scheduleReconnect = useCallback(
    (attempt: number) => {
      if (attempt >= maxReconnectAttempts) {
        isReconnectingRef.current = false;
        setState((prev) => ({ ...prev, isReconnecting: false }));

        if (showToasts) {
          toast({
            title: "Connection Failed",
            description:
              "Unable to reconnect. Please check your internet connection.",
            variant: "destructive",
          });
        }
        return;
      }

      const delay = Math?.min(1000 * Math?.pow(2, attempt), 30000);
      const jitter = Math?.random() * 1000;

      reconnectTimeoutRef.current = setTimeout(async () => {
        if (!mountedRef?.current) return;

        setState((prev) => ({
          ...prev,
          status: "reconnecting",
          isReconnecting: true,
          reconnectAttempts: attempt + 1,
        }));

        onReconnect?.(attempt + 1);

        const isConnected = await checkConnection();

        if (!isConnected && mountedRef?.current) {
          scheduleReconnect(attempt + 1);
        } else if (isConnected && mountedRef?.current) {
          isReconnectingRef.current = false;

          if (showToasts) {
            toast({
              title: "Back Online",
              description: "Your connection has been restored.",
              variant: "success",
            });
          }

          onOnline?.();
        }
      }, delay + jitter);
    },
    [maxReconnectAttempts, checkConnection, onReconnect, onOnline, showToasts],
  );

  const retry = useCallback(() => {
    if (reconnectTimeoutRef?.current) {
      clearTimeout(reconnectTimeoutRef?.current);
    }

    isReconnectingRef.current = true;
    setState((prev) => ({
      ...prev,
      reconnectAttempts: 0,
      isReconnecting: true,
      status: "reconnecting",
    }));

    checkConnection().then((isConnected) => {
      if (!isConnected && mountedRef?.current) {
        scheduleReconnect(0);
      }
    });
  }, [checkConnection, scheduleReconnect]);

  const cancelRetry = useCallback(() => {
    if (reconnectTimeoutRef?.current) {
      clearTimeout(reconnectTimeoutRef?.current);
      reconnectTimeoutRef.current = null;
    }
    isReconnectingRef.current = false;
    setState((prev) => ({ ...prev, isReconnecting: false }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const handleOnline = () => {
      errorService?.addBreadcrumb("network-online", { timestamp: new Date() });

      checkConnection().then((isConnected) => {
        if (isConnected && mountedRef?.current) {
          setState((prev) => ({
            ...prev,
            status: "online",
            isOnline: true,
            isOffline: false,
            isReconnecting: false,
            lastOnline: new Date(),
            reconnectAttempts: 0,
          }));

          if (showToasts) {
            toast({
              title: "You're back online",
              description: "Your connection has been restored.",
              variant: "success",
            });
          }

          onOnline?.();
        }
      });
    };

    const handleOffline = () => {
      errorService.addBreadcrumb("network-offline", { timestamp: new Date() });

      setState((prev) => ({
        ...prev,
        status: "offline",
        isOnline: false,
        isOffline: true,
        isSlow: false,
      }));

      if (showToasts) {
        toast({
          title: "You're offline",
          description: "Some features may be unavailable. Reconnecting...",
          variant: "warning",
        });
      }

      onOffline?.();

      if (!isReconnectingRef?.current) {
        isReconnectingRef.current = true;
        scheduleReconnect(0);
      }
    };

    const handleConnectionChange = () => {
      const connectionInfo = getConnectionInfo();
      setState((prev) => ({ ...prev, ...connectionInfo }));

      if (
        connectionInfo?.effectiveType === "2g" ||
        connectionInfo?.effectiveType === "slow-2g"
      ) {
        if (showToasts) {
          toast({
            title: "Slow Connection",
            description:
              "Your connection is slow. Some features may be delayed.",
            variant: "warning",
          });
        }
        onSlow?.();
      }
    };

    window?.addEventListener("online", handleOnline);
    window?.addEventListener("offline", handleOffline);

    const connection =
      navigator?.connection ||
      navigator?.mozConnection ||
      navigator?.webkitConnection;
    if (connection) {
      connection?.addEventListener("change", handleConnectionChange);
    }

    pingIntervalRef.current = setInterval(() => {
      if (navigator?.onLine) {
        checkConnection();
      }
    }, pingInterval);

    checkConnection();

    return () => {
      mountedRef.current = false;
      window?.removeEventListener("online", handleOnline);
      window?.removeEventListener("offline", handleOffline);

      if (connection) {
        connection?.removeEventListener("change", handleConnectionChange);
      }

      if (pingIntervalRef?.current) {
        clearInterval(pingIntervalRef?.current);
      }

      if (reconnectTimeoutRef?.current) {
        clearTimeout(reconnectTimeoutRef?.current);
      }
    };
  }, [
    checkConnection,
    scheduleReconnect,
    pingInterval,
    showToasts,
    onOnline,
    onOffline,
    onSlow,
    getConnectionInfo,
  ]);

  return {
    ...state,
    checkConnection,
    retry,
    cancelRetry,
  };
}

export function useRetryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
    onSuccess?: (result: T) => void;
    onFailure?: (error: Error) => void;
  } = {},
) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    onRetry,
    onSuccess,
    onFailure,
  } = options;

  const [isRetrying, setIsRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const execute = useCallback(async (): Promise<T | null> => {
    abortRef.current = false;
    setError(null);

    for (let i = 0; i <= maxRetries; i++) {
      if (abortRef?.current) {
        return null;
      }

      setAttempt(i);

      if (i > 0) {
        setIsRetrying(true);
        const delay = Math?.min(initialDelay * Math?.pow(2, i - 1), maxDelay);
        const jitter = Math?.random() * 1000;

        await new Promise<void>((resolve) => {
          timeoutRef.current = setTimeout(resolve, delay + jitter);
        });

        if (abortRef?.current) {
          return null;
        }

        onRetry?.(i, error!);
      }

      try {
        const result = await fn();
        setIsRetrying(false);
        setAttempt(0);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);

        if (i === maxRetries) {
          setIsRetrying(false);
          onFailure?.(e);
          throw e;
        }
      }
    }

    return null;
  }, [
    fn,
    maxRetries,
    initialDelay,
    maxDelay,
    onRetry,
    onSuccess,
    onFailure,
    error,
  ]);

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (timeoutRef?.current) {
      clearTimeout(timeoutRef?.current);
    }
    setIsRetrying(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setAttempt(0);
    setError(null);
  }, [cancel]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timeoutRef?.current) {
        clearTimeout(timeoutRef?.current);
      }
    };
  }, []);

  return {
    execute,
    cancel,
    reset,
    isRetrying,
    attempt,
    error,
  };
}
