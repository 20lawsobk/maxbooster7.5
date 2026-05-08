import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getCsrfTokenFromCookie } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const INACTIVITY_MS = 30 * 60 * 1000;
const WARNING_MS = 5 * 60 * 1000;
const HEARTBEAT_MIN_INTERVAL_MS = 2 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

function dispatchAutosave() {
  window.dispatchEvent(new CustomEvent('maxbooster:autosave', { bubbles: false }));
}

export function InactivityManager() {
  const { user, logout } = useAuth();
  const { toast, dismiss } = useToast();

  const logoutRef = useRef(logout);
  const toastRef = useRef(toast);
  const dismissRef = useRef(dismiss);
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { dismissRef.current = dismiss; }, [dismiss]);

  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeartbeatRef = useRef<number>(0);
  const warningToastIdRef = useRef<string | undefined>(undefined);

  const sendHeartbeat = useCallback(async () => {
    try {
      const csrfToken = getCsrfTokenFromCookie();
      await fetch('/api/auth/heartbeat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
      });
    } catch {
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (warningToastIdRef.current) {
      dismissRef.current(warningToastIdRef.current);
      warningToastIdRef.current = undefined;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();

    warningTimerRef.current = setTimeout(() => {
      dispatchAutosave();
      const { id } = toastRef.current({
        title: 'Still there?',
        description: 'Your progress has been saved. You\'ll be signed out in 5 minutes due to inactivity — move your mouse or press any key to stay signed in.',
        duration: WARNING_MS,
      });
      warningToastIdRef.current = id;
    }, INACTIVITY_MS - WARNING_MS);

    inactivityTimerRef.current = setTimeout(async () => {
      dispatchAutosave();
      await new Promise<void>(r => setTimeout(r, 800));
      await logoutRef.current();
    }, INACTIVITY_MS);
  }, [clearTimers]);

  const onActivity = useCallback(() => {
    if (warningToastIdRef.current) {
      dismissRef.current(warningToastIdRef.current);
      warningToastIdRef.current = undefined;
    }

    startTimers();

    const now = Date.now();
    if (now - lastHeartbeatRef.current >= HEARTBEAT_MIN_INTERVAL_MS) {
      lastHeartbeatRef.current = now;
      sendHeartbeat();
    }
  }, [startTimers, sendHeartbeat]);

  useEffect(() => {
    if (!user) {
      clearTimers();
      return;
    }

    lastHeartbeatRef.current = Date.now();
    sendHeartbeat();
    startTimers();

    ACTIVITY_EVENTS.forEach(event =>
      window.addEventListener(event, onActivity, { passive: true })
    );

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(event =>
        window.removeEventListener(event, onActivity)
      );
    };
  }, [user, onActivity, startTimers, clearTimers, sendHeartbeat]);

  return null;
}

export default InactivityManager;
