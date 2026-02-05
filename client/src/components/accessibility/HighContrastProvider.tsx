import React, { createContext, useContext, type ReactNode, useMemo, useCallback, useEffect } from 'react';
import { useHighContrast, type HighContrastResult, type ContrastMode, type ContrastColors } from '@/hooks/useHighContrast';

export interface HighContrastContextValue extends HighContrastResult {
  enhancedFocusStyle: React.CSSProperties;
  enhancedBorderStyle: React.CSSProperties;
  getTextColor: () => string;
  getBackgroundColor: () => string;
  getBorderColor: () => string;
  getLinkColor: () => string;
}

const HighContrastContext = createContext<HighContrastContextValue | undefined>(undefined);

export interface HighContrastProviderProps {
  children: ReactNode;
  defaultMode?: ContrastMode;
  respectSystemPreference?: boolean;
  applyToDocument?: boolean;
}

export function HighContrastProvider({
  children,
  defaultMode,
  respectSystemPreference = true,
  applyToDocument = true,
}: HighContrastProviderProps) {
  const highContrast = useHighContrast({
    defaultMode,
    respectSystemPreference,
  });

  useEffect(() => {
    if (!applyToDocument || typeof document === 'undefined') return;

    const root = document.documentElement;

    root.classList.remove('a11y-normal-contrast', 'a11y-high-contrast', 'a11y-more-contrast');
    root.classList.add(`a11y-${highContrast.contrastMode}-contrast`);

    if (highContrast.isHighContrast) {
      root.style.setProperty('--a11y-focus-ring-width', `${highContrast.getFocusIndicatorWidth()}px`);
      root.style.setProperty('--a11y-border-width', `${highContrast.getBorderWidth()}px`);
    }
  }, [highContrast, applyToDocument]);

  const enhancedFocusStyle = useMemo<React.CSSProperties>(() => {
    const width = highContrast.getFocusIndicatorWidth();
    const colors = highContrast.getContrastColors();

    return {
      outline: `${width}px solid ${colors.focus}`,
      outlineOffset: '2px',
    };
  }, [highContrast]);

  const enhancedBorderStyle = useMemo<React.CSSProperties>(() => {
    const width = highContrast.getBorderWidth();
    const colors = highContrast.getContrastColors();

    return {
      borderWidth: `${width}px`,
      borderColor: colors.border,
      borderStyle: 'solid',
    };
  }, [highContrast]);

  const getTextColor = useCallback((): string => {
    return highContrast.getContrastColors().text;
  }, [highContrast]);

  const getBackgroundColor = useCallback((): string => {
    return highContrast.getContrastColors().background;
  }, [highContrast]);

  const getBorderColor = useCallback((): string => {
    return highContrast.getContrastColors().border;
  }, [highContrast]);

  const getLinkColor = useCallback((): string => {
    return highContrast.getContrastColors().link;
  }, [highContrast]);

  const value = useMemo<HighContrastContextValue>(
    () => ({
      ...highContrast,
      enhancedFocusStyle,
      enhancedBorderStyle,
      getTextColor,
      getBackgroundColor,
      getBorderColor,
      getLinkColor,
    }),
    [highContrast, enhancedFocusStyle, enhancedBorderStyle, getTextColor, getBackgroundColor, getBorderColor, getLinkColor]
  );

  return (
    <HighContrastContext.Provider value={value}>
      {children}
    </HighContrastContext.Provider>
  );
}

export function useHighContrastContext(): HighContrastContextValue {
  const context = useContext(HighContrastContext);
  if (context === undefined) {
    throw new Error('useHighContrastContext must be used within a HighContrastProvider');
  }
  return context;
}

export function useContrastMode(): ContrastMode {
  const context = useContext(HighContrastContext);
  if (context === undefined) {
    if (typeof window === 'undefined') return 'normal';
    if (window.matchMedia('(prefers-contrast: more)').matches) return 'more';
    if (window.matchMedia('(prefers-contrast: high)').matches) return 'high';
    return 'normal';
  }
  return context.contrastMode;
}

export function useIsHighContrast(): boolean {
  const context = useContext(HighContrastContext);
  if (context === undefined) {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(prefers-contrast: more)').matches ||
      window.matchMedia('(prefers-contrast: high)').matches
    );
  }
  return context.isHighContrast;
}

export function useContrastColors(): ContrastColors {
  const context = useContext(HighContrastContext);
  if (context === undefined) {
    return {
      text: 'hsl(var(--foreground))',
      background: 'hsl(var(--background))',
      border: 'hsl(var(--border))',
      focus: 'hsl(var(--primary))',
      link: 'hsl(var(--primary))',
      linkVisited: 'hsl(var(--primary) / 0.8)',
      error: 'hsl(var(--destructive))',
      success: 'hsl(142.1 76.2% 36.3%)',
      warning: 'hsl(45 100% 51%)',
    };
  }
  return context.getContrastColors();
}

export interface HighContrastWrapperProps {
  children: ReactNode;
  highContrastOnly?: boolean;
}

export function HighContrastWrapper({ children, highContrastOnly = false }: HighContrastWrapperProps) {
  const isHighContrast = useIsHighContrast();

  if (highContrastOnly && !isHighContrast) {
    return null;
  }

  return <>{children}</>;
}

export default HighContrastProvider;
