import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useLocation } from "wouter";
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
  const onboardingData =
    user?.onboardingData && typeof user.onboardingData === "object"
      ? user.onboardingData
      : {};

  const hasAccess = user ? hasDashboardPaidAccess(user) : false;
  const userLevel = getOnboardingUserLevel(user?.onboardingData);
  const preferSimplified = prefersSimplifiedDashboard(user?.onboardingData);

  const upgradeToFullModeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/update-onboarding", {
        hasCompletedOnboarding: true,
        onboardingData: {
          experienceLevel: "intermediate",
          userLevel: "intermediate",
          preferSimplifiedView: false,
        },
      });
      const result = await response.json();
      if (result?.success !== true) {
        throw new Error("Your dashboard preference was not saved.");
      }
      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["/api/auth/onboarding-status"],
        }),
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
      ]);
      setLocation("/dashboard");
      toast({
        title: "Full Dashboard Enabled",
        description: "Your dashboard preference has been saved. Your subscription is unchanged.",
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

  const handleUpgrade = () => {
    if (!upgradeToFullModeMutation.isPending) upgradeToFullModeMutation.mutate();
  };

  useEffect(() => {
    if (
      onboardingStatus?.hasCompletedOnboarding &&
      onboardingData.preferSimplifiedView === false
    ) {
      setLocation("/dashboard");
    }
  }, [onboardingStatus, onboardingData.preferSimplifiedView, setLocation]);

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

  return (
    <AppLayout>
      <SimplifiedDashboardComponent
        onUpgrade={() => upgradeToFullModeMutation.mutate()}
        userLevel={userLevel}
        upgrading={upgradeToFullModeMutation.isPending}
      />
    </AppLayout>
  );
}
