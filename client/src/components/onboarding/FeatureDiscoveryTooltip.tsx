import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { X, ArrowRight, ArrowLeft, Lightbulb, HelpCircle, Check, SkipForward, RotateCcw } from "lucide-react";

export interface TooltipStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  highlight?: boolean;
  actionLabel?: string;
  actionUrl?: string;
}

export interface TutorialConfig {
  id: string;
  name: string;
  steps: TooltipStep[];
  module: string;
}

interface FeatureDiscoveryTooltipProps {
  tutorial: TutorialConfig;
  isActive: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onShowAgain?: () => void;
  initialStep?: number;
}


export default function FeatureDiscoveryTooltip({
  tutorial,
  isActive,
  onComplete,
  onSkip,
  onShowAgain,
  initialStep = 0,
}: FeatureDiscoveryTooltipProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const currentStep = tutorial.steps[currentStepIndex];
  const progress = ((currentStepIndex + 1) / tutorial.steps.length) * 100;
  const isLastStep = currentStepIndex === tutorial.steps.length - 1;

  const trackProgressMutation = useMutation({
    mutationFn: async (data: {
      tutorialId: string;
      stepId: string;
      completed: boolean;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/onboarding/track-tutorial",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/onboarding/tutorials"],
      });
    },
  });

  const calculatePosition = useCallback(() => {
    if (!currentStep?.targetSelector) return;

    const target = document.querySelector(currentStep.targetSelector);
    if (!target) {
      logger.warn(`Target element not found: ${currentStep.targetSelector}`);
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const padding = 16;
    const position = currentStep.position || "bottom";

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = targetRect.top - tooltipHeight - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "bottom":
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.left - tooltipWidth - padding;
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
        left = targetRect.right + padding;
        break;
    }

    left = Math.max(
      padding,
      Math.min(left, window.innerWidth - tooltipWidth - padding),
    );
    top = Math.max(
      padding,
      Math.min(top, window.innerHeight - tooltipHeight - padding),
    );

    setTooltipPosition({ top, left });

    if (currentStep.highlight) {
      target.classList.add("ring-2", "ring-blue-500", "ring-offset-2", "z-50");
    }

    return () => {
      target.classList.remove(
        "ring-2",
        "ring-blue-500",
        "ring-offset-2",
        "z-50",
      );
    };
  }, [currentStep]);

  useEffect(() => {
    if (isActive && currentStep) {
      const cleanup = calculatePosition();
      const handleResize = () => calculatePosition();
      window.addEventListener("resize", handleResize);
      window.addEventListener("scroll", handleResize, true);

      return () => {
        cleanup?.();
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleResize, true);
      };
    }
  }, [isActive, currentStep, calculatePosition]);

  const handleNext = () => {
    trackProgressMutation.mutate({
      tutorialId: tutorial.id,
      stepId: currentStep.id,
      completed: true,
    });

    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    if (!showSkipConfirm) {
      setShowSkipConfirm(true);
      return;
    }
    onSkip();
  };

  if (!isActive || !currentStep) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={() => setShowSkipConfirm(true)}
      />

      <AnimatePresence mode="wait">
        <motion.div
          ref={tooltipRef}
          key={currentStep.id}
          className="fixed z-50 w-80"
          style={{ top: tooltipPosition.top, left: tooltipPosition.left }}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-border overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <Lightbulb className="w-4 h-4" />
                  <span className="text-sm font-medium">{tutorial.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-white/20 text-white text-xs"
                  >
                    {currentStepIndex + 1} / {tutorial.steps.length}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-white/80 hover:text-white hover:bg-white/20"
                    onClick={() => setShowSkipConfirm(true)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{currentStep.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentStep.description}
                </p>
              </div>

              {showSkipConfirm ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3"
                >
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    Skip this tutorial?
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    You can restart it anytime from the help menu.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSkipConfirm(false)}
                    >
                      Continue
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleSkip}
                    >
                      <SkipForward className="w-3 h-3 mr-1" />
                      Skip Tutorial
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBack}
                    disabled={currentStepIndex === 0}
                    className="text-muted-foreground"
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" />
                    Back
                  </Button>

                  <Button size="sm" onClick={handleNext}>
                    {isLastStep ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Done
                      </>
                    ) : (
                      <>
                        Next
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            {onShowAgain && !showSkipConfirm && (
              <div className="px-4 pb-3 pt-0">
                <button
                  onClick={onShowAgain}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Show me again later
                </button>
              </div>
            )}
          </div>

          <div
            className={cn(
              "absolute w-3 h-3 bg-white dark:bg-gray-900 rotate-45",
              currentStep.position === "top" &&
                "bottom-[-6px] left-1/2 -translate-x-1/2 border-b border-r border-border",
              currentStep.position === "bottom" &&
                "top-[-6px] left-1/2 -translate-x-1/2 border-t border-l border-border",
              currentStep.position === "left" &&
                "right-[-6px] top-1/2 -translate-y-1/2 border-t border-r border-border",
              currentStep.position === "right" &&
                "left-[-6px] top-1/2 -translate-y-1/2 border-b border-l border-border",
              !currentStep.position &&
                "top-[-6px] left-1/2 -translate-x-1/2 border-t border-l border-border",
            )}
          />
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export function ContextSensitiveHelp({
  featureId,
  children,
  className,
}: {
  featureId: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [showHelp, setShowHelp] = useState(false);

  const { data: helpContent } = useQuery<{ title: string; content: string }>({
    queryKey: ["/api/help/context", featureId],
    enabled: showHelp,
    staleTime: 60000,
  });

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        onClick={() => setShowHelp(!showHelp)}
        className="p-1 rounded-full hover:bg-muted transition-colors"
        aria-label="Help"
      >
        {children || <HelpCircle className="w-4 h-4 text-muted-foreground" />}
      </button>

      <AnimatePresence>
        {showHelp && helpContent && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 top-full mt-2 left-0 w-64 p-3 bg-popover border rounded-lg shadow-lg"
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-medium text-sm">{helpContent.title}</h4>
              <button onClick={() => setShowHelp(false)}>
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {helpContent.content}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const TUTORIAL_CONFIGS: Record<string, TutorialConfig> = {
  studio: {
    id: "studio-tour",
    name: "Studio Tour",
    module: "studio",
    steps: [
      {
        id: "studio-1",
        targetSelector: '[data-tour="studio-toolbar"]',
        title: "Studio Toolbar",
        description:
          "Access all your production tools here - from recording to mixing to mastering.",
        position: "bottom",
        highlight: true,
      },
      {
        id: "studio-2",
        targetSelector: '[data-tour="studio-timeline"]',
        title: "Timeline & Tracks",
        description:
          "Arrange your audio clips, MIDI, and automation on the timeline.",
        position: "top",
        highlight: true,
      },
      {
        id: "studio-3",
        targetSelector: '[data-tour="ai-generator"]',
        title: "AI Music Generator",
        description:
          "Generate beats, melodies, or full tracks using AI. Just describe what you want!",
        position: "left",
        highlight: true,
      },
    ],
  },
  distribution: {
    id: "distribution-tour",
    name: "Distribution Guide",
    module: "distribution",
    steps: [
      {
        id: "dist-1",
        targetSelector: '[data-tour="release-wizard"]',
        title: "Create a Release",
        description:
          "Start here to distribute your music to 150+ streaming platforms.",
        position: "bottom",
        highlight: true,
      },
      {
        id: "dist-2",
        targetSelector: '[data-tour="platform-selector"]',
        title: "Choose Platforms",
        description:
          "Select which streaming services and stores to release on.",
        position: "right",
        highlight: true,
      },
    ],
  },
  socialMedia: {
    id: "social-tour",
    name: "Social Media Setup",
    module: "social-media",
    steps: [
      {
        id: "social-1",
        targetSelector: '[data-tour="connect-accounts"]',
        title: "Connect Accounts",
        description:
          "Link your social media accounts to enable posting and analytics.",
        position: "bottom",
        highlight: true,
      },
      {
        id: "social-2",
        targetSelector: '[data-tour="autopilot"]',
        title: "Social Autopilot",
        description:
          "Let AI create and schedule viral content for you automatically.",
        position: "left",
        highlight: true,
      },
    ],
  },
};
