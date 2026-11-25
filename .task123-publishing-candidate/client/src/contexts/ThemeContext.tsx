import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

import { writePreference } from "@/lib/preferenceWrites";
import { toast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { offlineIdentity, assertOfflineIdentity } from "@/lib/offline/identity";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isSavingTheme: boolean;
  acceptAccountTheme: (owner: string | null, theme?: string, hydrated?: boolean) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const STORAGE_KEY = "max-booster-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function getStoredTheme(): Theme {
  if (typeof window !== "undefined") {
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* Theme still works without persistence. */ }
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  }
  return "dark";
}

function applyTheme(resolvedTheme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolvedTheme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [themeWrites, setThemeWrites] = useState(0);
  const migrationAttempted = useRef(new Set<string>());
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    const stored = getStoredTheme();
    return stored === "system" ? getSystemTheme() : stored;
  });

  useEffect(() => {
    const newResolved = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(newResolved);
    applyTheme(newResolved);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      const newResolved = e.matches ? "dark" : "light";
      setResolvedTheme(newResolved);
      applyTheme(newResolved);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    if (account) {
      const identity = offlineIdentity();
      setThemeWrites(count => count + 1);
      // Server-authoritative: no success-looking appearance before persistence.
      void writePreference("theme", newTheme).then(() => {
        assertOfflineIdentity(identity);
        setThemeState(newTheme);
        queryClient.invalidateQueries({ queryKey: ["/api/auth/preferences"] });
      }).catch(() => toast({
        title: "Appearance was not saved",
        description: "Check your connection and try again.",
        variant: "destructive",
      })).finally(() => setThemeWrites(count => count - 1));
      return;
    }
    setThemeState(newTheme);
    try { localStorage.setItem(STORAGE_KEY, newTheme); } catch { /* In-memory appearance remains usable. */ }
  };

  const acceptAccountTheme = (owner: string | null, saved?: string, hydrated = false) => {
    setAccount(owner);
    if (!owner) setThemeState(getStoredTheme());
    else if (saved === "light" || saved === "dark" || saved === "system") setThemeState(saved);
    else if (hydrated && saved == null && !migrationAttempted.current.has(owner)) {
      migrationAttempted.current.add(owner);
      const local = getStoredTheme();
      const identity = offlineIdentity();
      setThemeWrites(count => count + 1);
      void writePreference("theme", local).then(() => {
        assertOfflineIdentity(identity);
        setThemeState(local);
        return queryClient.invalidateQueries({ queryKey: ["/api/auth/preferences"] });
      }).catch(() => toast({
        title: "Appearance preference was not saved",
        description: "Choose your theme again when connected to save it to this account.",
        variant: "destructive",
      })).finally(() => setThemeWrites(count => count - 1));
    }
  };

  const toggleTheme = () => {
    const next: Theme =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme, acceptAccountTheme, isSavingTheme: themeWrites > 0 }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
