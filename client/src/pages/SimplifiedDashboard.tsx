// @ts-nocheck
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

  const { data: onboardingStatus } = useQuery({
    queryKey: ["/api/auth/onboarding-status"],
    enabled: !!user,
  });

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
    onError: () => {
      toast({
        title: "Upgrade Failed",
        description: "Failed to upgrade to full mode. Please try again.",
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

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const storedLevel = onboardingData.experienceLevel ?? onboardingData.userLevel;
  const userLevel =
    storedLevel === "intermediate" || storedLevel === "advanced"
      ? storedLevel
      : "beginner";

  return (
    <AppLayout>
      <SimplifiedDashboardComponent
        onUpgrade={handleUpgrade}
        userLevel={userLevel}
      />
    </AppLayout>
  );
}
