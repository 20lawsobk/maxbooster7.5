import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Music, Share2, TrendingUp, Sparkles, ArrowRight, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

interface QuickStartWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

type WizardStep = 'welcome' | 'choose-path' | 'complete';

interface QuickStartPath {
  id: string;
  title: string;
  description: string;
  icon: typeof Music;
  route: string;
  benefits: string[];
  estimatedTime: string;
}

const QUICK_START_PATHS: QuickStartPath[] = [
  {
    id: 'distribute',
    title: 'Distribute Your First Track',
    description: 'Get your music on Spotify, Apple Music, and 150+ platforms in under 5 minutes',
    icon: Music,
    route: '/distribution',
    benefits: [
      'Reach millions of listeners worldwide',
      'Keep 100% of your royalties',
      'Professional metadata & artwork',
      'Automated delivery to all DSPs',
    ],
    estimatedTime: '5 minutes',
  },
  {
    id: 'social',
    title: 'Schedule Your First Social Post',
    description: 'Let AI optimize and schedule your content across all platforms',
    icon: Share2,
    route: '/social-media',
    benefits: [
      'AI-powered optimal posting times',
      'Multi-platform scheduling',
      'Engagement predictions',
      'Automatic content optimization',
    ],
    estimatedTime: '3 minutes',
  },
  {
    id: 'advertising',
    title: 'Launch Zero-Cost Ad Campaign',
    description: 'Create viral organic content that outperforms paid ads - completely free',
    icon: TrendingUp,
    route: '/advertising',
    benefits: [
      'Save $60,000+/year vs paid ads',
      '50-100% better results than paid',
      'AI-powered viral predictions',
      'Organic reach amplification',
    ],
    estimatedTime: '4 minutes',
  },
];

export function QuickStartWizard({ onComplete, onSkip }: QuickStartWizardProps) {
  const [step, setStep] = useState<WizardStep>('welcome');
  const [selectedPath, setSelectedPath] = useState<QuickStartPath | null>(null);
  const [, setLocation] = useLocation();

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/users/complete-onboarding', {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to complete onboarding');
      return response.json();
    },
    onSuccess: () => {
      if (selectedPath) {
        setLocation(selectedPath.route);
      }
      onComplete();
    },
  });

  const handleSkip = async () => {
    // Always close the onboarding and set localStorage, even if API fails
    localStorage.setItem('onboardingSkipped', 'true');
    try {
      await completeOnboardingMutation.mutateAsync();
    } catch (error) {
      // Silently fail - user should still be able to skip
      console.warn('Failed to mark onboarding complete, but proceeding anyway');
    }
    onSkip();
  };

  const handlePathSelect = (path: QuickStartPath) => {
    setSelectedPath(path);
    setStep('complete');
  };

  const handleStartPath = () => {
    completeOnboardingMutation.mutate();
  };

  const progress = step === 'welcome' ? 33 : step === 'choose-path' ? 66 : 100;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-4xl shadow-2xl border-2">
        <CardHeader className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={handleSkip}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
            <CardTitle className="text-2xl">Welcome to Max Booster! 🎉</CardTitle>
          </div>
          <Progress value={progress} className="h-2" />
        </CardHeader>

        <CardContent className="space-y-6">
          {step === 'welcome' && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-4">
                <h3 className="text-xl font-semibold">
                  Let's Get Your First Win in 5 Minutes or Less
                </h3>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Max Booster gives you 8 powerful tools for your music career. Instead of overwhelming
                  you with everything at once, let's start with one quick win to show you the value.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">AI Works Immediately</p>
                    <p className="text-sm text-muted-foreground">
                      Pre-trained on proven strategies from day 1
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">8 Tools, 1 Platform</p>
                    <p className="text-sm text-muted-foreground">
                      Studio, distribution, social, ads, analytics & more
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-primary/5">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">Save $60K+/Year</p>
                    <p className="text-sm text-muted-foreground">
                      Free advertising that outperforms paid ads
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-4">
                <Button size="lg" onClick={() => setStep('choose-path')}>
                  Get Started <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 'choose-path' && (
            <div className="space-y-6 py-4">
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold">Choose Your First Quick Win</h3>
                <p className="text-muted-foreground">
                  Pick the path that's most valuable to you right now. You can explore the other tools anytime.
                </p>
              </div>

              <div className="grid gap-4 mt-6">
                {QUICK_START_PATHS.map((path) => {
                  const Icon = path.icon;
                  return (
                    <Card
                      key={path.id}
                      className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                      onClick={() => handlePathSelect(path)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="p-3 rounded-lg bg-primary/10">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-lg">{path.title}</h4>
                              <span className="text-sm text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                {path.estimatedTime}
                              </span>
                            </div>
                            <p className="text-muted-foreground mb-4">{path.description}</p>
                            <div className="grid grid-cols-2 gap-2">
                              {path.benefits.map((benefit, idx) => (
                                <div key={idx} className="flex items-start gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                  <span className="text-sm">{benefit}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <ArrowRight className="h-5 w-5 text-muted-foreground mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'complete' && selectedPath && (
            <div className="space-y-6 py-8 text-center">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-primary/10">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-semibold">Perfect Choice!</h3>
                <p className="text-muted-foreground max-w-xl mx-auto">
                  You're about to {selectedPath.title.toLowerCase()}. This will take approximately{' '}
                  <strong>{selectedPath.estimatedTime}</strong> and give you immediate results.
                </p>
              </div>

              <div className="bg-primary/5 p-6 rounded-lg max-w-xl mx-auto">
                <p className="font-medium mb-3">What Happens Next:</p>
                <div className="space-y-2 text-left">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-primary">1.</span>
                    <span className="text-sm">We'll guide you through the process step-by-step</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-primary">2.</span>
                    <span className="text-sm">
                      AI will help optimize your content for maximum impact
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-primary">3.</span>
                    <span className="text-sm">
                      You'll see your first results within minutes
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-primary">4.</span>
                    <span className="text-sm">
                      Explore the other 7 tools whenever you're ready
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-4 pt-4">
                <Button variant="outline" onClick={() => setStep('choose-path')}>
                  Choose Different Path
                </Button>
                <Button
                  size="lg"
                  onClick={handleStartPath}
                  disabled={completeOnboardingMutation.isPending}
                >
                  {completeOnboardingMutation.isPending ? (
                    'Starting...'
                  ) : (
                    <>
                      Let's Go! <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>

        {step !== 'complete' && (
          <div className="px-6 pb-6">
            <Button variant="ghost" className="w-full" onClick={handleSkip}>
              Skip and explore on my own
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
