import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Music,
  Upload,
  Calendar,
  DollarSign,
  Share2,
  Trophy,
  Star,
  Sparkles,
  PartyPopper,
  X,
  ArrowRight,
  Rocket,
  Heart,
  Zap,
} from 'lucide-react';

export type FirstActionType =
  | 'first_track_upload'
  | 'first_post_scheduled'
  | 'first_beat_listed'
  | 'first_payout'
  | 'first_collaboration'
  | 'first_release'
  | 'profile_complete'
  | 'social_connected';

interface FirstActionCelebrationProps {
  actionType: FirstActionType;
  isOpen: boolean;
  onClose: () => void;
  metadata?: {
    title?: string;
    amount?: number;
    platform?: string;
    collaborator?: string;
  };
}

interface Confetti {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
}

const ACTION_CONFIGS: Record<
  FirstActionType,
  {
    icon: typeof Music;
    title: string;
    subtitle: string;
    gradient: string;
    points: number;
    nextAction?: { label: string; href: string };
    confettiColors: string[];
  }
> = {
  first_track_upload: {
    icon: Upload,
    title: 'First Track Uploaded!',
    subtitle: "You've taken the first step on your musical journey",
    gradient: 'from-green-500 to-emerald-600',
    points: 100,
    nextAction: { label: 'Try AI Enhancement', href: '/studio' },
    confettiColors: ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0'],
  },
  first_post_scheduled: {
    icon: Calendar,
    title: 'First Post Scheduled!',
    subtitle: 'Your content is queued and ready to go viral',
    gradient: 'from-blue-500 to-indigo-600',
    points: 75,
    nextAction: { label: 'Enable Autopilot', href: '/social-media' },
    confettiColors: ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE'],
  },
  first_beat_listed: {
    icon: DollarSign,
    title: 'First Beat Listed!',
    subtitle: 'Your beats are now available for purchase',
    gradient: 'from-purple-500 to-violet-600',
    points: 100,
    nextAction: { label: 'Optimize Pricing', href: '/storefront' },
    confettiColors: ['#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE'],
  },
  first_payout: {
    icon: DollarSign,
    title: 'First Payout! 💰',
    subtitle: "You're officially making money from your music",
    gradient: 'from-yellow-500 to-amber-600',
    points: 250,
    nextAction: { label: 'View Analytics', href: '/analytics' },
    confettiColors: ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A'],
  },
  first_collaboration: {
    icon: Share2,
    title: 'First Collaboration!',
    subtitle: 'Great things happen when artists work together',
    gradient: 'from-pink-500 to-rose-600',
    points: 100,
    nextAction: { label: 'Find More Collaborators', href: '/collaborations' },
    confettiColors: ['#EC4899', '#F472B6', '#F9A8D4', '#FBCFE8'],
  },
  first_release: {
    icon: Rocket,
    title: 'First Release Live!',
    subtitle: 'Your music is now streaming worldwide',
    gradient: 'from-cyan-500 to-teal-600',
    points: 150,
    nextAction: { label: 'Track Performance', href: '/analytics' },
    confettiColors: ['#06B6D4', '#22D3EE', '#67E8F9', '#A5F3FC'],
  },
  profile_complete: {
    icon: Star,
    title: 'Profile Complete!',
    subtitle: "You're all set up and ready to grow",
    gradient: 'from-orange-500 to-red-600',
    points: 50,
    nextAction: { label: 'Explore Features', href: '/dashboard' },
    confettiColors: ['#F97316', '#FB923C', '#FDBA74', '#FED7AA'],
  },
  social_connected: {
    icon: Heart,
    title: 'Social Account Connected!',
    subtitle: 'Now you can reach fans across platforms',
    gradient: 'from-red-500 to-pink-600',
    points: 75,
    nextAction: { label: 'Schedule Posts', href: '/social-media' },
    confettiColors: ['#EF4444', '#F87171', '#FCA5A5', '#FECACA'],
  },
};

