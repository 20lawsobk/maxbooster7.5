import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  Bell,
  Loader2,
  Trash2,
  ExternalLink,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import type {
  Notification,
  NotificationCategory,
} from "@/components/notifications/types";
import { categoryConfig, typeToCategory } from "@/components/notifications/types";

function resolveActionUrl(url: string): string {
  if (url.startsWith("/marketplace/beat/")) return "/marketplace";
  if (url.startsWith("/marketplace/sell")) return "/marketplace";
  if (url === "/social") return "/social-media";
  if (url.startsWith("/social/")) return "/social-media";
  return url;
}

export default function NotificationDetail() {
  const [, params] = useRoute("/notifications/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();

  const {
    data: notification,
    isLoading,
    isError,
  } = useQuery<Notification>({
    queryKey: ["/api/notifications", id],
    enabled: !!user && !!id,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async () => apiRequest("PUT", `/api/notifications/${id}/read`),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "Notification deleted" });
      navigate("/notifications");
    },
    onError: () =>
      toast({
        title: "Error",
        description: "Failed to delete notification",
        variant: "destructive",
      }),
  });

  useEffect(() => {
    if (notification && !notification.isRead) {
      markAsReadMutation.mutate();
    }
     
  }, [notification?.id]);

  const category: NotificationCategory =
    (notification?.category as NotificationCategory) ||
    (notification ? typeToCategory[notification.type] : undefined) ||
    "system";
  const priority = notification?.priority || "normal";

  const handleOpenAction = () => {
    if (!notification?.actionUrl) return;
    if (notification.actionUrl.startsWith("http")) {
      window.open(notification.actionUrl, "_blank");
    } else {
      navigate(resolveActionUrl(notification.actionUrl));
    }
  };

  return (
    <AppLayout title="Notification">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/notifications")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Notification</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : isError || !notification ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-16 text-center">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Bell className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg mb-2">
                Notification not found
              </h3>
              <p className="text-sm text-muted-foreground max-w-[300px] mb-4">
                This notification may have been deleted or is no longer
                available.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/notifications")}
              >
                Back to notifications
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <Badge variant="secondary">
                      {categoryConfig[category]?.label || category}
                    </Badge>
                    {priority === "urgent" && (
                      <Badge variant="destructive">Urgent</Badge>
                    )}
                    {priority === "high" && (
                      <Badge
                        variant="outline"
                        className="border-orange-500 text-orange-500"
                      >
                        High
                      </Badge>
                    )}
                    {notification.isRead && (
                      <span className="inline-flex items-center text-xs text-muted-foreground">
                        <Check className="h-3 w-3 mr-1" /> Read
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-semibold">
                    {notification.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {notification.message && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {notification.message}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {notification.actionUrl && (
                  <Button onClick={handleOpenAction}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    {notification.actionLabel || "View related page"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
