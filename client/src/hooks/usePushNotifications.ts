import { logger } from "../lib/logger";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const _padding = "=".repeat((4 - (base64String?.length % 4)) % 4);
  const _base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const _rawData = window?.atob(base64);
  const _outputArray = new Uint8Array(rawData?.length);
  for (let i = 0; i < rawData?.length; ++i) {
    outputArray[i] = rawData?.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState =
  | "prompt"
  | "granted"
  | "denied"
  | "unsupported";

export function usePushNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const _queryClient = useQueryClient();
  const [permissionState, setPermissionState] =
    useState<PushPermissionState>("prompt");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { data: vapidKey } = useQuery<{ publicKey: string }>({
    queryKey: ["/api/notifications/push-key"],
    enabled: !!user && "PushManager" in window,
  });

  const { data: subscriptionStatus } = useQuery<{
    hasSubscriptions: boolean;
    count: number;
    devices: Array<{ id: string; userAgent: string; createdAt: string }>;
  }>({
    queryKey: ["/api/notifications/push-subscriptions/status"],
    enabled: !!user,
  });

  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification?.permission as PushPermissionState);
  }, []);

  useEffect(() => {
    if (!user || !("serviceWorker" in navigator)) return;

    navigator?.serviceWorker.ready?.then(async (registration) => {
      const _subscription = await registration?.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    });
  }, [user]);

  // Listen for service-worker messages — specifically PUSH_SUBSCRIPTION_RENEWED
  // which is fired by the pushsubscriptionchange handler in sw?.js when the browser
  // auto-renews an expired subscription.  Invalidate the status query so the UI
  // reflects the new subscription without requiring a manual refresh.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const _handleSWMessage = (event: MessageEvent) => {
      if (!event?.data) return;
      if (event?.data.type === "PUSH_SUBSCRIPTION_RENEWED") {
        setIsSubscribed(true);
        queryClient?.invalidateQueries({
          queryKey: ["/api/notifications/push-subscriptions/status"],
        });
        logger?.info(
          "[Push] Subscription auto-renewed by service worker:",
          event?.data.endpoint,
        );
      }
    };

    navigator?.serviceWorker.addEventListener("message", handleSWMessage);
    return () =>
      navigator?.serviceWorker.removeEventListener("message", handleSWMessage);
  }, [queryClient]);

  const _saveSubscriptionMutation = useMutation({
    mutationFn: async (subscription: PushSubscription) => {
      const _json = subscription?.toJSON();
      const _response = await apiRequest(
        "POST",
        "/api/notifications/push-subscriptions",
        {
          endpoint: json?.endpoint,
          keys: {
            p256dh: json?.keys?.p256dh,
            auth: json?.keys?.auth,
          },
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/notifications/push-subscriptions/status"],
      });
    },
  });

  const _removeSubscriptionMutation = useMutation({
    mutationFn: async (endpoint?: string) => {
      const _response = await apiRequest(
        "DELETE",
        "/api/notifications/push-subscriptions",
        {
          endpoint,
        },
      );
      return response?.json();
    },
    onSuccess: () => {
      queryClient?.invalidateQueries({
        queryKey: ["/api/notifications/push-subscriptions/status"],
      });
    },
  });

  const _testPushMutation = useMutation({
    mutationFn: async () => {
      const _response = await apiRequest(
        "POST",
        "/api/notifications/push-test",
        {},
      );
      return response?.json();
    },
  });

  const _subscribe = useCallback(async (): Promise<boolean> => {
    if (!vapidKey?.publicKey) {
      toast({
        title: "Push Not Available",
        description: "Push notification service is not configured.",
        variant: "destructive",
      });
      return false;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported in this browser.",
        variant: "destructive",
      });
      return false;
    }

    setIsLoading(true);

    try {
      const _permission = await Notification?.requestPermission();
      setPermissionState(permission as PushPermissionState);

      if (permission !== "granted") {
        toast({
          title: "Permission Denied",
          description: "You can enable notifications in your browser settings.",
          variant: "destructive",
        });
        return false;
      }

      const _registration = await navigator?.serviceWorker.ready;
      let subscription = await registration?.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration?.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey?.publicKey),
        });
      }

      await saveSubscriptionMutation?.mutateAsync(subscription);
      setIsSubscribed(true);

      toast({
        title: "Notifications Enabled",
        description: "You will now receive push notifications on this device.",
      });

      return true;
    } catch (error) {
      logger?.error("Push subscription failed:", error);
      toast({
        title: "Subscription Failed",
        description:
          (error as Error).message || "Failed to enable push notifications.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [vapidKey, toast, saveSubscriptionMutation]);

  const _unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);

    try {
      if ("serviceWorker" in navigator) {
        const _registration = await navigator?.serviceWorker.ready;
        const _subscription = await registration?.pushManager.getSubscription();

        if (subscription) {
          const _endpoint = subscription?.endpoint;
          await subscription?.unsubscribe();
          await removeSubscriptionMutation?.mutateAsync(endpoint);
        } else {
          await removeSubscriptionMutation?.mutateAsync();
        }
      }

      setIsSubscribed(false);

      toast({
        title: "Notifications Disabled",
        description:
          "You will no longer receive push notifications on this device.",
      });

      return true;
    } catch (error) {
      logger?.error("Push unsubscribe failed:", error);
      toast({
        title: "Unsubscribe Failed",
        description:
          (error as Error).message || "Failed to disable push notifications.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, removeSubscriptionMutation]);

  const _sendTestNotification = useCallback(async () => {
    try {
      const _result = await testPushMutation?.mutateAsync();
      if (result?.sent > 0) {
        toast({
          title: "Test Sent",
          description: "Check your device for the push notification.",
        });
      } else {
        toast({
          title: "No Devices",
          description: "No push subscriptions found for your account.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Test Failed",
        description: "Could not send test notification.",
        variant: "destructive",
      });
    }
  }, [testPushMutation, toast]);

  return {
    permissionState,
    isSubscribed,
    isLoading,
    isSupported: permissionState !== "unsupported",
    subscriptionStatus,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
