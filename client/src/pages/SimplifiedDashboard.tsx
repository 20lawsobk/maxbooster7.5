import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  getOnboardingUserLevel,
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

  const { data: onboardingStatus } = useQuery<{ hasCompletedOnboarding: boolean }>({
    queryKey: ["/api/auth/onboarding-status"],
    enabled: Boolean(user) && hasAccess,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/onboarding-status");
      const result = await readDashboardJson(response);
      if (!result || typeof result !== "object" || !("hasCompletedOnboarding" in result) ||
          typeof result.hasCompletedOnboarding !== "boolean") {
        throw new Error("Invalid onboarding status response");
      }
      return { hasCompletedOnboarding: result.hasCompletedOnboarding };
    },
  });

  const upgradeToFullModeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/update-onboarding", {
        hasCompletedOnboarding: true,
        onboardingData: {
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
      !preferSimplified
    ) {
      setLocation("/dashboard");
    }
  }, [onboardingStatus, preferSimplified, setLocation]);

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
        onUpgrade={handleUpgrade}
        userLevel={userLevel}
        upgrading={upgradeToFullModeMutation.isPending}
      />
    </AppLayout>
  );
}
