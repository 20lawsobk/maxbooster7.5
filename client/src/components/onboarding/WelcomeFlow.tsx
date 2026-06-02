import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import {
  uploadImageFile,
  createLocalPreview,
  revokeLocalPreview,
} from "@/lib/imageUpload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { announce } from "@/lib/accessibility";
import { cn } from "@/lib/utils";
import { Music, Mic2, Guitar, Headphones, Building2, Users, ArrowRight, ArrowLeft, Check, X, Sparkles, Camera, Upload, User, PartyPopper, Rocket, Share2, DollarSign, BarChart3, Star, Heart, Trophy } from "lucide-react";

interface WelcomeFlowProps {
  isOpen: boolean;
  onComplete: () => void;
  onSkip?: () => void;
  userName?: string;
  isFirstLogin?: boolean;
}

type WelcomeStep =
  | "celebration"
  | "artist_type"
  | "genres"
  | "goals"
  | "profile_basics"
  | "avatar"
  | "social_connect"
  | "complete";

interface WelcomeData {
  artistType: string;
  genres: string[];
  goals: string[];
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  socialLinks: {
    instagram?: string;
    twitter?: string;
    youtube?: string;
  };
}

const ARTIST_TYPES = [
  {
    id: "solo",
    label: "Solo Artist",
    description: "Independent musician or singer",
    icon: Mic2,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "band",
    label: "Band/Group",
    description: "Part of a musical group",
    icon: Users,
    color: "from-purple-500 to-pink-500",
  },
  {
    id: "producer",
    label: "Producer/Beatmaker",
    description: "Creating beats and instrumentals",
    icon: Headphones,
    color: "from-orange-500 to-red-500",
  },
  {
    id: "label",
    label: "Record Label",
    description: "Managing multiple artists",
    icon: Building2,
    color: "from-green-500 to-teal-500",
  },
];

const GENRES = [
  { id: "hip-hop", label: "Hip-Hop/Rap", icon: Mic2 },
  { id: "pop", label: "Pop", icon: Music },
  { id: "rock", label: "Rock", icon: Guitar },
  { id: "electronic", label: "Electronic/EDM", icon: Headphones },
  { id: "rnb", label: "R&B/Soul", icon: Heart },
  { id: "indie", label: "Indie", icon: Music },
  { id: "jazz", label: "Jazz", icon: Music },
  { id: "country", label: "Country", icon: Guitar },
  { id: "latin", label: "Latin", icon: Music },
  { id: "classical", label: "Classical", icon: Music },
];

const GOALS = [
  { id: "produce", label: "Create music in the studio", icon: Mic2 },
  { id: "distribute", label: "Release to streaming platforms", icon: Share2 },
  { id: "social", label: "Grow social media presence", icon: Users },
  { id: "sell", label: "Sell beats/samples", icon: DollarSign },
  { id: "analytics", label: "Track performance analytics", icon: BarChart3 },
  { id: "collaborate", label: "Find collaborators", icon: Users },
];

const STEP_ORDER: WelcomeStep[] = [
  "celebration",
  "artist_type",
  "genres",
  "goals",
  "profile_basics",
  "avatar",
  "complete",
];

