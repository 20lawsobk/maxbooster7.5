import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="max-booster-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

export function useTheme(): ThemeContextType {
  const { theme, resolvedTheme, setTheme } = useNextTheme();
  
  return {
    theme: (theme || 'system') as Theme,
    resolvedTheme: (resolvedTheme || 'light') as 'light' | 'dark',
    setTheme: setTheme as (theme: Theme) => void,
  };
}
