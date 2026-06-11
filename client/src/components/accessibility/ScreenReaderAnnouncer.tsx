import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  announcePolite,
  announceAssertive,
  ScreenReaderAnnouncer as SRAnnouncer,
} from "@/lib/a11y/screenReader";

export type AnnouncementPriority = "polite" | "assertive";

export interface ScreenReaderAnnouncerContextValue {
  announce: (message: string, priority?: AnnouncementPriority) => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
  clear: () => void;
}

const ScreenReaderAnnouncerContext = createContext<
  ScreenReaderAnnouncerContextValue | undefined
>(undefined);

export interface ScreenReaderAnnouncerProviderProps {
  children: ReactNode;
}

export function ScreenReaderAnnouncerProvider({
  children,
}: ScreenReaderAnnouncerProviderProps) {
  useEffect(() => {
    const announcer = SRAnnouncer.getInstance();
    return () => {
      announcer.clear();
    };
  }, []);

  const announce = useCallback(
    (message: string, priority: AnnouncementPriority = "polite") => {
      if (!message.trim()) return;

      if (priority === "assertive") {
        announceAssertive(message);
      } else {
        announcePolite(message);
      }
    },
    [],
  );

  const announcePoliteWrapper = useCallback((message: string) => {
    announcePolite(message);
  }, []);

  const announceAssertiveWrapper = useCallback((message: string) => {
    announceAssertive(message);
  }, []);

  const clear = useCallback(() => {
    const announcer = SRAnnouncer.getInstance();
    announcer.clear();
  }, []);

  const value: ScreenReaderAnnouncerContextValue = {
    announce,
    announcePolite: announcePoliteWrapper,
    announceAssertive: announceAssertiveWrapper,
    clear,
  };

  return (
    <ScreenReaderAnnouncerContext.Provider value={value}>
      {children}
    </ScreenReaderAnnouncerContext.Provider>
  );
}

export function useScreenReaderAnnouncerContext(): ScreenReaderAnnouncerContextValue {
  const context = useContext(ScreenReaderAnnouncerContext);
  if (context === undefined) {
    throw new Error(
      "useScreenReaderAnnouncerContext must be used within a ScreenReaderAnnouncerProvider",
    );
  }
  return context;
}

export interface ScreenReaderAnnouncerProps {
  message?: string;
  priority?: AnnouncementPriority;
  clearOnUnmount?: boolean;
}

export function ScreenReaderAnnouncer({
  message,
  priority = "polite",
  clearOnUnmount = false,
}: ScreenReaderAnnouncerProps) {
  const previousMessageRef = useRef<string>("");

  useEffect(() => {
    if (message && message !== previousMessageRef.current) {
      if (priority === "assertive") {
        announceAssertive(message);
      } else {
        announcePolite(message);
      }
      previousMessageRef.current = message;
    }
  }, [message, priority]);

  useEffect(() => {
    return () => {
      if (clearOnUnmount) {
        const announcer = SRAnnouncer.getInstance();
        announcer.clear();
      }
    };
  }, [clearOnUnmount]);

  return null;
}

export interface LiveRegionProps {
  children?: ReactNode;
  priority?: AnnouncementPriority;
  atomic?: boolean;
  relevant?: "additions" | "removals" | "text" | "all";
  role?: "status" | "alert" | "log";
}

export function LiveRegion({
  children,
  priority = "polite",
  atomic = true,
  relevant = "additions",
  role = "status",
}: LiveRegionProps) {
  return (
    <div
      role={role}
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className="sr-only"
    >
      {children}
    </div>
  );
}

export interface RouteAnnouncerProps {
  pageName: string;
  prefix?: string;
}

export function RouteAnnouncer({
  pageName,
  prefix = "Navigated to",
}: RouteAnnouncerProps) {
  useEffect(() => {
    const message = `${prefix} ${pageName}`;
    announcePolite(message);
  }, [pageName, prefix]);

  return null;
}

export interface LoadingAnnouncerProps {
  isLoading: boolean;
  loadingMessage?: string;
  completeMessage?: string;
}

export function LoadingAnnouncer({
  isLoading,
  loadingMessage = "Loading, please wait",
  completeMessage = "Loading complete",
}: LoadingAnnouncerProps) {
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (isLoading && !wasLoadingRef.current) {
      announcePolite(loadingMessage);
    } else if (!isLoading && wasLoadingRef.current) {
      announcePolite(completeMessage);
    }
    wasLoadingRef.current = isLoading;
  }, [isLoading, loadingMessage, completeMessage]);

  return null;
}

export default ScreenReaderAnnouncer;
