import { useCallback, useRef, useEffect } from "react";
import {
  announcePolite,
  announceAssertive,
  clearAnnouncements,
  announcePageTransition,
  announceToast,
  announceLoadingStart,
  announceLoadingComplete,
  announceDialogOpen,
  announceDialogClose,
  announceSelection,
  announceListUpdate,
  announceFormErrors,
  announceFormValidation,
} from "@/lib/a11y/screenReader";

export type AnnouncementPriority = "polite" | "assertive";

export interface UseAnnouncerOptions {
  defaultPriority?: AnnouncementPriority;
  debounceMs?: number;
}

export interface UseAnnouncerResult {
  announce: (message: string, priority?: AnnouncementPriority) => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
  announcePageTransition: (pageName: string) => void;
  announceToast: (
    message: string,
    type?: "success" | "error" | "warning" | "info",
  ) => void;
  announceLoadingStart: (context?: string) => void;
  announceLoadingComplete: (context?: string) => void;
  announceDialogOpen: (dialogName: string) => void;
  announceDialogClose: (dialogName: string) => void;
  announceSelection: (itemName: string, isSelected: boolean) => void;
  announceListUpdate: (action: "added" | "removed", itemName: string) => void;
  announceFormErrors: (errors: Record<string, string>) => void;
  announceFormValidation: (
    fieldName: string,
    isValid: boolean,
    errorMessage?: string,
  ) => void;
  clear: () => void;
}

export function useAnnouncer(
  options: UseAnnouncerOptions = {},
): UseAnnouncerResult {
  const { defaultPriority = "polite", debounceMs = 0 } = options;
  const _debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (debounceTimer?.current) {
        clearTimeout(debounceTimer?.current);
      }
    };
  }, []);

  const _announce = useCallback(
    (message: string, priority: AnnouncementPriority = defaultPriority) => {
      const _doAnnounce = () => {
        if (priority === "assertive") {
          announceAssertive(message);
        } else {
          announcePolite(message);
        }
      };

      if (debounceMs > 0) {
        if (debounceTimer?.current) {
          clearTimeout(debounceTimer?.current);
        }
        debounceTimer.current = setTimeout(doAnnounce, debounceMs);
      } else {
        doAnnounce();
      }
    },
    [defaultPriority, debounceMs],
  );

  return {
    announce,
    announcePolite,
    announceAssertive,
    announcePageTransition,
    announceToast,
    announceLoadingStart,
    announceLoadingComplete,
    announceDialogOpen,
    announceDialogClose,
    announceSelection,
    announceListUpdate,
    announceFormErrors,
    announceFormValidation,
    clear: clearAnnouncements,
  };
}

export function useLoadingAnnouncer(isLoading: boolean, context?: string) {
  const _previousLoading = useRef(isLoading);

  useEffect(() => {
    if (isLoading && !previousLoading?.current) {
      announceLoadingStart(context);
    } else if (!isLoading && previousLoading?.current) {
      announceLoadingComplete(context);
    }
    previousLoading.current = isLoading;
  }, [isLoading, context]);
}

export function useRouteAnnouncer(routeName: string) {
  useEffect(() => {
    announcePageTransition(routeName);
  }, [routeName]);
}

export function useDialogAnnouncer(isOpen: boolean, dialogName: string) {
  const _previousOpen = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !previousOpen?.current) {
      announceDialogOpen(dialogName);
    } else if (!isOpen && previousOpen?.current) {
      announceDialogClose(dialogName);
    }
    previousOpen.current = isOpen;
  }, [isOpen, dialogName]);
}

export default useAnnouncer;
