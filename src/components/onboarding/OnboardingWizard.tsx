import { useState, useCallback, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { announce } from '@/lib/accessibility';
import { cn } from '@/lib/utils';
import {
  Music,
  Users,
  Headphones,
  Building2,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Sparkles,
  Info,
  Target,
  Share2,
  DollarSign,
  Mic2,
  BarChart3,
  Zap,
  HelpCircle,
} from 'lucide-react';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<StepProps>;
  isRequired: boolean;
  completedKey: string;
}

interface StepProps {
  data: OnboardingData;
  onDataChange: (data: Partial<OnboardingData>) => void;
  onNext: () => void;
  onBack: () => void;
  canProceed: boolean;
}

type Persona = 'artist' | 'producer' | 'label' | 'manager';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
type Goal = 'produce' | 'distribute' | 'social' | 'advertising' | 'marketplace' | 'analytics' | 'royalties';

interface OnboardingData {
  persona: Persona | null;
  experienceLevel: ExperienceLevel | null;
  goals: Goal[];
  preferSimplifiedView: boolean;
  hasSeenTour: boolean;
  connectedPlatforms: string[];
  completedSteps: string[];
}

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
  initialData?: Partial<OnboardingData>;
}

const personas = [
  {
    value: 'artist' as Persona,
    label: 'Solo Artist',
    icon: Music,
    description: 'Independent musician or singer creating and releasing your own music',
    features: ['Music distribution', 'Social media management', 'Analytics'],
  },
  {
    value: 'producer' as Persona,
    label: 'Producer/Beatmaker',
    icon: Headphones,
    description: 'Creating beats, instrumentals, and producing tracks for artists',
    features: ['Beat marketplace', 'Studio tools', 'Collaboration'],
  },
  {
    value: 'label' as Persona,
    label: 'Record Label',
    icon: Building2,
    description: 'Managing multiple artists and their releases',
    features: ['Multi-artist dashboard', 'Royalty splits', 'Catalog management'],
  },
  {
    value: 'manager' as Persona,
    label: 'Artist Manager',
    icon: Briefcase,
    description: 'Managing and growing artist careers',
    features: ['Campaign management', 'Financial tracking', 'Team coordination'],
  },
];

const experienceLevels = [
  {
    value: 'beginner' as ExperienceLevel,
    label: 'Just Starting Out',
    description: 'New to music production or business',
    recommendation: 'We\'ll show you simplified views and helpful guides',
  },
  {
    value: 'intermediate' as ExperienceLevel,
    label: 'Some Experience',
    description: 'Released music before, know the basics',
    recommendation: 'Balance of guidance and advanced features',
  },
  {
    value: 'advanced' as ExperienceLevel,
    label: 'Industry Professional',
    description: 'Extensive experience in music industry',
    recommendation: 'Full access to all professional tools',
  },
];

const goals = [
  { value: 'produce' as Goal, label: 'Produce & Record Music', icon: Mic2 },
  { value: 'distribute' as Goal, label: 'Distribute to Platforms', icon: Share2 },
  { value: 'social' as Goal, label: 'Grow Social Media', icon: Users },
  { value: 'advertising' as Goal, label: 'Run Ad Campaigns', icon: Target },
  { value: 'marketplace' as Goal, label: 'Sell on Marketplace', icon: DollarSign },
  { value: 'analytics' as Goal, label: 'Track Analytics', icon: BarChart3 },
  { value: 'royalties' as Goal, label: 'Manage Royalties', icon: DollarSign },
];

