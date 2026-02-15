import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
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
} from '@/lib/a11y/screenReader';

export type AnnouncementPriority = 'polite' | 'assertive';

export interface ScreenReaderAnnouncerContextValue {
  announce: (message: string, priority?: AnnouncementPriority) => void;
  announcePolite: (message: string) => void;
  announceAssertive: (message: string) => void;
  announcePageTransition: (pageName: string) => void;
  announceToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  announceLoadingStart: (context?: string) => void;
  announceLoadingComplete: (context?: string) => void;
  announceDialogOpen: (dialogName: string) => void;
  announceDialogClose: (dialogName: string) => void;
  announceSelection: (itemName: string, isSelected: boolean) => void;
  announceListUpdate: (action: 'added' | 'removed', itemName: string) => void;
  announceFormErrors: (errors: Record<string, string>) => void;
  announceFormValidation: (fieldName: string, isValid: boolean, errorMessage?: string) => void;
  clear: () => void;
}

const ScreenReaderAnnouncerContext = createContext<ScreenReaderAnnouncerContextValue | null>(null);

export interface ScreenReaderAnnouncerProviderProps {
  children: React.ReactNode;
}

export function ScreenReaderAnnouncerProvider({ children }: ScreenReaderAnnouncerProviderProps) {
  const announce = useCallback((message: string, priority: AnnouncementPriority = 'polite') => {
    if (priority === 'assertive') {
      announceAssertive(message);
    } else {
      announcePolite(message);
    }
  }, []);

  const value: ScreenReaderAnnouncerContextValue = {
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

  return (
    <ScreenReaderAnnouncerContext.Provider value={value}>
      {children}
    </ScreenReaderAnnouncerContext.Provider>
  );
}

export function useScreenReaderAnnouncer(): ScreenReaderAnnouncerContextValue {
  const context = useContext(ScreenReaderAnnouncerContext);
  if (!context) {
    return {
      announce: announcePolite,
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
  return context;
}

export interface ScreenReaderAnnouncerProps {
  message?: string;
  priority?: AnnouncementPriority;
  clearAfter?: number;
}

export function ScreenReaderAnnouncer({ 
  message, 
  priority = 'polite',
  clearAfter,
}: ScreenReaderAnnouncerProps) {
  const [content, setContent] = useState<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (message) {
      setContent('');
      requestAnimationFrame(() => {
        setContent(message);
      });

      if (clearAfter) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          setContent('');
        }, clearAfter);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message, clearAfter]);

  return (
    <div
      role={priority === 'assertive' ? 'alert' : 'status'}
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
    >
      {content}
    </div>
  );
}

export interface RouteAnnouncerProps {
  routeName: string;
}

export function RouteAnnouncer({ routeName }: RouteAnnouncerProps) {
  useEffect(() => {
    announcePageTransition(routeName);
  }, [routeName]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      Navigated to {routeName}
    </div>
  );
}

export interface LoadingAnnouncerProps {
  isLoading: boolean;
  context?: string;
  loadingMessage?: string;
  completeMessage?: string;
}

export function LoadingAnnouncer({ 
  isLoading, 
  context,
  loadingMessage,
  completeMessage,
}: LoadingAnnouncerProps) {
  const previousLoading = useRef(isLoading);

  useEffect(() => {
    if (isLoading && !previousLoading.current) {
      const message = loadingMessage || (context ? `Loading ${context}` : 'Loading');
      announcePolite(message);
    } else if (!isLoading && previousLoading.current) {
      const message = completeMessage || (context ? `${context} loaded` : 'Content loaded');
      announcePolite(message);
    }
    previousLoading.current = isLoading;
  }, [isLoading, context, loadingMessage, completeMessage]);

  return null;
}

export default ScreenReaderAnnouncer;
