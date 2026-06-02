import {
  useState,
  useCallback,
  useEffect,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  ArrowRight,
  ExternalLink,
  X,
  Sparkles,
  Trophy,
  Rocket,
  PartyPopper,
} from "lucide-react";

export type FeedbackType = "success" | "error" | "warning" | "info" | "loading";

export interface NextStepSuggestion {
  label: string;
  action: () => void;
  description?: string;
  icon?: ReactNode;
  primary?: boolean;
}

export interface FeedbackOptions {
  title: string;
  description?: string;
  type: FeedbackType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  nextSteps?: NextStepSuggestion[];
  showConfetti?: boolean;
  persistent?: boolean;
  dismissible?: boolean;
}

interface GlobalFeedbackContextValue {
  showFeedback: (options: FeedbackOptions) => string;
  hideFeedback: (id: string) => void;
  showSuccess: (
    title: string,
    description?: string,
    nextSteps?: NextStepSuggestion[],
  ) => string;
  showError: (
    title: string,
    description?: string,
    action?: FeedbackOptions["action"],
  ) => string;
  showWarning: (title: string, description?: string) => string;
  showInfo: (title: string, description?: string) => string;
  showLoading: (title: string, description?: string) => string;
  updateFeedback: (id: string, options: Partial<FeedbackOptions>) => void;
  showProgress: (
    title: string,
    progress: number,
    description?: string,
  ) => string;
  showCelebration: (
    title: string,
    description?: string,
    achievement?: string,
  ) => void;
}

const GlobalFeedbackContext = createContext<GlobalFeedbackContextValue | null>(
  null,
);

export function useGlobalFeedback() {
  const context = useContext(GlobalFeedbackContext);
  if (!context) {
    throw new Error(
      "useGlobalFeedback must be used within a GlobalFeedbackProvider",
    );
  }
  return context;
}

const feedbackIcons: Record<FeedbackType, ReactNode> = {
  success: <CheckCircle className="h-5 w-5 text-green-500" />,
  error: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
  loading: <Loader2 className="h-5 w-5 text-primary animate-spin" />,
};

const feedbackVariants: Record<FeedbackType, string> = {
  success: "success",
  error: "destructive",
  warning: "warning",
  info: "info",
  loading: "loading",
} as const;

interface FeedbackItem extends FeedbackOptions {
  id: string;
}

