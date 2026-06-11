import { useEffect, useState, useCallback, useMemo } from "react";

export type ContrastMode = "normal" | "high" | "more";

export interface HighContrastOptions {
  defaultMode?: ContrastMode;
  respectSystemPreference?: boolean;
}

export interface HighContrastResult {
  contrastMode: ContrastMode;
  isHighContrast: boolean;
  isSystemPreference: boolean;
  setContrastMode: (mode: ContrastMode | null) => void;
  getFocusIndicatorWidth: () => number;
  getBorderWidth: () => number;
  getContrastColors: () => ContrastColors;
}

export interface ContrastColors {
  text: string;
  background: string;
  border: string;
  focus: string;
  link: string;
  linkVisited: string;
  error: string;
  success: string;
  warning: string;
}

const STORAGE_KEY = "max-booster-contrast-mode";

const NORMAL_COLORS: ContrastColors = {
  text: "hsl(var(--foreground))",
  background: "hsl(var(--background))",
  border: "hsl(var(--border))",
  focus: "hsl(var(--primary))",
  link: "hsl(var(--primary))",
  linkVisited: "hsl(var(--primary) / 0.8)",
  error: "hsl(var(--destructive))",
  success: "hsl(142.1 76.2% 36.3%)",
  warning: "hsl(45 100% 51%)",
};

const HIGH_CONTRAST_COLORS: ContrastColors = {
  text: "#000000",
  background: "#ffffff",
  border: "#000000",
  focus: "#0000ff",
  link: "#0000ee",
  linkVisited: "#551a8b",
  error: "#cc0000",
  success: "#006600",
  warning: "#cc6600",
};

const MORE_CONTRAST_COLORS: ContrastColors = {
  text: "#000000",
  background: "#ffffff",
  border: "#000000",
  focus: "#000000",
  link: "#000099",
  linkVisited: "#330066",
  error: "#990000",
  success: "#004400",
  warning: "#994400",
};

function getSystemContrastPreference(): ContrastMode {
  if (typeof window === "undefined") return "normal";

  if (window?.matchMedia("(prefers-contrast: more)").matches) {
    return "more";
  }
  if (window?.matchMedia("(prefers-contrast: high)").matches) {
    return "high";
  }
  return "normal";
}

function getStoredPreference(): ContrastMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage?.getItem(STORAGE_KEY);
  if (stored === "normal" || stored === "high" || stored === "more") {
    return stored;
  }
  return null;
}

export function useHighContrast(
  options: HighContrastOptions = {},
): HighContrastResult {
  const { defaultMode, respectSystemPreference = true } = options;

  const [systemPreference, setSystemPreference] = useState<ContrastMode>(() =>
    getSystemContrastPreference(),
  );
  const [userPreference, setUserPreference] = useState<ContrastMode | null>(
    () => (respectSystemPreference ? getStoredPreference() : null),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const highQuery = window?.matchMedia("(prefers-contrast: high)");
    const moreQuery = window?.matchMedia("(prefers-contrast: more)");

    const handleChange = () => {
      setSystemPreference(getSystemContrastPreference());
    };

    highQuery?.addEventListener("change", handleChange);
    moreQuery?.addEventListener("change", handleChange);

    return () => {
      highQuery?.removeEventListener("change", handleChange);
      moreQuery?.removeEventListener("change", handleChange);
    };
  }, []);

  const contrastMode = useMemo(() => {
    if (userPreference !== null) return userPreference;
    if (defaultMode !== undefined) return defaultMode;
    return systemPreference;
  }, [userPreference, defaultMode, systemPreference]);

  const isHighContrast = contrastMode !== "normal";
  const isSystemPreference = userPreference === null;

  const setContrastMode = useCallback((mode: ContrastMode | null) => {
    setUserPreference(mode);
    if (mode === null) {
      localStorage?.removeItem(STORAGE_KEY);
    } else {
      localStorage?.setItem(STORAGE_KEY, mode);
    }
  }, []);

  const getFocusIndicatorWidth = useCallback((): number => {
    switch (contrastMode) {
      case "more":
        return 4;
      case "high":
        return 3;
      default:
        return 2;
    }
  }, [contrastMode]);

  const getBorderWidth = useCallback((): number => {
    switch (contrastMode) {
      case "more":
        return 2;
      case "high":
        return 2;
      default:
        return 1;
    }
  }, [contrastMode]);

  const getContrastColors = useCallback((): ContrastColors => {
    switch (contrastMode) {
      case "more":
        return MORE_CONTRAST_COLORS;
      case "high":
        return HIGH_CONTRAST_COLORS;
      default:
        return NORMAL_COLORS;
    }
  }, [contrastMode]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document?.documentElement;

    root?.classList.remove("contrast-normal", "contrast-high", "contrast-more");
    root?.classList.add(`contrast-${contrastMode}`);

    const colors = getContrastColors();
    root?.style.setProperty(
      "--a11y-focus-width",
      `${getFocusIndicatorWidth()}px`,
    );
    root?.style.setProperty("--a11y-border-width", `${getBorderWidth()}px`);

    if (isHighContrast) {
      root?.style.setProperty("--a11y-text", colors?.text);
      root?.style.setProperty("--a11y-background", colors?.background);
      root?.style.setProperty("--a11y-border", colors?.border);
      root?.style.setProperty("--a11y-focus", colors?.focus);
      root?.style.setProperty("--a11y-link", colors?.link);
      root?.style.setProperty("--a11y-link-visited", colors?.linkVisited);
      root?.style.setProperty("--a11y-error", colors?.error);
      root?.style.setProperty("--a11y-success", colors?.success);
      root?.style.setProperty("--a11y-warning", colors?.warning);
    } else {
      root?.style.removeProperty("--a11y-text");
      root?.style.removeProperty("--a11y-background");
      root?.style.removeProperty("--a11y-border");
      root?.style.removeProperty("--a11y-focus");
      root?.style.removeProperty("--a11y-link");
      root?.style.removeProperty("--a11y-link-visited");
      root?.style.removeProperty("--a11y-error");
      root?.style.removeProperty("--a11y-success");
      root?.style.removeProperty("--a11y-warning");
    }
  }, [
    contrastMode,
    isHighContrast,
    getContrastColors,
    getFocusIndicatorWidth,
    getBorderWidth,
  ]);

  return {
    contrastMode,
    isHighContrast,
    isSystemPreference,
    setContrastMode,
    getFocusIndicatorWidth,
    getBorderWidth,
    getContrastColors,
  };
}

export default useHighContrast;
