import { useLocation } from 'wouter';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.hasCompletedOnboarding) {
      setLocation('/dashboard');
    }
  }, [user?.hasCompletedOnboarding, setLocation]);

  const handleComplete = () => {
    setLocation('/dashboard');
  };

  const handleSkip = () => {
    setLocation('/dashboard');
  };

  return (
    <OnboardingWizard
      onComplete={handleComplete}
      onSkip={handleSkip}
    />
  );
}
