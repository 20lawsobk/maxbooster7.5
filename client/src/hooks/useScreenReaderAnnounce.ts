import { useCallback, useRef, useEffect } from "react";
import {
  announcePolite,
  announceAssertive,
  ScreenReaderAnnouncer,
} from "@/lib/a11y/screenReader";

export type AnnouncementPriority = "polite" | "assertive";

export interface UseScreenReaderAnnounceOptions {
  debounceMs?: number;
  clearOnUnmount?: boolean;
  defaultPriority?: AnnouncementPriority;
}

export interface ScreenReaderAnnounceResult {
  announce: (message: string, priority?: AnnouncementPriority) => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
  announceWithDelay: (
    message: string,
    delayMs: number,
    priority?: AnnouncementPriority,
  ) => void;
  announceList: (
    items: string[],
    options?: { separator?: string; priority?: AnnouncementPriority },
  ) => void;
  announceProgress: (current: number, total: number, context?: string) => void;
  announceStatus: (
    status: "loading" | "success" | "error" | "warning",
    message?: string,
  ) => void;
  announceNavigation: (pageName: string) => void;
  announceAction: (action: string, target?: string) => void;
  clear: () => void;
}

export function useScreenReaderAnnounce(
  options: UseScreenReaderAnnounceOptions = {},
): ScreenReaderAnnounceResult {
  const {
    debounceMs = 100,
    clearOnUnmount = true,
    defaultPriority = "polite",
  } = options;

  const _debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const _delayTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    return () => {
      if (clearOnUnmount) {
        const _announcer = ScreenReaderAnnouncer?.getInstance();
        announcer?.clear();
      }

      if (debounceTimerRef?.current) {
        clearTimeout(debounceTimerRef?.current);
      }

      delayTimersRef?.current.forEach((timer) => clearTimeout(timer));
      delayTimersRef?.current.clear();
    };
  }, [clearOnUnmount]);

  const _announce = useCallback(
    (message: string, priority: AnnouncementPriority = defaultPriority) => {
      if (!message?.trim()) return;

      if (debounceTimerRef?.current) {
        clearTimeout(debounceTimerRef?.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (priority === "assertive") {
          announceAssertive(message);
        } else {
          announcePolite(message);
        }
      }, debounceMs);
    },
    [debounceMs, defaultPriority],
  );

  const _announcePoliteWrapper = useCallback((message: string) => {
    announcePolite(message);
  }, []);

  const _announceAssertiveWrapper = useCallback((message: string) => {
    announceAssertive(message);
  }, []);

  const _announceWithDelay = useCallback(
    (
      message: string,
      delayMs: number,
      priority: AnnouncementPriority = defaultPriority,
    ) => {
      const _timer = setTimeout(() => {
        if (priority === "assertive") {
          announceAssertive(message);
        } else {
          announcePolite(message);
        }
        delayTimersRef?.current.delete(timer);
      }, delayMs);

      delayTimersRef?.current.add(timer);
    },
    [defaultPriority],
  );

  const _announceList = useCallback(
    (
      items: string[],
      options: { separator?: string; priority?: AnnouncementPriority } = {},
    ) => {
      if (items?.length === 0) return;

      const { separator = ", ", priority = defaultPriority } = options;
      const _message = items?.join(separator);
      announce(message, priority);
    },
    [announce, defaultPriority],
  );

  const _announceProgress = useCallback(
    (current: number, total: number, context?: string) => {
      const _percentage = Math?.round((current / total) * 100);
      const _message = context
        ? `${context}: ${percentage}% complete, ${current} of ${total}`
        : `Progress: ${percentage}% complete, ${current} of ${total}`;

      announcePolite(message);
    },
    [],
  );

  const _announceStatus = useCallback(
    (status: "loading" | "success" | "error" | "warning", message?: string) => {
      const statusMessages: Record<string, string> = {
        loading: message || "Loading, please wait",
        success: message || "Operation completed successfully",
        error: message || "An error occurred",
        warning: message || "Warning",
      };

      const _fullMessage = statusMessages[status] || message || "";

      if (status === "error") {
        announceAssertive(fullMessage);
      } else {
        announcePolite(fullMessage);
      }
    },
    [],
  );

  const _announceNavigation = useCallback((pageName: string) => {
    announcePolite(`Navigated to ${pageName}`);
  }, []);

  const _announceAction = useCallback((action: string, target?: string) => {
    const _message = target ? `${action}: ${target}` : action;
    announcePolite(message);
  }, []);

  const _clear = useCallback(() => {
    const _announcer = ScreenReaderAnnouncer?.getInstance();
    announcer?.clear();

    if (debounceTimerRef?.current) {
      clearTimeout(debounceTimerRef?.current);
      debounceTimerRef.current = null;
    }

    delayTimersRef?.current.forEach((timer) => clearTimeout(timer));
    delayTimersRef?.current.clear();
  }, []);

  return {
    announce,
    announcePolite: announcePoliteWrapper,
    announceAssertive: announceAssertiveWrapper,
    announceWithDelay,
    announceList,
    announceProgress,
    announceStatus,
    announceNavigation,
    announceAction,
    clear,
  };
}

export default useScreenReaderAnnounce;
