import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  CheckCircle,
  Circle,
  Zap,
  Trophy,
  Star,
  ArrowRight,
  Flame,
  Target,
  Lock,
  Sparkles,
} from "lucide-react";

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

interface OnboardingProgressProps {
  variant?: "compact" | "detailed" | "minimal";
  showRecommendation?: boolean;
  showStreak?: boolean;
  className?: string;
}

const MILESTONES = [
  {
    percentage: 25,
    label: "Getting Started",
    icon: Star,
    color: "text-blue-500",
  },
  {
    percentage: 50,
    label: "Halfway There",
    icon: Zap,
    color: "text-purple-500",
  },
  {
    percentage: 75,
    label: "Almost Done",
    icon: Target,
    color: "text-orange-500",
  },
  {
    percentage: 100,
    label: "Completed!",
    icon: Trophy,
    color: "text-yellow-500",
  },
];

export default function OnboardingProgress({
  variant = "compact",
  showRecommendation = true,
  showStreak = true,
  className,
}: OnboardingProgressProps) {
  const { data: progress, isLoading } = useQuery<OnboardingProgressData>({
    queryKey: ["/api/onboarding/progress"],
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const currentMilestone = useMemo(() => {
    if (!progress) return null;
    const percentage = progress.completionPercentage;
    return (
      MILESTONES.find((m) => percentage <= m.percentage) ||
      MILESTONES[MILESTONES.length - 1]
    );
  }, [progress]);

  const nextMilestone = useMemo(() => {
    if (!progress) return null;
    const percentage = progress.completionPercentage;
    return MILESTONES.find((m) => percentage < m.percentage);
  }, [progress]);

  if (isLoading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-2 bg-muted rounded-full" />
      </div>
    );
  }

  if (!progress || progress.completedAt) {
    return null;
  }

  if (variant === "minimal") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Progress
          value={progress.completionPercentage}
          className="h-2 flex-1"
        />
        <span className="text-sm font-medium text-muted-foreground">
          {progress.completionPercentage}%
        </span>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex items-center gap-4 p-3 bg-muted/50 rounded-lg",
          className,
        )}
      >
        <div className="relative">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {progress.completionPercentage}%
            </span>
          </div>
          {showStreak && progress.dayStreak > 0 && (
            <div className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              <Flame className="w-3 h-3" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium">Onboarding Progress</span>
            <Badge variant="secondary" className="text-xs">
              {progress.currentStep} / {progress.totalSteps}
            </Badge>
          </div>
          <Progress value={progress.completionPercentage} className="h-2" />
        </div>

        {showRecommendation && progress.recommendedNextStep && (
          <Link href={progress.recommendedNextStep.actionUrl || "#"}>
            <Button size="sm" variant="outline" className="shrink-0">
              <ArrowRight className="w-4 h-4 mr-1" />
              Next Step
            </Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white pb-12">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Onboarding Progress
          </CardTitle>
          {showStreak && progress.dayStreak > 0 && (
            <Badge className="bg-orange-500 text-white">
              <Flame className="w-3 h-3 mr-1" />
              {progress.dayStreak} day streak
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="-mt-8 space-y-6">
        <div className="bg-card rounded-xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <motion.div
                className="relative w-16 h-16"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
              >
                <svg className="w-16 h-16 -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="url(#progressGradient)"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${progress.completionPercentage * 1.76} 176`}
                    className="transition-all duration-500"
                  />
                  <defs>
                    <linearGradient
                      id="progressGradient"
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">
                    {progress.completionPercentage}%
                  </span>
                </div>
              </motion.div>

              <div>
                <p className="font-semibold">
                  {progress.currentStep} of {progress.totalSteps} steps
                  completed
                </p>
                <p className="text-sm text-muted-foreground">
                  {nextMilestone
                    ? `${nextMilestone.percentage - progress.completionPercentage}% to ${nextMilestone.label}`
                    : "All milestones reached!"}
                </p>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-1 text-yellow-500">
                <Star className="w-4 h-4 fill-current" />
                <span className="font-bold">{progress.totalPoints}</span>
              </div>
              <p className="text-xs text-muted-foreground">XP earned</p>
            </div>
          </div>

          <div className="flex justify-between mb-2">
            {MILESTONES.map((milestone, index) => {
              const MilestoneIcon = milestone.icon;
              const isCompleted =
                progress.completionPercentage >= milestone.percentage;
              const isCurrent =
                progress.completionPercentage >=
                  (MILESTONES[index - 1]?.percentage || 0) &&
                progress.completionPercentage < milestone.percentage;

              return (
                <Tooltip key={milestone.label}>
                  <TooltipTrigger>
                    <div
                      className={cn(
                        "flex flex-col items-center gap-1 transition-all",
                        isCompleted ? "opacity-100" : "opacity-50",
                      )}
                    >
                      <div
                        className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                          isCompleted
                            ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white"
                            : "bg-muted",
                          isCurrent && "ring-2 ring-blue-500 ring-offset-2",
                        )}
                      >
                        {isCompleted ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <MilestoneIcon
                            className={cn("w-4 h-4", milestone.color)}
                          />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {milestone.percentage}%
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{milestone.label}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <Progress value={progress.completionPercentage} className="h-2" />
        </div>

        {showRecommendation && progress.recommendedNextStep && (
          <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium">Recommended Next</p>
                  <p className="text-sm text-muted-foreground">
                    {progress.recommendedNextStep.name}
                  </p>
                </div>
              </div>
              <Link href={progress.recommendedNextStep.actionUrl || "#"}>
                <Button size="sm">
                  Start
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            {progress.recommendedNextStep.points > 0 && (
              <Badge className="mt-2" variant="secondary">
                <Star className="w-3 h-3 mr-1" />+
                {progress.recommendedNextStep.points} XP
              </Badge>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Tasks</p>
          <div className="space-y-1">
            {progress.tasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex items-center gap-2 p-2 rounded-lg transition-colors",
                  task.completed ? "bg-green-500/10" : "hover:bg-muted/50",
                )}
              >
                {task.completed ? (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <span
                  className={cn(
                    "text-sm flex-1",
                    task.completed && "text-muted-foreground line-through",
                  )}
                >
                  {task.name}
                </span>
                {task.isRequired && !task.completed && (
                  <Badge variant="outline" className="text-xs">
                    Required
                  </Badge>
                )}
                {!task.completed && task.points > 0 && (
                  <span className="text-xs text-muted-foreground">
                    +{task.points} XP
                  </span>
                )}
              </div>
            ))}
          </div>

          {progress.tasks.length > 5 && (
            <Link href="/onboarding">
              <Button variant="ghost" size="sm" className="w-full">
                View all {progress.tasks.length} tasks
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function OnboardingProgressRing({
  percentage,
  size = 48,
  strokeWidth = 4,
  className,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={cn("relative", className)}
      style={{ width: size, height: size }}
    >
      <svg className="w-full h-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3B82F6" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold">{percentage}%</span>
      </div>
    </div>
  );
}
