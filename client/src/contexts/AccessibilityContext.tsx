export {
  AccessibilityProvider,
  useAccessibility,
  useAnnounce,
  useA11yReducedMotion,
  useA11yHighContrast,
} from '@/components/a11y/AccessibilityProvider';

export type {
  AccessibilityContextValue,
  AccessibilityProviderProps,
} from '@/components/a11y/AccessibilityProvider';

import {
  AccessibilityProvider,
  useAccessibility,
  type AccessibilityContextValue,
} from '@/components/a11y/AccessibilityProvider';

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  keyboardNavigating: boolean;
}

export function useAccessibilitySettings(): AccessibilitySettings {
  const context = useAccessibility();
  
  return {
    reducedMotion: context.reducedMotion.prefersReducedMotion,
    highContrast: context.highContrast.isHighContrast,
    keyboardNavigating: context.isKeyboardNavigating,
  };
}

export default AccessibilityProvider;
