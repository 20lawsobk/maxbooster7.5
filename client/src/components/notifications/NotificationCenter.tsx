import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, Settings, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link?: string;
  createdAt: string;
}

interface NotificationPreferences {
  email: boolean;
  browser: boolean;
  releases: boolean;
  earnings: boolean;
  sales: boolean;
  marketing: boolean;
  system: boolean;
}

/**
 * TODO: Add function documentation
 */
export function NotificationCenter() {
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [requestedPermission, setRequestedPermission] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // WebSocket connection for real-time notifications
  // Authentication is now handled server-side via session cookie
  const { isConnected, connectionStatus } = useWebSocket({
    onMessage: (message) => {
      // Handle incoming WebSocket messages
      if (message.type === 'notification') {
        logger.info('📬 Real-time notification received via WebSocket:', message.data);

        // Invalidate queries to refetch notifications
        queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });

        // Show toast for new notification
        if (message.data && message.data.title) {
          toast({
            title: message.data.title,
            description: message.data.message,
          });
        }
      } else if (message.type === 'auth_success') {
        logger.info('✅ WebSocket authenticated via session cookie');
      }
    },
    onConnect: () => {
      logger.info('🔌 WebSocket connected - authenticated via session cookie');
    },
    onDisconnect: () => {
      logger.info('🔌 WebSocket disconnected - falling back to polling');
    },
    onError: (error) => {
      logger.error('❌ WebSocket error:', error);
    },
  });

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    // Keep polling as fallback when WebSocket is disconnected
    refetchInterval: isConnected ? false : 30000,
  });

  const { data: preferences } = useQuery<NotificationPreferences>({
    queryKey: ['/api/notifications/preferences'],
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('PUT', `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PUT', '/api/notifications/mark-all-read');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: 'All notifications marked as read',
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/notifications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({
        title: 'Notification deleted',
      });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: NotificationPreferences) => {
      return apiRequest('PUT', '/api/notifications/preferences', newPreferences);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/preferences'] });
      toast({
        title: 'Notification preferences updated',
      });
    },
  });

  const testNotificationMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/notifications/test');
    },
    onSuccess: () => {
      toast({
        title: 'Test notification sent!',
        description: 'Check your email and notifications.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    },
  });

  const requestBrowserNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setRequestedPermission(true);

      if (permission === 'granted') {
        toast({
          title: 'Browser notifications enabled',
          description: "You'll now receive desktop notifications from Max Booster.",
        });
      }
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  const getNotificationIcon = (type: string) => {
    const icons: Record<string, string> = {
      release: '🎵',
      earning: '💰',
      sale: '🎉',
      marketing: '📢',
      system: '⚙️',
    };
    return icons[type] || '🔔';
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            data-testid="button-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
                data-testid="badge-unread-count"
              >
                {unreadCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center space-x-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={unreadCount === 0}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPreferencesOpen(true)}
                data-testid="button-notification-settings"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="h-96">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition ${
                      !notification.read ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-${notification.id}`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-2xl">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm truncate">{notification.title}</p>
                          <div className="flex items-center space-x-2">
                            {!notification.read && (
                              <div className="w-2 h-2 rounded-full bg-blue-600" />
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotificationMutation.mutate(notification.id);
                              }}
                              data-testid={`delete-notification-${notification.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Notification Preferences Dialog */}
      <Dialog open={preferencesOpen} onOpenChange={setPreferencesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Notification Preferences</DialogTitle>
            <DialogDescription>
              Choose how you want to be notified about updates and events.
            </DialogDescription>
          </DialogHeader>

          {preferences && (
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Channels</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="email-notifications" className="cursor-pointer">
                      Email Notifications
                    </Label>
                    <Switch
                      id="email-notifications"
                      checked={preferences.email}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          email: checked,
                        })
                      }
                      data-testid="switch-email-notifications"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="browser-notifications" className="cursor-pointer">
                        Browser Notifications
                      </Label>
                      {!requestedPermission &&
                        'Notification' in window &&
                        Notification.permission === 'default' && (
                          <p className="text-xs text-gray-500 mt-1">
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto"
                              onClick={requestBrowserNotificationPermission}
                            >
                              Enable browser notifications
                            </Button>
                          </p>
                        )}
                    </div>
                    <Switch
                      id="browser-notifications"
                      checked={preferences.browser}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          browser: checked,
                        })
                      }
                      disabled={'Notification' in window && Notification.permission === 'denied'}
                      data-testid="switch-browser-notifications"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="font-medium text-sm">Notification Types</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="releases" className="cursor-pointer">
                      Releases & Distribution
                    </Label>
                    <Switch
                      id="releases"
                      checked={preferences.releases}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          releases: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="earnings" className="cursor-pointer">
                      Earnings & Royalties
                    </Label>
                    <Switch
                      id="earnings"
                      checked={preferences.earnings}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          earnings: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sales" className="cursor-pointer">
                      Sales & Marketplace
                    </Label>
                    <Switch
                      id="sales"
                      checked={preferences.sales}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          sales: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="marketing" className="cursor-pointer">
                      Marketing & Promotions
                    </Label>
                    <Switch
                      id="marketing"
                      checked={preferences.marketing}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          marketing: checked,
                        })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="system" className="cursor-pointer">
                      System Updates
                    </Label>
                    <Switch
                      id="system"
                      checked={preferences.system}
                      onCheckedChange={(checked) =>
                        updatePreferencesMutation.mutate({
                          ...preferences,
                          system: checked,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => testNotificationMutation.mutate()}
                  disabled={testNotificationMutation.isPending}
                  data-testid="button-test-notification"
                >
                  {testNotificationMutation.isPending ? 'Sending...' : 'Send Test Notification'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
