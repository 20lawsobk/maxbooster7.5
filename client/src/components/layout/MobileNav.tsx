import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { announce } from '@/lib/accessibility';
import {
  LayoutDashboard,
  Music,
  Monitor,
  BarChart3,
  Share2,
  Megaphone,
  ShoppingBag,
  DollarSign,
  Disc,
  Radio,
  Shield,
  Brain,
  Menu,
  X,
  ChevronRight,
  HelpCircle,
  Settings,
  LogOut,
  Home,
} from 'lucide-react';

interface NavItem {
  labelKey: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { labelKey: 'navigation.dashboard', path: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'navigation.projects', path: '/projects', icon: Music },
  { labelKey: 'navigation.desktopApp', path: '/desktop-app', icon: Monitor },
  { labelKey: 'navigation.analytics', path: '/analytics', icon: BarChart3 },
  { labelKey: 'analytics.aiInsights', path: '/analytics/ai', icon: Brain },
  { labelKey: 'navigation.social', path: '/social-media', icon: Share2 },
  { labelKey: 'navigation.advertising', path: '/advertising', icon: Megaphone },
  { labelKey: 'navigation.marketplace', path: '/marketplace', icon: ShoppingBag },
  { labelKey: 'distribution.royalties', path: '/royalties', icon: DollarSign },
  { labelKey: 'navigation.studio', path: '/studio', icon: Disc },
  { labelKey: 'navigation.distribution', path: '/distribution', icon: Radio },
  { labelKey: 'settings.title', path: '/admin', icon: Shield, adminOnly: true },
];

const secondaryItems: NavItem[] = [
  { labelKey: 'navigation.settings', path: '/settings', icon: Settings },
  { labelKey: 'navigation.help', path: '/help', icon: HelpCircle },
];

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
}

