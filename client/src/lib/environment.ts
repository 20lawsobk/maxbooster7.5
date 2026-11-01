// @ts-nocheck
/**
 * Runtime Environment Detection
 *
 * Detects whether the app is running inside Electron (desktop), Capacitor
 * (iOS/Android), or standard web browser, and exposes per-platform capability
 * flags so components can gate native-only features at runtime.
 *
 * All exports are pure functions/constants — no side-effects, safe to call
 * in SSR contexts (window guard included in getEnvironmentType).
 *
 * Key exports:
 *   getEnvironmentType()        → 'electron' | 'web' | 'capacitor'
 *   isElectron()                → boolean
 *   isCapacitor()               → boolean
 *   isWeb()                     → boolean
 *   isNativeApp()               → boolean
 *   getPlatformCapabilities()   → map of feature availability flags
 */

export type EnvironmentType = "electron" | "web" | "capacitor";

export function getEnvironmentType(): EnvironmentType {
  if (typeof window === "undefined") {
    return "web";
  }

  const userAgent = window?.navigator.userAgent?.toLowerCase();

  if (userAgent?.includes("electron")) {
    return "electron";
  }

  if (
    (window as Record<string, unknown>).Capacitor !== undefined ||
    userAgent?.includes("capacitor")
  ) {
    return "capacitor";
  }

  return "web";
}

export function isElectron(): boolean {
  return getEnvironmentType() === "electron";
}

export function isCapacitor(): boolean {
  return getEnvironmentType() === "capacitor";
}

export function isWeb(): boolean {
  return getEnvironmentType() === "web";
}

export function isNativeApp(): boolean {
  const env = getEnvironmentType();
  return env === "electron" || env === "capacitor";
}

export function getPlatformCapabilities() {
  const env = getEnvironmentType();

  return {
    hasFileSystemAccess: env === "electron",
    hasNativeMenus: env === "electron",
    hasSystemNotifications: env === "electron" || env === "capacitor",
    hasDeepLinking: true,
    hasPushNotifications: env === "capacitor",
    hasOfflineSupport: true,
    hasWindowControls: env === "electron",
    hasTouchSupport: env === "capacitor" || "ontouchstart" in window,
  };
}
