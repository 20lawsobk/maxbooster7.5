export {
  useAccessibility,
  useAnnounce,
  useA11yReducedMotion,
  useA11yHighContrast,
} from "@/components/a11y/AccessibilityProvider";

export type { AccessibilityContextValue } from "@/components/a11y/AccessibilityProvider";

import { useAccessibility as useA11yContext } from "@/components/a11y/AccessibilityProvider";
import { useReducedMotion as useReducedMotionHook } from "./useReducedMotion";
import { useHighContrast as useHighContrastHook } from "./useHighContrast";

export interface AccessibilityPreferences {
  reducedMotion: boolean;
  highContrast: boolean;
  keyboardNavigating: boolean;
  fontSize: string;
  colorBlindMode: string | null;
}

export function useAccessibilityPreferences(): AccessibilityPreferences {
  const context = useA11yContext();

  return {
    reducedMotion: context.reducedMotion.prefersReducedMotion,
    highContrast: context.highContrast.isHighContrast,
    keyboardNavigating: context.isKeyboardNavigating,
    fontSize: context.fontSize || "medium",
    colorBlindMode: context.colorBlindMode || null,
  };
}

export function useA11yAnnounce() {
  const { announce } = useA11yContext();
  return announce;
}

export function useA11yFocusMainContent() {
  const { focusMainContent } = useA11yContext();
  return focusMainContent;
}

export { useReducedMotionHook as useReducedMotionPreference };
export { useHighContrastHook as useHighContrastPreference };

export default useA11yContext;
