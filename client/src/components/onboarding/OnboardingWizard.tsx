import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Music,
  Users,
  Headphones,
  Building2,
  Briefcase,
  ArrowRight,
  ArrowLeft,
  Check,
  Sparkles,
  Target,
  Share2,
  DollarSign,
  Mic2,
  BarChart3,
  Zap,
  Trophy,
  Star,
  Crown,
  Flame,
  Shield,
  Rocket,
  Gift,
} from "lucide-react";

type Persona = "artist" | "producer" | "label" | "manager";
type ExperienceLevel = "beginner" | "intermediate" | "advanced";
type Goal =
  | "produce"
  | "distribute"
  | "social"
  | "advertising"
  | "marketplace"
  | "analytics"
  | "royalties";

interface OnboardingData {
  persona: Persona | null;
  experienceLevel: ExperienceLevel | null;
  goals: Goal[];
  preferSimplifiedView: boolean;
  connectedPlatforms: string[];
  completedSteps: string[];
}

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

const STEP_XP = [150, 200, 100, 250];
const TOTAL_XP = STEP_XP.reduce((a, b) => a + b, 0);

const RANKS = [
  {
    min: 0,
    label: "Newcomer",
    icon: Star,
    color: "from-slate-500 to-slate-400",
    textColor: "text-slate-400",
  },
  {
    min: 150,
    label: "Rising Artist",
    icon: Flame,
    color: "from-blue-600 to-cyan-400",
    textColor: "text-cyan-400",
  },
  {
    min: 350,
    label: "Pro Creator",
    icon: Shield,
    color: "from-purple-600 to-pink-400",
    textColor: "text-purple-400",
  },
  {
    min: 450,
    label: "Legend",
    icon: Crown,
    color: "from-yellow-500 to-orange-400",
    textColor: "text-yellow-400",
  },
];

const ACHIEVEMENTS = [
  {
    atStep: 0,
    title: "Identity Confirmed",
    desc: "You chose your path.",
    icon: Star,
    color: "text-blue-400",
  },
  {
    atStep: 1,
    title: "Goals Locked In",
    desc: "Ambition documented.",
    icon: Target,
    color: "text-purple-400",
  },
  {
    atStep: 2,
    title: "Level Assessed",
    desc: "We know your power.",
    icon: Zap,
    color: "text-yellow-400",
  },
  {
    atStep: 3,
    title: "Ready to Launch",
    desc: "All systems go.",
    icon: Rocket,
    color: "text-green-400",
  },
];

const personas = [
  {
    value: "artist" as Persona,
    label: "Solo Artist",
    icon: Music,
    description: "Independent musician creating your own music",
    class: "The Performer",
    color: "from-purple-600 to-pink-500",
    border: "border-purple-500/40 hover:border-purple-400",
    features: ["Music distribution", "Social autopilot", "Analytics"],
  },
  {
    value: "producer" as Persona,
    label: "Producer",
    icon: Headphones,
    description: "Creating beats and producing tracks",
    class: "The Architect",
    color: "from-blue-600 to-cyan-500",
    border: "border-blue-500/40 hover:border-blue-400",
    features: ["Beat marketplace", "Studio DAW", "Collaboration"],
  },
  {
    value: "label" as Persona,
    label: "Record Label",
    icon: Building2,
    description: "Managing multiple artists and releases",
    class: "The Empire",
    color: "from-orange-600 to-yellow-500",
    border: "border-orange-500/40 hover:border-orange-400",
    features: ["Multi-artist dashboard", "Royalty splits", "Catalog"],
  },
  {
    value: "manager" as Persona,
    label: "Artist Manager",
    icon: Briefcase,
    description: "Growing and managing artist careers",
    class: "The Strategist",
    color: "from-green-600 to-emerald-400",
    border: "border-green-500/40 hover:border-green-400",
    features: ["Campaign management", "Financial tracking", "Team tools"],
  },
];

const experienceLevels = [
  {
    value: "beginner" as ExperienceLevel,
    label: "Rookie",
    sublabel: "Just starting out",
    xpBonus: "+10 XP Guidance Bonus",
    icon: Star,
  },
  {
    value: "intermediate" as ExperienceLevel,
    label: "Established",
    sublabel: "Released music before",
    xpBonus: "+10 XP Experience Bonus",
    icon: Shield,
  },
  {
    value: "advanced" as ExperienceLevel,
    label: "Veteran",
    sublabel: "Industry professional",
    xpBonus: "+10 XP Pro Bonus",
    icon: Crown,
  },
];

