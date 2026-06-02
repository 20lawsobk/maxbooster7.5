import React, { useRef, useEffect, useCallback, type ReactNode } from "react";
import { getFocusableElements } from "@/lib/accessibility";
import { useFocusReturn } from "@/hooks/useFocusReturn";

export interface FocusTrapProps {
  children: ReactNode;
  active?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
  finalFocus?: React.RefObject<HTMLElement>;
  onEscape?: () => void;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

export function FocusTrap({
  children,
  active = true,
  autoFocus = true,
  restoreFocus = true,
  initialFocus,
  finalFocus,
  onEscape,
  className,
  as: Component = "div",
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { saveFocus, restoreFocus: restore } = useFocusReturn();

  useEffect(() => {
    if (!active) return;

    saveFocus();

    if (autoFocus) {
      const focusTarget = initialFocus?.current || containerRef.current;
      if (focusTarget) {
        const focusableElements = getFocusableElements(
          focusTarget as HTMLElement,
        );
        const firstFocusable = focusableElements[0] || focusTarget;

        requestAnimationFrame(() => {
          if (firstFocusable instanceof HTMLElement) {
            firstFocusable.focus();
          }
        });
      }
    }

    return () => {
      if (restoreFocus) {
        if (finalFocus?.current) {
          finalFocus.current.focus();
        } else {
          restore();
        }
      }
    };
  }, [
    active,
    autoFocus,
    restoreFocus,
    saveFocus,
    restore,
    initialFocus,
    finalFocus,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!active || !containerRef.current) return;

      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(containerRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [active, onEscape],
  );

  const handleFocusOut = useCallback(
    (event: React.FocusEvent) => {
      if (!active || !containerRef.current) return;

      if (!containerRef.current.contains(event.relatedTarget as Node)) {
        const focusableElements = getFocusableElements(containerRef.current);
        if (focusableElements.length > 0) {
          event.preventDefault();
          focusableElements[0].focus();
        }
      }
    },
    [active],
  );

  return React.createElement(
    Component,
    {
      ref: containerRef,
      onKeyDown: handleKeyDown,
      onBlur: handleFocusOut,
      className,
      "data-focus-trap": active,
    },
    children,
  );
}

export function useFocusTrapHook(enabled = true) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { saveFocus, restoreFocus } = useFocusReturn();

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    saveFocus();

    const container = containerRef.current;
    const focusableElements = getFocusableElements(container);

    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);

    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      restoreFocus();
    };
  }, [enabled, saveFocus, restoreFocus]);

  return containerRef;
}

export interface UseFocusTrapOptions {
  enabled?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onEscape?: () => void;
}

export default FocusTrap;
