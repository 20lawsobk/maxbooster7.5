// @ts-nocheck
import { useLocation } from "wouter";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useRequireAuth();

  useEffect(() => {
    if (user?.onboardingCompleted) {
      setLocation("/dashboard");
    }
  }, [user?.onboardingCompleted, setLocation]);

  const handleComplete = () => {
    setLocation("/dashboard");
  };

  const handleSkip = () => {
    setLocation("/dashboard");
  };

  if (isLoading || !user) {
    return (
      <AppLayout noPadding>
        <main className="min-h-screen bg-black flex items-center justify-center p-4">
          <p className="text-sm text-white/60">
            {isLoading ? "Loading your setup…" : "Redirecting to sign in…"}
          </p>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout noPadding>
      <OnboardingWizard onComplete={handleComplete} onSkip={handleSkip} />
    </AppLayout>
  );
}
