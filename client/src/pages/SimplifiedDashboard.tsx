import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  buildFullModeUpgradePayload,
  getOnboardingUserLevel,
  parseOnboardingUpdateResponse,
  prefersSimplifiedDashboard,
} from "@/lib/onboardingMode";
import {
  hasDashboardPaidAccess,
  readDashboardJson,
} from "@/components/dashboard/dashboardDataContracts";
import SimplifiedDashboardComponent from "@/components/onboarding/SimplifiedDashboard";
import { AppLayout } from "@/components/layout/AppLayout";

export default function SimplifiedDashboard() {
  const { user, isLoading } = useRequireSubscription();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const hasAccess = user ? hasDashboardPaidAccess(user) : false;
  const userLevel = getOnboardingUserLevel(user?.onboardingData);
  const preferSimplified = prefersSimplifiedDashboard(user?.onboardingData);

  const upgradeToFullModeMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error("Your session is no longer available. Please sign in again.");
      }

      const response = await apiRequest(
        "POST",
        "/api/auth/update-onboarding",
        buildFullModeUpgradePayload(user.onboardingData),
      );
      return parseOnboardingUpdateResponse(await readDashboardJson(response));
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/auth/me"],
          refetchType: "active",
        }),
        queryClient.invalidateQueries({
          queryKey: ["/api/auth/onboarding-status"],
        }),
      ]);

      setLocation("/dashboard");
      toast({
        title: "Full Mode Enabled",
        description: "Your dashboard now uses the full feature layout.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upgrade Failed",
        description:
          error.message || "Failed to enable full mode. Please try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isLoading || !user) return;

    if (!hasAccess) {
      setLocation("/pricing");
      return;
    }

    if (user.onboardingCompleted && !preferSimplified) {
      setLocation("/dashboard");
    }
  }, [hasAccess, isLoading, preferSimplified, setLocation, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
          aria-label="Loading dashboard"
          role="status"
        />
      </div>
    );
  }

  if (!user || !hasAccess) return null;

  return (
    <AppLayout>
      <SimplifiedDashboardComponent
        onUpgrade={() => upgradeToFullModeMutation.mutate()}
        userLevel={userLevel}
      />
    </AppLayout>
  );
}
