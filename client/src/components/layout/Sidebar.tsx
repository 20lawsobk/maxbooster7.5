import { useAuth } from '@/hooks/useAuth';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
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
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';

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
  { labelKey: 'settings.security', path: '/admin/security', icon: Shield, adminOnly: true },
];

interface SidebarProps {
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

/**
 * Sidebar component with navigation and language switcher
 */
export function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const { t } = useTranslation();

  if (!user) {
    return null;
  }

  const isAdmin = user.role === 'admin';
  const visibleNavItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          data-testid="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-background border-r border-gray-200 dark:border-border flex flex-col h-full transition-transform duration-300 lg:translate-x-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 border-b border-gray-200 dark:border-border">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Music className="w-6 h-6 text-primary" />
              <div className="flex flex-col">
                <h2 className="text-lg font-bold bg-gradient-to-r from-amber-500 to-purple-600 bg-clip-text text-transparent">Max Booster</h2>
                <span className="text-xs text-gray-500 dark:text-muted-foreground">by B-Lawz Music</span>
              </div>
            </div>
            {/* Mobile Close Button */}
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={onMobileClose}
              data-testid="sidebar-close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {user.subscriptionPlan === 'lifetime'
              ? '🎵 Lifetime Access'
              : user.subscriptionPlan === 'yearly'
                ? '📅 Yearly Plan'
                : user.subscriptionPlan === 'monthly'
                  ? '📆 Monthly Plan'
                  : 'Free'}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || location.startsWith(item.path + '/');

            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ease-in-out group',
                  isActive
                    ? 'bg-gradient-to-r from-amber-500/20 to-purple-600/20 text-primary dark:text-primary shadow-sm border border-primary/30'
                    : 'text-gray-700 dark:text-foreground hover:bg-muted dark:hover:bg-muted hover:shadow-sm'
                )}
                onClick={(e) => {
                  // Close mobile menu immediately on click
                  if (onMobileClose) {
                    onMobileClose();
                  }
                }}
                data-testid={`nav-${item.path.replace('/', '')}`}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-transform duration-200',
                    isActive ? 'scale-110' : 'group-hover:scale-110'
                  )}
                />
                <span className="font-medium">{t(item.labelKey)}</span>
                {isActive && (
                  <div className="ml-auto w-1 h-4 bg-gradient-to-b from-amber-500 to-purple-600 rounded-full animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 dark:border-border space-y-3">
          <div className="flex items-center justify-between mb-3">
            <LanguageSwitcher />
            <ThemeToggle variant="outline" size="sm" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{user.username}</p>
            <p className="truncate">{user.email}</p>
            {isAdmin && (
              <span className="inline-block mt-2 px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs font-medium">
                Admin
              </span>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
