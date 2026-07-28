import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Star,
  Zap,
  Music,
  Upload,
  Users,
  Share2,
  Target,
  Flame,
  Crown,
  Award,
  Medal,
  Sparkles,
  X,
  ChevronRight,
  Lock,
  CheckCircle,
} from "lucide-react";

export type AchievementCategory =
  | "onboarding"
  | "studio"
  | "distribution"
  | "social"
  | "marketplace"
  | "collaboration"
  | "streak";

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  icon: string;
  points: number;
  unlockedAt?: string | null;
  progress?: number;
  maxProgress?: number;
}

interface AchievementUnlockToastProps {
  achievement: Achievement;
  isVisible: boolean;
  onClose: () => void;
  onViewAll?: () => void;
}

const ICON_MAP: Record<string, typeof Trophy> = {
  Trophy,
  Star,
  Zap,
  Music,
  Upload,
  Users,
  Share2,
  Target,
  Flame,
  Crown,
  Award,
  Medal,
  Sparkles,
};

const RARITY_STYLES: Record<
  AchievementRarity,
  { bg: string; border: string; glow: string; text: string }
> = {
  common: {
    bg: "from-slate-500 to-gray-600",
    border: "border-slate-400",
    glow: "shadow-slate-500/30",
    text: "text-slate-100",
  },
  rare: {
    bg: "from-blue-500 to-indigo-600",
    border: "border-blue-400",
    glow: "shadow-blue-500/40",
    text: "text-blue-100",
  },
  epic: {
    bg: "from-purple-500 to-violet-600",
    border: "border-purple-400",
    glow: "shadow-purple-500/50",
    text: "text-purple-100",
  },
  legendary: {
    bg: "from-yellow-500 via-orange-500 to-red-500",
    border: "border-yellow-400",
    glow: "shadow-yellow-500/60",
    text: "text-yellow-100",
  },
};

