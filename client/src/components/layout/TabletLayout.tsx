import { useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { useLocation } from 'wouter';
import { useIsTablet, useOrientation } from '@/hooks/use-mobile';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useSwipeGesture, triggerHapticFeedback } from '@/hooks/useTouchGestures';
import { SplitPane } from '@/components/ui/SplitPane';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BreadcrumbTrail } from './Breadcrumb';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Plus,
  Upload,
  Music,
  Radio,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

interface TabletLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  noPadding?: boolean;
  showSidebar?: boolean;
  showFloatingActions?: boolean;
  className?: string;
}

interface FloatingAction {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  onClick: () => void;
}

export function TabletLayout({
  children,
  title,
  subtitle,
  noPadding = false,
  showSidebar = true,
  showFloatingActions = true,
  className,
}: TabletLayoutProps) {
  const isTablet = useIsTablet();
  const orientation = useOrientation();
  const { layoutMode, columns, sidebarWidth, contentGap } = useAdaptiveLayout();
  const [location, setLocation] = useLocation();
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showFABMenu, setShowFABMenu] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isLandscape = orientation === 'landscape';
  const effectiveSidebarWidth = sidebarCollapsed ? 64 : sidebarWidth;

  useSwipeGesture(sidebarRef, {
    threshold: 30,
    onSwipeLeft: () => {
      if (!sidebarCollapsed) {
        setSidebarCollapsed(true);
        triggerHapticFeedback('medium');
      }
    },
    onSwipeRight: () => {
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
        triggerHapticFeedback('medium');
      }
    },
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
    triggerHapticFeedback('light');
  }, []);

  const floatingActions: FloatingAction[] = [
    {
      id: 'new-project',
      icon: Plus,
      label: 'New Project',
      color: 'bg-blue-500 hover:bg-blue-600',
      onClick: () => {
        setLocation('/projects');
        setShowFABMenu(false);
      },
    },
    {
      id: 'upload',
      icon: Upload,
      label: 'Upload Track',
      color: 'bg-purple-500 hover:bg-purple-600',
      onClick: () => {
        setLocation('/studio');
        setShowFABMenu(false);
      },
    },
    {
      id: 'studio',
      icon: Music,
      label: 'Open Studio',
      color: 'bg-green-500 hover:bg-green-600',
      onClick: () => {
        setLocation('/studio');
        setShowFABMenu(false);
      },
    },
    {
      id: 'distribute',
      icon: Radio,
      label: 'Distribute',
      color: 'bg-orange-500 hover:bg-orange-600',
      onClick: () => {
        setLocation('/distribution');
        setShowFABMenu(false);
      },
    },
    {
      id: 'analytics',
      icon: BarChart3,
      label: 'Analytics',
      color: 'bg-cyan-500 hover:bg-cyan-600',
      onClick: () => {
        setLocation('/analytics');
        setShowFABMenu(false);
      },
    },
  ];

  const handleFABClick = () => {
    setShowFABMenu(!showFABMenu);
    triggerHapticFeedback('medium');
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showFABMenu) {
        setShowFABMenu(false);
      }
    };

    if (showFABMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showFABMenu]);

  if (!isTablet) {
    return <>{children}</>;
  }

  const renderSidebar = () => (
    <div
      ref={sidebarRef}
      className={cn(
        'h-full bg-background border-r transition-all duration-300 flex flex-col',
        sidebarCollapsed ? 'w-16' : 'w-full'
      )}
      style={{ width: effectiveSidebarWidth }}
    >
      <div className="flex items-center justify-between p-3 border-b">
        {!sidebarCollapsed && (
          <span className="font-semibold text-sm">Max Booster</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-10 h-10"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Sidebar 
          isMobileOpen={false} 
          onMobileClose={() => {}} 
          collapsed={sidebarCollapsed}
        />
      </div>
    </div>
  );

  const renderMainContent = () => (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <TopBar 
        title={title} 
        subtitle={subtitle} 
        onMenuClick={toggleSidebar}
      />
      
      <main
        className={cn(
          'flex-1 overflow-y-auto',
          !noPadding && 'p-4 md:p-6'
        )}
      >
        {!noPadding && (
          <div className="mb-4">
            <BreadcrumbTrail />
          </div>
        )}
        
        <div
          className={cn('tablet-content', className)}
          style={{ 
            gap: contentGap,
            '--tablet-columns': columns,
          } as React.CSSProperties}
          data-layout={layoutMode}
          data-orientation={orientation}
        >
          {children}
        </div>
      </main>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex bg-gray-50 dark:bg-background overflow-hidden',
        isLandscape && 'landscape-tablet-mode'
      )}
      style={{ height: '100dvh' }}
      data-layout={layoutMode}
      data-orientation={orientation}
    >
      {showSidebar ? (
        <SplitPane
          direction="horizontal"
          defaultSize={effectiveSidebarWidth}
          minSize={64}
          maxSize={400}
          snapSizes={[64, 200, 280, 320]}
          snapThreshold={15}
          primaryPane={renderSidebar()}
          secondaryPane={renderMainContent()}
          className="w-full h-full"
          disabled={sidebarCollapsed}
        />
      ) : (
        renderMainContent()
      )}

      {showFloatingActions && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={cn(
              'absolute bottom-16 right-0 flex flex-col gap-3 transition-all duration-300',
              showFABMenu
                ? 'opacity-100 translate-y-0 pointer-events-auto'
                : 'opacity-0 translate-y-4 pointer-events-none'
            )}
          >
            {floatingActions.map((action, index) => (
              <div
                key={action.id}
                className="flex items-center gap-3 justify-end"
                style={{
                  transitionDelay: showFABMenu ? `${index * 50}ms` : '0ms',
                }}
              >
                <span className="bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap">
                  {action.label}
                </span>
                <Button
                  size="icon"
                  className={cn('w-12 h-12 rounded-full shadow-lg', action.color)}
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerHapticFeedback('medium');
                    action.onClick();
                  }}
                >
                  <action.icon className="w-5 h-5 text-white" />
                </Button>
              </div>
            ))}
          </div>

          <Button
            size="icon"
            className={cn(
              'w-14 h-14 rounded-full shadow-xl transition-all duration-300',
              showFABMenu
                ? 'bg-destructive hover:bg-destructive/90 rotate-45'
                : 'bg-primary hover:bg-primary/90 rotate-0'
            )}
            onClick={(e) => {
              e.stopPropagation();
              handleFABClick();
            }}
          >
            {showFABMenu ? (
              <X className="w-6 h-6" />
            ) : (
              <Plus className="w-6 h-6" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

interface TabletGridProps {
  children: ReactNode;
  columns?: 2 | 3;
  gap?: number;
  className?: string;
}

export function TabletGrid({ 
  children, 
  columns, 
  gap = 16, 
  className 
}: TabletGridProps) {
  const { layoutMode, columns: autoColumns } = useAdaptiveLayout();
  const effectiveColumns = columns || (layoutMode === 'tablet-portrait' ? 2 : 3);

  return (
    <div
      className={cn(
        'grid',
        effectiveColumns === 2 && 'grid-cols-2',
        effectiveColumns === 3 && 'grid-cols-3',
        className
      )}
      style={{ gap }}
    >
      {children}
    </div>
  );
}

export function TabletCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  const { layoutMode } = useAdaptiveLayout();

  return (
    <div
      className={cn(
        'grid gap-4',
        layoutMode === 'tablet-portrait' && 'grid-cols-2',
        layoutMode === 'tablet-landscape' && 'grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}