export default function FirstActionCelebration({
  actionType,
  isOpen,
  onClose,
  metadata,
}: FirstActionCelebrationProps) {
  const [confetti, setConfetti] = useState<Confetti[]>([]);
  const [showContent, setShowContent] = useState(false);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const config = ACTION_CONFIGS[actionType];

  const markCelebratedMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/onboarding/mark-celebrated', {
        actionType,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/onboarding/progress'] });
      queryClient.invalidateQueries({ queryKey: ['/api/achievements/user'] });
    },
  });

  const createConfetti = useCallback(() => {
    const pieces: Confetti[] = [];
    for (let i = 0; i < 60; i++) {
      pieces.push({
        id: i,
        x: Math.random() * 100,
        color: config.confettiColors[Math.floor(Math.random() * config.confettiColors.length)],
        size: Math.random() * 10 + 5,
        rotation: Math.random() * 360,
        delay: Math.random() * 0.5,
      });
    }
    setConfetti(pieces);
  }, [config.confettiColors]);

  useEffect(() => {
    if (isOpen) {
      createConfetti();
      const contentTimer = setTimeout(() => setShowContent(true), 300);
      
      const audio = new Audio('/sounds/celebration.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});

      return () => clearTimeout(contentTimer);
    } else {
      setConfetti([]);
      setShowContent(false);
    }
  }, [isOpen, createConfetti]);

  const handleClose = () => {
    markCelebratedMutation.mutate();
    onClose();
  };

  const handleNextAction = () => {
    markCelebratedMutation.mutate();
    if (config.nextAction) {
      navigate(config.nextAction.href);
    }
    onClose();
  };

  const Icon = config.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
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
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                }}
                initial={{
                  top: '-5%',
                  rotate: 0,
                  opacity: 1,
                }}
                animate={{
                  top: '110%',
                  rotate: piece.rotation + 720,
                  opacity: [1, 1, 0],
                }}
                transition={{
                  duration: 3 + Math.random() * 2,
                  delay: piece.delay,
                  ease: 'linear',
                }}
              />
            ))}
          </div>

          <motion.div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          >
            <motion.div
              className={cn(
                'relative max-w-md w-full rounded-2xl overflow-hidden shadow-2xl',
                'bg-gradient-to-br',
                config.gradient
              )}
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 10 }}
              transition={{ type: 'spring', damping: 15, delay: 0.1 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 text-white/80 hover:text-white hover:bg-white/20 z-10"
                onClick={handleClose}
              >
                <X className="w-5 h-5" />
              </Button>

              <div className="relative p-8 text-center text-white">
                <div className="absolute top-4 left-4">
                  <PartyPopper className="w-6 h-6 animate-bounce" />
                </div>
                <div className="absolute top-4 right-12">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>

                <AnimatePresence>
                  {showContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <motion.div
                        className="relative inline-block mb-6"
                        animate={{
                          scale: [1, 1.1, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                        }}
                      >
                        <div className="absolute inset-0 animate-ping opacity-30">
                          <div className="w-20 h-20 rounded-full bg-white" />
                        </div>
                        <div className="relative bg-white/20 backdrop-blur-sm rounded-full p-5">
                          <Icon className="w-10 h-10" />
                        </div>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                      >
                        <h2 className="text-3xl font-bold mb-2">{config.title}</h2>
                        <p className="text-white/90 mb-4">{config.subtitle}</p>

                        {metadata?.title && (
                          <p className="text-sm text-white/80 mb-2">"{metadata.title}"</p>
                        )}

                        {metadata?.amount && (
                          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 mb-4">
                            <DollarSign className="w-5 h-5" />
                            <span className="font-bold text-xl">
                              ${metadata.amount.toFixed(2)}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-center gap-2 mb-6">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', delay: 0.6 }}
                          >
                            <Badge className="bg-white/20 text-white text-lg px-4 py-1">
                              <Trophy className="w-4 h-4 mr-2" />
                              +{config.points} XP
                            </Badge>
                          </motion.div>
                        </div>

                        <div className="flex flex-col gap-3">
                          {config.nextAction && (
                            <Button
                              onClick={handleNextAction}
                              className="w-full bg-white text-gray-900 hover:bg-white/90"
                            >
                              {config.nextAction.label}
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            onClick={handleClose}
                            className="w-full text-white/80 hover:text-white hover:bg-white/10"
                          >
                            Continue
                          </Button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div
                  className="absolute -bottom-4 -left-4 w-24 h-24 bg-white/10 rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                />
                <motion.div
                  className="absolute -bottom-8 -right-8 w-32 h-32 bg-white/5 rounded-full"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 4, repeat: Infinity, delay: 0.5 }}
                />
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function useFirstActionCelebration() {
  const [celebration, setCelebration] = useState<{
    type: FirstActionType;
    metadata?: FirstActionCelebrationProps['metadata'];
  } | null>(null);

  const celebrate = useCallback(
    (type: FirstActionType, metadata?: FirstActionCelebrationProps['metadata']) => {
      setCelebration({ type, metadata });
    },
    []
  );

  const closeCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  const CelebrationComponent = celebration ? (
    <FirstActionCelebration
      actionType={celebration.type}
      isOpen={true}
      onClose={closeCelebration}
      metadata={celebration.metadata}
    />
  ) : null;

  return {
    celebrate,
    CelebrationComponent,
  };
}

export function MilestoneCelebration({
  milestone,
  isOpen,
  onClose,
}: {
  milestone: { name: string; description: string; icon: typeof Trophy; points: number };
  isOpen: boolean;
  onClose: () => void;
}) {
  const Icon = milestone.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 rounded-2xl p-8 text-white text-center max-w-sm"
            initial={{ scale: 0, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0, y: 50 }}
            transition={{ type: 'spring' }}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 0.5, repeat: 3 }}
            >
              <div className="w-16 h-16 mx-auto mb-4 bg-white/20 rounded-full flex items-center justify-center">
                <Icon className="w-8 h-8" />
              </div>
            </motion.div>

            <h2 className="text-2xl font-bold mb-2">Milestone Reached!</h2>
            <p className="text-lg font-semibold mb-1">{milestone.name}</p>
            <p className="text-white/80 text-sm mb-4">{milestone.description}</p>

            <Badge className="bg-white/20 text-white">
              <Zap className="w-4 h-4 mr-1" />
              +{milestone.points} XP
            </Badge>

            <Button
              onClick={onClose}
              className="w-full mt-6 bg-white text-orange-600 hover:bg-white/90"
            >
              Awesome!
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
