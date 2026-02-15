import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, X, Star, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  category: string;
  iconUrl: string | null;
  points: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
}

interface Confetti {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  rotation: number;
}

const tierColors = {
  bronze: "from-orange-600 to-orange-800",
  silver: "from-gray-300 to-gray-500",
  gold: "from-yellow-400 to-amber-600",
  platinum: "from-cyan-300 to-blue-500",
};

const confettiColors = [
  "#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", 
  "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8",
  "#F7DC6F", "#BB8FCE", "#85C1E9", "#F8B500"
];

export function AchievementNotification() {
  const queryClient = useQueryClient();
  const [currentAchievement, setCurrentAchievement] = useState<Achievement | null>(null);
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [queue, setQueue] = useState<Achievement[]>([]);

  const { data: unnotified } = useQuery<Achievement[]>({
    queryKey: ["/api/achievements/unnotified"],
    refetchInterval: 5000,
  });

  const markNotifiedMutation = useMutation({
    mutationFn: async (achievementId: string) => {
      const res = await fetch(`/api/achievements/mark-notified/${achievementId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to mark notified");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/unnotified"] });
      queryClient.invalidateQueries({ queryKey: ["/api/achievements/user"] });
    },
  });

  const createConfetti = useCallback(() => {
    const newConfetti: Confetti[] = [];
    for (let i = 0; i < 50; i++) {
      newConfetti.push({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        size: Math.random() * 10 + 5,
        rotation: Math.random() * 360,
      });
    }
    setConfetti(newConfetti);
    setTimeout(() => setConfetti([]), 3000);
  }, []);

  useEffect(() => {
    if (unnotified && unnotified.length > 0) {
      const newAchievements = unnotified.filter(
        (a) => !queue.some((q) => q.id === a.id) && 
               (!currentAchievement || currentAchievement.id !== a.id)
      );
      if (newAchievements.length > 0) {
        setQueue((prev) => [...prev, ...newAchievements]);
      }
    }
  }, [unnotified]);

  useEffect(() => {
    if (!currentAchievement && queue.length > 0) {
      const next = queue[0];
      setQueue((prev) => prev.slice(1));
      setCurrentAchievement(next);
      createConfetti();
      
      const audio = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU...");
      audio.volume = 0.3;
      audio.play().catch(() => {});
    }
  }, [currentAchievement, queue, createConfetti]);

  const handleDismiss = () => {
    if (currentAchievement) {
      markNotifiedMutation.mutate(currentAchievement.id);
      setCurrentAchievement(null);
    }
  };

  return (
    <>
      <AnimatePresence>
        {confetti.length > 0 && (
          <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
            {confetti.map((piece) => (
              <motion.div
                key={piece.id}
                className="absolute"
                style={{
                  left: `${piece.x}%`,
                  backgroundColor: piece.color,
                  width: piece.size,
                  height: piece.size,
                  borderRadius: Math.random() > 0.5 ? "50%" : "0%",
                }}
                initial={{
                  top: "-10%",
                  rotate: 0,
                  opacity: 1,
                }}
                animate={{
                  top: "110%",
                  rotate: piece.rotation + 720,
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  ease: "linear",
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {currentAchievement && (
          <motion.div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleDismiss}
          >
            <motion.div
              className={cn(
                "relative max-w-md w-full rounded-2xl overflow-hidden",
                "bg-gradient-to-br",
                tierColors[currentAchievement.tier],
                "shadow-2xl"
              )}
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 10 }}
              transition={{ type: "spring", damping: 15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-white/80 hover:text-white hover:bg-white/20"
                onClick={handleDismiss}
              >
                <X className="w-5 h-5" />
              </Button>

              <div className="p-8 text-center text-white">
                <motion.div
                  className="relative inline-block mb-4"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                  }}
                >
                  <div className="absolute inset-0 animate-ping">
                    <Sparkles className="w-20 h-20 text-yellow-300 opacity-50" />
                  </div>
                  <div className="relative bg-white/20 rounded-full p-6">
                    <Trophy className="w-12 h-12" />
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-sm font-medium opacity-80 mb-1">
                    Achievement Unlocked!
                  </p>
                  <h2 className="text-2xl font-bold mb-2">
                    {currentAchievement.name}
                  </h2>
                  {currentAchievement.description && (
                    <p className="text-sm opacity-90 mb-4">
                      {currentAchievement.description}
                    </p>
                  )}

                  <div className="flex items-center justify-center gap-2">
                    <Star className="w-5 h-5 text-yellow-300" />
                    <span className="font-bold text-lg">
                      +{currentAchievement.points} points
                    </span>
                    <Star className="w-5 h-5 text-yellow-300" />
                  </div>
                </motion.div>

                <motion.div
                  className="mt-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <Button
                    variant="secondary"
                    className="bg-white/20 hover:bg-white/30 text-white"
                    onClick={handleDismiss}
                  >
                    Awesome!
                  </Button>
                </motion.div>

                {queue.length > 0 && (
                  <motion.p
                    className="mt-4 text-xs opacity-70"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                  >
                    +{queue.length} more achievement{queue.length > 1 ? "s" : ""} unlocked!
                  </motion.p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
