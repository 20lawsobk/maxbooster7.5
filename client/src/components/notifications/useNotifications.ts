import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { logger } from "@/lib/logger";
import type { Notification, NotificationPreferences } from "./types";

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { isConnected } = useWebSocket({
    userId: user.id,
    onMessage: (message) => {
      if (message?.type === "notification") {
        logger?.info("📬 Real-time notification received:", message?.data);
        queryClient?.invalidateQueries({ queryKey: ["/api/notifications"] });

        if (message?.data?.title) {
          toast({
            title: message.data.title,
            description: message.data.message,
          });

          if (
            "Notification" in window &&
            Notification?.permission === "granted"
          ) {
            new window.Notification(message?.data.title, {
              body: message.data.message || "",
              icon: "/favicon.png",
              tag: message.data.id,
            });
          }
        }
      }
    },
    onConnect: () => logger?.info("🔌 WebSocket connected for notifications"),
    onDisconnect: () => logger?.info("🔌 WebSocket disconnected"),
    onError: (error) => logger?.error("❌ WebSocket error:", error),
  });

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: isConnected ? false : 30000,
    enabled: !!user,
  });

  const { data: preferences } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notifications/preferences"],
    enabled: !!user,
  });

  const unreadCount = notifications?.filter((n) => !n?.isRead).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("PUT", `/api/notifications/${id}/read`);
    },
    onMutate: async (id) => {
      await queryClient?.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient?.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient?.setQueryData<Notification[]>(
        ["/api/notifications"],
        (old = []) =>
          old?.map((n) => (n?.id === id ? { ...n, isRead: true } : n)),
      );
      return { previousNotifications };
    },
    onError: (_err, _id, context) => {
      queryClient?.setQueryData(
        ["/api/notifications"],
        context?.previousNotifications,
      );
      toast({
        title: "Error",
        description: "Failed to mark notification as read",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", "/api/notifications/mark-all-read");
    },
    onMutate: async () => {
      await queryClient?.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient?.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient?.setQueryData<Notification[]>(
        ["/api/notifications"],
        (old = []) => old?.map((n) => ({ ...n, isRead: true })),
      );
      return { previousNotifications };
    },
    onSuccess: () => {
      toast({ title: "All notifications marked as read" });
    },
    onError: (_err, _vars, context) => {
      queryClient?.setQueryData(
        ["/api/notifications"],
        context?.previousNotifications,
      );
      toast({
        title: "Error",
        description: "Failed to mark all as read",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/notifications/${id}`);
    },
    onMutate: async (id) => {
      await queryClient?.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient?.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient?.setQueryData<Notification[]>(
        ["/api/notifications"],
        (old = []) => old?.filter((n) => n?.id !== id),
      );
      return { previousNotifications };
    },
    onSuccess: () => {
      toast({ title: "Notification deleted" });
    },
    onError: (_err, _id, context) => {
      queryClient?.setQueryData(
        ["/api/notifications"],
        context?.previousNotifications,
      );
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/notifications/clear-all");
    },
    onMutate: async () => {
      await queryClient?.cancelQueries({ queryKey: ["/api/notifications"] });
      const previousNotifications = queryClient?.getQueryData<Notification[]>([
        "/api/notifications",
      ]);
      queryClient?.setQueryData<Notification[]>(["/api/notifications"], []);
      return { previousNotifications };
    },
    onSuccess: () => {
      toast({ title: "All notifications cleared" });
    },
    onError: (_err, _vars, context) => {
      queryClient?.setQueryData(
        ["/api/notifications"],
        context?.previousNotifications,
      );
      toast({
        title: "Error",
        description: "Failed to clear notifications",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient?.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: Partial<NotificationPreferences>) => {
      return apiRequest(
        "PUT",
        "/api/notifications/preferences",
        newPreferences,
      );
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/notifications/preferences"],
      });
      toast({ title: "Notification preferences updated" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    preferences,
    refetch,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    deleteNotification: deleteNotificationMutation.mutate,
    clearAll: clearAllMutation.mutate,
    updatePreferences: updatePreferencesMutation.mutate,
    isMarkingRead: markAsReadMutation.isPending,
    isMarkingAllRead: markAllAsReadMutation.isPending,
    isDeleting: deleteNotificationMutation.isPending,
    isClearing: clearAllMutation.isPending,
    isUpdatingPreferences: updatePreferencesMutation.isPending,
  };
}
