import { ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileLayout } from './MobileLayout';
import { WebLayout } from './WebLayout';
import { DesktopLayout } from './DesktopLayout';
import { isElectron, isCapacitor } from '@/lib/environment';

export type LayoutType = 'mobile' | 'web' | 'desktop';

interface ResponsiveLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  noPadding?: boolean;
  mobileContent?: ReactNode;
  webContent?: ReactNode;
  desktopContent?: ReactNode;
  tabletContent?: ReactNode;
  showNavigation?: boolean;
  enableSwipeNavigation?: boolean;
  showSidebar?: boolean;
  showFloatingActions?: boolean;
  className?: string;
}

export function ResponsiveLayout({
  children,
  title,
  subtitle,
  noPadding = false,
  mobileContent,
  webContent,
  desktopContent,
  tabletContent,
  showNavigation = true,
  enableSwipeNavigation = true,
  showSidebar = true,
  showFloatingActions = true,
  className,
}: ResponsiveLayoutProps) {
  const layoutType = useLayoutType();
  
  const effectiveWebContent = webContent || tabletContent || children;
  const effectiveMobileContent = mobileContent || webContent || tabletContent || children;
  const effectiveDesktopContent = desktopContent || webContent || tabletContent || children;

  if (layoutType === 'mobile') {
    return (
      <MobileLayout
        title={title}
        subtitle={subtitle}
        showNavigation={showNavigation}
        enableSwipeNavigation={enableSwipeNavigation}
        noPadding={noPadding}
        className={className}
      >
        {effectiveMobileContent}
      </MobileLayout>
    );
  }

  if (layoutType === 'desktop') {
    return (
      <DesktopLayout
        title={title}
        subtitle={subtitle}
        noPadding={noPadding}
        showSidebar={showSidebar}
        className={className}
      >
        {effectiveDesktopContent}
      </DesktopLayout>
    );
  }

  return (
    <WebLayout
      title={title}
      subtitle={subtitle}
      noPadding={noPadding}
      showSidebar={showSidebar}
      className={className}
    >
      {effectiveWebContent}
    </WebLayout>
  );
}

export function useLayoutType(): LayoutType {
  const isMobile = useIsMobile();

  if (isMobile || isCapacitor()) {
    return 'mobile';
  }

  if (isElectron()) {
    return 'desktop';
  }

  return 'web';
}

export function getLayoutTypeSync(): LayoutType {
  if (isCapacitor()) {
    return 'mobile';
  }

  if (isElectron()) {
    return 'desktop';
  }

  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    return 'mobile';
  }

  return 'web';
}
