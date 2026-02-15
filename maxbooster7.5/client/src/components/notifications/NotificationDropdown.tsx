import { useState } from 'react';
import { useLocation } from 'wouter';
import {
  Bell,
  CheckCheck,
  Settings,
  Trash2,
  Filter,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationItem } from './NotificationItem';
import { useNotifications } from './useNotifications';
import type { Notification, NotificationType } from './types';

interface NotificationDropdownProps {
  notifications: Notification[];
  isLoading: boolean;
  onClose: () => void;
}

type FilterType = 'all' | 'unread' | 'collaboration' | 'payment' | 'release' | 'social' | 'system' | 'security';

const filterLabels: Record<FilterType, string> = {
  all: 'All',
  unread: 'Unread',
  collaboration: 'Collaboration',
  payment: 'Payments',
  release: 'Releases',
  social: 'Social',
  system: 'System',
  security: 'Security',
};

const typeToCategory: Record<string, FilterType> = {
  collaboration_invite: 'collaboration',
  collaboration_accepted: 'collaboration',
  collaboration_declined: 'collaboration',
  payment_received: 'payment',
  payout_completed: 'payment',
  payout_failed: 'payment',
  release_milestone: 'release',
  release_live: 'release',
  release_rejected: 'release',
  social_like: 'social',
  social_comment: 'social',
  social_share: 'social',
  social_follow: 'social',
  system_announcement: 'system',
  system_maintenance: 'system',
  system_update: 'system',
  security_new_login: 'security',
  security_password_changed: 'security',
  security_2fa_enabled: 'security',
  security_suspicious_activity: 'security',
};

export function NotificationDropdown({
  notifications,
  isLoading,
  onClose,
}: NotificationDropdownProps) {
  const [, navigate] = useLocation();
  const [filter, setFilter] = useState<FilterType>('all');
  const {
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
    isMarkingAllRead,
    isClearing,
  } = useNotifications();

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !notification.isRead;
    const category = typeToCategory[notification.type] || 'system';
    return category === filter;
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNavigate = (url: string) => {
    onClose();
    navigate(url);
  };

  const handleOpenPreferences = () => {
    onClose();
    navigate('/settings?tab=notifications');
  };

  return (
    <div className="flex flex-col max-h-[500px]">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">
              ({unreadCount} unread)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <Filter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(filterLabels).map(([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setFilter(key as FilterType)}
                  className={filter === key ? 'bg-accent' : ''}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => markAllAsRead()}
            disabled={unreadCount === 0 || isMarkingAllRead}
            title="Mark all as read"
            data-testid="mark-all-read"
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleOpenPreferences}
            title="Notification settings"
            data-testid="notification-settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h4 className="font-medium mb-1">No notifications</h4>
            <p className="text-sm text-muted-foreground max-w-[200px]">
              {filter === 'unread'
                ? "You're all caught up! No unread notifications."
                : filter === 'all'
                ? "You don't have any notifications yet. We'll notify you when something happens."
                : `No ${filterLabels[filter].toLowerCase()} notifications.`}
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {notifications.length > 0 && (
        <>
          <Separator />
          <div className="p-2 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                onClose();
                navigate('/notifications');
              }}
            >
              View all notifications
            </Button>
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => clearAll()}
                disabled={isClearing}
                data-testid="clear-all-notifications"
              >
                {isClearing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1" />
                )}
                Clear all
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
