import * as React from 'react';

export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1280,
  wide: 1536,
};

const MOBILE_BREAKPOINT = BREAKPOINTS.mobile;
const TABLET_BREAKPOINT = BREAKPOINTS.tablet;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = React.useState<boolean>(false);

  React.useEffect(() => {
    const onChange = () => {
      const width = window.innerWidth;
      setIsTablet(width >= MOBILE_BREAKPOINT && width < TABLET_BREAKPOINT);
    };
    onChange();
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, []);

  return isTablet;
}

export function useIsMobileOrTablet() {
  const [isMobileOrTablet, setIsMobileOrTablet] = React.useState<boolean>(false);

  React.useEffect(() => {
    const onChange = () => {
      setIsMobileOrTablet(window.innerWidth < TABLET_BREAKPOINT);
    };
    onChange();
    window.addEventListener('resize', onChange);
    return () => window.removeEventListener('resize', onChange);
  }, []);

  return isMobileOrTablet;
}

export function useOrientation() {
  const [orientation, setOrientation] = React.useState<'portrait' | 'landscape'>('portrait');

  React.useEffect(() => {
    const handleChange = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };
    handleChange();
    window.addEventListener('resize', handleChange);
    window.addEventListener('orientationchange', handleChange);
    return () => {
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('orientationchange', handleChange);
    };
  }, []);

  return orientation;
}

export function useBreakpoint() {
  const [breakpoint, setBreakpoint] = React.useState<'mobile' | 'tablet' | 'desktop' | 'wide'>('desktop');

  React.useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.mobile) {
        setBreakpoint('mobile');
      } else if (width < BREAKPOINTS.tablet) {
        setBreakpoint('tablet');
      } else if (width < BREAKPOINTS.wide) {
        setBreakpoint('desktop');
      } else {
        setBreakpoint('wide');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return breakpoint;
}

export function useViewportSize() {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  React.useEffect(() => {
    const handleResize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return size;
}

export function useTouchDevice() {
  const [isTouch, setIsTouch] = React.useState(false);

  React.useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  return isTouch;
}

export function useSafeAreaInsets() {
  const [insets, setInsets] = React.useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  React.useEffect(() => {
    const computedStyle = getComputedStyle(document.documentElement);
    setInsets({
      top: parseInt(computedStyle.getPropertyValue('--sat') || '0', 10),
      right: parseInt(computedStyle.getPropertyValue('--sar') || '0', 10),
      bottom: parseInt(computedStyle.getPropertyValue('--sab') || '0', 10),
      left: parseInt(computedStyle.getPropertyValue('--sal') || '0', 10),
    });
  }, []);

  return insets;
}
