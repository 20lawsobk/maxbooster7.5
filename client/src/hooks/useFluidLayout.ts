import { useState, useEffect, useRef, useCallback, RefObject } from 'react';

export type LayoutMode = 'mobile' | 'tablet' | 'desktop' | 'wide';

interface FluidLayoutConfig {
  mobileMax?: number;
  tabletMax?: number;
  desktopMax?: number;
}

interface FluidLayoutResult {
  containerRef: RefObject<HTMLDivElement>;
  layoutMode: LayoutMode;
  containerWidth: number;
  containerHeight: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  isSmallHeight: boolean;
}

const DEFAULT_CONFIG: FluidLayoutConfig = {
  mobileMax: 768,
  tabletMax: 1024,
  desktopMax: 1440,
};

export function useFluidLayout(config: FluidLayoutConfig = {}): FluidLayoutResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [containerHeight, setContainerHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);

  const { mobileMax, tabletMax, desktopMax } = { ...DEFAULT_CONFIG, ...config };

  const calculateLayoutMode = useCallback((width: number): LayoutMode => {
    if (width < mobileMax!) return 'mobile';
    if (width < tabletMax!) return 'tablet';
    if (width < desktopMax!) return 'desktop';
    return 'wide';
  }, [mobileMax, tabletMax, desktopMax]);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => calculateLayoutMode(containerWidth));

  useEffect(() => {
    const container = containerRef.current;
    
    const updateDimensions = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setContainerWidth(width);
        setContainerHeight(height);
        setLayoutMode(calculateLayoutMode(width));
      }
    };

    if (container) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          updateDimensions(width, height);
        }
      });
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    } else {
      const handleResize = () => {
        updateDimensions(window.innerWidth, window.innerHeight);
      };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [calculateLayoutMode]);

  return {
    containerRef,
    layoutMode,
    containerWidth,
    containerHeight,
    isMobile: layoutMode === 'mobile',
    isTablet: layoutMode === 'tablet',
    isDesktop: layoutMode === 'desktop',
    isWide: layoutMode === 'wide',
    isSmallHeight: containerHeight < 500,
  };
}

export function getFluidPadding(layoutMode: LayoutMode): string {
  switch (layoutMode) {
    case 'mobile': return 'px-3 py-3';
    case 'tablet': return 'px-4 py-4';
    case 'desktop': return 'px-6 py-5';
    case 'wide': return 'px-8 py-6';
  }
}

export function getFluidGap(layoutMode: LayoutMode): string {
  switch (layoutMode) {
    case 'mobile': return 'gap-3';
    case 'tablet': return 'gap-4';
    case 'desktop': return 'gap-5';
    case 'wide': return 'gap-6';
  }
}

export function getFluidGridCols(layoutMode: LayoutMode, defaultCols: number = 4): string {
  switch (layoutMode) {
    case 'mobile': return 'grid-cols-1';
    case 'tablet': return 'grid-cols-2';
    case 'desktop': return `grid-cols-${Math.min(defaultCols, 3)}`;
    case 'wide': return `grid-cols-${defaultCols}`;
  }
}

export function getFluidTextSize(layoutMode: LayoutMode, base: 'sm' | 'base' | 'lg' | 'xl' = 'base'): string {
  const sizeMap = {
    sm: { mobile: 'text-xs', tablet: 'text-sm', desktop: 'text-sm', wide: 'text-sm' },
    base: { mobile: 'text-sm', tablet: 'text-base', desktop: 'text-base', wide: 'text-base' },
    lg: { mobile: 'text-base', tablet: 'text-lg', desktop: 'text-lg', wide: 'text-xl' },
    xl: { mobile: 'text-lg', tablet: 'text-xl', desktop: 'text-2xl', wide: 'text-3xl' },
  };
  return sizeMap[base][layoutMode];
}