function PersonaStep({ data, onDataChange }: StepProps) {
  return (
    <div className="space-y-6" role="radiogroup" aria-label="Select your account type">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">Who are you?</h2>
        <p className="text-muted-foreground">
          Select your role to personalize your Max Booster experience
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {personas.map((persona) => {
          const Icon = persona.icon;
          const isSelected = data.persona === persona.value;
          return (
            <button
              key={persona.value}
              onClick={() => onDataChange({ persona: persona.value })}
              role="radio"
              aria-checked={isSelected}
              className={cn(
                'p-4 rounded-xl border-2 transition-all text-left hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 min-h-[120px]',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md'
                  : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  isSelected ? 'bg-blue-500 text-white' : 'bg-muted'
                )}>
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{persona.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-500" aria-hidden="true" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{persona.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {persona.features.map((feature) => (
                      <Badge key={feature} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExperienceStep({ data, onDataChange }: StepProps) {
  return (
    <div className="space-y-6" role="radiogroup" aria-label="Select your experience level">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">What's your experience level?</h2>
        <p className="text-muted-foreground">
          This helps us tailor the interface and guidance for you
        </p>
      </div>

      <div className="space-y-3">
        {experienceLevels.map((level) => {
          const isSelected = data.experienceLevel === level.value;
          return (
            <button
              key={level.value}
              onClick={() => onDataChange({ 
                experienceLevel: level.value,
                preferSimplifiedView: level.value === 'beginner'
              })}
              role="radio"
              aria-checked={isSelected}
              className={cn(
                'w-full p-4 rounded-xl border-2 transition-all text-left hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-md'
                  : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{level.label}</span>
                    {isSelected && <Check className="w-5 h-5 text-blue-500" aria-hidden="true" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{level.description}</p>
                  <div className="flex items-center gap-1 mt-2 text-xs text-blue-600 dark:text-blue-400">
                    <Info className="w-3 h-3" aria-hidden="true" />
                    <span>{level.recommendation}</span>
                  </div>
                </div>
                <div className={cn(
                  'w-6 h-6 rounded-full border-2 flex items-center justify-center',
                  isSelected ? 'border-blue-500 bg-blue-500' : 'border-border'
                )}>
                  {isSelected && <Check className="w-4 h-4 text-white" aria-hidden="true" />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GoalsStep({ data, onDataChange }: StepProps) {
  const toggleGoal = (goal: Goal) => {
    const newGoals = data.goals.includes(goal)
      ? data.goals.filter((g) => g !== goal)
      : [...data.goals, goal];
    onDataChange({ goals: newGoals });
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold">What are your goals?</h2>
        <p className="text-muted-foreground">
          Select all that apply - we'll customize your dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Select your goals">
        {goals.map((goal) => {
          const Icon = goal.icon;
          const isSelected = data.goals.includes(goal.value);
          return (
            <button
              key={goal.value}
              onClick={() => toggleGoal(goal.value)}
              role="checkbox"
              aria-checked={isSelected}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                isSelected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-border hover:border-blue-300 dark:hover:border-blue-700'
              )}
            >
              <div className={cn(
                'p-2 rounded-lg transition-colors',
                isSelected ? 'bg-blue-500 text-white' : 'bg-muted'
              )}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <span className="font-medium flex-1">{goal.label}</span>
              <div className={cn(
                'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
                isSelected ? 'border-blue-500 bg-blue-500' : 'border-border'
              )}>
                {isSelected && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
              </div>
            </button>
          );
        })}
      </div>

      {data.goals.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4" role="status" aria-live="polite">
          <div className="flex items-start gap-2">
            <Sparkles className="w-5 h-5 text-blue-500 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">
                {data.goals.length} goal{data.goals.length > 1 ? 's' : ''} selected
              </p>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Your dashboard will be optimized for these priorities
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QuickTourStep({ data, onDataChange }: StepProps) {
  const features = [
    {
      title: 'AI-Powered Studio',
      description: 'Professional DAW with AI mixing and mastering',
      icon: Mic2,
    },
    {
      title: 'Smart Distribution',
      description: 'Release to 150+ platforms with one click',
      icon: Share2,
    },
    {
      title: 'Social Automation',
      description: 'AI-generated content and scheduling',
      icon: Users,
    },
    {
      title: 'Real-time Analytics',
      description: 'Track streams, revenue, and growth',
      icon: BarChart3,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 mb-4">
          <Zap className="w-8 h-8 text-white" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-semibold">You're all set!</h2>
        <p className="text-muted-foreground">
          Here's what you can do with Max Booster
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 p-4 rounded-xl bg-muted">
        <Checkbox
          id="show-tour"
          checked={data.hasSeenTour}
          onCheckedChange={(checked) => onDataChange({ hasSeenTour: !!checked })}
        />
        <Label htmlFor="show-tour" className="text-sm cursor-pointer">
          Show me feature tours as I explore (recommended)
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="p-1" aria-label="More info about feature tours">
              <HelpCircle className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">
              We'll show helpful tooltips when you first visit each feature
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

const defaultSteps: OnboardingStep[] = [
  {
    id: 'persona',
    title: 'Select Your Role',
    description: 'Tell us about yourself',
    component: PersonaStep,
    isRequired: true,
    completedKey: 'persona',
  },
  {
    id: 'experience',
    title: 'Experience Level',
    description: 'Customize your interface',
    component: ExperienceStep,
    isRequired: true,
    completedKey: 'experienceLevel',
  },
  {
    id: 'goals',
    title: 'Your Goals',
    description: 'Prioritize your dashboard',
    component: GoalsStep,
    isRequired: true,
    completedKey: 'goals',
  },
  {
    id: 'tour',
    title: 'Quick Tour',
    description: 'Get started fast',
    component: QuickTourStep,
    isRequired: false,
    completedKey: 'hasSeenTour',
  },
];

export default function OnboardingWizard({
  onComplete,
  onSkip,
  initialData,
}: OnboardingWizardProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    persona: null,
    experienceLevel: null,
    goals: [],
    preferSimplifiedView: false,
    hasSeenTour: true,
    connectedPlatforms: [],
    completedSteps: [],
    ...initialData,
  });
  const { toast } = useToast();

  const currentStep = defaultSteps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / defaultSteps.length) * 100;

  const canProceed = useCallback(() => {
    switch (currentStep.id) {
      case 'persona':
        return data.persona !== null;
      case 'experience':
        return data.experienceLevel !== null;
      case 'goals':
        return data.goals.length > 0;
      case 'tour':
        return true;
      default:
        return false;
    }
  }, [currentStep.id, data]);

  const handleDataChange = useCallback((newData: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...newData }));
  }, []);

  const handleNext = useCallback(() => {
    if (currentStepIndex < defaultSteps.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
      announce(`Step ${currentStepIndex + 2} of ${defaultSteps.length}: ${defaultSteps[currentStepIndex + 1].title}`);
    }
  }, [currentStepIndex]);

  const handleBack = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      announce(`Step ${currentStepIndex} of ${defaultSteps.length}: ${defaultSteps[currentStepIndex - 1].title}`);
    }
  }, [currentStepIndex]);

  const completeMutation = useMutation({
    mutationFn: async (onboardingData: OnboardingData) => {
      const payload = {
        hasCompletedOnboarding: true,
        onboardingData: {
          persona: onboardingData.persona,
          experienceLevel: onboardingData.experienceLevel,
          goals: onboardingData.goals,
          preferSimplifiedView: onboardingData.preferSimplifiedView,
          hasSeenTour: onboardingData.hasSeenTour,
        },
      };
      const response = await apiRequest('POST', '/api/auth/update-onboarding', payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: '🎉 Welcome to Max Booster!',
        description: 'Your personalized dashboard is ready.',
        variant: 'success',
      });
      announce('Onboarding complete. Welcome to Max Booster!');
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to complete setup. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleComplete = useCallback(() => {
    completeMutation.mutate(data);
  }, [completeMutation, data]);

  useEffect(() => {
    announce(`Onboarding step ${currentStepIndex + 1} of ${defaultSteps.length}: ${currentStep.title}`);
  }, [currentStepIndex, currentStep.title]);

  const StepComponent = currentStep.component;

  return (
    <div 
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 p-4"
      role="main"
      aria-label="Onboarding wizard"
    >
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                Welcome to Max Booster
              </CardTitle>
              <CardDescription className="mt-1">
                Let's personalize your experience
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              onClick={onSkip}
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" aria-hidden="true" />
              Skip
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Step {currentStepIndex + 1} of {defaultSteps.length}: {currentStep.title}
              </span>
              <span className="font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress 
              value={progress} 
              className="h-2"
              aria-label={`Progress: ${Math.round(progress)}% complete`}
            />
            <div className="flex justify-between gap-2 mt-2">
              {defaultSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex-1 h-1 rounded-full transition-colors',
                    index <= currentStepIndex ? 'bg-blue-500' : 'bg-muted'
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <StepComponent
            data={data}
            onDataChange={handleDataChange}
            onNext={handleNext}
            onBack={handleBack}
            canProceed={canProceed()}
          />

          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStepIndex === 0}
              className="min-w-[100px] min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back
            </Button>

            {currentStepIndex < defaultSteps.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!canProceed()}
                className="min-w-[100px] min-h-[44px]"
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={completeMutation.isPending}
                className="min-w-[140px] min-h-[44px] bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                {completeMutation.isPending ? (
                  'Setting up...'
                ) : (
                  <>
                    Get Started
                    <Sparkles className="w-4 h-4 ml-2" aria-hidden="true" />
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function useOnboardingProgress() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);

  const markStepComplete = useCallback((stepId: string) => {
    setCompletedSteps((prev) => {
      if (prev.includes(stepId)) return prev;
      return [...prev, stepId];
    });
  }, []);

  const isStepComplete = useCallback((stepId: string) => {
    return completedSteps.includes(stepId);
  }, [completedSteps]);

  const getProgress = useCallback(() => {
    return (completedSteps.length / defaultSteps.length) * 100;
  }, [completedSteps]);

  return {
    completedSteps,
    markStepComplete,
    isStepComplete,
    getProgress,
    totalSteps: defaultSteps.length,
  };
}
