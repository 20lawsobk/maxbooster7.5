import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import {
  Brain,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Target,
  TrendingUp,
  Lightbulb,
  ArrowRight,
  Zap,
  Clock,
  CheckCircle2,
  Star,
} from 'lucide-react';

interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: number;
  actionUrl: string | null;
  createdAt: string;
}

interface Goal {
  id: string;
  goalType: string;
  title: string;
  description: string | null;
  targetValue: number;
  currentValue: number | null;
  unit: string | null;
  deadline: string | null;
  status: string;
}

interface RecommendationsResponse {
  success: boolean;
  data: {
    recommendations: Recommendation[];
    dailyTip: Recommendation | null;
    totalActive: number;
    lastAnalyzed: string;
  };
}

interface GoalsResponse {
  success: boolean;
  data: {
    goals: Goal[];
    summary: {
      total: number;
      active: number;
      completed: number;
    };
  };
}

const priorityColors: Record<number, string> = {
  1: 'bg-red-100 text-red-800 border-red-200',
  2: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  3: 'bg-blue-100 text-blue-800 border-blue-200',
};

const priorityLabels: Record<number, string> = {
  1: 'High Priority',
  2: 'Recommended',
  3: 'Nice to Have',
};

const typeIcons: Record<string, React.ReactNode> = {
  release_consistency: <Clock className="h-4 w-4" />,
  platform_focus: <TrendingUp className="h-4 w-4" />,
  benchmark: <Target className="h-4 w-4" />,
  social_connect: <Zap className="h-4 w-4" />,
  geo_targeting: <Target className="h-4 w-4" />,
  engagement_boost: <Star className="h-4 w-4" />,
  growth_opportunity: <Sparkles className="h-4 w-4" />,
};

export function AICareerCoach() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showGoals, setShowGoals] = useState(false);

  const { data: authUser } = useQuery({
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: recommendationsData, isLoading: recLoading } = useQuery<RecommendationsResponse>({
    queryKey: ['/api/career-coach/recommendations'],
    enabled: !!authUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: goalsData, isLoading: goalsLoading } = useQuery<GoalsResponse>({
    queryKey: ['/api/career-coach/goals'],
    enabled: !!authUser,
    staleTime: 5 * 60 * 1000,
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('POST', `/api/career-coach/dismiss/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/career-coach/recommendations'] });
      toast({
        title: 'Dismissed',
        description: 'Recommendation dismissed',
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('POST', `/api/career-coach/complete/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/career-coach/recommendations'] });
      toast({
        title: 'Completed!',
        description: 'Great job taking action!',
      });
    },
  });

  const createSmartGoalMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest('POST', '/api/career-coach/goals/smart', { type });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/career-coach/goals'] });
      toast({
        title: 'Goal Created',
        description: 'Your AI-generated goal has been set',
      });
    },
  });

  if (!authUser) return null;

  const recommendations = recommendationsData?.data?.recommendations || [];
  const dailyTip = recommendationsData?.data?.dailyTip;
  const goals = goalsData?.data?.goals || [];
  const activeGoals = goals.filter(g => g.status === 'active');
  const lastAnalyzed = recommendationsData?.data?.lastAnalyzed;

  if (recLoading) {
    return (
      <Card className="border-2 border-purple-200 dark:border-purple-800">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 w-40" />
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full mb-4" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-purple-950/20 dark:via-gray-900 dark:to-blue-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg">
                <Brain className="h-5 w-5 text-white" />
              </div>
              <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-white dark:border-gray-900 flex items-center justify-center">
                <Sparkles className="h-2 w-2 text-white" />
              </div>
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                AI Career Coach
                <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800">
                  Personalized
                </Badge>
              </CardTitle>
              {lastAnalyzed && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  AI analyzed your data
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGoals(!showGoals)}
            className="text-xs"
          >
            {showGoals ? 'Tips' : 'Goals'}
            <Target className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!showGoals ? (
          <>
            {dailyTip && (
              <div className="p-4 rounded-lg bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 border border-purple-200 dark:border-purple-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-0.5">
                      <Lightbulb className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {dailyTip.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {dailyTip.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {dailyTip.actionUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => setLocation(dailyTip.actionUrl!)}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-green-600 hover:text-green-700"
                      onClick={() => completeMutation.mutate(dailyTip.id)}
                      disabled={completeMutation.isPending}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-gray-400 hover:text-gray-600"
                      onClick={() => dismissMutation.mutate(dailyTip.id)}
                      disabled={dismissMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {recommendations.length > 1 && (
              <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between text-sm h-8">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">
                        {recommendations.length - 1} more recommendation{recommendations.length > 2 ? 's' : ''}
                      </span>
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mt-2">
                  {recommendations.slice(1).map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <div className="mt-0.5 text-purple-600">
                            {typeIcons[rec.type] || <Sparkles className="h-4 w-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-sm truncate">{rec.title}</p>
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] px-1.5 py-0 ${priorityColors[rec.priority]}`}
                              >
                                {priorityLabels[rec.priority]}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {rec.description}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {rec.actionUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => setLocation(rec.actionUrl!)}
                            >
                              <ArrowRight className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-green-600"
                            onClick={() => completeMutation.mutate(rec.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-gray-400"
                            onClick={() => dismissMutation.mutate(rec.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {recommendations.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Sparkles className="h-8 w-8 mx-auto mb-2 text-purple-400" />
                <p className="text-sm">You're all caught up!</p>
                <p className="text-xs">Check back tomorrow for new tips</p>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {goalsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : activeGoals.length > 0 ? (
              <div className="space-y-3">
                {activeGoals.slice(0, 3).map((goal) => {
                  const progress = goal.targetValue > 0 
                    ? Math.min(((goal.currentValue || 0) / goal.targetValue) * 100, 100)
                    : 0;
                  
                  return (
                    <div key={goal.id} className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-purple-600" />
                          <span className="font-medium text-sm">{goal.title}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {goal.goalType}
                        </Badge>
                      </div>
                      <Progress value={progress} className="h-2 mb-1" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{goal.currentValue || 0} / {goal.targetValue} {goal.unit}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      {goal.deadline && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Deadline: {new Date(goal.deadline).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-4">
                <Target className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-muted-foreground mb-3">No active goals yet</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {['streams', 'followers', 'releases'].map((type) => (
                    <Button
                      key={type}
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => createSmartGoalMutation.mutate(type)}
                      disabled={createSmartGoalMutation.isPending}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      {type.charAt(0).toUpperCase() + type.slice(1)} Goal
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AICareerCoach;
