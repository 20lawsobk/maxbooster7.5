import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  getOnboardingData,
  getOnboardingUserLevel,
  prefersSimplifiedDashboard,
  parseOnboardingStatusResponse,
  parseOnboardingUpdateResponse,
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
  const onboardingData = getOnboardingData(user?.onboardingData);

  const hasAccess = user ? hasDashboardPaidAccess(user) : false;
  const userLevel = getOnboardingUserLevel(user?.onboardingData);
  const preferSimplified = prefersSimplifiedDashboard(onboardingData);

  const { data: onboardingStatus } = useQuery({
    queryKey: ["/api/auth/onboarding-status"],
    enabled: Boolean(user) && !isLoading && hasAccess,
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/auth/onboarding-status");
      return parseOnboardingStatusResponse(await readDashboardJson(response));
    },
  });

  useEffect(() => {
    if (!isLoading && user && !hasAccess) {
      setLocation("/pricing");
    }
  }, [isLoading, user, hasAccess, setLocation]);

  const upgradeToFullModeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/update-onboarding", {
        hasCompletedOnboarding: true,
        onboardingData: {
          preferSimplifiedView: false,
        },
      });
      return parseOnboardingUpdateResponse(await response.json());
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
  }, [onboardingStatus?.hasCompletedOnboarding, preferSimplified, setLocation]);

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
