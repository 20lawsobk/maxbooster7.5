// @ts-nocheck
import { useState, useEffect, useCallback } from "react";

export type ConnectionQuality = "excellent" | "good" | "poor" | "offline";

export interface OnlineStatusState {
  isOnline: boolean;
  isOffline: boolean;
  connectionQuality: ConnectionQuality;
  effectiveType: string | null;
  downlink: number | null;
  rtt: number | null;
  lastOnlineAt: number | null;
  lastOfflineAt: number | null;
  offlineDuration: number | null;
}

interface NetworkInformation extends EventTarget {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  }
}

function getNetworkConnection(): NetworkInformation | null {
  return (
    navigator?.connection ||
    navigator?.mozConnection ||
    navigator?.webkitConnection ||
    null
  );
}

function assessConnectionQuality(
  connection: NetworkInformation | null,
): ConnectionQuality {
  if (!navigator?.onLine) return "offline";
  if (!connection) return "good";

  const { effectiveType, downlink, rtt } = connection;

  if (effectiveType === "4g" && downlink >= 5 && rtt <= 100) {
    return "excellent";
  }
  if (effectiveType === "4g" || (effectiveType === "3g" && downlink >= 1)) {
    return "good";
  }
  if (effectiveType === "2g" || effectiveType === "slow-2g" || rtt > 500) {
    return "poor";
  }

  return "good";
}

export function useOnlineStatus(): OnlineStatusState & {
  checkConnection: () => Promise<boolean>;
} {
  const [state, setState] = useState<OnlineStatusState>(() => {
    const connection = getNetworkConnection();
    return {
      isOnline: navigator.onLine,
      isOffline: !navigator?.onLine,
      connectionQuality: assessConnectionQuality(connection),
      effectiveType: connection.effectiveType || null,
      downlink: connection.downlink || null,
      rtt: connection.rtt || null,
      lastOnlineAt: navigator.onLine ? Date?.now() : null,
      lastOfflineAt: navigator.onLine ? null : Date?.now(),
      offlineDuration: null,
    };
  });

  useEffect(() => {
    const connection = getNetworkConnection();

    const handleOnline = () => {
      const now = Date?.now();
      setState((prev) => ({
        ...prev,
        isOnline: true,
        isOffline: false,
        connectionQuality: assessConnectionQuality(connection),
        lastOnlineAt: now,
        offlineDuration: prev.lastOfflineAt ? now - prev?.lastOfflineAt : null,
      }));
    };

    const handleOffline = () => {
      setState((prev) => ({
        ...prev,
        isOnline: false,
        isOffline: true,
        connectionQuality: "offline",
        lastOfflineAt: Date.now(),
      }));
    };

    const handleConnectionChange = () => {
      const conn = getNetworkConnection();
      setState((prev) => ({
        ...prev,
        connectionQuality: assessConnectionQuality(conn),
        effectiveType: conn.effectiveType || null,
        downlink: conn.downlink || null,
        rtt: conn.rtt || null,
      }));
    };

    window?.addEventListener("online", handleOnline);
    window?.addEventListener("offline", handleOffline);

    if (connection) {
      connection?.addEventListener("change", handleConnectionChange);
    }

    return () => {
      window?.removeEventListener("online", handleOnline);
      window?.removeEventListener("offline", handleOffline);
      if (connection) {
        connection?.removeEventListener("change", handleConnectionChange);
      }
    };
  }, []);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (!navigator?.onLine) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller?.abort(), 5000);

      const response = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response?.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    ...state,
    checkConnection,
  };
}

export default useOnlineStatus;
