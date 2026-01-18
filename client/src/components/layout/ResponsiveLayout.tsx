import { ReactNode } from 'react';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';
import { MobileLayout } from './MobileLayout';
import { TabletLayout } from './TabletLayout';
import { AppLayout } from './AppLayout';

interface ResponsiveLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  noPadding?: boolean;
  mobileContent?: ReactNode;
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
  tabletContent,
  showNavigation = true,
  enableSwipeNavigation = true,
  showSidebar = true,
  showFloatingActions = true,
  className,
}: ResponsiveLayoutProps) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  if (isMobile) {
    return (
      <MobileLayout
        title={title}
        subtitle={subtitle}
        showNavigation={showNavigation}
        enableSwipeNavigation={enableSwipeNavigation}
        noPadding={noPadding}
        className={className}
      >
        {mobileContent || children}
      </MobileLayout>
    );
  }

  if (isTablet) {
    return (
      <TabletLayout
        title={title}
        subtitle={subtitle}
        noPadding={noPadding}
        showSidebar={showSidebar}
        showFloatingActions={showFloatingActions}
        className={className}
      >
        {tabletContent || children}
      </TabletLayout>
    );
  }

  return (
    <AppLayout title={title} subtitle={subtitle} noPadding={noPadding}>
      {children}
    </AppLayout>
  );
}

export function useLayoutType() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();

  if (isMobile) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}
