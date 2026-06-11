import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  User,
  Music,
  Camera,
  FileText,
  Share2,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Trophy,
  Star,
  AlertCircle,
  Clock,
  Mail,
  Shield,
  Zap,
} from "lucide-react";

export type ProfileSetupStep =
  | "verify_email"
  | "artist_type"
  | "genres"
  | "photo"
  | "bio"
  | "social_links";

export interface ProfileSetupStatus {
  step: ProfileSetupStep;
  label: string;
  description: string;
  completed: boolean;
  required: boolean;
  actionUrl: string;
  icon: typeof User;
  points: number;
}

export interface ProfileCompletionData {
  emailVerified: boolean;
  artistType: string | null;
  genres: string[];
  hasPhoto: boolean;
  bio: string | null;
  socialLinks: string[];
  completionPercentage: number;
  totalPoints: number;
}

interface ProfileSetupProgressProps {
  variant?: "compact" | "detailed" | "card" | "inline";
  showIncomplete?: boolean;
  onStepClick?: (step: ProfileSetupStep) => void;
  className?: string;
}

const PROFILE_STEPS: ProfileSetupStatus[] = [
  {
    step: "verify_email",
    label: "Verify Email",
    description: "Confirm your email address for account security",
    completed: false,
    required: true,
    actionUrl: "/settings/email",
    icon: Mail,
    points: 25,
  },
  {
    step: "artist_type",
    label: "Select Artist Type",
    description: "Tell us who you are: solo artist, band, producer, or label",
    completed: false,
    required: true,
    actionUrl: "/onboarding",
    icon: Music,
    points: 25,
  },
  {
    step: "genres",
    label: "Choose Genres",
    description: "Select your music genres to personalize recommendations",
    completed: false,
    required: true,
    actionUrl: "/settings/profile",
    icon: Sparkles,
    points: 20,
  },
  {
    step: "photo",
    label: "Add Profile Photo",
    description: "Upload a photo to help fans recognize you",
    completed: false,
    required: false,
    actionUrl: "/settings/profile",
    icon: Camera,
    points: 15,
  },
  {
    step: "bio",
    label: "Write Your Bio",
    description: "Tell your story and what makes your music unique",
    completed: false,
    required: false,
    actionUrl: "/settings/profile",
    icon: FileText,
    points: 20,
  },
  {
    step: "social_links",
    label: "Connect Social Media",
    description: "Link your social accounts for cross-platform promotion",
    completed: false,
    required: false,
    actionUrl: "/social-media",
    icon: Share2,
    points: 30,
  },
];

export function useProfileCompletion() {
  const { data, isLoading, refetch } = useQuery<ProfileCompletionData>({
    queryKey: ["/api/profile/completion"],
    staleTime: 60000,
  });

  const completionSteps = useMemo(() => {
    if (!data) return PROFILE_STEPS;

    return PROFILE_STEPS.map((step) => {
      let completed = false;
      switch (step.step) {
        case "verify_email":
          completed = data.emailVerified;
          break;
        case "artist_type":
          completed = !!data.artistType;
          break;
        case "genres":
          completed = data.genres.length > 0;
          break;
        case "photo":
          completed = data.hasPhoto;
          break;
        case "bio":
          completed = !!data.bio && data.bio.length > 20;
          break;
        case "social_links":
          completed = data.socialLinks.length > 0;
          break;
      }
      return { ...step, completed };
    });
  }, [data]);

  const completedCount = completionSteps.filter((s) => s.completed).length;
  const totalCount = completionSteps.length;
  const percentage = Math.round((completedCount / totalCount) * 100);
  const totalPoints = completionSteps
    .filter((s) => s.completed)
    .reduce((sum, s) => sum + s.points, 0);
  const nextStep = completionSteps.find((s) => !s.completed);

  return {
    steps: completionSteps,
    completedCount,
    totalCount,
    percentage,
    totalPoints,
    nextStep,
    isLoading,
    refetch,
  };
}

