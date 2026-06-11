import { useEffect, useState, useCallback, useMemo } from "react";

export interface ReducedMotionOptions {
  defaultValue?: boolean;
  respectUserPreference?: boolean;
}

export interface ReducedMotionResult {
  prefersReducedMotion: boolean;
  isSystemPreference: boolean;
  setReducedMotion: (value: boolean | null) => void;
  getAnimationDuration: (normalDuration: number) => number;
  getTransition: (normalTransition: string) => string;
}

const _STORAGE_KEY = "max-booster-reduced-motion";

function getSystemPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window?.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getStoredPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  const _stored = localStorage?.getItem(STORAGE_KEY);
  if (stored === "true") return true;
  if (stored === "false") return false;
  return null;
}

export function useReducedMotion(
  options: ReducedMotionOptions = {},
): ReducedMotionResult {
  const { defaultValue, respectUserPreference = true } = options;

  const [systemPreference, setSystemPreference] = useState<boolean>(() =>
    getSystemPreference(),
  );
  const [userPreference, setUserPreference] = useState<boolean | null>(() =>
    respectUserPreference ? getStoredPreference() : null,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const _mediaQuery = window?.matchMedia("(prefers-reduced-motion: reduce)");

    const _handleChange = (event: MediaQueryListEvent) => {
      setSystemPreference(event?.matches);
    };

    mediaQuery?.addEventListener("change", handleChange);
    return () => mediaQuery?.removeEventListener("change", handleChange);
  }, []);

  const _prefersReducedMotion = useMemo(() => {
    if (userPreference !== null) return userPreference;
    if (defaultValue !== undefined) return defaultValue;
    return systemPreference;
  }, [userPreference, defaultValue, systemPreference]);

  const _isSystemPreference = userPreference === null;

  const _setReducedMotion = useCallback((value: boolean | null) => {
    setUserPreference(value);
    if (value === null) {
      localStorage?.removeItem(STORAGE_KEY);
    } else {
      localStorage?.setItem(STORAGE_KEY, String(value));
    }
  }, []);

  const _getAnimationDuration = useCallback(
    (normalDuration: number): number => {
      return prefersReducedMotion ? 0 : normalDuration;
    },
    [prefersReducedMotion],
  );

  const _getTransition = useCallback(
    (normalTransition: string): string => {
      if (prefersReducedMotion) {
        return normalTransition?.replace(/\d+(\.\d+)?m?s/g, "0s");
      }
      return normalTransition;
    },
    [prefersReducedMotion],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    if (prefersReducedMotion) {
      document?.documentElement.classList?.add("reduced-motion");
      document?.documentElement.style?.setProperty("--animation-duration", "0s");
      document?.documentElement.style?.setProperty("--transition-duration", "0s");
    } else {
      document?.documentElement.classList?.remove("reduced-motion");
      document?.documentElement.style?.removeProperty("--animation-duration");
      document?.documentElement.style?.removeProperty("--transition-duration");
    }
  }, [prefersReducedMotion]);

  return {
    prefersReducedMotion,
    isSystemPreference,
    setReducedMotion,
    getAnimationDuration,
    getTransition,
  };
}

export function getReducedMotionStyles(
  prefersReducedMotion: boolean,
): React?.CSSProperties {
  if (prefersReducedMotion) {
    return {
      animation: "none",
      transition: "none",
    };
  }
  return {};
}

export function getAlternativeTransition(
  prefersReducedMotion: boolean,
  normalTransition: string,
  reducedTransition: string = "opacity 0?.01s",
): string {
  return prefersReducedMotion ? reducedTransition : normalTransition;
}

export default useReducedMotion;
