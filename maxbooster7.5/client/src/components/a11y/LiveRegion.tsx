import React, { useState, useEffect, useCallback, useRef } from 'react';

export type LiveRegionPriority = 'polite' | 'assertive' | 'off';

export interface LiveRegionProps {
  priority?: LiveRegionPriority;
  atomic?: boolean;
  relevant?: 'additions' | 'removals' | 'text' | 'all' | 'additions text';
  role?: 'status' | 'alert' | 'log' | 'timer' | 'marquee';
  className?: string;
  clearAfter?: number;
  children?: React.ReactNode;
}

export function LiveRegion({
  priority = 'polite',
  atomic = true,
  relevant = 'additions text',
  role = priority === 'assertive' ? 'alert' : 'status',
  className = '',
  clearAfter,
  children,
}: LiveRegionProps) {
  const [content, setContent] = useState<React.ReactNode>(children);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setContent(children);

    if (clearAfter && children) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setContent(null);
      }, clearAfter);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [children, clearAfter]);

  return (
    <div
      role={role}
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className={`sr-only ${className}`}
    >
      {content}
    </div>
  );
}

export interface UseLiveRegionOptions {
  priority?: LiveRegionPriority;
  debounceMs?: number;
}

export function useLiveRegion(options: UseLiveRegionOptions = {}) {
  const { priority = 'polite', debounceMs = 100 } = options;
  const [message, setMessage] = useState<string>('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback(
    (text: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setMessage('');

      timeoutRef.current = setTimeout(() => {
        setMessage(text);
      }, debounceMs);
    },
    [debounceMs]
  );

  const clear = useCallback(() => {
    setMessage('');
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const LiveRegionComponent = useCallback(
    () => (
      <LiveRegion priority={priority} atomic>
        {message}
      </LiveRegion>
    ),
    [priority, message]
  );

  return {
    announce,
    clear,
    message,
    LiveRegionComponent,
  };
}

export interface AnnouncerProps {
  children: React.ReactNode;
}

interface AnnouncerContextValue {
  announce: (message: string, priority?: LiveRegionPriority) => void;
  clear: () => void;
}

const AnnouncerContext = React.createContext<AnnouncerContextValue | null>(null);

export function Announcer({ children }: AnnouncerProps) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const politeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const assertiveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const announce = useCallback((message: string, priority: LiveRegionPriority = 'polite') => {
    const setMessage = priority === 'assertive' ? setAssertiveMessage : setPoliteMessage;
    const timeoutRef = priority === 'assertive' ? assertiveTimeoutRef : politeTimeoutRef;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setMessage('');

    timeoutRef.current = setTimeout(() => {
      setMessage(message);
    }, 50);
  }, []);

  const clear = useCallback(() => {
    setPoliteMessage('');
    setAssertiveMessage('');
  }, []);

  useEffect(() => {
    return () => {
      if (politeTimeoutRef.current) clearTimeout(politeTimeoutRef.current);
      if (assertiveTimeoutRef.current) clearTimeout(assertiveTimeoutRef.current);
    };
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce, clear }}>
      {children}
      <LiveRegion priority="polite">{politeMessage}</LiveRegion>
      <LiveRegion priority="assertive">{assertiveMessage}</LiveRegion>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerContextValue {
  const context = React.useContext(AnnouncerContext);
  if (!context) {
    throw new Error('useAnnouncer must be used within an Announcer provider');
  }
  return context;
}

export default LiveRegion;
