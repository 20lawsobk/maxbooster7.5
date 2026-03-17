import { useState } from 'react';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { Button } from '@/components/ui/button';
import { Menu, LogOut, Loader2, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useLocation } from 'wouter';
import { logger } from '@/lib/logger';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

export function TopBar({ title, subtitle, onMenuClick }: TopBarProps = {}) {
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } catch (error: unknown) {
      logger.error('Failed to sign out:', error);
    } finally {
      setSigningOut(false);
      navigate('/login');
    }
  };

  return (
    <div className="bg-white dark:bg-[#0a0a16]/90 border-b border-gray-200 dark:border-white/5 p-4 dark:backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={onMenuClick}
            data-testid="mobile-menu-button"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div>
            {title && (
              <h1
                className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white"
                data-testid="topbar-title"
              >
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <NotificationCenter />
          <Link to="/settings">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              data-testid="settings-button"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="sign-out-button"
          >
            {signingOut ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{signingOut ? 'Signing out...' : 'Sign Out'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
