import { useEffect, useMemo, useState } from 'react';
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
  ShieldAlert,
  Brain,
  Sparkles,
  GraduationCap,
  Bot,
  X,
  FileText,
  Users,
  Building2,
  Timer,
  Receipt,
  ShieldCheck,
  Zap,
  Settings,
  Ticket,
  Heart,
  ShoppingCart,
  Newspaper,
  ListMusic,
  BookOpen,
  Film,
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
  section?: string;
}

const navItems: NavItem[] = [
  // ── Overview ──────────────────────────────────────────────────────────
  { labelKey: 'navigation.dashboard', path: '/dashboard', icon: LayoutDashboard, section: 'Overview' },

  // ── Creator ───────────────────────────────────────────────────────────
  { labelKey: 'navigation.projects', path: '/projects', icon: Music, section: 'Creator' },
  { labelKey: 'navigation.studio', path: '/studio', icon: Disc },
  { labelKey: 'navigation.desktopApp', path: '/desktop-app', icon: Monitor },

  // ── Growth ────────────────────────────────────────────────────────────
  { labelKey: 'navigation.analytics', path: '/analytics', icon: BarChart3, section: 'Growth' },
  { labelKey: 'analytics.aiInsights', path: '/analytics/ai', icon: Sparkles },
  { labelKey: 'navigation.social', path: '/social-media', icon: Share2 },
  { labelKey: 'navigation.advertising', path: '/advertising', icon: Megaphone },
  { labelKey: 'navigation.playlistPitching', path: '/playlist-pitching', icon: ListMusic },
  { labelKey: 'navigation.fanHub', path: '/fan-hub', icon: Heart },

  // ── Business ──────────────────────────────────────────────────────────
  { labelKey: 'navigation.marketplace', path: '/marketplace', icon: ShoppingBag, section: 'Business' },
  { labelKey: 'navigation.royalties', path: '/royalties', icon: DollarSign },
  { labelKey: 'navigation.distribution', path: '/distribution', icon: Radio },
  { labelKey: 'navigation.publishing', path: '/publishing', icon: BookOpen },
  { labelKey: 'navigation.syncLicensing', path: '/sync-licensing', icon: Film },
  { labelKey: 'navigation.merch', path: '/merch', icon: ShoppingCart },
  { labelKey: 'navigation.invoices', path: '/invoices', icon: Receipt },

  // ── Management ────────────────────────────────────────────────────────
  { labelKey: 'navigation.contracts', path: '/contracts', icon: FileText, section: 'Manage' },
  { labelKey: 'navigation.shows', path: '/shows', icon: Ticket },
  { labelKey: 'navigation.pressKit', path: '/press-kit', icon: Newspaper },
  { labelKey: 'navigation.collaborations', path: '/collaborations', icon: Users },
  { labelKey: 'navigation.workspaces', path: '/workspaces', icon: Building2 },
  { labelKey: 'navigation.releaseCountdown', path: '/release-countdown', icon: Timer },
  { labelKey: 'navigation.careerCoach', path: '/career-coach', icon: GraduationCap },
  { labelKey: 'navigation.assistant', path: '/assistant', icon: Bot },
  { labelKey: 'navigation.workflowAutomations', path: '/workflow-automations', icon: Zap },
  { labelKey: 'navigation.verification', path: '/verification', icon: ShieldCheck },

  // ── Admin ─────────────────────────────────────────────────────────────
  { labelKey: 'navigation.adminPanel', path: '/admin', icon: Shield, adminOnly: true, section: 'Admin' },
  { labelKey: 'navigation.adminSecurity', path: '/admin/security', icon: ShieldAlert, adminOnly: true },
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
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (!isMobileOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onMobileClose) {
        onMobileClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileOpen, onMobileClose]);

  if (!user) {
    return null;
  }

  const isAdmin = user.role === 'admin';
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
          onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onMobileClose?.(); }}
          onTouchEnd={(e) => { e.preventDefault(); onMobileClose?.(); }}
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
          data-testid="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col h-full transition-transform duration-300 lg:translate-x-0 sidebar-premium',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={!isDesktop && !isMobileOpen}
      >
        {/* Sidebar header */}
        <div className="px-4 py-5 border-b border-white/5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="sidebar-logo-icon">
                <img src="/logo.png" alt="B-Lawz Music" className="w-full h-full object-cover rounded-[9px]" />
              </div>
              <div className="flex flex-col">
                <h2 className="text-base font-black tracking-tight sidebar-brand-text">Max Booster</h2>
                <span className="text-[10px] text-white/40 font-medium uppercase tracking-widest">by B-Lawz Music</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden text-white/50 hover:text-white hover:bg-white/5"
              onClick={onMobileClose}
              data-testid="sidebar-close"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
          {/* Tier badge */}
          <div className="mt-3">
            <span className="sidebar-tier-badge">
              {user.subscriptionTier === 'lifetime'
                ? '♾ Lifetime Access'
                : user.subscriptionTier === 'yearly'
                  ? '★ Yearly Plan'
                  : user.subscriptionTier === 'monthly'
                    ? '◈ Monthly Plan'
                    : isAdmin
                      ? '♾ Lifetime Access'
                      : '◇ Free'}
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto sidebar-scrollbar">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path || location.startsWith(item.path + '/');

            return (
              <div key={item.path}>
                {item.section && (
                  <div className="sidebar-section-label">{item.section}</div>
                )}
                <Link
                  href={item.path}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ease-out group relative',
                    isActive
                      ? 'sidebar-nav-active'
                      : 'sidebar-nav-item'
                  )}
                  onClick={() => {
                    if (onMobileClose) onMobileClose();
                  }}
                  data-testid={`nav-${item.path.replace('/', '')}`}
                >
                  {isActive && <div className="sidebar-active-indicator" />}
                  <Icon
                    className={cn(
                      'w-4 h-4 flex-shrink-0 transition-all duration-200',
                      isActive ? 'text-amber-400' : 'text-white/40 group-hover:text-white/70'
                    )}
                  />
                  <span className={cn(
                    'text-sm font-medium transition-colors',
                    isActive ? 'text-white' : 'text-white/50 group-hover:text-white/80'
                  )}>{t(item.labelKey)}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                  )}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <LanguageSwitcher />
            <ThemeToggle variant="outline" size="sm" />
          </div>
          <Link
            to="/settings"
            className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors group sidebar-user-card"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors">{user.username}</p>
              <p className="text-xs text-white/30 truncate">{user.email}</p>
              {isAdmin && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-md text-[10px] font-bold uppercase tracking-wide">
                  Admin
                </span>
              )}
            </div>
            <Settings className="w-4 h-4 text-white/20 shrink-0 group-hover:text-white/50 group-hover:rotate-45 transition-all duration-300" />
          </Link>
        </div>
      </aside>
    </>
  );
}
