import React, { useEffect, useRef, useCallback } from "react";
import { getFocusableElements, trapFocus } from "@/lib/accessibility";
import { announcePolite } from "@/lib/a11y/screenReader";

export interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onEscape?: () => void;
  onClickOutside?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
  finalFocusRef?: React.RefObject<HTMLElement>;
  className?: string;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-modal"?: boolean;
}

export function FocusTrap({
  children,
  active = true,
  autoFocus = true,
  restoreFocus = true,
  onEscape,
  onClickOutside,
  initialFocusRef,
  finalFocusRef,
  className = "",
  role,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  "aria-modal": ariaModal,
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const focusInitialElement = useCallback(() => {
    if (!containerRef.current) return;

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
      return;
    }

    const focusableElements = getFocusableElements(containerRef.current);
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      containerRef.current.setAttribute("tabindex", "-1");
      containerRef.current.focus();
    }
  }, [initialFocusRef]);

  const restorePreviousFocus = useCallback(() => {
    if (restoreFocus) {
      const elementToFocus =
        finalFocusRef?.current || previousActiveElementRef.current;
      if (elementToFocus && typeof elementToFocus.focus === "function") {
        elementToFocus.focus();
      }
    }
  }, [restoreFocus, finalFocusRef]);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;

    if (autoFocus) {
      requestAnimationFrame(() => {
        focusInitialElement();
      });
    }

    cleanupRef.current = trapFocus(containerRef.current);

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      restorePreviousFocus();
    };
  }, [active, autoFocus, focusInitialElement, restorePreviousFocus]);

  useEffect(() => {
    if (!active || !onEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onEscape();
        announcePolite("Dialog closed");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape]);

  useEffect(() => {
    if (!active || !onClickOutside) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClickOutside();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [active, onClickOutside]);

  return (
    <div
      ref={containerRef}
      className={className}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      aria-describedby={ariaDescribedby}
      aria-modal={ariaModal}
    >
      {children}
    </div>
  );
}

export interface UseFocusTrapOptions {
  active?: boolean;
  autoFocus?: boolean;
  restoreFocus?: boolean;
  onEscape?: () => void;
  initialFocusRef?: React.RefObject<HTMLElement>;
}

export function useFocusTrapHook(options: UseFocusTrapOptions = {}) {
  const {
    active = true,
    autoFocus = true,
    restoreFocus = true,
    onEscape,
    initialFocusRef,
  } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const activate = useCallback(() => {
    if (!containerRef.current) return;

    previousActiveElementRef.current = document.activeElement as HTMLElement;
    cleanupRef.current = trapFocus(containerRef.current);

    if (autoFocus) {
      requestAnimationFrame(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (containerRef.current) {
          const focusable = getFocusableElements(containerRef.current);
          if (focusable.length > 0) {
            focusable[0].focus();
          }
        }
      });
    }
  }, [autoFocus, initialFocusRef]);

  const deactivate = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (restoreFocus && previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
    }
  }, [restoreFocus]);

  useEffect(() => {
    if (active) {
      activate();
    } else {
      deactivate();
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [active, activate, deactivate]);

  useEffect(() => {
    if (!active || !onEscape) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, onEscape]);

  return {
    containerRef,
    activate,
    deactivate,
  };
}

export default FocusTrap;
