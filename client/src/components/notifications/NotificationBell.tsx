import { useState, useEffect } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { NotificationDropdown } from './NotificationDropdown';
import { useNotifications } from './useNotifications';

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const { notifications, unreadCount, isLoading, isConnected } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);

  useEffect(() => {
    if (unreadCount > 0) {
      setHasNewNotification(true);
      const timer = setTimeout(() => setHasNewNotification(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative transition-transform",
            hasNewNotification && "animate-bounce",
            className
          )}
          data-testid="notification-bell"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          {hasNewNotification || unreadCount > 0 ? (
            <BellRing className="h-5 w-5" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className={cn(
                "absolute -top-1 -right-1 h-5 min-w-5 rounded-full p-0 flex items-center justify-center text-xs",
                unreadCount > 99 && "px-1"
              )}
              data-testid="notification-badge"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          {isConnected && (
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="end" sideOffset={8}>
        <NotificationDropdown
          notifications={notifications}
          isLoading={isLoading}
          onClose={() => setIsOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