export function MobileNav() {
  const { user, logoutMutation } = useAuth();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [swipeState, setSwipeState] = useState<SwipeState | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'admin';
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    setSwipeState({
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
    });
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!swipeState) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - swipeState.startX;
    const deltaY = touch.clientY - swipeState.startY;
    const deltaTime = Date.now() - swipeState.startTime;

    const minSwipeDistance = 50;
    const maxSwipeTime = 300;
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);

    if (isHorizontalSwipe && Math.abs(deltaX) > minSwipeDistance && deltaTime < maxSwipeTime) {
      if (deltaX > 0 && !isOpen) {
        setIsOpen(true);
        announce('Navigation menu opened');
      } else if (deltaX < 0 && isOpen) {
        setIsOpen(false);
        announce('Navigation menu closed');
      }
    }

    setSwipeState(null);
  }, [swipeState, isOpen]);

  useEffect(() => {
    const handleDocumentTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch.clientX < 30 || isOpen) {
        handleTouchStart(e);
      }
    };

    document.addEventListener('touchstart', handleDocumentTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleDocumentTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchEnd, isOpen]);

  useEffect(() => {
    setIsOpen(false);
  }, [location]);

  const handleLogout = async () => {
    setIsOpen(false);
    await logoutMutation.mutateAsync();
    announce('Logged out successfully');
    setLocation('/');
  };

  const handleNavClick = (path: string) => {
    setIsOpen(false);
    announce(`Navigating to ${path.replace('/', '')}`);
  };

  if (!user) {
    return (
      <nav className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b" role="navigation" aria-label="Mobile navigation">
        <div className="flex items-center justify-between px-4 h-14">
          <Link href="/" className="flex items-center gap-2">
            <Music className="w-6 h-6 text-blue-600" aria-hidden="true" />
            <span className="font-bold text-lg">Max Booster</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle variant="ghost" size="sm" />
            <Link href="/login">
              <Button size="sm">Login</Button>
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <>
      <nav
        className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b"
        role="navigation"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between px-4 h-14">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[44px] min-h-[44px]"
                aria-label="Open navigation menu"
                aria-expanded={isOpen}
                aria-controls="mobile-nav-menu"
              >
                <Menu className="h-6 w-6" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[85vw] max-w-[320px] p-0"
              id="mobile-nav-menu"
              ref={navRef}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-2">
                    <Music className="w-6 h-6 text-blue-600" aria-hidden="true" />
                    <div className="flex flex-col">
                      <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                        Max Booster
                      </span>
                      <span className="text-xs text-muted-foreground">by B-Lawz Music</span>
                    </div>
                  </div>
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="min-w-[44px] min-h-[44px]"
                      aria-label="Close navigation menu"
                    >
                      <X className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </SheetClose>
                </div>

                <div className="p-4 border-b bg-muted/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                      {user.username?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{user.username}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    {isAdmin && (
                      <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                        Admin
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-xs">
                    <span className={cn(
                      'px-2 py-1 rounded-full',
                      user.subscriptionTier === 'lifetime' && 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
                      user.subscriptionTier === 'yearly' && 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
                      user.subscriptionTier === 'monthly' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
                      !user.subscriptionTier && 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    )}>
                      {user.subscriptionTier === 'lifetime' && '🎵 Lifetime Access'}
                      {user.subscriptionTier === 'yearly' && '📅 Yearly Plan'}
                      {user.subscriptionTier === 'monthly' && '📆 Monthly Plan'}
                      {!user.subscriptionTier && 'Free'}
                    </span>
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-2">
                    <div className="mb-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Main Menu
                    </div>
                    <nav aria-label="Main navigation" role="navigation">
                      <ul className="space-y-1" role="menu">
                        {visibleNavItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location === item.path || location.startsWith(item.path + '/');
                          return (
                            <li key={item.path} role="none">
                              <Link
                                href={item.path}
                                onClick={() => handleNavClick(item.path)}
                                role="menuitem"
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-3 rounded-lg transition-all min-h-[48px] touch-manipulation',
                                  isActive
                                    ? 'bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-800/40 dark:to-blue-700/40 text-blue-600 dark:text-white'
                                    : 'text-foreground hover:bg-muted active:bg-muted/80'
                                )}
                              >
                                <Icon className={cn('w-5 h-5', isActive && 'text-blue-600 dark:text-blue-400')} aria-hidden="true" />
                                <span className="font-medium flex-1">{t(item.labelKey)}</span>
                                {isActive && (
                                  <ChevronRight className="w-4 h-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                                )}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </nav>

                    <div className="my-4 border-t" />

                    <div className="mb-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      More
                    </div>
                    <nav aria-label="Secondary navigation">
                      <ul className="space-y-1" role="menu">
                        {secondaryItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = location === item.path;
                          return (
                            <li key={item.path} role="none">
                              <Link
                                href={item.path}
                                onClick={() => handleNavClick(item.path)}
                                role="menuitem"
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-3 rounded-lg transition-all min-h-[48px] touch-manipulation',
                                  isActive
                                    ? 'bg-muted text-foreground'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                              >
                                <Icon className="w-5 h-5" aria-hidden="true" />
                                <span className="font-medium">{t(item.labelKey)}</span>
                              </Link>
                            </li>
                          );
                        })}
                        <li role="none">
                          <button
                            onClick={handleLogout}
                            disabled={logoutMutation.isPending}
                            role="menuitem"
                            className="flex items-center gap-3 px-3 py-3 rounded-lg transition-all min-h-[48px] w-full text-left text-destructive hover:bg-destructive/10 touch-manipulation"
                          >
                            <LogOut className="w-5 h-5" aria-hidden="true" />
                            <span className="font-medium">
                              {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                            </span>
                          </button>
                        </li>
                      </ul>
                    </nav>
                  </div>
                </ScrollArea>

                <div className="p-4 border-t bg-muted/30">
                  <div className="flex items-center justify-between">
                    <LanguageSwitcher />
                    <ThemeToggle variant="outline" size="sm" />
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/dashboard" className="flex items-center gap-2">
            <Music className="w-6 h-6 text-blue-600" aria-hidden="true" />
            <span className="font-bold">Max Booster</span>
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle variant="ghost" size="sm" />
            <Link href="/settings">
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[44px] min-h-[44px]"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>
      <div className="lg:hidden h-14" aria-hidden="true" />
    </>
  );
}

export function MobileBottomNav() {
  const { user } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  const bottomNavItems = [
    { path: '/dashboard', icon: Home, label: 'Home' },
    { path: '/studio', icon: Disc, label: 'Studio' },
    { path: '/analytics', icon: BarChart3, label: 'Analytics' },
    { path: '/social-media', icon: Share2, label: 'Social' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t safe-area-inset-bottom"
      role="navigation"
      aria-label="Bottom navigation"
    >
      <ul className="flex items-center justify-around h-16" role="menubar">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || location.startsWith(item.path + '/');
          return (
            <li key={item.path} role="none" className="flex-1">
              <Link
                href={item.path}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 py-2 min-h-[48px] touch-manipulation transition-colors',
                  isActive
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  className={cn('w-5 h-5 transition-transform', isActive && 'scale-110')}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function useMobileGestures() {
  const [gesture, setGesture] = useState<string | null>(null);

  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();

      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = touchEndTime - touchStartTime;

      const minSwipeDistance = 50;
      const maxSwipeTime = 300;

      if (deltaTime > maxSwipeTime) return;

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        setGesture(deltaX > 0 ? 'swipe-right' : 'swipe-left');
      } else if (Math.abs(deltaY) > minSwipeDistance) {
        setGesture(deltaY > 0 ? 'swipe-down' : 'swipe-up');
      }

      setTimeout(() => setGesture(null), 100);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return gesture;
}
