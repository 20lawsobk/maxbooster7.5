import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useReducedMotion, type ReducedMotionResult } from '@/hooks/useReducedMotion';
import { useHighContrast, type HighContrastResult, type ContrastMode } from '@/hooks/useHighContrast';
import { ScreenReaderAnnouncer, announcePolite } from '@/lib/a11y/screenReader';

export interface AccessibilityContextValue {
  reducedMotion: ReducedMotionResult;
  highContrast: HighContrastResult;
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
  focusMainContent: () => void;
  isKeyboardNavigating: boolean;
  setKeyboardNavigating: (value: boolean) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | undefined>(undefined);

export interface AccessibilityProviderProps {
  children: ReactNode;
  defaultReducedMotion?: boolean;
  defaultContrastMode?: ContrastMode;
}

export function AccessibilityProvider({
  children,
  defaultReducedMotion,
  defaultContrastMode,
}: AccessibilityProviderProps) {
  const reducedMotion = useReducedMotion({
    defaultValue: defaultReducedMotion,
    respectUserPreference: true,
  });

  const highContrast = useHighContrast({
    defaultMode: defaultContrastMode,
    respectSystemPreference: true,
  });

  const [isKeyboardNavigating, setKeyboardNavigating] = React.useState(false);

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

  const announce = React.useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const announcer = ScreenReaderAnnouncer.getInstance();
    announcer.announce(message, priority);
  }, []);

  const focusMainContent = React.useCallback(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.tabIndex = -1;
      mainContent.focus();
      mainContent.scrollIntoView({ behavior: reducedMotion.prefersReducedMotion ? 'auto' : 'smooth' });
      announcePolite('Focused on main content');
    }
  }, [reducedMotion.prefersReducedMotion]);

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
  }, [reducedMotion.prefersReducedMotion, highContrast.isHighContrast, highContrast.contrastMode, isKeyboardNavigating]);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      reducedMotion,
      highContrast,
      announce,
      focusMainContent,
      isKeyboardNavigating,
      setKeyboardNavigating,
    }),
    [reducedMotion, highContrast, announce, focusMainContent, isKeyboardNavigating]
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

export default AccessibilityProvider;
