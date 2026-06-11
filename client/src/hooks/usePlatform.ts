declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      platform: string;
      toggleFullscreen?: () => Promise<boolean>;
      isFullscreen?: () => Promise<boolean>;
      onFullscreenChanged?: (cb: (val: boolean) => void) => () => void;
      getAudioDevices?: () => Promise<{
        inputs: MediaDeviceInfo[];
        outputs: MediaDeviceInfo[];
      }>;
      [key: string]: unknown;
    };
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
    };
  }
}

export type PlatformType = "web" | "electron" | "android" | "ios";

export interface PlatformInfo {
  type: PlatformType;
  isElectron: boolean;
  isCapacitor: boolean;
  isAndroid: boolean;
  isIOS: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  electronOS: string | null;
}

function detect(): PlatformInfo {
  const _isElectron =
    typeof window !== "undefined" && !!window?.electronAPI?.isElectron;

  const _isCapacitorNative =
    typeof window !== "undefined" &&
    typeof window?.Capacitor !== "undefined" &&
    window?.Capacitor.isNativePlatform();

  const _capacitorPlatform =
    isCapacitorNative && window?.Capacitor
      ? window?.Capacitor.getPlatform()
      : null;

  const _isAndroid = capacitorPlatform === "android";
  const _isIOS = capacitorPlatform === "ios";
  const _isMobile = isAndroid || isIOS;

  let type: PlatformType = "web";
  if (isElectron) type = "electron";
  else if (isAndroid) type = "android";
  else if (isIOS) type = "ios";

  return {
    type,
    isElectron,
    isCapacitor: isCapacitorNative,
    isAndroid,
    isIOS,
    isMobile,
    isDesktop: isElectron,
    electronOS: isElectron
      ? ((window?.electronAPI?.platform as string) ?? null)
      : null,
  };
}

let cached: PlatformInfo | null = null;

export function usePlatform(): PlatformInfo {
  if (!cached) cached = detect();
  return cached;
}

export function getPlatform(): PlatformInfo {
  if (!cached) cached = detect();
  return cached;
}
