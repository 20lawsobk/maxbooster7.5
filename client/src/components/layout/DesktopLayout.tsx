import { useState, ReactNode, createContext, useContext, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BreadcrumbTrail } from './Breadcrumb';
import { useFluidLayout, LayoutMode, getFluidPadding, getFluidGap } from '@/hooks/useFluidLayout';
import { cn } from '@/lib/utils';
import { Menu, Bell, Search, User, ChevronDown, Minus, Square, X } from 'lucide-react';
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
import { isElectron, getPlatformCapabilities } from '@/lib/environment';

interface DesktopLayoutContextType {
  layoutMode: LayoutMode;
  containerWidth: number;
  containerHeight: number;
  isMaximized: boolean;
  isFocused: boolean;
}

const DesktopLayoutContext = createContext<DesktopLayoutContextType | null>(null);

export function useDesktopLayout() {
  const context = useContext(DesktopLayoutContext);
  if (!context) {
    return {
      layoutMode: 'desktop' as LayoutMode,
      containerWidth: 1200,
      containerHeight: 800,
      isMaximized: false,
      isFocused: true,
    };
  }
  return context;
}

interface DesktopLayoutProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  noPadding?: boolean;
  showSidebar?: boolean;
  className?: string;
}

export function DesktopLayout({ 
  title, 
  subtitle, 
  children, 
  noPadding = false,
  showSidebar = true,
  className,
}: DesktopLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isFocused, setIsFocused] = useState(true);
  const fluidLayout = useFluidLayout();
  const { containerRef, layoutMode, containerWidth, containerHeight, isSmallHeight } = fluidLayout;
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const capabilities = getPlatformCapabilities();

  useEffect(() => {
    if (!isElectron()) return;

    const handleFocus = () => setIsFocused(true);
    const handleBlur = () => setIsFocused(false);
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const contextValue: DesktopLayoutContextType = {
    layoutMode,
    containerWidth,
    containerHeight,
    isMaximized,
    isFocused,
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

  // Narrow window for the Electron preload bridge — these methods only exist
  // when the renderer is running inside our Electron shell.
  const electronWindow = window as Window & {
    electronAPI?: {
      minimize?: () => void;
      maximize?: () => void;
      close?: () => void;
    };
  };

  const handleMinimize = () => {
    if (isElectron() && electronWindow.electronAPI?.minimize) {
      electronWindow.electronAPI.minimize();
    }
  };

  const handleMaximize = () => {
    if (isElectron() && electronWindow.electronAPI?.maximize) {
      electronWindow.electronAPI.maximize();
      setIsMaximized(!isMaximized);
    }
  };

  const handleClose = () => {
    if (isElectron() && electronWindow.electronAPI?.close) {
      electronWindow.electronAPI.close();
    }
  };

  return (
    <DesktopLayoutContext.Provider value={contextValue}>
      <div 
        ref={containerRef}
        className={cn(
          'flex bg-background overflow-hidden',
          !isFocused && 'opacity-95',
          className
        )}
        style={{ 
          height: '100dvh',
          minHeight: isSmallHeight ? 'auto' : '100dvh',
        }}
        data-layout="desktop"
        data-mode={layoutMode}
        data-focused={isFocused}
      >
        {showSidebar && (
          <Sidebar 
            isMobileOpen={isMobileMenuOpen} 
            onMobileClose={() => setIsMobileMenuOpen(false)} 
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header 
            className={cn(
              'h-12 border-b border-border bg-background flex items-center justify-between px-4 shrink-0',
              capabilities.hasWindowControls && 'app-region-drag'
            )}
          >
            <div className="flex items-center gap-3 app-region-no-drag">
              {showSidebar && (
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
                  <h1 className="font-semibold text-sm truncate">{title}</h1>
                )}
                {subtitle && (
                  <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 app-region-no-drag">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Search className="h-4 w-4" />
              </Button>
              
              <Button variant="ghost" size="icon" className="h-8 w-8 relative">
                <Bell className="h-4 w-4" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 h-8">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <span className="text-sm">
                      {user?.displayName || user?.username || 'User'}
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

              {capabilities.hasWindowControls && (
                <div className="flex items-center ml-4 -mr-2 border-l border-border pl-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-muted"
                    onClick={handleMinimize}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-muted"
                    onClick={handleMaximize}
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={handleClose}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </header>

          <main
            className={cn(
              'flex-1',
              noPadding ? 'overflow-hidden' : `overflow-y-auto ${getPadding()} pb-4`
            )}
          >
            {noPadding ? (
              children
            ) : (
              <div className="max-w-[1920px] mx-auto">
                <div className="mb-3">
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
    </DesktopLayoutContext.Provider>
  );
}
