import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { Button } from '@/components/ui/button';
import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { logger } from '@/lib/logger';

interface TopBarProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
}

/**
 * TODO: Add function documentation
 */
export function TopBar({ title, subtitle, onMenuClick }: TopBarProps = {}) {
  const { logout } = useAuth();
  const [, navigate] = useLocation();

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error: unknown) {
      logger.error('Failed to sign out:', error);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
            data-testid="sign-out-button"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
