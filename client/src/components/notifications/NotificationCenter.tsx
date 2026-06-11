import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, BellRing, CheckCheck, Settings, Trash2, Loader2, Shield, Music2, MessageSquare, ShoppingBag, DollarSign, Users, Megaphone, Trophy, LayoutDashboard, Heart, Flame, FileText, BarChart2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { NotificationItem } from "./NotificationItem";
import { NotificationBadge } from "./NotificationBadge";
import { NotificationToastContainer } from "./NotificationToast";
import type { Notification, NotificationCategory, NotificationPreferences } from "./types";
import { categoryConfig, typeToCategory } from "./types";

type TabFilter = "all" | "unread" | NotificationCategory;

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
  platform_admin: LayoutDashboard,
};

const defaultPreferences: NotificationPreferences = {
  muteAll: false,
  quietHours: {
    enabled: false,
    startTime: "22:00",
    endTime: "08:00",
    timezone: "America/New_York",
    allowUrgent: true,
  },
  email: {
    enabled: true,
    frequency: "instant",
    categories: {
      account_security: true,
      distribution: true,
      social_media: true,
      marketplace: true,
      royalties: true,
      collaboration: true,
      achievements: true,
      system: true,
      platform_admin: true,
    },
  },
  push: {
    enabled: false,
    categories: {
      account_security: true,
      distribution: true,
      social_media: false,
      marketplace: true,
      royalties: true,
      collaboration: true,
      achievements: true,
      system: true,
      platform_admin: true,
    },
  },
  sms: {
    enabled: false,
    phoneNumber: null,
    verified: false,
    categories: {
      account_security: true,
      royalties: true,
    },
  },
  inApp: {
    enabled: true,
    sound: true,
    desktop: true,
  },
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>("all");
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [toastQueue, setToastQueue] = useState<Notification[]>([]);
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { isConnected } = useWebSocket({
    userId: user.id,
    onMessage: (message) => {
      if (message.type === "notification") {
        logger.info("📬 Real-time notification received:", message.data);
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });

        if (message.data?.title) {
          const notification = message.data as Notification;
          setToastQueue((prev) => [...prev, notification]);

          if (
            "Notification" in window &&
            Notification.permission === "granted" &&
            preferences?.inApp?.desktop
          ) {
            new window.Notification(notification.title, {
              body: notification.message || "",
              icon: "/favicon.png",
              tag: notification.id,
            });
          }

          if (preferences?.inApp?.sound) {
            const audio = new Audio("/notification.mp3");
            audio.volume = 0.3;
            audio.play().catch(() => {});
          }
        }
      }
    },
    onConnect: () => logger.info("🔌 WebSocket connected for notifications"),
    onDisconnect: () => logger.info("🔌 WebSocket disconnected"),
    onError: (error) => logger.error("❌ WebSocket error:", error),
  });

  const {
    data: notifications = [],
    isLoading,
  } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: isConnected ? false : 30000,
    enabled: !!user,
  });

  const { data: preferences = defaultPreferences } =
    useQuery<NotificationPreferences>({
      queryKey: ["/api/notifications/preferences"],
      enabled: !!user,
    });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const urgentCount = useMemo(
    () =>
      notifications.filter((n) => !n.isRead && n.priority === "urgent").length,
    [notifications],
  );

  useEffect(() => {
    if (unreadCount > 0) {
      setHasNewNotification(true);
      const timer = setTimeout(() => setHasNewNotification(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [unreadCount]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (activeTab === "all") return true;
      if (activeTab === "unread") return !notification.isRead;
      const category =
        notification.category || typeToCategory[notification.type] || "system";
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
      const category = (n.category ||
        typeToCategory[n.type] ||
        "system") as NotificationCategory;
      if (groups[category]) {
        groups[category].push(n);
      } else {
        groups.system.push(n);
      }
    });

    return groups;
  }, [notifications]);

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("PUT", `/api/notifications/${id}/read`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previous = queryClient.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient.setQueryData<Notification[]>(
        ["/api/notifications"],
        (old = []) =>
          old.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      return { previous };
    },
    onError: (_, __, context) => {
      queryClient.setQueryData(["/api/notifications"], context?.previous);
      toast({
        title: "Error",
        description: "Failed to mark as read",
        variant: "destructive",
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PUT", "/api/notifications/mark-all-read"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to mark all as read",
        variant: "destructive",
      }),
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/notifications/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/notifications"] });
      const previous = queryClient.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient.setQueryData<Notification[]>(
        ["/api/notifications"],
        (old = []) => old.filter((n) => n.id !== id),
      );
      return { previous };
    },
    onSuccess: () => toast({ title: "Notification deleted" }),
    onError: (_, __, context) => {
      queryClient.setQueryData(["/api/notifications"], context?.previous);
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
      });
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
  });

  const clearAllMutation = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", "/api/notifications/clear-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications cleared" });
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to clear notifications",
        variant: "destructive",
      }),
  });

  const handleNavigate = useCallback(
    (url: string) => {
      setIsOpen(false);
      navigate(url);
    },
    [navigate],
  );

  const handleDismissToast = useCallback((id: string) => {
    setToastQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleToastRead = useCallback(
    (id: string) => {
      markAsReadMutation.mutate(id);
      handleDismissToast(id);
    },
    [markAsReadMutation, handleDismissToast],
  );

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "relative transition-transform",
              hasNewNotification && "animate-bounce",
            )}
            data-testid="notification-center-trigger"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
          >
            {hasNewNotification || unreadCount > 0 ? (
              <BellRing className="h-5 w-5" />
            ) : (
              <Bell className="h-5 w-5" />
            )}
            {unreadCount > 0 && (
              <NotificationBadge
                count={unreadCount}
                variant={urgentCount > 0 ? "urgent" : "default"}
                className="absolute -top-1 -right-1"
              />
            )}
            {isConnected && (
              <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 ring-2 ring-background" />
            )}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-[420px] p-0" align="end" sideOffset={8}>
          <div className="flex flex-col max-h-[550px]">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">Notifications</h3>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {unreadCount} unread
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => markAllAsReadMutation.mutate()}
                  disabled={
                    unreadCount === 0 || markAllAsReadMutation.isPending
                  }
                  title="Mark all as read"
                  data-testid="mark-all-read-btn"
                >
                  {markAllAsReadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCheck className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setIsOpen(false);
                    navigate("/settings?tab=notifications");
                  }}
                  title="Notification settings"
                  data-testid="notification-settings-btn"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabFilter)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="border-b px-2">
                <TabsList className="h-10 w-full justify-start bg-transparent gap-1">
                  <TabsTrigger value="all" className="text-xs px-2">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="unread" className="text-xs px-2">
                    Unread
                    {unreadCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="ml-1 h-4 px-1 text-[10px]"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  {(Object.keys(categoryConfig) as NotificationCategory[])
                    .filter(
                      (cat) =>
                        cat !== "platform_admin" || user?.role === "admin",
                    )
                    .map((cat) => {
                      const Icon = categoryIcons[cat];
                      const catCount = groupedByCategory[cat].filter(
                        (n) => !n.isRead,
                      ).length;
                      return (
                        <TabsTrigger
                          key={cat}
                          value={cat}
                          className={`text-xs px-2 ${cat === "platform_admin" ? "text-orange-600 dark:text-orange-400" : ""}`}
                        >
                          <Icon className="h-3 w-3 mr-1" />
                          {catCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {catCount}
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                </TabsList>
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
                      {activeTab === "unread"
                        ? "You're all caught up!"
                        : activeTab === "all"
                          ? "You don't have any notifications yet."
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
              </ScrollArea>
            </Tabs>

            {notifications.length > 0 && (
              <>
                <Separator />
                <div className="p-2 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => handleNavigate("/notifications")}
                  >
                    View all notifications
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-destructive hover:text-destructive"
                    onClick={() => clearAllMutation.mutate()}
                    disabled={clearAllMutation.isPending}
                    data-testid="clear-all-btn"
                  >
                    {clearAllMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="h-3 w-3 mr-1" />
                    )}
                    Clear all
                  </Button>
                </div>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <NotificationToastContainer
        notifications={toastQueue}
        onDismiss={handleDismissToast}
        onMarkRead={handleToastRead}
        maxVisible={3}
        position="top-right"
      />
    </>
  );
}
