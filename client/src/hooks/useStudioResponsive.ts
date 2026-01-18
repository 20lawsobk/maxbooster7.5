import { useMemo, useCallback, useState, useEffect } from 'react';
import { useIsMobile, useIsTablet, useOrientation, useTouchDevice, useViewportSize, useSafeAreaInsets } from './use-mobile';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';

export type StudioLayoutMode = 'mobile' | 'tablet-portrait' | 'tablet-landscape' | 'desktop';
export type StudioPanelMode = 'hidden' | 'drawer' | 'sidebar' | 'overlay' | 'full';

export interface StudioPanelConfig {
  browser: StudioPanelMode;
  inspector: StudioPanelMode;
  console: StudioPanelMode;
  launcher: StudioPanelMode;
  browserWidth: number;
  inspectorWidth: number;
  consoleHeight: number;
  showToolbar: boolean;
  toolbarHeight: number;
  transportHeight: number;
  touchTargetSize: number;
  faderHeight: number;
  channelWidth: number;
}

export interface StudioResponsiveState {
  layoutMode: StudioLayoutMode;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  orientation: 'portrait' | 'landscape';
  panelConfig: StudioPanelConfig;
  viewport: { width: number; height: number };
  safeArea: { top: number; right: number; bottom: number; left: number };
  activeDrawer: 'browser' | 'inspector' | 'console' | 'mixer' | null;
  setActiveDrawer: (drawer: 'browser' | 'inspector' | 'console' | 'mixer' | null) => void;
  toggleDrawer: (drawer: 'browser' | 'inspector' | 'console' | 'mixer') => void;
  closeAllDrawers: () => void;
}

const MOBILE_PANEL_CONFIG: StudioPanelConfig = {
  browser: 'drawer',
  inspector: 'drawer',
  console: 'drawer',
  launcher: 'overlay',
  browserWidth: 280,
  inspectorWidth: 260,
  consoleHeight: 320,
  showToolbar: true,
  toolbarHeight: 48,
  transportHeight: 56,
  touchTargetSize: 44,
  faderHeight: 160,
  channelWidth: 60,
};

const TABLET_PORTRAIT_CONFIG: StudioPanelConfig = {
  browser: 'drawer',
  inspector: 'drawer',
  console: 'drawer',
  launcher: 'overlay',
  browserWidth: 300,
  inspectorWidth: 280,
  consoleHeight: 280,
  showToolbar: true,
  toolbarHeight: 44,
  transportHeight: 52,
  touchTargetSize: 40,
  faderHeight: 180,
  channelWidth: 70,
};

const TABLET_LANDSCAPE_CONFIG: StudioPanelConfig = {
  browser: 'sidebar',
  inspector: 'sidebar',
  console: 'sidebar',
  launcher: 'sidebar',
  browserWidth: 260,
  inspectorWidth: 240,
  consoleHeight: 240,
  showToolbar: true,
  toolbarHeight: 40,
  transportHeight: 48,
  touchTargetSize: 36,
  faderHeight: 200,
  channelWidth: 72,
};

const DESKTOP_CONFIG: StudioPanelConfig = {
  browser: 'sidebar',
  inspector: 'sidebar',
  console: 'sidebar',
  launcher: 'sidebar',
  browserWidth: 280,
  inspectorWidth: 260,
  consoleHeight: 300,
  showToolbar: true,
  toolbarHeight: 36,
  transportHeight: 44,
  touchTargetSize: 32,
  faderHeight: 220,
  channelWidth: 80,
};

export function useStudioResponsive(): StudioResponsiveState {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const orientation = useOrientation();
  const isTouch = useTouchDevice();
  const viewport = useViewportSize();
  const safeArea = useSafeAreaInsets();
  
  const [activeDrawer, setActiveDrawer] = useState<'browser' | 'inspector' | 'console' | 'mixer' | null>(null);

  const layoutMode: StudioLayoutMode = useMemo(() => {
    if (isMobile) return 'mobile';
    if (isTablet) {
      return orientation === 'portrait' ? 'tablet-portrait' : 'tablet-landscape';
    }
    return 'desktop';
  }, [isMobile, isTablet, orientation]);

  const panelConfig: StudioPanelConfig = useMemo(() => {
    switch (layoutMode) {
      case 'mobile':
        return MOBILE_PANEL_CONFIG;
      case 'tablet-portrait':
        return TABLET_PORTRAIT_CONFIG;
      case 'tablet-landscape':
        return TABLET_LANDSCAPE_CONFIG;
      case 'desktop':
      default:
        return DESKTOP_CONFIG;
    }
  }, [layoutMode]);

  const toggleDrawer = useCallback((drawer: 'browser' | 'inspector' | 'console' | 'mixer') => {
    setActiveDrawer(prev => prev === drawer ? null : drawer);
  }, []);

  const closeAllDrawers = useCallback(() => {
    setActiveDrawer(null);
  }, []);

  useEffect(() => {
    if (layoutMode === 'desktop' || layoutMode === 'tablet-landscape') {
      setActiveDrawer(null);
    }
  }, [layoutMode]);

  return {
    layoutMode,
    isMobile,
    isTablet,
    isDesktop: !isMobile && !isTablet,
    isTouch: isTouch || isMobile || isTablet,
    orientation,
    panelConfig,
    viewport,
    safeArea,
    activeDrawer,
    setActiveDrawer,
    toggleDrawer,
    closeAllDrawers,
  };
}

export function getStudioGridColumns(layoutMode: StudioLayoutMode): number {
  switch (layoutMode) {
    case 'mobile':
      return 4;
    case 'tablet-portrait':
      return 6;
    case 'tablet-landscape':
      return 8;
    case 'desktop':
    default:
      return 12;
  }
}

export function getStudioTrackHeight(layoutMode: StudioLayoutMode): number {
  switch (layoutMode) {
    case 'mobile':
      return 72;
    case 'tablet-portrait':
      return 64;
    case 'tablet-landscape':
      return 56;
    case 'desktop':
    default:
      return 48;
  }
}

export function getStudioPinchZoomEnabled(layoutMode: StudioLayoutMode): boolean {
  return layoutMode === 'mobile' || layoutMode === 'tablet-portrait' || layoutMode === 'tablet-landscape';
}