export default function ProfileSetupProgress({
  variant = "compact",
  showIncomplete = true,
  onStepClick,
  className,
}: ProfileSetupProgressProps) {
  const {
    steps,
    completedCount,
    totalCount,
    percentage,
    totalPoints,
    nextStep,
    isLoading,
  } = useProfileCompletion();

  if (isLoading) {
    return (
      <div className={cn("animate-pulse", className)}>
        <div className="h-20 bg-muted rounded-lg" />
      </div>
    );
  }

  if (percentage === 100 && !showIncomplete) {
    return null;
  }

  const incompleteSteps = steps.filter((s) => !s.completed);
  const requiredIncomplete = incompleteSteps.filter((s) => s.required);

  if (variant === "inline") {
    return (
      <div className={cn("flex items-center gap-4", className)}>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Profile Setup</span>
            <span className="text-sm text-muted-foreground">{percentage}%</span>
          </div>
          <Progress value={percentage} className="h-2" />
        </div>
        {nextStep && (
          <Link href={nextStep.actionUrl}>
            <Button size="sm" variant="outline">
              {nextStep.label}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className={cn("bg-muted/50 rounded-lg p-4", className)}>
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg className="w-14 h-14 -rotate-90">
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="currentColor"
                strokeWidth="6"
                fill="none"
                className="text-muted"
              />
              <circle
                cx="28"
                cy="28"
                r="24"
                stroke="url(#profileGradient)"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${percentage * 1.51} 151`}
              />
              <defs>
                <linearGradient
                  id="profileGradient"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold">{percentage}%</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-medium">Complete Your Profile</p>
            <p className="text-sm text-muted-foreground">
              {completedCount} of {totalCount} steps done
            </p>
            {requiredIncomplete.length > 0 && (
              <Badge variant="outline" className="mt-1 text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                {requiredIncomplete.length} required
              </Badge>
            )}
          </div>

          {nextStep && (
            <Link href={nextStep.actionUrl}>
              <Button size="sm">
                Continue
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Card className={cn("overflow-hidden", className)}>
        <CardHeader className="bg-gradient-to-r from-green-500 to-blue-500 text-white pb-8">
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Setup
          </CardTitle>
        </CardHeader>

        <CardContent className="-mt-4 space-y-4">
          <div className="bg-card rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-lg">{percentage}% Complete</p>
                <p className="text-sm text-muted-foreground">
                  {completedCount} of {totalCount} steps
                </p>
              </div>
              <Badge className="bg-gradient-to-r from-green-500 to-blue-500 text-white">
                <Star className="w-3 h-3 mr-1" />
                {totalPoints} XP
              </Badge>
            </div>
            <Progress value={percentage} className="h-3" />
          </div>

          <div className="space-y-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.step}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <button
                    onClick={() => onStepClick?.(step.step)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg transition-all text-left",
                      step.completed
                        ? "bg-green-50 dark:bg-green-950/20"
                        : "hover:bg-muted/50",
                      !step.completed && "cursor-pointer",
                    )}
                  >
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                        step.completed ? "bg-green-500 text-white" : "bg-muted",
                      )}
                    >
                      {step.completed ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-medium",
                            step.completed &&
                              "text-green-700 dark:text-green-400",
                          )}
                        >
                          {step.label}
                        </span>
                        {step.required && !step.completed && (
                          <Badge variant="outline" className="text-xs">
                            Required
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {step.description}
                      </p>
                    </div>

                    {!step.completed && (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          +{step.points} XP
                        </span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </button>
                </motion.div>
              );
            })}
          </div>

          {percentage < 100 && nextStep && (
            <Link href={nextStep.actionUrl}>
              <Button className="w-full">
                Continue: {nextStep.label}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          )}

          {percentage === 100 && (
            <div className="text-center py-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 rounded-lg">
              <Trophy className="w-8 h-8 mx-auto text-yellow-500 mb-2" />
              <p className="font-semibold text-green-700 dark:text-green-400">
                Profile Complete! 🎉
              </p>
              <p className="text-sm text-muted-foreground">
                You've earned {totalPoints} XP
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Profile Setup</h3>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} steps complete
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{percentage}%</p>
          <Badge variant="secondary">
            <Star className="w-3 h-3 mr-1" />
            {totalPoints} XP
          </Badge>
        </div>
      </div>

      <Progress value={percentage} className="h-3" />

      <div className="flex justify-between">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <Tooltip key={step.step}>
              <TooltipTrigger>
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    step.completed
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.completed ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{step.label}</p>
                <p className="text-xs text-muted-foreground">
                  {step.completed ? "Completed" : `+${step.points} XP`}
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {nextStep && (
        <Link href={nextStep.actionUrl}>
          <Button className="w-full" variant="outline">
            <nextStep.icon className="w-4 h-4 mr-2" />
            Next: {nextStep.label}
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
        </Link>
      )}
    </div>
  );
}

export function EmailVerificationStatus({
  status,
  email,
  onResend,
  className,
}: {
  status: "pending" | "success" | "failed" | "expired";
  email: string;
  onResend?: () => void;
  className?: string;
}) {
  const configs = {
    pending: {
      icon: Clock,
      title: "Verification Pending",
      description: `We sent a verification link to ${email}`,
      color:
        "text-yellow-600 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200",
      iconColor: "text-yellow-600",
    },
    success: {
      icon: CheckCircle,
      title: "Email Verified!",
      description: "Your email has been successfully verified",
      color: "text-green-600 bg-green-50 dark:bg-green-950/20 border-green-200",
      iconColor: "text-green-600",
    },
    failed: {
      icon: AlertCircle,
      title: "Verification Failed",
      description: "The verification link is invalid or has expired",
      color: "text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200",
      iconColor: "text-red-600",
    },
    expired: {
      icon: Clock,
      title: "Link Expired",
      description: "Your verification link has expired. Request a new one.",
      color:
        "text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200",
      iconColor: "text-orange-600",
    },
  };

  const config = configs[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-lg border p-4", config.color, className)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", config.iconColor)} />
        <div className="flex-1">
          <p className="font-medium">{config.title}</p>
          <p className="text-sm opacity-80">{config.description}</p>
          {(status === "pending" ||
            status === "failed" ||
            status === "expired") &&
            onResend && (
              <Button
                variant="link"
                size="sm"
                onClick={onResend}
                className="p-0 h-auto mt-2"
              >
                Resend verification email
              </Button>
            )}
        </div>
      </div>
    </motion.div>
  );
}

export function RegistrationOutcome({
  type,
  message,
  details,
  onAction,
  actionLabel,
}: {
  type:
    | "success"
    | "email_exists"
    | "username_exists"
    | "password_weak"
    | "invitation_invalid"
    | "invitation_expired"
    | "referral_applied";
  message: string;
  details?: string;
  onAction?: () => void;
  actionLabel?: string;
}) {
  const configs = {
    success: {
      icon: CheckCircle,
      color:
        "bg-green-50 dark:bg-green-950/20 border-green-200 text-green-800 dark:text-green-200",
      iconColor: "text-green-600",
    },
    email_exists: {
      icon: Mail,
      color:
        "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-yellow-800 dark:text-yellow-200",
      iconColor: "text-yellow-600",
    },
    username_exists: {
      icon: User,
      color:
        "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 text-yellow-800 dark:text-yellow-200",
      iconColor: "text-yellow-600",
    },
    password_weak: {
      icon: Shield,
      color:
        "bg-red-50 dark:bg-red-950/20 border-red-200 text-red-800 dark:text-red-200",
      iconColor: "text-red-600",
    },
    invitation_invalid: {
      icon: AlertCircle,
      color:
        "bg-red-50 dark:bg-red-950/20 border-red-200 text-red-800 dark:text-red-200",
      iconColor: "text-red-600",
    },
    invitation_expired: {
      icon: Clock,
      color:
        "bg-orange-50 dark:bg-orange-950/20 border-orange-200 text-orange-800 dark:text-orange-200",
      iconColor: "text-orange-600",
    },
    referral_applied: {
      icon: Zap,
      color:
        "bg-purple-50 dark:bg-purple-950/20 border-purple-200 text-purple-800 dark:text-purple-200",
      iconColor: "text-purple-600",
    },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("rounded-lg border p-4", config.color)}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", config.iconColor)} />
        <div className="flex-1">
          <p className="font-medium">{message}</p>
          {details && <p className="text-sm opacity-80 mt-1">{details}</p>}
          {onAction && actionLabel && (
            <Button
              variant="link"
              size="sm"
              onClick={onAction}
              className="p-0 h-auto mt-2"
            >
              {actionLabel}
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