export default function WelcomeFlow({
  isOpen,
  onComplete,
  onSkip,
  userName,
  isFirstLogin = true,
}: WelcomeFlowProps) {
  const [currentStep, setCurrentStep] = useState<WelcomeStep>("celebration");
  const [data, setData] = useState<WelcomeData>({
    artistType: "",
    genres: [],
    goals: [],
    displayName: userName || "",
    bio: "",
    avatarUrl: null,
    socialLinks: {},
  });
  const [confetti, setConfetti] = useState<
    Array<{ id: number; x: number; color: string }>
  >([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const stepIndex = STEP_ORDER.indexOf(currentStep);
  const progress = ((stepIndex + 1) / STEP_ORDER.length) * 100;
  const isFirstStep = stepIndex === 0;
  const isLastStep = currentStep === "complete";

  useEffect(() => {
    if (isOpen && currentStep === "celebration") {
      const pieces = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        color: ["#3B82F6", "#8B5CF6", "#EC4899", "#10B981", "#F59E0B"][
          Math.floor(Math.random() * 5)
        ],
      }));
      setConfetti(pieces);
    }
  }, [isOpen, currentStep]);

  const completeMutation = useMutation({
    mutationFn: async (welcomeData: WelcomeData) => {
      const response = await apiRequest(
        "POST",
        "/api/onboarding/complete-welcome",
        {
          displayName: welcomeData.displayName,
          bio: welcomeData.bio,
          avatarUrl: welcomeData.avatarUrl,
          genres: welcomeData.genres,
          interests: welcomeData.goals,
          artistType: welcomeData.artistType,
        },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/onboarding/progress"] });
      toast({
        title: "🎉 Welcome aboard!",
        description: "Your profile is set up and ready to go.",
        variant: "success",
      });
      onComplete();
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const goToStep = useCallback((step: WelcomeStep) => {
    setCurrentStep(step);
    announce(`Step: ${step.replace("_", " ")}`);
  }, []);

  const handleNext = useCallback(() => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      goToStep(STEP_ORDER[nextIndex]);
    }
  }, [stepIndex, goToStep]);

  const handleBack = useCallback(() => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEP_ORDER[prevIndex]);
    }
  }, [stepIndex, goToStep]);

  const handleComplete = useCallback(() => {
    completeMutation.mutate(data);
  }, [completeMutation, data]);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case "celebration":
        return true;
      case "artist_type":
        return data.artistType !== "";
      case "genres":
        return data.genres.length > 0;
      case "goals":
        return data.goals.length > 0;
      case "profile_basics":
        return data.displayName.trim().length > 0;
      case "avatar":
        return true;
      case "social_connect":
        return true;
      case "complete":
        return true;
      default:
        return false;
    }
  }, [currentStep, data]);

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || avatarUploading) return;

    const localUrl = createLocalPreview(file);
    setAvatarPreview(localUrl);
    setAvatarUploading(true);

    try {
      const serverUrl = await uploadImageFile(
        file,
        "/api/auth/avatar",
        "avatar",
      );
      setData((prev) => ({ ...prev, avatarUrl: serverUrl }));
      toast({ title: "Photo uploaded!" });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setAvatarPreview(null);
      setData((prev) => ({ ...prev, avatarUrl: null }));
    } finally {
      revokeLocalPreview(localUrl);
      setAvatarUploading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "celebration":
        return (
          <motion.div
            className="text-center space-y-6 py-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="relative">
              <motion.div
                className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <PartyPopper className="w-12 h-12 text-white" />
              </motion.div>
              <motion.div
                className="absolute -top-2 -right-2"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Sparkles className="w-8 h-8 text-yellow-400" />
              </motion.div>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Welcome{userName ? `, ${userName}` : ""}! 🎉
              </h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                {isFirstLogin
                  ? "You're now part of the Max Booster community. Let's set up your profile to unlock your full potential."
                  : "Let's complete your profile to get the most out of Max Booster."}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {["AI Studio", "Distribution", "Marketing", "Analytics"].map(
                (feature, i) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                  >
                    <Badge variant="secondary" className="text-sm py-1 px-3">
                      {feature}
                    </Badge>
                  </motion.div>
                ),
              )}
            </div>
          </motion.div>
        );

      case "artist_type":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Who are you?</h2>
              <p className="text-muted-foreground">
                This helps us personalize your experience
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ARTIST_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = data.artistType === type.id;
                return (
                  <motion.button
                    key={type.id}
                    onClick={() =>
                      setData((prev) => ({ ...prev, artistType: type.id }))
                    }
                    className={cn(
                      "relative p-4 rounded-xl border-2 text-left transition-all overflow-hidden",
                      isSelected
                        ? "border-blue-500 shadow-lg"
                        : "border-border hover:border-blue-300",
                    )}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isSelected && (
                      <div
                        className={cn(
                          "absolute inset-0 opacity-10 bg-gradient-to-br",
                          type.color,
                        )}
                      />
                    )}
                    <div className="relative flex items-start gap-3">
                      <div
                        className={cn(
                          "p-2 rounded-lg bg-gradient-to-br text-white",
                          isSelected ? type.color : "from-gray-400 to-gray-500",
                        )}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{type.label}</span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-blue-500" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {type.description}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>
        );

      case "genres":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">
                What genres do you make?
              </h2>
              <p className="text-muted-foreground">Select all that apply</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {GENRES.map((genre) => {
                const Icon = genre.icon;
                const isSelected = data.genres.includes(genre.id);
                return (
                  <button
                    key={genre.id}
                    onClick={() => {
                      setData((prev) => ({
                        ...prev,
                        genres: isSelected
                          ? prev.genres.filter((g) => g !== genre.id)
                          : [...prev.genres, genre.id],
                      }));
                    }}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                        : "border-border hover:border-blue-300",
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4",
                        isSelected ? "text-blue-500" : "text-muted-foreground",
                      )}
                    />
                    <span className="text-sm font-medium">{genre.label}</span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-500 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>

            {data.genres.length > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {data.genres.length} genre{data.genres.length > 1 ? "s" : ""}{" "}
                selected
              </p>
            )}
          </div>
        );

      case "goals":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">What are your goals?</h2>
              <p className="text-muted-foreground">
                We'll customize your dashboard
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {GOALS.map((goal) => {
                const Icon = goal.icon;
                const isSelected = data.goals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    onClick={() => {
                      setData((prev) => ({
                        ...prev,
                        goals: isSelected
                          ? prev.goals.filter((g) => g !== goal.id)
                          : [...prev.goals, goal.id],
                      }));
                    }}
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left",
                      isSelected
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30"
                        : "border-border hover:border-purple-300",
                    )}
                  >
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        isSelected ? "bg-purple-500 text-white" : "bg-muted",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-medium flex-1">{goal.label}</span>
                    <div
                      className={cn(
                        "w-5 h-5 rounded border-2 flex items-center justify-center",
                        isSelected
                          ? "border-purple-500 bg-purple-500"
                          : "border-border",
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case "profile_basics":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Your Profile</h2>
              <p className="text-muted-foreground">How should fans know you?</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  value={data.displayName}
                  onChange={(e) =>
                    setData((prev) => ({
                      ...prev,
                      displayName: e.target.value,
                    }))
                  }
                  placeholder="Your artist or stage name"
                  className="text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio (optional)</Label>
                <Textarea
                  id="bio"
                  value={data.bio}
                  onChange={(e) =>
                    setData((prev) => ({ ...prev, bio: e.target.value }))
                  }
                  placeholder="Tell fans about yourself and your music..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  {data.bio.length}/500 characters
                </p>
              </div>
            </div>
          </div>
        );

      case "avatar":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Add a Profile Photo</h2>
              <p className="text-muted-foreground">Help fans recognize you</p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <Avatar className="w-32 h-32 border-4 border-border">
                  <AvatarImage
                    src={avatarPreview || data.avatarUrl || undefined}
                  />
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {data.displayName?.[0]?.toUpperCase() || (
                      <User className="w-12 h-12" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <label
                  className={cn(
                    "absolute bottom-0 right-0 p-2 rounded-full text-white transition-colors cursor-pointer",
                    avatarUploading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-500 hover:bg-blue-600",
                  )}
                >
                  <Camera className="w-5 h-5" />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                    className="hidden"
                  />
                </label>
              </div>

              <label>
                <Button variant="outline" disabled={avatarUploading} asChild>
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    {avatarUploading
                      ? "Uploading…"
                      : data.avatarUrl
                        ? "Change Photo"
                        : "Upload Photo"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarUpload}
                      disabled={avatarUploading}
                      className="hidden"
                    />
                  </span>
                </Button>
              </label>

              {data.avatarUrl && !avatarUploading && (
                <p className="text-sm text-green-600 font-medium">
                  ✓ Photo saved to your profile
                </p>
              )}

              <p className="text-sm text-muted-foreground text-center">
                You can skip this and add a photo later
              </p>
            </div>
          </div>
        );

      case "complete":
        return (
          <motion.div
            className="text-center space-y-6 py-8"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <motion.div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: 0.2 }}
            >
              <Trophy className="w-10 h-10 text-white" />
            </motion.div>

            <div className="space-y-3">
              <h2 className="text-3xl font-bold text-green-600">
                You're All Set! 🚀
              </h2>
              <p className="text-lg text-muted-foreground max-w-md mx-auto">
                Your profile is complete. You're ready to start your journey
                with Max Booster.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-4">
              <Badge className="bg-yellow-500 text-yellow-900 text-sm py-1 px-3">
                <Star className="w-4 h-4 mr-1" />
                +100 XP Earned
              </Badge>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mt-6">
              <p className="font-medium mb-2">What's next?</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Badge variant="outline">Explore Studio</Badge>
                <Badge variant="outline">Upload Music</Badge>
                <Badge variant="outline">Connect Social</Badge>
              </div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onSkip?.()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden p-0">
        <div className="relative overflow-hidden">
          {currentStep === "celebration" && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {confetti.map((piece) => (
                <motion.div
                  key={piece.id}
                  className="absolute w-2 h-2 rounded-full"
                  style={{ backgroundColor: piece.color, left: `${piece.x}%` }}
                  initial={{ top: "-5%", rotate: 0, opacity: 1 }}
                  animate={{ top: "110%", rotate: 720, opacity: 0 }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    delay: Math.random(),
                  }}
                />
              ))}
            </div>
          )}

          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm text-muted-foreground">
                  Step {stepIndex + 1} of {STEP_ORDER.length}
                </p>
              </div>
              {onSkip && currentStep !== "complete" && (
                <Button variant="ghost" size="sm" onClick={onSkip}>
                  <X className="w-4 h-4 mr-1" />
                  Skip
                </Button>
              )}
            </div>

            <Progress value={progress} className="h-2 mb-6" />

            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {renderStep()}
              </motion.div>
            </AnimatePresence>

            <div className="flex items-center justify-between pt-6 border-t mt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isFirstStep}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              {isLastStep ? (
                <Button
                  onClick={handleComplete}
                  disabled={completeMutation.isPending}
                  className="min-w-[140px] bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                >
                  {completeMutation.isPending ? (
                    "Finishing..."
                  ) : (
                    <>
                      Let's Go!
                      <Rocket className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={!canProceed()}>
                  {currentStep === "celebration" ? "Get Started" : "Next"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useWelcomeFlow() {
  const [isOpen, setIsOpen] = useState(false);

  const { data: loginStatus } = useQuery<{
    isFirstLogin: boolean;
    showWelcomeWizard: boolean;
  }>({
    queryKey: ["/api/onboarding/check-first-login"],
    staleTime: 60000,
  });

  useEffect(() => {
    if (loginStatus?.showWelcomeWizard) {
      setIsOpen(true);
    }
  }, [loginStatus]);

  const openWelcome = useCallback(() => setIsOpen(true), []);
  const closeWelcome = useCallback(() => setIsOpen(false), []);

  return {
    isOpen,
    shouldShow: loginStatus?.showWelcomeWizard ?? false,
    openWelcome,
    closeWelcome,
  };
}
