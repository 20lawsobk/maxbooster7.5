import { useLocation, Link } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { triggerHapticFeedback } from '@/hooks/useTouchGestures';
import {
  Home,
  Disc,
  Radio,
  ShoppingBag,
  User,
} from 'lucide-react';

interface NavItem {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
}

const navItems: NavItem[] = [
  { path: '/dashboard', icon: Home, label: 'Home' },
  { path: '/studio', icon: Disc, label: 'Studio' },
  { path: '/distribution', icon: Radio, label: 'Distribute' },
  { path: '/marketplace', icon: ShoppingBag, label: 'Market' },
  { path: '/settings', icon: User, label: 'Profile' },
];

export function MobileNavigation() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: notifications } = useQuery({
    queryKey: ['/api/notifications/unread-count'],
    enabled: !!user,
    staleTime: 30000,
  });

  const unreadCount = (notifications as any)?.count || 0;

  if (!user) return null;

  const handleNavClick = () => {
    triggerHapticFeedback('light');
  };

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border"
      role="navigation"
      aria-label="Mobile navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch justify-around" role="menubar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location === item.path || location.startsWith(item.path + '/');
          const showBadge = item.path === '/settings' && unreadCount > 0;

          return (
            <li key={item.path} role="none" className="flex-1">
              <Link
                href={item.path}
                onClick={handleNavClick}
                role="menuitem"
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] min-w-[44px] touch-manipulation transition-all duration-200',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground active:scale-95'
                )}
              >
                <div className="relative">
                  <div
                    className={cn(
                      'p-1.5 rounded-xl transition-all duration-200',
                      isActive && 'bg-primary/10'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 transition-transform duration-200',
                        isActive && 'scale-110'
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />
                  )}
                </div>
                <span className={cn(
                  'text-[10px] font-medium transition-colors',
                  isActive && 'text-primary'
                )}>
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNavigationSpacer() {
  return (
    <div 
      className="lg:hidden h-[56px]" 
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-hidden="true" 
    />
  );
}
