import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  Circle,
  X,
  ChevronDown,
  ChevronUp,
  User,
  Sparkles,
  Music,
  Share2,
  Crown,
  Gift,
  Zap,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { Link } from 'wouter';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  completed: boolean;
  href?: string;
  action?: () => void;
}

export default function OnboardingChecklist() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [steps, setSteps] = useState<OnboardingStep[]>([
    {
      id: 'create-account',
      title: 'Account Created',
      description: "You're all set up and ready to go!",
      icon: User,
      completed: true,
      href: '/settings',
    },
    {
      id: 'explore-studio',
      title: 'Explore AI Studio',
      description: 'Create your first AI-powered track',
      icon: Sparkles,
      completed: false,
      href: '/studio',
    },
    {
      id: 'generate-content',
      title: 'Generate First Content',
      description: 'Use AI to create social media posts',
      icon: Music,
      completed: false,
      href: '/social-media',
    },
    {
      id: 'connect-social',
      title: 'Connect Social Platform',
      description: 'Link your social accounts for automation',
      icon: Share2,
      completed: false,
      href: '/social-media',
    },
    {
      id: 'upgrade-account',
      title: 'Unlock All Features',
      description: 'Upgrade to access unlimited AI power',
      icon: Crown,
      completed: false,
      href: '/pricing',
    },
  ]);

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem('onboardingProgress');
    const savedDismissed = localStorage.getItem('onboardingDismissed');

    if (savedProgress) {
      try {
        const progress = JSON.parse(savedProgress);
        setSteps((prevSteps) =>
          prevSteps.map((step) => ({
            ...step,
            completed: progress[step.id] || step.completed,
          }))
        );
      } catch (e: unknown) {
        logger.error('Failed to load onboarding progress');
      }
    }

    if (savedDismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Save progress to localStorage
  const markStepComplete = (stepId: string) => {
    const newSteps = steps.map((step) =>
      step.id === stepId ? { ...step, completed: true } : step
    );
    setSteps(newSteps);

    const progress = newSteps.reduce(
      (acc, step) => ({
        ...acc,
        [step.id]: step.completed,
      }),
      {}
    );

    localStorage.setItem('onboardingProgress', JSON.stringify(progress));
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('onboardingDismissed', 'true');
  };

  const handleRestore = () => {
    setIsDismissed(false);
    localStorage.removeItem('onboardingDismissed');
  };

  const completedCount = steps.filter((step) => step.completed).length;
  const progressPercentage = (completedCount / steps.length) * 100;

  // Demo mode bonus step
  const bonusStep = {
    icon: Gift,
    title: 'Demo Mode Active',
    description: "You're exploring Max Booster with full access!",
  };

  if (isDismissed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={handleRestore}
          size="sm"
          variant="outline"
          className="shadow-lg"
          data-testid="button-restore-checklist"
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          Show Getting Started
        </Button>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-xl border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Getting Started</CardTitle>
              <p className="text-sm text-muted-foreground">
                {completedCount} of {steps.length} steps completed
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setIsExpanded(!isExpanded)}
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              data-testid="button-toggle-checklist"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button
              onClick={handleDismiss}
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              data-testid="button-dismiss-checklist"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <Progress value={progressPercentage} className="mt-3 h-2" />
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-2 space-y-3">
          {/* Demo Mode Banner */}
          <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-3 border border-purple-200/50">
            <div className="flex items-center space-x-3">
              <bonusStep.icon className="w-5 h-5 text-purple-600" />
              <div className="flex-1">
                <p className="font-medium text-sm">{bonusStep.title}</p>
                <p className="text-xs text-muted-foreground">{bonusStep.description}</p>
              </div>
            </div>
          </div>

          {/* Checklist Steps */}
          <div className="space-y-2">
            {steps.map((step) => (
              <Link key={step.id} href={step.href || '#'}>
                <div
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all cursor-pointer
                    ${
                      step.completed
                        ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800'
                        : 'bg-gray-50 dark:bg-gray-950/20 hover:bg-gray-100 dark:hover:bg-gray-900/30 border border-gray-200 dark:border-gray-800'
                    }`}
                  onClick={() => !step.completed && markStepComplete(step.id)}
                  data-testid={`checklist-step-${step.id}`}
                >
                  <div className="flex-shrink-0">
                    {step.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <step.icon
                      className={`w-5 h-5 ${step.completed ? 'text-green-600' : 'text-gray-600'}`}
                    />
                  </div>
                  <div className="flex-1">
                    <p
                      className={`font-medium text-sm ${step.completed ? 'text-green-900 dark:text-green-100' : ''}`}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  {!step.completed && <ArrowRight className="w-4 h-4 text-gray-400" />}
                </div>
              </Link>
            ))}
          </div>

          {/* Completion Reward */}
          {completedCount === steps.length && (
            <div className="bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg p-4 border border-yellow-200/50">
              <div className="flex items-center space-x-3">
                <Crown className="w-6 h-6 text-yellow-600" />
                <div>
                  <p className="font-semibold text-sm">Congratulations! 🎉</p>
                  <p className="text-xs text-muted-foreground">
                    You've completed all onboarding steps. You're ready to dominate!
                  </p>
                </div>
              </div>
              <Link href="/pricing">
                <Button size="sm" className="mt-3 w-full">
                  Unlock Full Power
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
