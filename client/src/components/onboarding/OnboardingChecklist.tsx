import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, Circle, X, ChevronDown, ChevronUp, User, Sparkles, Music, Share2, Crown, Zap, ArrowRight, HelpCircle, Trophy, Star, Flame, Target, BarChart3, Calendar, UserPlus, ShoppingBag, Minimize2, PartyPopper, Lock } from "lucide-react";
import { Link } from "wouter";

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

interface OnboardingProgressData {
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

interface OnboardingChecklistProps {
  variant?: "floating" | "inline" | "sidebar";
  showOnComplete?: boolean;
  className?: string;
}

const ICON_MAP: Record<string, typeof User> = {
  User,
  Sparkles,
  Music,
  Share2,
  Crown,
  BarChart3,
  Calendar,
  UserPlus,
  ShoppingBag,
  Target,
  Zap,
};

const REWARDS = [
  { threshold: 25, label: "Quick Starter", icon: Star, color: "text-blue-500" },
  { threshold: 50, label: "Halfway Hero", icon: Zap, color: "text-purple-500" },
  {
    threshold: 75,
    label: "Almost Pro",
    icon: Target,
    color: "text-orange-500",
  },
  {
    threshold: 100,
    label: "Max Champion",
    icon: Trophy,
    color: "text-yellow-500",
  },
];

export default function OnboardingChecklist({
  variant = "floating",
  showOnComplete = false,
  className,
}: OnboardingChecklistProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [celebratingStep, setCelebratingStep] = useState<string | null>(null);
  const [justUnlockedReward, setJustUnlockedReward] = useState<
    (typeof REWARDS)[0] | null
  >(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: progress, isLoading } = useQuery<OnboardingProgressData>({
    queryKey: ["/api/onboarding/progress"],
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const response = await apiRequest(
        "POST",
        "/api/onboarding/complete-step",
        { stepId },
      );
      return response.json();
    },
    onSuccess: (data, stepId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/progress"] });

      setCelebratingStep(stepId);
      setTimeout(() => setCelebratingStep(null), 2000);

      if (data.pointsAwarded > 0) {
        toast({
          title: `+${data.pointsAwarded} XP! 🎉`,
          description: data.message,
        });
      }

      const prevPercentage = progress?.completionPercentage || 0;
      const newReward = REWARDS.find(
        (r) =>
          prevPercentage < r.threshold &&
          (data.completionPercentage || 0) >= r.threshold,
      );
      if (newReward) {
        setJustUnlockedReward(newReward);
        setTimeout(() => setJustUnlockedReward(null), 3000);
      }
    },
    onError: (error) => {
      logger.error("Failed to complete step:", error);
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/onboarding/skip");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/progress"] });
      toast({
        title: "Onboarding Skipped",
        description: "You can always complete tasks later from your dashboard.",
      });
    },
  });

  useEffect(() => {
    const savedDismissed = localStorage.getItem("onboardingDismissed");
    const savedMinimized = localStorage.getItem("onboardingMinimized");
    if (savedDismissed === "true") setIsDismissed(true);
    if (savedMinimized === "true") setIsMinimized(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem("onboardingDismissed", "true");
  }, []);

  const handleRestore = useCallback(() => {
    setIsDismissed(false);
    setIsMinimized(false);
    localStorage.removeItem("onboardingDismissed");
    localStorage.removeItem("onboardingMinimized");
  }, []);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    localStorage.setItem("onboardingMinimized", "true");
  }, []);

  const handleMaximize = useCallback(() => {
    setIsMinimized(false);
    localStorage.removeItem("onboardingMinimized");
  }, []);

  const getIcon = (iconName: string | null) => {
    if (!iconName) return Circle;
    return ICON_MAP[iconName] || Circle;
  };

  const completedCount = progress?.tasks.filter((t) => t.completed).length || 0;
  const totalCount = progress?.tasks.length || 0;
  const progressPercentage = progress?.completionPercentage || 0;
  REWARDS.find((r) => progressPercentage < r.threshold) ||
    REWARDS[REWARDS.length - 1];
  REWARDS.filter(
    (r) => progressPercentage >= r.threshold,
  );

  if (isLoading) {
    return null;
  }

  if (!progress || (progress.completedAt && !showOnComplete)) {
    return null;
  }

  if (isDismissed) {
    return (
      <div
        className={cn(
          "fixed bottom-20 lg:bottom-4 right-4 z-[42]",
          variant !== "floating" && "hidden",
        )}
      >
        <Button
          onClick={handleRestore}
          size="sm"
          variant="outline"
          className="shadow-lg bg-background"
          data-testid="button-restore-checklist"
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          Show Getting Started
        </Button>
      </div>
    );
  }

  if (isMinimized && variant === "floating") {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-20 lg:bottom-4 right-4 z-[42]"
      >
        <Button
          onClick={handleMaximize}
          className="rounded-full w-14 h-14 shadow-xl bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
        >
          <div className="relative">
            <Zap className="w-6 h-6 text-white" />
            {completedCount < totalCount && (
              <span className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {totalCount - completedCount}
              </span>
            )}
          </div>
        </Button>
      </motion.div>
    );
  }

  const cardContent = (
    <>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              {progress.dayStreak > 0 && (
                <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  <Flame className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Getting Started
                {progress.totalPoints > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    <Star className="w-3 h-3 mr-1" />
                    {progress.totalPoints} XP
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {completedCount} of {totalCount} steps completed
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-1">
            <Button
              onClick={() => setIsExpanded(!isExpanded)}
              size="icon"
              variant="ghost"
              className="h-7 w-7"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
            {variant === "floating" && (
              <Button
                onClick={handleMinimize}
                size="icon"
                variant="ghost"
                className="h-7 w-7"
              >
                <Minimize2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              onClick={handleDismiss}
              size="icon"
              variant="ghost"
              className="h-7 w-7"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          <Progress value={progressPercentage} className="h-2" />
          <div className="flex justify-between">
            {REWARDS.map((reward) => {
              const RewardIcon = reward.icon;
              const isUnlocked = progressPercentage >= reward.threshold;
              return (
                <Tooltip key={reward.label}>
                  <TooltipTrigger>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                        isUnlocked
                          ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isUnlocked ? (
                        <RewardIcon className="w-3 h-3" />
                      ) : (
                        <Lock className="w-3 h-3" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{reward.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {reward.threshold}% complete
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <CardContent className="pt-2 space-y-3">
              {progress.recommendedNextStep && (
                <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-3 border border-blue-200/50 dark:border-blue-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium">
                        Suggested Next
                      </span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      +{progress.recommendedNextStep.points} XP
                    </Badge>
                  </div>
                  <Link href={progress.recommendedNextStep.actionUrl || "#"}>
                    <Button size="sm" className="w-full mt-2">
                      {progress.recommendedNextStep.name}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {progress.tasks.map((task) => {
                  const TaskIcon = getIcon(task.icon);
                  const isCelebrating = celebratingStep === task.id;

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      animate={isCelebrating ? { scale: [1, 1.02, 1] } : {}}
                    >
                      <Link href={task.actionUrl || "#"}>
                        <div
                          className={cn(
                            "flex items-center space-x-3 p-3 rounded-lg transition-all cursor-pointer",
                            task.completed
                              ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                              : "bg-muted/50 hover:bg-muted border border-transparent",
                          )}
                          onClick={(e) => {
                            if (!task.completed) {
                              e.preventDefault();
                              completeStepMutation.mutate(task.id);
                            }
                          }}
                        >
                          <div className="flex-shrink-0">
                            <AnimatePresence mode="wait">
                              {task.completed ? (
                                <motion.div
                                  key="completed"
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0 }}
                                >
                                  <CheckCircle className="w-5 h-5 text-green-600" />
                                </motion.div>
                              ) : (
                                <motion.div key="pending">
                                  <Circle className="w-5 h-5 text-muted-foreground" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <TaskIcon
                            className={cn(
                              "w-5 h-5 flex-shrink-0",
                              task.completed
                                ? "text-green-600"
                                : "text-muted-foreground",
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "font-medium text-sm truncate",
                                task.completed &&
                                  "line-through text-muted-foreground",
                              )}
                            >
                              {task.name}
                            </p>
                            {task.description && (
                              <p className="text-xs text-muted-foreground truncate">
                                {task.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {task.isRequired && !task.completed && (
                              <Badge variant="outline" className="text-xs">
                                Required
                              </Badge>
                            )}
                            {!task.completed && task.points > 0 && (
                              <span className="text-xs text-muted-foreground">
                                +{task.points}
                              </span>
                            )}
                            {!task.completed && (
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>

              {completedCount === totalCount && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 rounded-lg p-4 border border-yellow-200/50"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-bold flex items-center gap-2">
                        Congratulations! <PartyPopper className="w-4 h-4" />
                      </p>
                      <p className="text-sm text-muted-foreground">
                        You've completed all onboarding steps!
                      </p>
                      <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
                        Total: {progress.totalPoints} XP earned
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {completedCount < totalCount && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => skipMutation.mutate()}
                  disabled={skipMutation.isPending}
                >
                  Skip for now
                </Button>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {justUnlockedReward && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl z-10"
          >
            <div className="text-center text-white p-6">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5 }}
              >
                <justUnlockedReward.icon
                  className={cn(
                    "w-12 h-12 mx-auto mb-2",
                    justUnlockedReward.color,
                  )}
                />
              </motion.div>
              <p className="font-bold text-lg">Reward Unlocked!</p>
              <p className="text-white/80">{justUnlockedReward.label}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  if (variant === "floating") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className={cn("fixed bottom-20 lg:bottom-4 right-4 z-[42]", className)}
      >
        <Card className="w-full max-w-md shadow-xl border-2 border-primary/20 relative overflow-hidden">
          {cardContent}
        </Card>
      </motion.div>
    );
  }

  return (
    <Card className={cn("w-full relative overflow-hidden", className)}>
      {cardContent}
    </Card>
  );
}
