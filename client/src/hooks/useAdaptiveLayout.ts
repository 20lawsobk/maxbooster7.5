import { useMemo } from 'react';
import { useIsMobile, useIsTablet, useOrientation, useTouchDevice, useViewportSize } from './use-mobile';

export type LayoutMode = 'mobile' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';

export interface AdaptiveLayoutState {
  layoutMode: LayoutMode;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  columns: number;
  orientation: 'portrait' | 'landscape';
  sidebarWidth: number;
  contentGap: number;
  cardMinWidth: number;
}

export function useAdaptiveLayout(): AdaptiveLayoutState {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const orientation = useOrientation();
  const isTouch = useTouchDevice();
  const { width } = useViewportSize();

  const layoutMode: LayoutMode = useMemo(() => {
    if (isMobile) return 'mobile';
    if (isTablet) {
      return orientation === 'portrait' ? 'tablet-portrait' : 'tablet-landscape';
    }
    return 'desktop';
  }, [isMobile, isTablet, orientation]);

  const columns = useMemo(() => {
    switch (layoutMode) {
      case 'mobile':
        return 1;
      case 'tablet-portrait':
        return 2;
      case 'tablet-landscape':
        return 3;
      case 'desktop':
        return 4;
      default:
        return 2;
    }
  }, [layoutMode]);

  const sidebarWidth = useMemo(() => {
    switch (layoutMode) {
      case 'mobile':
        return 0;
      case 'tablet-portrait':
        return 280;
      case 'tablet-landscape':
        return 320;
      case 'desktop':
        return 280;
      default:
        return 280;
    }
  }, [layoutMode]);

  const contentGap = useMemo(() => {
    switch (layoutMode) {
      case 'mobile':
        return 12;
      case 'tablet-portrait':
        return 16;
      case 'tablet-landscape':
        return 20;
      case 'desktop':
        return 24;
      default:
        return 16;
    }
  }, [layoutMode]);

  const cardMinWidth = useMemo(() => {
    switch (layoutMode) {
      case 'mobile':
        return width - 32;
      case 'tablet-portrait':
        return 280;
      case 'tablet-landscape':
        return 300;
      case 'desktop':
        return 320;
      default:
        return 280;
    }
  }, [layoutMode, width]);

  return {
    layoutMode,
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    isTouch: isTouch || isMobile || isTablet,
    columns,
    orientation,
    sidebarWidth,
    contentGap,
    cardMinWidth,
  };
}

export function getGridColumns(layoutMode: LayoutMode): string {
  switch (layoutMode) {
    case 'mobile':
      return 'grid-cols-1';
    case 'tablet-portrait':
      return 'grid-cols-2';
    case 'tablet-landscape':
      return 'grid-cols-3';
    case 'desktop':
      return 'grid-cols-4';
    default:
      return 'grid-cols-2';
  }
}

export function getResponsiveGridClasses(columns: number): string {
  const gridMap: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };
  return gridMap[columns] || gridMap[2];
}
