import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useCallback } from 'react';

interface OnboardingTask {
  id: string;
  name: string;
  description: string | null;
  category: string;
  points: number;
  order: number;
  isRequired: boolean;
  actionUrl: string | null;
  icon: string | null;
  completed: boolean;
}

interface OnboardingProgress {
  userId: string;
  currentStep: number;
  totalSteps: number;
  completionPercentage: number;
  completedSteps: string[];
  totalPoints: number;
  dayStreak: number;
  startedAt: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  tasks: OnboardingTask[];
  recommendedNextStep: OnboardingTask | null;
}

export type OnboardingTaskName = 
  | 'Complete your profile'
  | 'Upload first track'
  | 'Try AI Music Generator'
  | 'Connect a social account'
  | 'Activate Social Autopilot'
  | 'Set up your beat store'
  | 'Schedule first post'
  | 'Explore Zero-Cost Advertising'
  | 'Explore analytics'
  | 'Invite a collaborator';

export function useOnboardingProgress() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: progress, isLoading } = useQuery<OnboardingProgress>({
    queryKey: ['/api/onboarding/progress'],
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await apiRequest('POST', '/api/onboarding/complete-step', { stepId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      
      if (data.pointsAwarded > 0) {
        toast({
          title: `+${data.pointsAwarded} XP!`,
          description: data.message,
        });
      }
    },
    onError: (error) => {
      console.error('Failed to complete onboarding step:', error);
    },
  });

  const findTaskByName = useCallback((name: OnboardingTaskName): OnboardingTask | undefined => {
    return progress?.tasks.find(t => t.name === name);
  }, [progress?.tasks]);

  const isTaskCompleted = useCallback((name: OnboardingTaskName): boolean => {
    const task = findTaskByName(name);
    return task?.completed ?? false;
  }, [findTaskByName]);

  const completeTaskByName = useCallback(async (name: OnboardingTaskName): Promise<boolean> => {
    const task = findTaskByName(name);
    if (!task) {
      console.warn(`Onboarding task not found: ${name}`);
      return false;
    }
    
    if (task.completed) {
      return true;
    }

    try {
      await completeStepMutation.mutateAsync(task.id);
      return true;
    } catch (error) {
      console.error(`Failed to complete task: ${name}`, error);
      return false;
    }
  }, [findTaskByName, completeStepMutation]);

  const completeTaskById = useCallback(async (stepId: string): Promise<boolean> => {
    const task = progress?.tasks.find(t => t.id === stepId);
    if (!task) {
      console.warn(`Onboarding task not found with id: ${stepId}`);
      return false;
    }

    if (task.completed) {
      return true;
    }

    try {
      await completeStepMutation.mutateAsync(stepId);
      return true;
    } catch (error) {
      console.error(`Failed to complete task: ${stepId}`, error);
      return false;
    }
  }, [progress?.tasks, completeStepMutation]);

  const trackProfileComplete = useCallback(async () => {
    await completeTaskByName('Complete your profile');
  }, [completeTaskByName]);

  const trackFirstTrackUpload = useCallback(async () => {
    await completeTaskByName('Upload first track');
  }, [completeTaskByName]);

  const trackAIGeneratorUsed = useCallback(async () => {
    await completeTaskByName('Try AI Music Generator');
  }, [completeTaskByName]);

  const trackSocialAccountConnected = useCallback(async () => {
    await completeTaskByName('Connect a social account');
  }, [completeTaskByName]);

  const trackSocialAutopilotActivated = useCallback(async () => {
    await completeTaskByName('Activate Social Autopilot');
  }, [completeTaskByName]);

  const trackBeatStoreSetup = useCallback(async () => {
    await completeTaskByName('Set up your beat store');
  }, [completeTaskByName]);

  const trackFirstPostScheduled = useCallback(async () => {
    await completeTaskByName('Schedule first post');
  }, [completeTaskByName]);

  const trackZeroCostAdvertisingExplored = useCallback(async () => {
    await completeTaskByName('Explore Zero-Cost Advertising');
  }, [completeTaskByName]);

  const trackAnalyticsExplored = useCallback(async () => {
    await completeTaskByName('Explore analytics');
  }, [completeTaskByName]);

  const trackCollaboratorInvited = useCallback(async () => {
    await completeTaskByName('Invite a collaborator');
  }, [completeTaskByName]);

  return {
    progress,
    isLoading,
    isOnboardingActive: !progress?.completedAt && !progress?.skippedAt,
    completionPercentage: progress?.completionPercentage ?? 0,
    totalPoints: progress?.totalPoints ?? 0,
    
    isTaskCompleted,
    completeTaskByName,
    completeTaskById,
    
    trackProfileComplete,
    trackFirstTrackUpload,
    trackAIGeneratorUsed,
    trackSocialAccountConnected,
    trackSocialAutopilotActivated,
    trackBeatStoreSetup,
    trackFirstPostScheduled,
    trackZeroCostAdvertisingExplored,
    trackAnalyticsExplored,
    trackCollaboratorInvited,
  };
}