export function GlobalFeedbackProvider({ children }: { children: ReactNode }) {
  const [activeFeedback, setActiveFeedback] = useState<FeedbackItem[]>([]);
  const [showCelebrationModal, setShowCelebrationModal] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    title: string;
    description?: string;
    achievement?: string;
  } | null>(null);

  const generateId = () =>
    `feedback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const showFeedback = useCallback((options: FeedbackOptions): string => {
    const id = generateId();
    const {
      type,
      title,
      description,
      duration = 5000,
      action,
      nextSteps,
      showConfetti,
      persistent,
      dismissible = true,
    } = options;

    if (nextSteps && nextSteps.length > 0) {
      setActiveFeedback((prev) => [...prev, { ...options, id }]);
    } else {
      const toastResult = toast({
        title: (
          <div className="flex items-center gap-2">
            {feedbackIcons[type]}
            <span>{title}</span>
          </div>
        ) as unknown as string,
        description,
        variant: feedbackVariants[type] as "default" | "destructive",
        duration: persistent ? Infinity : duration,
      });

      if (action) {
        setTimeout(() => {
          toast({
            title: (
              <div className="flex items-center gap-2">
                {feedbackIcons[type]}
                <span>{title}</span>
              </div>
            ) as unknown as string,
            description: (
              <div className="space-y-2">
                <p>{description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    action.onClick();
                    toastResult.dismiss();
                  }}
                >
                  {action.label}
                </Button>
              </div>
            ) as unknown as string,
            variant: feedbackVariants[type] as "default" | "destructive",
            duration: persistent ? Infinity : duration,
          });
        }, 0);
      }
    }

    if (showConfetti && type === "success") {
      triggerConfetti();
    }

    return id;
  }, []);

  const hideFeedback = useCallback((id: string) => {
    setActiveFeedback((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const updateFeedback = useCallback(
    (id: string, options: Partial<FeedbackOptions>) => {
      setActiveFeedback((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...options } : f)),
      );
    },
    [],
  );

  const showSuccess = useCallback(
    (
      title: string,
      description?: string,
      nextSteps?: NextStepSuggestion[],
    ): string => {
      return showFeedback({
        type: "success",
        title,
        description,
        nextSteps,
        duration: nextSteps ? 10000 : 5000,
      });
    },
    [showFeedback],
  );

  const showError = useCallback(
    (
      title: string,
      description?: string,
      action?: FeedbackOptions["action"],
    ): string => {
      return showFeedback({
        type: "error",
        title,
        description,
        action,
        duration: 8000,
      });
    },
    [showFeedback],
  );

  const showWarning = useCallback(
    (title: string, description?: string): string => {
      return showFeedback({ type: "warning", title, description });
    },
    [showFeedback],
  );

  const showInfo = useCallback(
    (title: string, description?: string): string => {
      return showFeedback({ type: "info", title, description });
    },
    [showFeedback],
  );

  const showLoading = useCallback(
    (title: string, description?: string): string => {
      return showFeedback({
        type: "loading",
        title,
        description,
        persistent: true,
        dismissible: false,
      });
    },
    [showFeedback],
  );

  const showProgress = useCallback(
    (title: string, progress: number, description?: string): string => {
      const id = generateId();
      toast({
        title: (
          <div className="space-y-2 w-full">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{title}</span>
            </div>
            <Progress value={progress} className="h-2" />
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        ) as unknown as string,
        duration: Infinity,
      });
      return id;
    },
    [],
  );

  const showCelebration = useCallback(
    (title: string, description?: string, achievement?: string) => {
      setCelebrationData({ title, description, achievement });
      setShowCelebrationModal(true);
      triggerConfetti();
    },
    [],
  );

  const triggerConfetti = () => {
    const colors = [
      "#ff0000",
      "#00ff00",
      "#0000ff",
      "#ffff00",
      "#ff00ff",
      "#00ffff",
    ];
    const confettiCount = 150;

    for (let i = 0; i < confettiCount; i++) {
      createConfettiPiece(
        colors[Math.floor(Math.random() * colors.length)],
        i * 10,
      );
    }
  };

  const createConfettiPiece = (color: string, delay: number) => {
    const piece = document.createElement("div");
    piece.style.cssText = `
      position: fixed;
      width: 10px;
      height: 10px;
      background-color: ${color};
      left: ${Math.random() * 100}vw;
      top: -10px;
      z-index: 10001;
      pointer-events: none;
      animation: confetti-fall 3s ease-out forwards;
      animation-delay: ${delay}ms;
      transform: rotate(${Math.random() * 360}deg);
    `;

    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3000 + delay);
  };

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes confetti-fall {
        0% {
          transform: translateY(0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translateY(100vh) rotate(720deg);
          opacity: 0;
        }
      }
      @keyframes success-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes celebration-bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const value: GlobalFeedbackContextValue = {
    showFeedback,
    hideFeedback,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    updateFeedback,
    showProgress,
    showCelebration,
  };

  return (
    <GlobalFeedbackContext.Provider value={value}>
      {children}

      {activeFeedback.map((feedback) => (
        <NextStepsFeedback
          key={feedback.id}
          feedback={feedback}
          onDismiss={() => hideFeedback(feedback.id)}
        />
      ))}

      {showCelebrationModal && celebrationData && (
        <CelebrationModal
          title={celebrationData.title}
          description={celebrationData.description}
          achievement={celebrationData.achievement}
          onClose={() => setShowCelebrationModal(false)}
        />
      )}
    </GlobalFeedbackContext.Provider>
  );
}

interface NextStepsFeedbackProps {
  feedback: FeedbackItem;
  onDismiss: () => void;
}

function NextStepsFeedback({ feedback, onDismiss }: NextStepsFeedbackProps) {
  const { title, description, type, nextSteps, dismissible = true } = feedback;

  return (
    <div className="fixed bottom-20 lg:bottom-4 right-4 z-[10000] animate-in slide-in-from-bottom-5 duration-300">
      <Card
        className={cn(
          "w-80 shadow-lg border-l-4",
          type === "success" && "border-l-green-500",
          type === "error" && "border-l-red-500",
          type === "warning" && "border-l-yellow-500",
          type === "info" && "border-l-blue-500",
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {feedbackIcons[type]}
              <CardTitle className="text-sm">{title}</CardTitle>
            </div>
            {dismissible && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {description && (
            <CardDescription className="text-xs">{description}</CardDescription>
          )}
        </CardHeader>

        {nextSteps && nextSteps.length > 0 && (
          <CardContent className="pt-0 pb-2">
            <p className="text-xs text-muted-foreground mb-2">
              Suggested next steps:
            </p>
            <div className="space-y-2">
              {nextSteps.map((step, index) => (
                <Button
                  key={index}
                  variant={step.primary ? "default" : "outline"}
                  size="sm"
                  className="w-full justify-between text-xs"
                  onClick={() => {
                    step.action();
                    onDismiss();
                  }}
                >
                  <span className="flex items-center gap-2">
                    {step.icon}
                    {step.label}
                  </span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              ))}
            </div>
          </CardContent>
        )}

        <CardFooter className="pt-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

interface CelebrationModalProps {
  title: string;
  description?: string;
  achievement?: string;
  onClose: () => void;
}

function CelebrationModal({
  title,
  description,
  achievement,
  onClose,
}: CelebrationModalProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <Card
        className="w-96 text-center shadow-2xl animate-in zoom-in-95 duration-300"
        style={{ animation: "celebration-bounce 0.5s ease-in-out" }}
      >
        <CardContent className="pt-8 pb-6">
          <div className="mb-4 flex justify-center">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center animate-pulse">
                {achievement ? (
                  <Trophy className="h-10 w-10 text-white" />
                ) : (
                  <PartyPopper className="h-10 w-10 text-white" />
                )}
              </div>
              <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 animate-bounce" />
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-2">{title}</h2>
          {description && (
            <p className="text-muted-foreground mb-4">{description}</p>
          )}

          {achievement && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full text-sm font-medium">
              <Trophy className="h-4 w-4" />
              {achievement}
            </div>
          )}

          <Button className="mt-6 w-full" onClick={onClose}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function SuccessAnimation({
  children,
  show,
}: {
  children: ReactNode;
  show: boolean;
}) {
  if (!show) return <>{children}</>;

  return (
    <div
      className="relative inline-block"
      style={{ animation: "success-pulse 0.3s ease-in-out" }}
    >
      <div className="absolute inset-0 bg-green-500/20 rounded-lg animate-ping" />
      {children}
    </div>
  );
}

export function ActionFeedback({
  isLoading,
  isSuccess,
  isError,
  loadingText = "Processing...",
  successText = "Done!",
  errorText = "Failed",
  children,
}: {
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  children: ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{loadingText}</span>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex items-center gap-2 text-green-600 animate-in fade-in duration-200">
        <CheckCircle className="h-4 w-4" />
        <span>{successText}</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-red-600 animate-in fade-in duration-200">
        <XCircle className="h-4 w-4" />
        <span>{errorText}</span>
      </div>
    );
  }

  return <>{children}</>;
}

export function InlineSuccessMessage({
  message,
  show,
  onHide,
}: {
  message: string;
  show: boolean;
  onHide?: () => void;
}) {
  useEffect(() => {
    if (show && onHide) {
      const timer = setTimeout(onHide, 3000);
      return () => clearTimeout(timer);
    }
  }, [show, onHide]);

  if (!show) return null;

  return (
    <div className="flex items-center gap-2 text-green-600 text-sm animate-in slide-in-from-left duration-200">
      <CheckCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  );
}
