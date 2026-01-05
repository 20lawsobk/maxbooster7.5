import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Music,
  Share2,
  BarChart3,
  Calendar,
  ShoppingBag,
  UserPlus,
  Sparkles,
  Trophy,
  Flame,
  Star,
  ArrowRight,
  Zap,
  Gift,
  Target,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';

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

const iconMap: Record<string, React.ComponentType<any>> = {
  User,
  Music,
  Share2,
  BarChart3,
  Calendar,
  ShoppingBag,
  UserPlus,
  Sparkles,
};

const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
  'Profile Setup': { bg: 'bg-blue-50 dark:bg-blue-950/20', text: 'text-blue-600', border: 'border-blue-200' },
  'First Release': { bg: 'bg-purple-50 dark:bg-purple-950/20', text: 'text-purple-600', border: 'border-purple-200' },
  'Connect Socials': { bg: 'bg-pink-50 dark:bg-pink-950/20', text: 'text-pink-600', border: 'border-pink-200' },
  'Explore Features': { bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-600', border: 'border-green-200' },
};

interface FirstWeekSuccessPathProps {
  onComplete?: () => void;
  onSkip?: () => void;
  compact?: boolean;
}

export default function FirstWeekSuccessPath({ onComplete, onSkip, compact = false }: FirstWeekSuccessPathProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showCelebration, setShowCelebration] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: progress, isLoading } = useQuery<OnboardingProgress>({
    queryKey: ['/api/onboarding/progress'],
    refetchInterval: 30000,
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await apiRequest('POST', '/api/onboarding/complete-step', { stepId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      
      if (data.allCompleted) {
        setShowCelebration(true);
        setTimeout(() => {
          setShowCelebration(false);
          onComplete?.();
        }, 3000);
      }
      
      toast({
        title: data.pointsAwarded > 0 ? `+${data.pointsAwarded} XP!` : 'Task Updated',
        description: data.message,
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to complete task',
        variant: 'destructive',
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/onboarding/skip');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      toast({
        title: 'Onboarding Skipped',
        description: data.message,
      });
      onSkip?.();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to skip onboarding',
        variant: 'destructive',
      });
    },
  });

  const handleTaskClick = (task: OnboardingTask) => {
    if (!task.completed && task.actionUrl) {
      setLocation(task.actionUrl);
    }
  };

  const getDayProgress = () => {
    if (!progress?.startedAt) return 1;
    const start = new Date(progress.startedAt);
    const now = new Date();
    const days = Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.min(days, 7);
  };

  const getIcon = (iconName: string | null) => {
    if (!iconName) return Circle;
    return iconMap[iconName] || Circle;
  };

  const groupedTasks = progress?.tasks.reduce((acc, task) => {
    if (!acc[task.category]) {
      acc[task.category] = [];
    }
    acc[task.category].push(task);
    return acc;
  }, {} as Record<string, OnboardingTask[]>) || {};

  if (isLoading) {
    return (
      <Card className="w-full animate-pulse">
        <CardContent className="p-6">
          <div className="h-8 bg-muted rounded w-3/4 mb-4" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (progress?.completedAt || progress?.skippedAt) {
    return null;
  }

  return (
    <>
      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div
              className="bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 p-8 rounded-3xl text-center text-white"
              animate={{
                rotate: [0, -5, 5, -5, 5, 0],
                scale: [1, 1.05, 1],
              }}
              transition={{ duration: 0.5, repeat: 2 }}
            >
              <Trophy className="w-24 h-24 mx-auto mb-4" />
              <h2 className="text-3xl font-bold mb-2">Congratulations!</h2>
              <p className="text-xl">You've completed your First Week Success Path!</p>
              <p className="text-2xl font-bold mt-4">{progress?.totalPoints} XP Earned</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="w-full border-2 border-gradient-to-r from-blue-500 to-purple-500 shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <Target className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl flex items-center gap-2">
                  First Week Success Path
                  {progress?.dayStreak && progress.dayStreak > 0 && (
                    <Badge variant="outline" className="flex items-center gap-1 text-orange-500 border-orange-300">
                      <Flame className="h-3 w-3" />
                      {progress.dayStreak} day streak
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Complete tasks to unlock your full potential
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-lg px-3 py-1">
                <Star className="h-4 w-4 mr-1" />
                {progress?.totalPoints || 0} XP
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => skipMutation.mutate()}
                disabled={skipMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Day {getDayProgress()} of 7
              </span>
              <span className="font-medium">
                {progress?.completionPercentage || 0}% complete
              </span>
            </div>
            <Progress value={progress?.completionPercentage || 0} className="h-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress?.completedSteps.length || 0} of {progress?.totalSteps || 0} tasks</span>
              <span>
                {(progress?.totalSteps || 0) - (progress?.completedSteps.length || 0)} remaining
              </span>
            </div>
          </div>
        </CardHeader>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0 space-y-4">
                {progress?.recommendedNextStep && !progress.recommendedNextStep.completed && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30 rounded-xl border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">
                      <Zap className="h-4 w-4" />
                      Recommended Next Step
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const IconComponent = getIcon(progress.recommendedNextStep.icon);
                          return <IconComponent className="h-5 w-5 text-blue-600" />;
                        })()}
                        <div>
                          <p className="font-medium">{progress.recommendedNextStep.name}</p>
                          <p className="text-sm text-muted-foreground">{progress.recommendedNextStep.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                          <Gift className="h-3 w-3 mr-1" />
                          +{progress.recommendedNextStep.points} XP
                        </Badge>
                        <Button
                          size="sm"
                          onClick={() => handleTaskClick(progress.recommendedNextStep!)}
                        >
                          Start <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {Object.entries(groupedTasks).map(([category, tasks]) => {
                  const colors = categoryColors[category] || categoryColors['Explore Features'];
                  const completedInCategory = tasks.filter(t => t.completed).length;

                  return (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm font-semibold ${colors.text}`}>
                          {category}
                        </h4>
                        <span className="text-xs text-muted-foreground">
                          {completedInCategory}/{tasks.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {tasks.map((task) => {
                          const IconComponent = getIcon(task.icon);
                          return (
                            <motion.div
                              key={task.id}
                              whileHover={{ scale: task.completed ? 1 : 1.01 }}
                              className={`
                                flex items-center justify-between p-3 rounded-lg border transition-all
                                ${task.completed
                                  ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                                  : `${colors.bg} ${colors.border} hover:shadow-sm cursor-pointer`
                                }
                              `}
                              onClick={() => !task.completed && handleTaskClick(task)}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`
                                  p-2 rounded-lg
                                  ${task.completed 
                                    ? 'bg-green-500 text-white' 
                                    : `bg-white dark:bg-gray-800 ${colors.text}`
                                  }
                                `}>
                                  {task.completed ? (
                                    <CheckCircle className="h-5 w-5" />
                                  ) : (
                                    <IconComponent className="h-5 w-5" />
                                  )}
                                </div>
                                <div>
                                  <p className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                    {task.name}
                                    {task.isRequired && (
                                      <Badge variant="outline" className="ml-2 text-xs">Required</Badge>
                                    )}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {task.description}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={task.completed ? 'default' : 'outline'}
                                  className={task.completed ? 'bg-green-500' : 'text-yellow-600 border-yellow-300'}
                                >
                                  {task.completed ? (
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                  ) : (
                                    <Star className="h-3 w-3 mr-1" />
                                  )}
                                  {task.points} XP
                                </Badge>
                                {!task.completed && (
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Complete all tasks to earn the maximum reward
                    </span>
                    <span className="font-medium text-purple-600">
                      Total Available: {progress?.tasks.reduce((sum, t) => sum + t.points, 0) || 0} XP
                    </span>
                  </div>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </>
  );
}
