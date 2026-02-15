import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import SimplifiedDashboardComponent from '@/components/onboarding/SimplifiedDashboard';
import { AppLayout } from '@/components/layout/AppLayout';

export default function SimplifiedDashboard() {
  const { user, isLoading } = useRequireAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: onboardingStatus } = useQuery({
    queryKey: ['/api/auth/onboarding-status'],
    enabled: !!user,
  });

  const upgradeToFullModeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/update-onboarding', {
        hasCompletedOnboarding: true,
        onboardingData: {
          userLevel: 'intermediate',
          preferSimplifiedView: false,
        },
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/onboarding-status'] });
      setLocation('/dashboard');
      toast({
        title: 'Upgraded Successfully',
        description: 'You now have access to all advanced features!',
      });
    },
    onError: () => {
      toast({
        title: 'Upgrade Failed',
        description: 'Failed to upgrade to full mode. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleUpgrade = () => {
    upgradeToFullModeMutation.mutate();
  };

  useEffect(() => {
    if (
      onboardingStatus?.hasCompletedOnboarding &&
      onboardingStatus?.onboardingData?.preferSimplifiedView === false
    ) {
      setLocation('/dashboard');
    }
  }, [onboardingStatus, setLocation]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const userLevel = onboardingStatus?.onboardingData?.userLevel || 'beginner';

  return (
    <AppLayout>
      <SimplifiedDashboardComponent onUpgrade={handleUpgrade} userLevel={userLevel} />
    </AppLayout>
  );
}
