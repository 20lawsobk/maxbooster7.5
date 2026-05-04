import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Bell,
  CheckCheck,
  Trash2,
  Loader2,
  Shield,
  Music2,
  MessageSquare,
  ShoppingBag,
  DollarSign,
  Users,
  Megaphone,
  ArrowLeft,
  Settings,
  Trophy,
  ShieldAlert,
  Heart,
  Flame,
  FileText,
  BarChart2,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import type { Notification, NotificationCategory } from '@/components/notifications/types';
import { categoryConfig, typeToCategory } from '@/components/notifications/types';
import { AppLayout } from '@/components/layout/AppLayout';

type TabFilter = 'all' | 'unread' | NotificationCategory;

const categoryIcons: Record<NotificationCategory, React.ElementType> = {
  account_security: Shield,
  distribution: Music2,
  social_media: MessageSquare,
  direct_interaction: Heart,
  platform_generated: Flame,
  content_based: FileText,
  engagement_summary: BarChart2,
  location_based: MapPin,
  marketplace: ShoppingBag,
  royalties: DollarSign,
  collaboration: Users,
  achievements: Trophy,
  system: Megaphone,
  platform_admin: ShieldAlert,
};

export default function Notifications() {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: notifications = [], isLoading} = useQuery<Notification[]>({
    queryKey: ['/api/notifications'],
    enabled: !!user,
  });

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (activeTab === 'all') return true;
      if (activeTab === 'unread') return !notification.isRead;
      const category = notification.category || typeToCategory[notification.type] || 'system';
      return category === activeTab;
    });
  }, [notifications, activeTab]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<NotificationCategory, Notification[]> = {
      account_security: [],
      distribution: [],
      social_media: [],
      direct_interaction: [],
      platform_generated: [],
      content_based: [],
      engagement_summary: [],
      location_based: [],
      marketplace: [],
      royalties: [],
      collaboration: [],
      achievements: [],
      system: [],
      platform_admin: [],
    };
    notifications.forEach((n) => {
      const category = (n.category || typeToCategory[n.type] || 'system') as NotificationCategory;
      if (groups[category]) {
        groups[category].push(n);
      } else {
        groups.system.push(n);
      }
    });
    return groups;
  }, [notifications]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('PUT', `/api/notifications/${id}/read`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications'] });
      const previous = queryClient.getQueryData<Notification[]>(['/api/notifications']);
      queryClient.setQueryData<Notification[]>(['/api/notifications'], (old = []) =>
        old.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      return { previous };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(['/api/notifications'], context?.previous);
      toast({ title: 'Error', description: 'Failed to mark as read', variant: 'destructive' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => apiRequest('PUT', '/api/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ title: 'All notifications marked as read' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to mark all as read', variant: 'destructive' }),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/notifications/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['/api/notifications'] });
      const previous = queryClient.getQueryData<Notification[]>(['/api/notifications']);
      queryClient.setQueryData<Notification[]>(['/api/notifications'], (old = []) =>
        old.filter((n) => n.id !== id)
      );
      return { previous };
    },
    onSuccess: () => toast({ title: 'Notification deleted' }),
    onError: (_, __, context) => {
      queryClient.setQueryData(['/api/notifications'], context?.previous);
      toast({ title: 'Error', description: 'Failed to delete notification', variant: 'destructive' });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['/api/notifications'] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => apiRequest('DELETE', '/api/notifications/clear-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      toast({ title: 'All notifications cleared' });
    },
    onError: () => toast({ title: 'Error', description: 'Failed to clear notifications', variant: 'destructive' }),
  });

  const handleNavigate = useCallback(
    (url: string) => {
      navigate(url);
    },
    [navigate]
  );

return (
    <AppLayout title="Notifications">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Notifications</h1>
              {unreadCount > 0 && (
                <p className="text-sm text-muted-foreground">{unreadCount} unread</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={unreadCount === 0 || markAllAsReadMutation.isPending}
            >
              {markAllAsReadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCheck className="h-4 w-4 mr-2" />
              )}
              Mark all read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearAllMutation.mutate()}
              disabled={notifications.length === 0 || clearAllMutation.isPending}
            >
              {clearAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Clear all
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/settings?tab=notifications')}
              title="Notification settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)} className="mb-4">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-transparent p-0">
            <TabsTrigger value="all" className="text-sm">
              All ({notifications.length})
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-sm">
              Unread
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            {(Object.keys(categoryConfig) as NotificationCategory[]).map((cat) => {
              const Icon = categoryIcons[cat];
              const catCount = groupedByCategory[cat].filter((n) => !n.isRead).length;
              const catLabel = categoryConfig[cat]?.label || cat;
              return (
                <TabsTrigger key={cat} value={cat} className="text-sm">
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {catLabel}
                  {catCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {catCount}
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center">
                <div className="rounded-full bg-muted p-6 mb-4">
                  <Bell className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-lg mb-2">No notifications</h3>
                <p className="text-sm text-muted-foreground max-w-[280px]">
                  {activeTab === 'unread'
                    ? "You're all caught up! No unread notifications."
                    : activeTab === 'all'
                    ? "You don't have any notifications yet. They'll appear here when something happens."
                    : `No ${categoryConfig[activeTab as NotificationCategory]?.label.toLowerCase() || activeTab} notifications.`}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredNotifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={(id) => markAsReadMutation.mutate(id)}
                    onDelete={(id) => deleteNotificationMutation.mutate(id)}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
