import { useState, ReactNode, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileBottomNav } from './MobileBottomNav';
import { BreadcrumbTrail } from './Breadcrumb';
import { useFluidLayout, LayoutMode, getFluidPadding, getFluidGap } from '@/hooks/useFluidLayout';
import { useAuth } from '@/hooks/useAuth';

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

function DemoBanner() {
  return (
    <div className="bg-amber-500 text-white text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-2 shrink-0">
      <span>You're exploring Demo Mode (read-only)</span>
      <a href="/pricing" className="underline font-semibold hover:text-amber-100">Subscribe to unlock full access</a>
    </div>
  );
}

export function AppLayout({ title, subtitle, children, noPadding = false }: AppLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fluidLayout = useFluidLayout();
  const { containerRef, layoutMode, isMobile, isTablet, isSmallHeight } = fluidLayout;
  const { user } = useAuth();
  const isDemo = (user as Record<string, unknown>)?.isDemo === true || user?.email === 'demo@maxbooster.ai';

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
        className="flex bg-gray-50 dark:bg-[#080812] overflow-hidden"
        style={{ 
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
        }}
        data-layout={layoutMode}
      >
        <Sidebar isMobileOpen={isMobileMenuOpen} onMobileClose={() => setIsMobileMenuOpen(false)} />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {isDemo && <DemoBanner />}
          <TopBar title={title} subtitle={subtitle} onMenuClick={() => setIsMobileMenuOpen(true)} />

          <main
            className={`flex-1 page-enter ${noPadding ? 'overflow-hidden' : `overflow-y-auto ${getPadding()} pb-safe-bottom`}`}
            style={isMobile && !noPadding ? { paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.5rem)' } : undefined}
          >
            {noPadding ? (
              children
            ) : (
              <div className="max-w-[1920px] mx-auto">
                <div className={isMobile ? 'mb-2' : isTablet ? 'mb-3' : 'mb-4'}>
                  <BreadcrumbTrail />
                </div>
                <div className={getSpacing().replace('gap', 'space-y')}>
                  {children}
                </div>
              </div>
            )}
          </main>
        </div>

        {isMobile && !noPadding && (
          <MobileBottomNav onMoreClick={() => setIsMobileMenuOpen(true)} />
        )}
      </div>
    </FluidLayoutContext.Provider>
  );
}
