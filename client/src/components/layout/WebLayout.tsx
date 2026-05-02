import { useState, ReactNode, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';
import { BreadcrumbTrail } from './Breadcrumb';
import { useFluidLayout, LayoutMode, getFluidPadding, getFluidGap } from '@/hooks/useFluidLayout';
import { cn } from '@/lib/utils';
import { Menu, Bell, Search, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';

interface WebLayoutContextType {
  layoutMode: LayoutMode;
  containerWidth: number;
  containerHeight: number;
  isCompact: boolean;
  isWide: boolean;
}

const WebLayoutContext = createContext<WebLayoutContextType | null>(null);

export function useWebLayout() {
  const context = useContext(WebLayoutContext);
  if (!context) {
    return {
      layoutMode: 'desktop' as LayoutMode,
      containerWidth: 1200,
      containerHeight: 800,
      isCompact: false,
      isWide: false,
    };
  }
  return context;
}

interface WebLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  noPadding?: boolean;
  showSidebar?: boolean;
  className?: string;
}

export function WebLayout({ 
  title, 
  subtitle, 
  children, 
  noPadding = false,
  showSidebar = true,
  className,
}: WebLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const fluidLayout = useFluidLayout();
  const { containerRef, layoutMode, containerWidth, containerHeight, isSmallHeight } = fluidLayout;
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const isCompact = containerWidth < 1024;
  const isWide = containerWidth > 1600;

  const contextValue: WebLayoutContextType = {
    layoutMode,
    containerWidth,
    containerHeight,
    isCompact,
    isWide,
  };

  const getPadding = () => {
    if (noPadding) return '';
    return getFluidPadding(layoutMode);
  };

  const getSpacing = () => {
    return getFluidGap(layoutMode);
  };

  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
      setLocation('/login');
    }
  };

  return (
    <WebLayoutContext.Provider value={contextValue}>
      <div 
        ref={containerRef}
        className={cn(
          'flex bg-background overflow-hidden',
          className
        )}
        style={{ 
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
        }}
        data-layout="web"
        data-mode={layoutMode}
      >
        {showSidebar && (
          <Sidebar 
            isMobileOpen={isMobileMenuOpen} 
            onMobileClose={() => setIsMobileMenuOpen(false)} 
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="h-14 border-b border-border bg-background/95 backdrop-blur-sm flex items-center justify-between px-4 lg:px-6 shrink-0">
            <div className="flex items-center gap-3">
              {showSidebar && isCompact && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              )}
              
              <div className="min-w-0">
                {title && (
                  <h1 className="font-semibold text-base truncate">{title}</h1>
                )}
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="hidden sm:flex">
                <Search className="h-4 w-4" />
              </Button>
              
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="hidden md:inline text-sm">
                      {user?.username || 'User'}
                    </span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setLocation('/settings')}>
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation('/settings/profile')}>
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main
            className={cn(
              'flex-1',
              noPadding ? 'overflow-hidden' : `overflow-y-auto ${getPadding()} pb-6`
            )}
          >
            {noPadding ? (
              children
            ) : (
              <div className="max-w-[1920px] mx-auto">
                <div className="mb-4">
                  <BreadcrumbTrail />
                </div>
                <div className={getSpacing().replace('gap', 'space-y')}>
                  {children}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </WebLayoutContext.Provider>
  );
}
