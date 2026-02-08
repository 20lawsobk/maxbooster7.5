import { useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { prefetchRouteByPath } from '@/lib/prefetch';

export function useInstantNavigation() {
  const [, setLocation] = useLocation();
  const navigatingRef = useRef(false);

  const navigate = useCallback((path: string) => {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    
    prefetchRouteByPath(path);
    
    requestAnimationFrame(() => {
      setLocation(path);
      navigatingRef.current = false;
    });
  }, [setLocation]);

  const prefetchOnHover = useCallback((path: string) => {
    prefetchRouteByPath(path);
  }, []);

  return { navigate, prefetchOnHover };
}
