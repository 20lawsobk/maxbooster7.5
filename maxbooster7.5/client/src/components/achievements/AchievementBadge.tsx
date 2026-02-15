import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Trophy, Star, Award, Zap, Crown, Flame, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface AchievementBadgeProps {
  name: string;
  description?: string | null;
  iconUrl?: string | null;
  tier: "bronze" | "silver" | "gold" | "platinum";
  category: string;
  points: number;
  progress: number;
  unlocked: boolean;
  unlockedAt?: Date | null;
  showAnimation?: boolean;
  size?: "sm" | "md" | "lg";
}

const tierColors = {
  bronze: {
    bg: "bg-gradient-to-br from-orange-700 to-orange-900",
    border: "border-orange-500",
    glow: "shadow-orange-500/50",
    text: "text-orange-400",
  },
  silver: {
    bg: "bg-gradient-to-br from-gray-300 to-gray-500",
    border: "border-gray-300",
    glow: "shadow-gray-300/50",
    text: "text-gray-300",
  },
  gold: {
    bg: "bg-gradient-to-br from-yellow-400 to-yellow-600",
    border: "border-yellow-400",
    glow: "shadow-yellow-400/50",
    text: "text-yellow-400",
  },
  platinum: {
    bg: "bg-gradient-to-br from-cyan-300 to-blue-500",
    border: "border-cyan-300",
    glow: "shadow-cyan-300/50",
    text: "text-cyan-300",
  },
};

const categoryIcons: Record<string, typeof Trophy> = {
  streaming: Zap,
  social: Star,
  sales: Award,
  collaboration: Crown,
  streak: Flame,
  milestone: Target,
  default: Trophy,
};

const sizeClasses = {
  sm: "w-12 h-12",
  md: "w-16 h-16",
  lg: "w-24 h-24",
};

export function AchievementBadge({
  name,
  description,
  iconUrl,
  tier,
  category,
  points,
  progress,
  unlocked,
  unlockedAt,
  showAnimation = false,
  size = "md",
}: AchievementBadgeProps) {
  const [isAnimating, setIsAnimating] = useState(showAnimation);
  const tierStyle = tierColors[tier] || tierColors.bronze;
  const Icon = categoryIcons[category] || categoryIcons.default;

  useEffect(() => {
    if (showAnimation) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showAnimation]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={cn(
              "relative rounded-full flex items-center justify-center cursor-pointer",
              sizeClasses[size],
              unlocked ? tierStyle.bg : "bg-gray-800",
              unlocked ? `border-2 ${tierStyle.border}` : "border-2 border-gray-600",
              unlocked && isAnimating && `shadow-lg ${tierStyle.glow}`,
              "transition-all duration-300"
            )}
            initial={showAnimation ? { scale: 0, rotate: -180 } : { scale: 1 }}
            animate={
              showAnimation
                ? {
                    scale: [0, 1.2, 1],
                    rotate: [180, 0],
                  }
                : { scale: 1 }
            }
            transition={{ duration: 0.6, ease: "easeOut" }}
            whileHover={{ scale: 1.1 }}
          >
            <AnimatePresence>
              {isAnimating && unlocked && (
                <>
                  {[...Array(12)].map((_, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-2 h-2 rounded-full bg-yellow-400"
                      initial={{ scale: 0, x: 0, y: 0 }}
                      animate={{
                        scale: [0, 1, 0],
                        x: Math.cos((i * Math.PI * 2) / 12) * 50,
                        y: Math.sin((i * Math.PI * 2) / 12) * 50,
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 1,
                        delay: i * 0.05,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </>
              )}
            </AnimatePresence>

            {unlocked ? (
              iconUrl ? (
                <img
                  src={iconUrl}
                  alt={name}
                  className={cn(
                    "rounded-full object-cover",
                    size === "sm" ? "w-8 h-8" : size === "md" ? "w-10 h-10" : "w-16 h-16"
                  )}
                />
              ) : (
                <Icon
                  className={cn(
                    "text-white",
                    size === "sm" ? "w-5 h-5" : size === "md" ? "w-7 h-7" : "w-12 h-12"
                  )}
                />
              )
            ) : (
              <div className="relative">
                <Icon
                  className={cn(
                    "text-gray-600",
                    size === "sm" ? "w-5 h-5" : size === "md" ? "w-7 h-7" : "w-12 h-12"
                  )}
                />
                <Lock
                  className={cn(
                    "absolute -bottom-1 -right-1 text-gray-500",
                    size === "sm" ? "w-3 h-3" : "w-4 h-4"
                  )}
                />
              </div>
            )}

            {!unlocked && progress > 0 && progress < 1 && (
              <svg
                className="absolute inset-0 -rotate-90"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="4"
                />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="none"
                  stroke={tierStyle.text.replace("text-", "")}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${progress * 283} 283`}
                  initial={{ strokeDasharray: "0 283" }}
                  animate={{ strokeDasharray: `${progress * 283} 283` }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className={tierStyle.text}
                />
              </svg>
            )}
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{name}</span>
              <span className={cn("text-xs uppercase font-bold", tierStyle.text)}>
                {tier}
              </span>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-yellow-500">+{points} points</span>
              {unlocked ? (
                <span className="text-green-500">Unlocked!</span>
              ) : (
                <span className="text-muted-foreground">
                  {Math.round(progress * 100)}% complete
                </span>
              )}
            </div>
            {unlocked && unlockedAt && (
              <p className="text-xs text-muted-foreground">
                Unlocked: {new Date(unlockedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
