import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { X, ExternalLink, Bell, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Notification, NotificationPriority } from './types';

interface NotificationToastProps {
  notification: Notification;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  onAction?: (notification: Notification) => void;
  autoHideDuration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

const priorityIcons: Record<NotificationPriority, React.ElementType> = {
  low: Info,
  normal: Bell,
  high: AlertTriangle,
  urgent: AlertTriangle,
};

const priorityStyles: Record<NotificationPriority, string> = {
  low: 'border-gray-200 dark:border-gray-700',
  normal: 'border-primary/30',
  high: 'border-orange-400',
  urgent: 'border-red-500 animate-pulse',
};

export function NotificationToast({
  notification,
  onDismiss,
  onMarkRead,
  onAction,
  autoHideDuration = 5000,
  position = 'top-right',
}: NotificationToastProps) {
  const [, navigate] = useLocation();
  const [isExiting, setIsExiting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(notification.id);
    }, 300);
  }, [notification.id, onDismiss]);

  const handleAction = useCallback(() => {
    onMarkRead(notification.id);
    if (onAction) {
      onAction(notification);
    } else if (notification.actionUrl) {
      if (notification.actionUrl.startsWith('http')) {
        window.open(notification.actionUrl, '_blank');
      } else {
        navigate(notification.actionUrl);
      }
    }
    handleDismiss();
  }, [notification, onMarkRead, onAction, navigate, handleDismiss]);

  useEffect(() => {
    if (isPaused || autoHideDuration === 0) return;

    const timer = setTimeout(() => {
      handleDismiss();
    }, autoHideDuration);

    return () => clearTimeout(timer);
  }, [autoHideDuration, isPaused, handleDismiss]);

  const Icon = priorityIcons[notification.priority || 'normal'];

  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };

  return (
    <div
      role="alert"
      aria-live={notification.priority === 'urgent' ? 'assertive' : 'polite'}
      className={cn(
        'fixed z-[100] w-96 max-w-[calc(100vw-2rem)]',
        'bg-background border-2 rounded-lg shadow-lg',
        'transform transition-all duration-300 ease-in-out',
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0',
        priorityStyles[notification.priority || 'normal'],
        positionClasses[position]
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid={`notification-toast-${notification.id}`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'p-2 rounded-full shrink-0',
              notification.priority === 'urgent'
                ? 'bg-red-100 dark:bg-red-900/30'
                : notification.priority === 'high'
                ? 'bg-orange-100 dark:bg-orange-900/30'
                : 'bg-primary/10'
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                notification.priority === 'urgent'
                  ? 'text-red-600'
                  : notification.priority === 'high'
                  ? 'text-orange-600'
                  : 'text-primary'
              )}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm truncate">{notification.title}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 -mt-1 -mr-2"
                onClick={handleDismiss}
                aria-label="Dismiss notification"
                data-testid="dismiss-toast"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {notification.message && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {notification.message}
              </p>
            )}

            {(notification.actionUrl || notification.actionLabel) && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 mt-2 text-xs"
                onClick={handleAction}
                data-testid="toast-action"
              >
                {notification.actionLabel || 'View details'}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {autoHideDuration > 0 && !isPaused && (
        <div className="h-1 bg-muted overflow-hidden rounded-b-lg">
          <div
            className="h-full bg-primary transition-all ease-linear"
            style={{
              width: '100%',
              animation: `shrink ${autoHideDuration}ms linear forwards`,
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}

interface NotificationToastContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
  maxVisible?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export function NotificationToastContainer({
  notifications,
  onDismiss,
  onMarkRead,
  maxVisible = 3,
  position = 'top-right',
}: NotificationToastContainerProps) {
  const visibleNotifications = notifications.slice(0, maxVisible);

  return (
    <div className="fixed z-[100] pointer-events-none">
      {visibleNotifications.map((notification, index) => (
        <div
          key={notification.id}
          className="pointer-events-auto"
          style={{
            transform: `translateY(${index * 110}px)`,
            zIndex: 100 - index,
          }}
        >
          <NotificationToast
            notification={notification}
            onDismiss={onDismiss}
            onMarkRead={onMarkRead}
            position={position}
          />
        </div>
      ))}
    </div>
  );
}
