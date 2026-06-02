export {
  AccessibilityProvider,
  useAccessibility,
  useAnnounce,
  useA11yReducedMotion,
  useA11yHighContrast,
  useA11yFontSize,
  useA11yColorBlindMode,
} from "@/components/a11y/AccessibilityProvider";

export type {
  AccessibilityContextValue,
  AccessibilityProviderProps,
  FontSize,
  ColorBlindMode,
} from "@/components/a11y/AccessibilityProvider";

import {
  AccessibilityProvider,
  useAccessibility,
  type AccessibilityContextValue,
} from "@/components/a11y/AccessibilityProvider";

export interface AccessibilitySettings {
  reducedMotion: boolean;
  highContrast: boolean;
  keyboardNavigating: boolean;
  fontSize: string;
  colorBlindMode: string;
}

export function useAccessibilitySettings(): AccessibilitySettings {
  const context = useAccessibility();

  return {
    reducedMotion: context.reducedMotion.prefersReducedMotion,
    highContrast: context.highContrast.isHighContrast,
    keyboardNavigating: context.isKeyboardNavigating,
    fontSize: context.fontSize,
    colorBlindMode: context.colorBlindMode,
  };
}

export default AccessibilityProvider;