const goals = [
  { value: "produce" as Goal, label: "Produce & Record", icon: Mic2, xp: 30 },
  {
    value: "distribute" as Goal,
    label: "Distribute Music",
    icon: Share2,
    xp: 30,
  },
  { value: "social" as Goal, label: "Grow Social Media", icon: Users, xp: 30 },
  {
    value: "advertising" as Goal,
    label: "Run Ad Campaigns",
    icon: Target,
    xp: 30,
  },
  {
    value: "marketplace" as Goal,
    label: "Sell on Marketplace",
    icon: DollarSign,
    xp: 30,
  },
  {
    value: "analytics" as Goal,
    label: "Track Analytics",
    icon: BarChart3,
    xp: 30,
  },
  {
    value: "royalties" as Goal,
    label: "Collect Royalties",
    icon: Trophy,
    xp: 30,
  },
];

function getRank(xp: number) {
  return [...RANKS].reverse().find((r) => xp >= r.min) ?? RANKS[0];
}

function XPBar({ xp, total }: { xp: number; total: number }) {
  const pct = Math.round((xp / (total || 1)) * 100);
  const rank = getRank(xp);
  const RankIcon = rank.icon;
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <RankIcon className={cn("w-3.5 h-3.5", rank.textColor)} />
          <span className={cn("text-xs font-bold", rank.textColor)}>
            {rank.label}
          </span>
        </div>
        <span className="text-xs text-white/60">
          {xp} / {total} XP
        </span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full bg-gradient-to-r", rank.color)}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function AchievementToast({
  achievement,
  onDone,
}: {
  achievement: (typeof ACHIEVEMENTS)[0];
  onDone: () => void;
}) {
  const Icon = achievement.icon;
  useEffect(() => {
    const t = setTimeout(onDone, 2800);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <motion.div
      initial={{ opacity: 0, y: -40, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/90 border border-yellow-500/40 rounded-2xl px-5 py-3 shadow-2xl shadow-yellow-500/10"
    >
      <div className="w-9 h-9 rounded-full bg-yellow-500/20 flex items-center justify-center">
        <Icon className={cn("w-5 h-5", achievement.color)} />
      </div>
      <div>
        <p className="text-xs text-yellow-400 font-bold tracking-wider uppercase">
          Achievement Unlocked
        </p>
        <p className="text-sm text-white font-semibold">{achievement.title}</p>
        <p className="text-xs text-white/50">{achievement.desc}</p>
      </div>
      <Gift className="w-4 h-4 text-yellow-400 animate-pulse ml-1" />
    </motion.div>
  );
}

function XPGain({ amount }: { amount: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.8 }}
      animate={{
        opacity: [0, 1, 1, 0],
        y: [-10, -40, -60, -80],
        scale: [0.8, 1.2, 1, 0.8],
      }}
      transition={{ duration: 1.4, ease: "easeOut" }}
      className="fixed top-1/2 left-1/2 -translate-x-1/2 pointer-events-none z-50"
    >
      <span className="text-2xl font-black text-yellow-400 drop-shadow-lg">
        +{amount} XP
      </span>
    </motion.div>
  );
}

export default function OnboardingWizard({
  onComplete,
  onSkip,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [xp, setXp] = useState(0);
  const [showXpGain, setShowXpGain] = useState(false);
  const [gainAmount, setGainAmount] = useState(0);
  const [achievement, setAchievement] = useState<
    (typeof ACHIEVEMENTS)[0] | null
  >(null);
  const [done, setDone] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    persona: null,
    experienceLevel: null,
    goals: [],
    preferSimplifiedView: false,
    connectedPlatforms: [],
    completedSteps: [],
  });
  const { toast } = useToast();
  const confettiRef = useRef(false);

  const completeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/update-onboarding", {
        hasCompletedOnboarding: true,
        onboardingData: {
          accountType: data.persona,
          goals: data.goals,
          userLevel: data.experienceLevel,
          preferSimplifiedView: data.experienceLevel === "beginner",
        },
      });
      return response.json();
    },
    onSuccess: () => {
      setDone(true);
      if (!confettiRef.current) {
        confettiRef.current = true;
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ["#a855f7", "#ec4899", "#facc15", "#22d3ee"],
        });
        setTimeout(
          () =>
            confetti({
              particleCount: 60,
              spread: 100,
              origin: { y: 0.5 },
              angle: 60,
            }),
          400,
        );
        setTimeout(
          () =>
            confetti({
              particleCount: 60,
              spread: 100,
              origin: { y: 0.5 },
              angle: 120,
            }),
          600,
        );
      }
    },
    onError: () => {
      toast({
        title: "Setup failed",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const awardXP = (amount: number, achievementIndex?: number) => {
    setXp((prev) => prev + amount);
    setGainAmount(amount);
    setShowXpGain(true);
    setTimeout(() => setShowXpGain(false), 1500);
    if (achievementIndex !== undefined) {
      setTimeout(() => setAchievement(ACHIEVEMENTS[achievementIndex]), 600);
    }
  };

  const canProceed = () => {
    if (step === 0) return data.persona !== null;
    if (step === 1) return data.goals.length > 0;
    if (step === 2) return data.experienceLevel !== null;
    return true;
  };

  const handleNext = () => {
    if (!canProceed()) return;
    awardXP(STEP_XP[step], step);
    setStep((s) => s + 1);
  };

  const handleBack = () => setStep((s) => Math.max(0, s - 1));

  const toggleGoal = (g: Goal) => {
    setData((d) => ({
      ...d,
      goals: d.goals.includes(g)
        ? d.goals.filter((x) => x !== g)
        : [...d.goals, g],
    }));
  };

  const rank = getRank(xp);
  const RankIcon = rank.icon;
  Math.round((step / 4) * 100);

  const STEP_TITLES = [
    "Choose Your Class",
    "Set Your Goals",
    "Assess Your Level",
    "Activate Your Arsenal",
  ];
  const STEP_SUBTITLES = [
    "Who are you in the music world?",
    "What do you want to achieve?",
    "How experienced are you?",
    "Connect your platforms for max power",
  ];

  if (done) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md w-full"
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, -5, 5, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-yellow-500/30"
          >
            <Trophy className="w-12 h-12 text-white" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-4xl font-black text-white mb-2"
          >
            Mission Complete!
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-white/60 mb-6"
          >
            You've earned{" "}
            <span className="text-yellow-400 font-bold">{xp} XP</span> and
            reached{" "}
            <span className={cn("font-bold", rank.textColor)}>
              {rank.label}
            </span>{" "}
            rank. Your journey starts now.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="grid grid-cols-2 gap-3 mb-8"
          >
            {ACHIEVEMENTS.map((a, i) => {
              const Icon = a.icon;
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white/5 rounded-xl p-3 border border-white/10"
                >
                  <Icon className={cn("w-5 h-5 flex-shrink-0", a.color)} />
                  <span className="text-xs text-white/80 font-medium">
                    {a.title}
                  </span>
                </div>
              );
            })}
          </motion.div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <Button
              onClick={onComplete}
              size="lg"
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-lg py-6 rounded-2xl"
            >
              Enter Max Booster <Rocket className="ml-2 w-5 h-5" />
            </Button>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
      <AnimatePresence>
        {showXpGain && <XPGain amount={gainAmount} key={xp} />}
        {achievement && (
          <AchievementToast
            key={achievement.title}
            achievement={achievement}
            onDone={() => setAchievement(null)}
          />
        )}
      </AnimatePresence>

      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center",
                  rank.color,
                )}
              >
                <RankIcon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm text-white/70">Max Booster Setup</span>
            </div>
            <button
              onClick={onSkip}
              className="text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Skip setup
            </button>
          </div>
          <XPBar xp={xp} total={TOTAL_XP} />
          <div className="flex justify-between mt-3">
            {STEP_TITLES.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                    i < step
                      ? "bg-green-500 text-white"
                      : i === step
                        ? "bg-gradient-to-br from-purple-600 to-pink-500 text-white ring-2 ring-purple-400/40"
                        : "bg-white/10 text-white/30",
                  )}
                >
                  {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-[10px] hidden sm:block",
                    i === step ? "text-white/60" : "text-white/20",
                  )}
                >
                  {t.split(" ")[0]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="bg-white/[0.04] border border-white/10 rounded-3xl p-6 sm:p-8 backdrop-blur-sm"
          >
            {/* Step header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant="outline"
                  className="text-[10px] border-white/20 text-white/40 font-mono"
                >
                  STEP {step + 1} OF 4
                </Badge>
                <Badge
                  variant="outline"
                  className="text-[10px] border-yellow-500/30 text-yellow-500/80 font-mono"
                >
                  +{STEP_XP[step]} XP
                </Badge>
              </div>
              <h2 className="text-2xl font-black text-white">
                {STEP_TITLES[step]}
              </h2>
              <p className="text-white/50 text-sm mt-0.5">
                {STEP_SUBTITLES[step]}
              </p>
            </div>

            {/* Step 0: Persona / Class Selection */}
            {step === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {personas.map((p) => {
                  const Icon = p.icon;
                  const selected = data.persona === p.value;
                  return (
                    <motion.button
                      key={p.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        setData((d) => ({ ...d, persona: p.value }))
                      }
                      className={cn(
                        "relative text-left p-4 rounded-2xl border-2 transition-all duration-200",
                        selected
                          ? "border-white/40 bg-white/10"
                          : cn("border-white/10 bg-white/[0.02]", p.border),
                      )}
                    >
                      {selected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-3 right-3 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3",
                          p.color,
                        )}
                      >
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/30 mb-0.5">
                        {p.class}
                      </p>
                      <p className="font-bold text-white text-sm">{p.label}</p>
                      <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                        {p.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {p.features.map((f) => (
                          <span
                            key={f}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Step 1: Goals */}
            {step === 1 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {goals.map((g) => {
                  const Icon = g.icon;
                  const selected = data.goals.includes(g.value);
                  return (
                    <motion.button
                      key={g.value}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => toggleGoal(g.value)}
                      className={cn(
                        "relative p-4 rounded-2xl border-2 text-left transition-all duration-200",
                        selected
                          ? "border-purple-500/60 bg-purple-500/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20",
                      )}
                    >
                      {selected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute top-2 right-2 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center"
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </motion.div>
                      )}
                      <Icon
                        className={cn(
                          "w-5 h-5 mb-2",
                          selected ? "text-purple-400" : "text-white/40",
                        )}
                      />
                      <p
                        className={cn(
                          "text-xs font-semibold",
                          selected ? "text-white" : "text-white/60",
                        )}
                      >
                        {g.label}
                      </p>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Step 2: Experience Level */}
            {step === 2 && (
              <div className="flex flex-col gap-3">
                {experienceLevels.map((lvl) => {
                  const Icon = lvl.icon;
                  const selected = data.experienceLevel === lvl.value;
                  return (
                    <motion.button
                      key={lvl.value}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() =>
                        setData((d) => ({ ...d, experienceLevel: lvl.value }))
                      }
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all duration-200",
                        selected
                          ? "border-cyan-500/60 bg-cyan-500/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20",
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                          selected ? "bg-cyan-500/20" : "bg-white/5",
                        )}
                      >
                        <Icon
                          className={cn(
                            "w-5 h-5",
                            selected ? "text-cyan-400" : "text-white/40",
                          )}
                        />
                      </div>
                      <div className="flex-1">
                        <p
                          className={cn(
                            "font-bold text-sm",
                            selected ? "text-white" : "text-white/70",
                          )}
                        >
                          {lvl.label}
                        </p>
                        <p className="text-xs text-white/40">{lvl.sublabel}</p>
                      </div>
                      <span
                        className={cn(
                          "text-[10px] font-bold",
                          selected ? "text-cyan-400" : "text-white/20",
                        )}
                      >
                        {lvl.xpBonus}
                      </span>
                      {selected && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center flex-shrink-0"
                        >
                          <Check className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* Step 3: Platform Connections */}
            {step === 3 && (
              <div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    {
                      id: "streaming",
                      label: "Streaming Platforms",
                      icon: Music,
                      desc: "Spotify, Apple Music, etc.",
                      color: "text-green-400",
                    },
                    {
                      id: "social",
                      label: "Social Media",
                      icon: Users,
                      desc: "Instagram, TikTok, YouTube",
                      color: "text-pink-400",
                    },
                    {
                      id: "distribution",
                      label: "Distribution",
                      icon: Share2,
                      desc: "DistroKid, TuneCore, etc.",
                      color: "text-blue-400",
                    },
                    {
                      id: "analytics",
                      label: "Analytics",
                      icon: BarChart3,
                      desc: "Spotify for Artists, etc.",
                      color: "text-purple-400",
                    },
                  ].map((platform) => {
                    const Icon = platform.icon;
                    const connected = data.connectedPlatforms.includes(
                      platform.id,
                    );
                    return (
                      <motion.button
                        key={platform.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          setData((d) => ({
                            ...d,
                            connectedPlatforms: connected
                              ? d.connectedPlatforms.filter(
                                  (x) => x !== platform.id,
                                )
                              : [...d.connectedPlatforms, platform.id],
                          }))
                        }
                        className={cn(
                          "p-4 rounded-2xl border-2 text-left transition-all duration-200",
                          connected
                            ? "border-green-500/50 bg-green-500/10"
                            : "border-white/10 bg-white/[0.02] hover:border-white/20",
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon
                            className={cn(
                              "w-5 h-5",
                              connected
                                ? "text-green-400"
                                : platform.color + "/60",
                            )}
                          />
                          {connected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-[10px] font-bold text-green-400"
                            >
                              ✓ NOTED
                            </motion.span>
                          )}
                        </div>
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            connected ? "text-white" : "text-white/60",
                          )}
                        >
                          {platform.label}
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          {platform.desc}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
                <p className="text-xs text-center text-white/30">
                  You can connect all accounts from Settings after setup — this
                  just tells us your current setup.
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between mt-8">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 0}
                className="text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-20"
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </Button>

              {step < 3 ? (
                <Button
                  onClick={handleNext}
                  disabled={!canProceed()}
                  className={cn(
                    "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700",
                    "text-white font-bold px-6 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed",
                  )}
                >
                  Next <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    awardXP(STEP_XP[3], 3);
                    completeMutation.mutate();
                  }}
                  disabled={completeMutation.isPending}
                  className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-black font-black px-8 rounded-xl"
                >
                  {completeMutation.isPending ? (
                    "Launching..."
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-1.5" /> Launch My Career
                    </>
                  )}
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
