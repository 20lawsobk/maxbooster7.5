import { useEffect } from 'react';
import { useLocation } from 'wouter';

const DEEP_LINK_ROUTES: Record<string, string> = {
  'dashboard': '/dashboard',
  'studio': '/studio',
  'distribution': '/distribution',
  'marketplace': '/marketplace',
  'analytics': '/analytics',
  'settings': '/settings',
  'profile': '/profile',
};

export function DeepLinkHandler() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepLink = params.get('url');
    
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    if ('launchQueue' in window) {
      (window as any).launchQueue.setConsumer((launchParams: any) => {
        if (launchParams.targetURL) {
          handleDeepLink(launchParams.targetURL);
        }
      });
    }
  }, []);

  const handleDeepLink = (url: string) => {
    try {
      const cleaned = url.replace(/^(web\+)?maxbooster:\/\//, '');
      const [route, ...params] = cleaned.split('/');
      
      const targetPath = DEEP_LINK_ROUTES[route];
      if (targetPath) {
        const fullPath = params.length > 0 
          ? `${targetPath}/${params.join('/')}`
          : targetPath;
        setLocation(fullPath);
      }
    } catch (error) {
      console.error('[DeepLink] Failed to parse deep link:', error);
    }
  };

  return null;
}