export default function AchievementUnlockToast({
  achievement,
  isVisible,
  onClose,
  onViewAll,
}: AchievementUnlockToastProps) {
  const [showDetails, setShowDetails] = useState(false);
  useQueryClient();
  const IconComponent = ICON_MAP[achievement.icon] || Trophy;
  const rarityStyle = RARITY_STYLES[achievement.rarity];

  useEffect(() => {
    if (isVisible) {
      const detailsTimer = setTimeout(() => setShowDetails(true), 500);
      const autoCloseTimer = setTimeout(onClose, 6000);

      return () => {
        clearTimeout(detailsTimer);
        clearTimeout(autoCloseTimer);
      };
    } else {
      setShowDetails(false);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed top-4 right-4 z-[9999] max-w-sm w-full"
          initial={{ opacity: 0, x: 100, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.8 }}
          transition={{ type: "spring", damping: 15 }}
        >
          <div
            className={cn(
              "relative rounded-xl overflow-hidden shadow-2xl",
              rarityStyle.glow,
            )}
          >
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-95",
                rarityStyle.bg,
              )}
            />

            <div className="absolute inset-0 overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-white/40 rounded-full"
                  initial={{
                    x: Math.random() * 400,
                    y: -10,
                    opacity: 0,
                  }}
                  animate={{
                    y: 200,
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 2 + Math.random() * 2,
                    delay: Math.random() * 1,
                    repeat: Infinity,
                  }}
                />
              ))}
            </div>

            <div className="relative p-4">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 text-white/70 hover:text-white hover:bg-white/20"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>

              <div className="flex items-start gap-4">
                <motion.div
                  className={cn(
                    "relative w-16 h-16 rounded-xl flex items-center justify-center",
                    "bg-white/20 backdrop-blur-sm border-2",
                    rarityStyle.border,
                  )}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <IconComponent className="w-8 h-8 text-white" />
                  <motion.div
                    className="absolute -inset-1 rounded-xl border-2 border-white/30"
                    animate={{ scale: [1, 1.1, 1], opacity: [1, 0, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                </motion.div>

                <div className="flex-1 min-w-0">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "text-xs font-medium uppercase tracking-wider",
                          rarityStyle.text,
                        )}
                      >
                        Achievement Unlocked
                      </span>
                      <Badge className="bg-white/20 text-white text-xs">
                        {achievement.rarity}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-1">
                      {achievement.name}
                    </h3>

                    <AnimatePresence>
                      {showDetails && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                        >
                          <p className="text-sm text-white/80 mb-3">
                            {achievement.description}
                          </p>

                          <div className="flex items-center gap-3">
                            <Badge className="bg-yellow-500 text-yellow-900">
                              <Star className="w-3 h-3 mr-1" />+
                              {achievement.points} XP
                            </Badge>

                            {onViewAll && (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={onViewAll}
                                className="p-0 h-auto text-white/80 hover:text-white"
                              >
                                View All
                                <ChevronRight className="w-4 h-4 ml-1" />
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AchievementBadge({
  achievement,
  size = "md",
  showProgress = false,
  onClick,
  className,
}: {
  achievement: Achievement;
  size?: "sm" | "md" | "lg";
  showProgress?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const IconComponent = ICON_MAP[achievement.icon] || Trophy;
  const rarityStyle = RARITY_STYLES[achievement.rarity];
  const isUnlocked = !!achievement.unlockedAt;

  const sizes = {
    sm: { container: "w-10 h-10", icon: "w-4 h-4" },
    md: { container: "w-14 h-14", icon: "w-6 h-6" },
    lg: { container: "w-20 h-20", icon: "w-8 h-8" },
  };

  const sizeConfig = sizes[size];

  return (
    <div
      className={cn("relative group", onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      <div
        className={cn(
          "rounded-xl flex items-center justify-center transition-all",
          sizeConfig.container,
          isUnlocked
            ? cn(
                "bg-gradient-to-br",
                rarityStyle.bg,
                "shadow-lg",
                rarityStyle.glow,
              )
            : "bg-muted",
        )}
      >
        {isUnlocked ? (
          <IconComponent className={cn("text-white", sizeConfig.icon)} />
        ) : (
          <Lock className={cn("text-muted-foreground", sizeConfig.icon)} />
        )}
      </div>

      {showProgress &&
        achievement.progress !== undefined &&
        achievement.maxProgress &&
        !isUnlocked && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3/4">
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${(achievement.progress / achievement.maxProgress) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

      {isUnlocked && (
        <div className="absolute -top-1 -right-1">
          <CheckCircle className="w-4 h-4 text-green-500 bg-white rounded-full" />
        </div>
      )}
    </div>
  );
}

interface AchievementContextType {
  showAchievement: (achievement: Achievement) => void;
  achievements: Achievement[];
  isLoading: boolean;
}

const AchievementContext = createContext<AchievementContextType | null>(null);

export function AchievementProvider({ children }: { children: ReactNode }) {
  const [currentAchievement, setCurrentAchievement] =
    useState<Achievement | null>(null);
  const [queue, setQueue] = useState<Achievement[]>([]);
  useQueryClient();
  const [, navigate] = useLocation();

  const { data: achievements = [], isLoading } = useQuery<Achievement[]>({
    queryKey: ["/api/onboarding/achievements"],
    staleTime: 60000,
  });

  const showAchievement = useCallback(
    (achievement: Achievement) => {
      if (currentAchievement) {
        setQueue((prev) => [...prev, achievement]);
      } else {
        setCurrentAchievement(achievement);
      }
    },
    [currentAchievement],
  );

  const handleClose = useCallback(() => {
    setCurrentAchievement(null);
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      setQueue(rest);
      setTimeout(() => setCurrentAchievement(next), 300);
    }
  }, [queue]);

  const handleViewAll = useCallback(() => {
    handleClose();
    navigate("/achievements");
  }, [handleClose, navigate]);

  return (
    <AchievementContext.Provider
      value={{ showAchievement, achievements, isLoading }}
    >
      {children}
      {currentAchievement && (
        <AchievementUnlockToast
          achievement={currentAchievement}
          isVisible={!!currentAchievement}
          onClose={handleClose}
          onViewAll={handleViewAll}
        />
      )}
    </AchievementContext.Provider>
  );
}

export function useAchievements() {
  const context = useContext(AchievementContext);
  if (!context) {
    throw new Error("useAchievements must be used within AchievementProvider");
  }
  return context;
}

export function FeatureUnlockNotification({
  feature,
  isVisible,
  onClose,
  onExplore,
}: {
  feature: { name: string; description: string; icon: string; tier?: string };
  isVisible: boolean;
  onClose: () => void;
  onExplore?: () => void;
}) {
  const IconComponent = ICON_MAP[feature.icon] || Zap;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-4 right-4 z-[9999] max-w-sm w-full"
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: "spring", damping: 20 }}
        >
          <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl shadow-2xl shadow-purple-500/30 overflow-hidden">
            <div className="p-4">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 text-white/70 hover:text-white hover:bg-white/20"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-4">
                <motion.div
                  className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center"
                  initial={{ rotate: -30, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                >
                  <IconComponent className="w-6 h-6 text-white" />
                </motion.div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                    <span className="text-xs font-medium text-purple-200 uppercase tracking-wider">
                      Feature Unlocked
                    </span>
                  </div>
                  <h3 className="font-bold text-white">{feature.name}</h3>
                  <p className="text-sm text-purple-200">
                    {feature.description}
                  </p>
                </div>
              </div>

              {onExplore && (
                <Button
                  onClick={onExplore}
                  className="w-full mt-4 bg-white text-purple-600 hover:bg-white/90"
                >
                  Explore Now
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TutorialStepCompletedToast({
  tutorialName,
  stepNumber,
  totalSteps,
  points,
  isVisible,
  onClose,
}: {
  tutorialName: string;
  stepNumber: number;
  totalSteps: number;
  points: number;
  isVisible: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-4 left-4 z-[9999]"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
        >
          <div className="bg-card border rounded-lg shadow-lg p-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Step {stepNumber}/{totalSteps} Complete
              </p>
              <p className="text-xs text-muted-foreground">{tutorialName}</p>
            </div>
            <Badge variant="secondary" className="ml-2">
              <Star className="w-3 h-3 mr-1" />+{points}
            </Badge>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
