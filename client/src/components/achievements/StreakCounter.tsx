import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Zap, TrendingUp, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface Streak {
  id: string;
  userId: string;
  streakType: string;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

interface StreakCounterProps {
  streakType?: string;
  showAll?: boolean;
  compact?: boolean;
  onStreakUpdate?: () => void;
}

const streakConfig: Record<string, { icon: typeof Flame; label: string; color: string }> = {
  login: {
    icon: Flame,
    label: "Login Streak",
    color: "from-orange-500 to-red-600",
  },
  posting: {
    icon: Zap,
    label: "Posting Streak",
    color: "from-yellow-400 to-orange-500",
  },
  release: {
    icon: TrendingUp,
    label: "Release Streak",
    color: "from-purple-500 to-pink-600",
  },
};

export function StreakCounter({
  streakType = "login",
  showAll = false,
  compact = false,
  onStreakUpdate,
}: StreakCounterProps) {
  const queryClient = useQueryClient();
  const [showFlame, setShowFlame] = useState(false);

  const { data: streaks, isLoading } = useQuery<Streak[]>({
    queryKey: ["/api/achievements/streaks"],
  });

  const updateStreakMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await fetch(`/api/achievements/streaks/${type}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update streak");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/streaks"] });
      setShowFlame(true);
      setTimeout(() => setShowFlame(false), 2000);
      onStreakUpdate?.();
    },
  });

  const getStreak = (type: string): Streak | undefined => {
    return streaks?.find((s) => s.streakType === type);
  };

  const renderStreak = (type: string) => {
    const streak = getStreak(type);
    const config = streakConfig[type] || streakConfig.login;
    const Icon = config.icon;
    const currentStreak = streak?.currentStreak || 0;
    const longestStreak = streak?.longestStreak || 0;
    const isActive = streak?.lastActivityDate === new Date().toISOString().split("T")[0];

    if (compact) {
      return (
        <TooltipProvider key={type}>
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                className={cn(
                  "relative flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer",
                  "bg-gradient-to-r",
                  config.color,
                  "text-white font-bold"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <AnimatePresence>
                  {showFlame && (
                    <motion.div
                      className="absolute -top-6 left-1/2 -translate-x-1/2"
                      initial={{ opacity: 0, y: 20, scale: 0 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -20, scale: 0 }}
                    >
                      <span className="text-2xl">🔥</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div
                  animate={
                    currentStreak > 0
                      ? {
                          rotate: [0, -5, 5, -5, 0],
                        }
                      : {}
                  }
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    repeatDelay: 3,
                  }}
                >
                  <Icon className="w-4 h-4" />
                </motion.div>
                <span className="text-sm">{currentStreak}</span>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-semibold">{config.label}</p>
                <p className="text-xs">Current: {currentStreak} days</p>
                <p className="text-xs">Best: {longestStreak} days</p>
                {isActive && (
                  <Badge variant="secondary" className="text-xs mt-1">
                    Active today!
                  </Badge>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <Card
        key={type}
        className={cn(
          "relative overflow-hidden border-0",
          "bg-gradient-to-br",
          config.color,
          "text-white"
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                className="p-2 bg-white/20 rounded-lg"
                animate={
                  currentStreak > 0
                    ? {
                        scale: [1, 1.1, 1],
                      }
                    : {}
                }
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              >
                <Icon className="w-6 h-6" />
              </motion.div>
              <div>
                <p className="text-sm font-medium opacity-90">{config.label}</p>
                <div className="flex items-baseline gap-1">
                  <motion.span
                    className="text-3xl font-bold"
                    key={currentStreak}
                    initial={{ scale: 1.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                  >
                    {currentStreak}
                  </motion.span>
                  <span className="text-sm opacity-75">days</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center gap-1 text-xs opacity-75">
                <Calendar className="w-3 h-3" />
                Best: {longestStreak}
              </div>
              {!isActive && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2 bg-white/20 hover:bg-white/30 text-white"
                  onClick={() => updateStreakMutation.mutate(type)}
                  disabled={updateStreakMutation.isPending}
                >
                  Check in
                </Button>
              )}
              {isActive && (
                <Badge className="mt-2 bg-white/20">
                  ✓ Active
                </Badge>
              )}
            </div>
          </div>

          <AnimatePresence>
            {currentStreak >= 7 && (
              <motion.div
                className="absolute top-0 right-0 p-2"
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
              >
                <Badge className="bg-yellow-400 text-yellow-900">
                  🔥 On Fire!
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="h-16 bg-gray-800 rounded-lg animate-pulse" />
    );
  }

  if (showAll) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Object.keys(streakConfig).map((type) => renderStreak(type))}
      </div>
    );
  }

  return renderStreak(streakType);
}
