import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { useReducedMotion, type ReducedMotionResult } from '@/hooks/useReducedMotion';
import { useHighContrast, type HighContrastResult, type ContrastMode } from '@/hooks/useHighContrast';
import { ScreenReaderAnnouncer, announcePolite } from '@/lib/a11y/screenReader';

export type FontSize = 'small' | 'medium' | 'large' | 'x-large' | '150' | '175' | '200';
export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

const FONT_SIZE_STORAGE_KEY = 'max-booster-font-size';
const COLOR_BLIND_STORAGE_KEY = 'max-booster-color-blind-mode';

const fontSizeValues: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
  'x-large': '20px',
  '150': '24px',
  '175': '28px',
  '200': '32px',
};

const fontSizeScales: Record<FontSize, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125,
  'x-large': 1.25,
  '150': 1.5,
  '175': 1.75,
  '200': 2.0,
};

export interface AccessibilityContextValue {
  reducedMotion: ReducedMotionResult;
  highContrast: HighContrastResult;
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  focusMainContent: () => void;
  isKeyboardNavigating: boolean;
  setKeyboardNavigating: (value: boolean) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  fontSizeScale: number;
  colorBlindMode: ColorBlindMode;
  setColorBlindMode: (mode: ColorBlindMode) => void;
  resetAllPreferences: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export interface AccessibilityProviderProps {
  children: ReactNode;
  defaultReducedMotion?: boolean;
  defaultContrastMode?: ContrastMode;
  defaultFontSize?: FontSize;
  defaultColorBlindMode?: ColorBlindMode;
}

function getStoredFontSize(): FontSize {
  if (typeof window === 'undefined') return 'medium';
  const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
  if (stored === 'small' || stored === 'medium' || stored === 'large' || stored === 'x-large' || stored === '150' || stored === '175' || stored === '200') {
    return stored;
  }
  return 'medium';
}

function getStoredColorBlindMode(): ColorBlindMode {
  if (typeof window === 'undefined') return 'none';
  const stored = localStorage.getItem(COLOR_BLIND_STORAGE_KEY);
  if (stored === 'none' || stored === 'protanopia' || stored === 'deuteranopia' || stored === 'tritanopia' || stored === 'achromatopsia') {
    return stored;
  }
  return 'none';
}

export function AccessibilityProvider({
  children,
  defaultReducedMotion,
  defaultContrastMode,
  defaultFontSize,
  defaultColorBlindMode,
}: AccessibilityProviderProps) {
  const reducedMotion = useReducedMotion({
    defaultValue: defaultReducedMotion,
    respectUserPreference: true,
  });

  const highContrast = useHighContrast({
    defaultMode: defaultContrastMode,
    respectSystemPreference: true,
  });

  const [isKeyboardNavigating, setKeyboardNavigating] = useState(false);
  const [fontSize, setFontSizeState] = useState<FontSize>(() => defaultFontSize || getStoredFontSize());
  const [colorBlindMode, setColorBlindModeState] = useState<ColorBlindMode>(() => defaultColorBlindMode || getStoredColorBlindMode());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setKeyboardNavigating(true);
        document.body.classList.add('keyboard-navigating');
      }
    };

    const handleMouseDown = () => {
      setKeyboardNavigating(false);
      document.body.classList.remove('keyboard-navigating');
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useEffect(() => {
    const announcer = ScreenReaderAnnouncer.getInstance();
    return () => {
      announcer.clear();
    };
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcer = ScreenReaderAnnouncer.getInstance();
    announcer.announce(message, priority);
  }, []);

  const focusMainContent = useCallback(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.tabIndex = -1;
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: reducedMotion.prefersReducedMotion ? 'auto' : 'smooth' });
      announcePolite('Focused on main content');
    }
  }, [reducedMotion.prefersReducedMotion]);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, size);
    announce(`Font size changed to ${size}`);
  }, [announce]);

  const setColorBlindMode = useCallback((mode: ColorBlindMode) => {
    setColorBlindModeState(mode);
    localStorage.setItem(COLOR_BLIND_STORAGE_KEY, mode);
    const modeLabel = mode === 'none' ? 'normal colors' : `${mode} mode`;
    announce(`Color blind mode changed to ${modeLabel}`);
  }, [announce]);

  const resetAllPreferences = useCallback(() => {
    reducedMotion.setReducedMotion(null);
    highContrast.setContrastMode(null);
    setFontSizeState('medium');
    setColorBlindModeState('none');
    localStorage.removeItem(FONT_SIZE_STORAGE_KEY);
    localStorage.removeItem(COLOR_BLIND_STORAGE_KEY);
    announce('All accessibility settings reset to defaults');
  }, [reducedMotion, highContrast, announce]);

  useEffect(() => {
    const root = document.documentElement;
    
    if (reducedMotion.prefersReducedMotion) {
      root.setAttribute('data-reduced-motion', 'true');
    } else {
      root.removeAttribute('data-reduced-motion');
    }

    if (highContrast.isHighContrast) {
      root.setAttribute('data-high-contrast', highContrast.contrastMode);
    } else {
      root.removeAttribute('data-high-contrast');
    }

    if (isKeyboardNavigating) {
      root.setAttribute('data-keyboard-navigating', 'true');
    } else {
      root.removeAttribute('data-keyboard-navigating');
    }

    root.setAttribute('data-font-size', fontSize);
    root.style.setProperty('--a11y-font-size', fontSizeValues[fontSize]);
    root.style.setProperty('--a11y-font-scale', String(fontSizeScales[fontSize]));

    root.setAttribute('data-color-blind-mode', colorBlindMode);
    
    root.classList.remove('cb-protanopia', 'cb-deuteranopia', 'cb-tritanopia', 'cb-achromatopsia');
    if (colorBlindMode !== 'none') {
      root.classList.add(`cb-${colorBlindMode}`);
    }
  }, [reducedMotion.prefersReducedMotion, highContrast.isHighContrast, highContrast.contrastMode, isKeyboardNavigating, fontSize, colorBlindMode]);

  const fontSizeScale = fontSizeScales[fontSize];

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      reducedMotion,
      highContrast,
      announce,
      focusMainContent,
      isKeyboardNavigating,
      setKeyboardNavigating,
      fontSize,
      setFontSize,
      fontSizeScale,
      colorBlindMode,
      setColorBlindMode,
      resetAllPreferences,
    }),
    [reducedMotion, highContrast, announce, focusMainContent, isKeyboardNavigating, fontSize, setFontSize, fontSizeScale, colorBlindMode, setColorBlindMode, resetAllPreferences]
  );

  return (
    <AccessibilityContext.Provider value={value}>
      <div
        id="a11y-polite-region"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        id="a11y-assertive-region"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const context = useContext(AccessibilityContext);
  if (context === undefined) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
}

export function useAnnounce() {
  const { announce } = useAccessibility();
  return announce;
}

export function useA11yReducedMotion() {
  const { reducedMotion } = useAccessibility();
  return reducedMotion;
}

export function useA11yHighContrast() {
  const { highContrast } = useAccessibility();
  return highContrast;
}

export function useA11yFontSize() {
  const { fontSize, setFontSize, fontSizeScale } = useAccessibility();
  return { fontSize, setFontSize, fontSizeScale };
}

export function useA11yColorBlindMode() {
  const { colorBlindMode, setColorBlindMode } = useAccessibility();
  return { colorBlindMode, setColorBlindMode };
}

export default AccessibilityProvider;
