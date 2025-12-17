import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Music, Users, Headphones, Building2, ArrowRight, ArrowLeft, Check } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
  onSkip: () => void;
}

type AccountType = 'solo_artist' | 'band' | 'producer' | 'label';
type UserLevel = 'beginner' | 'intermediate' | 'advanced';

interface OnboardingData {
  accountType: AccountType | null;
  goals: string[];
  userLevel: UserLevel | null;
  connectedAccounts: {
    streaming: boolean;
    social: boolean;
  };
}

const accountTypes = [
  {
    value: 'solo_artist' as AccountType,
    label: 'Solo Artist',
    icon: Music,
    description: 'Perfect for independent musicians and singers',
  },
  {
    value: 'band' as AccountType,
    label: 'Band/Group',
    icon: Users,
    description: 'Collaborate with your bandmates',
  },
  {
    value: 'producer' as AccountType,
    label: 'Producer',
    icon: Headphones,
    description: 'Create beats and produce tracks',
  },
  {
    value: 'label' as AccountType,
    label: 'Label',
    icon: Building2,
    description: 'Manage multiple artists and releases',
  },
];

const goals = [
  { value: 'produce', label: 'Produce & record music' },
  { value: 'distribute', label: 'Distribute to streaming platforms' },
  { value: 'social', label: 'Grow social media presence' },
  { value: 'advertising', label: 'Run ad campaigns' },
  { value: 'marketplace', label: 'Sell beats/samples on marketplace' },
  { value: 'analytics', label: 'Track analytics & royalties' },
];

const experienceLevels = [
  {
    value: 'beginner' as UserLevel,
    label: 'Beginner',
    description: 'New to music production/business',
  },
  {
    value: 'intermediate' as UserLevel,
    label: 'Intermediate',
    description: 'Some experience',
  },
  {
    value: 'advanced' as UserLevel,
    label: 'Advanced',
    description: 'Professional level',
  },
];

export default function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<OnboardingData>({
    accountType: null,
    goals: [],
    userLevel: null,
    connectedAccounts: {
      streaming: false,
      social: false,
    },
  });
  const { toast } = useToast();

  const updateOnboardingMutation = useMutation({
    mutationFn: async (data: OnboardingData) => {
      const payload = {
        hasCompletedOnboarding: true,
        onboardingData: {
          accountType: data.accountType,
          goals: data.goals,
          userLevel: data.userLevel,
          connectedAccounts: data.connectedAccounts,
          preferSimplifiedView: data.userLevel === 'beginner',
        },
      };
      const response = await apiRequest('POST', '/api/auth/update-onboarding', payload);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: '✨ Welcome to Max Booster!',
        description: "Your account setup is complete. Let's boost your music career!",
      });
      onComplete();
    },
    onError: (error: unknown) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to save onboarding data. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return formData.accountType !== null;
      case 2:
        return formData.goals.length > 0;
      case 3:
        return formData.userLevel !== null;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canProceed() && currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    updateOnboardingMutation.mutate(formData);
  };

  const toggleGoal = (goal: string) => {
    setFormData({
      ...formData,
      goals: formData.goals.includes(goal)
        ? formData.goals.filter((g) => g !== goal)
        : [...formData.goals, goal],
    });
  };

  const progress = (currentStep / 4) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-blue-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Welcome to Max Booster
            </CardTitle>
            <Button variant="ghost" onClick={onSkip} size="sm">
              Skip
            </Button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Step {currentStep} of 4</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">Let's get started!</h2>
                <p className="text-muted-foreground">
                  Tell us about yourself so we can personalize your experience
                </p>
              </div>

              <div className="space-y-3">
                <Label className="text-base font-medium">Select your account type</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {accountTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        onClick={() => setFormData({ ...formData, accountType: type.value })}
                        className={`p-4 rounded-lg border-2 transition-all text-left hover:shadow-md ${
                          formData.accountType === type.value
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          <Icon
                            className={`w-6 h-6 mt-0.5 ${formData.accountType === type.value ? 'text-primary' : 'text-gray-400'}`}
                          />
                          <div className="flex-1 space-y-1">
                            <div className="font-semibold">{type.label}</div>
                            <div className="text-sm text-muted-foreground">{type.description}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">What are your goals?</h2>
                <p className="text-muted-foreground">
                  Select all that apply - we'll customize your dashboard accordingly
                </p>
              </div>

              <div className="space-y-4">
                {goals.map((goal) => (
                  <div
                    key={goal.value}
                    className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Checkbox
                      id={goal.value}
                      checked={formData.goals.includes(goal.value)}
                      onCheckedChange={() => toggleGoal(goal.value)}
                    />
                    <Label htmlFor={goal.value} className="flex-1 cursor-pointer text-base">
                      {goal.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">What's your experience level?</h2>
                <p className="text-muted-foreground">
                  This helps us show you the right features and guidance
                </p>
              </div>

              <div className="space-y-3">
                {experienceLevels.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setFormData({ ...formData, userLevel: level.value })}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left hover:shadow-md ${
                      formData.userLevel === level.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold text-base">{level.label}</div>
                        <div className="text-sm text-muted-foreground">{level.description}</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.userLevel === level.value
                            ? 'border-primary bg-primary'
                            : 'border-gray-300'
                        }`}
                      >
                        {formData.userLevel === level.value && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-semibold">Quick Setup (Optional)</h2>
                <p className="text-muted-foreground">
                  Connect your accounts now or skip and do it later
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-lg border-2 border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="streaming"
                      checked={formData.connectedAccounts.streaming}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          connectedAccounts: {
                            ...formData.connectedAccounts,
                            streaming: !!checked,
                          },
                        })
                      }
                    />
                    <Label htmlFor="streaming" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Connect Streaming Account</div>
                      <div className="text-sm text-muted-foreground">
                        Spotify, Apple Music, etc.
                      </div>
                    </Label>
                  </div>
                </div>

                <div className="p-4 rounded-lg border-2 border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-center space-x-3">
                    <Checkbox
                      id="social"
                      checked={formData.connectedAccounts.social}
                      onCheckedChange={(checked) =>
                        setFormData({
                          ...formData,
                          connectedAccounts: { ...formData.connectedAccounts, social: !!checked },
                        })
                      }
                    />
                    <Label htmlFor="social" className="flex-1 cursor-pointer">
                      <div className="font-semibold">Link Social Media</div>
                      <div className="text-sm text-muted-foreground">
                        Facebook, Instagram, Twitter
                      </div>
                    </Label>
                  </div>
                </div>

                <p className="text-sm text-center text-muted-foreground mt-4">
                  Don't worry, you can connect these accounts later from your settings
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-6 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="min-w-[100px]"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {currentStep < 4 ? (
              <Button onClick={handleNext} disabled={!canProceed()} className="min-w-[100px]">
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleComplete}
                disabled={updateOnboardingMutation.isPending}
                className="min-w-[140px] bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {updateOnboardingMutation.isPending ? (
                  'Setting up...'
                ) : (
                  <>
                    Complete Setup
                    <Check className="w-4 h-4 ml-2" />
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
