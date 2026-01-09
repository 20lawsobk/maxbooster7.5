import { useState, ReactNode, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BreadcrumbTrail } from './Breadcrumb';
import { useFluidLayout, LayoutMode, getFluidPadding, getFluidGap } from '@/hooks/useFluidLayout';

interface FluidLayoutContextType {
  layoutMode: LayoutMode;
  containerWidth: number;
  containerHeight: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  isSmallHeight: boolean;
}

const FluidLayoutContext = createContext<FluidLayoutContextType | null>(null);

export function useAppLayout() {
  const context = useContext(FluidLayoutContext);
  if (!context) {
    return {
      layoutMode: 'desktop' as LayoutMode,
      containerWidth: 1200,
      containerHeight: 800,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isWide: false,
      isSmallHeight: false,
    };
  }
  return context;
}

interface AppLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  noPadding?: boolean;
}

export function AppLayout({ title, subtitle, children, noPadding = false }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fluidLayout = useFluidLayout();
  const { containerRef, layoutMode, isMobile, isTablet, isSmallHeight } = fluidLayout;

  const getPadding = () => {
    if (noPadding) return '';
    return getFluidPadding(layoutMode);
  };

  const getSpacing = () => {
    return getFluidGap(layoutMode);
  };

  return (
    <FluidLayoutContext.Provider value={fluidLayout}>
      <div 
        ref={containerRef}
        className="flex bg-gray-50 dark:bg-background overflow-hidden max-w-[1920px] mx-auto"
        style={{ 
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
        }}
        data-layout={layoutMode}
      >
        <Sidebar isMobileOpen={isMobileMenuOpen} onMobileClose={() => setIsMobileMenuOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <TopBar title={title} subtitle={subtitle} onMenuClick={() => setIsMobileMenuOpen(true)} />

          <main
            className={`flex-1 ${noPadding ? 'overflow-hidden' : `overflow-y-auto ${getPadding()} pb-safe-bottom`}`}
          >
            {!noPadding && (
              <div className={isMobile ? 'mb-2' : isTablet ? 'mb-3' : 'mb-4'}>
                <BreadcrumbTrail />
              </div>
            )}
            <div className={noPadding ? '' : getSpacing().replace('gap', 'space-y')}>
              {children}
            </div>
          </main>
        </div>
      </div>
    </FluidLayoutContext.Provider>
  );
}
