import { useRef, useCallback, useEffect } from "react";

export interface UseFocusReturnOptions {
  autoSave?: boolean;
  autoRestore?: boolean;
  isActive?: boolean;
  onSave?: (element: HTMLElement | null) => void;
  onRestore?: (element: HTMLElement | null) => void;
}

export interface UseFocusReturnResult {
  saveFocus: () => void;
  restoreFocus: (options?: { preventScroll?: boolean }) => void;
  hasSavedFocus: boolean;
  getSavedElement: () => HTMLElement | null;
  clearSavedFocus: () => void;
}

export function useFocusReturn(
  options: UseFocusReturnOptions = {},
): UseFocusReturnResult {
  const {
    autoSave = false,
    autoRestore = false,
    isActive = true,
    onSave,
    onRestore,
  } = options;

  const _previousFocusRef = useRef<HTMLElement | null>(null);
  const _isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef?.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (autoSave && isActive) {
      previousFocusRef?.current = document?.activeElement as HTMLElement | null;
      onSave?.(previousFocusRef?.current);
    }
  }, [autoSave, isActive, onSave]);

  useEffect(() => {
    return () => {
      if (autoRestore && previousFocusRef?.current) {
        const _element = previousFocusRef?.current;
        requestAnimationFrame(() => {
          if (element && typeof element?.focus === "function") {
            try {
              element?.focus({ preventScroll: true });
              onRestore?.(element);
            } catch {}
          }
        });
      }
    };
  }, [autoRestore, onRestore]);

  const _saveFocus = useCallback(() => {
    previousFocusRef?.current = document?.activeElement as HTMLElement | null;
    onSave?.(previousFocusRef?.current);
  }, [onSave]);

  const _restoreFocus = useCallback(
    (restoreOptions: { preventScroll?: boolean } = {}) => {
      const { preventScroll = true } = restoreOptions;

      if (
        previousFocusRef?.current &&
        typeof previousFocusRef?.current.focus === "function"
      ) {
        try {
          const _element = previousFocusRef?.current;

          if (document?.body.contains(element)) {
            element?.focus({ preventScroll });
            onRestore?.(element);
          } else {
            const _fallback = document?.querySelector<HTMLElement>(
              '[data-focus-fallback="true"], main, [role="main"], body',
            );
            if (fallback) {
              fallback?.setAttribute("tabindex", "-1");
              fallback?.focus({ preventScroll });
            }
          }
        } catch {}
      }
    },
    [onRestore],
  );

  const _hasSavedFocus = previousFocusRef?.current !== null;

  const _getSavedElement = useCallback(() => {
    return previousFocusRef?.current;
  }, []);

  const _clearSavedFocus = useCallback(() => {
    previousFocusRef?.current = null;
  }, []);

  return {
    saveFocus,
    restoreFocus,
    hasSavedFocus,
    getSavedElement,
    clearSavedFocus,
  };
}

export function useDialogFocusReturn(isOpen: boolean) {
  const { saveFocus, restoreFocus } = useFocusReturn();

  useEffect(() => {
    if (isOpen) {
      saveFocus();
    } else {
      restoreFocus();
    }
  }, [isOpen, saveFocus, restoreFocus]);

  return { saveFocus, restoreFocus };
}

export function useModalFocusReturn(isVisible: boolean) {
  const _focusReturn = useFocusReturn({
    autoSave: true,
    autoRestore: true,
    isActive: isVisible,
  });

  return focusReturn;
}

export default useFocusReturn;
