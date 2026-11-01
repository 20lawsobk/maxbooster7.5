// @ts-nocheck
import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { announce } from "@/lib/accessibility";
import { cn } from "@/lib/utils";
import {
  Music,
  Mic2,
  Guitar,
  Drum,
  Piano,
  Radio,
  Headphones,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Sparkles,
  Camera,
  Upload,
  User,
  Clock,
  Crop,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

interface WelcomeWizardProps {
  isOpen: boolean;
  onComplete: (data: WelcomeData) => void;
  onSkip: () => void;
  isFirstLogin?: boolean;
}

interface WelcomeData {
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  genres: string[];
  interests: string[];
  artistType: string;
}

const GENRES = [
  { id: "hip-hop", label: "Hip-Hop/Rap", icon: Mic2 },
  { id: "pop", label: "Pop", icon: Music },
  { id: "rock", label: "Rock", icon: Guitar },
  { id: "electronic", label: "Electronic/EDM", icon: Headphones },
  { id: "rnb", label: "R&B/Soul", icon: Radio },
  { id: "jazz", label: "Jazz", icon: Piano },
  { id: "classical", label: "Classical", icon: Piano },
  { id: "country", label: "Country", icon: Guitar },
  { id: "latin", label: "Latin", icon: Drum },
  { id: "reggae", label: "Reggae", icon: Drum },
  { id: "metal", label: "Metal", icon: Guitar },
  { id: "indie", label: "Indie", icon: Music },
];

const INTERESTS = [
  { id: "production", label: "Music Production" },
  { id: "distribution", label: "Distribution" },
  { id: "marketing", label: "Marketing & Promotion" },
  { id: "analytics", label: "Analytics & Insights" },
  { id: "collaboration", label: "Collaboration" },
  { id: "licensing", label: "Licensing & Sync" },
  { id: "selling", label: "Selling Beats" },
  { id: "streaming", label: "Streaming Optimization" },
];

const ARTIST_TYPES = [
  {
    id: "solo",
    label: "Solo Artist",
    description: "Independent musician creating my own music",
  },
  {
    id: "producer",
    label: "Producer/Beatmaker",
    description: "Creating beats and instrumentals",
  },
  { id: "band", label: "Band/Group", description: "Part of a musical group" },
  {
    id: "label",
    label: "Label/Manager",
    description: "Managing artists and releases",
  },
  { id: "hobbyist", label: "Hobbyist", description: "Making music for fun" },
];

export default function WelcomeWizard({
  isOpen,
  onComplete,
  onSkip,
  isFirstLogin = true,
}: WelcomeWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WelcomeData>({
    displayName: "",
    bio: "",
    avatarUrl: null,
    genres: [],
    interests: [],
    artistType: "",
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [cropScale, setCropScale] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const steps = [
    { id: "welcome", title: "Welcome", description: "Get started" },
    { id: "profile", title: "Profile", description: "Tell us about you" },
    { id: "avatar", title: "Avatar", description: "Add a photo" },
    { id: "genres", title: "Genres", description: "Your music style" },
    { id: "interests", title: "Interests", description: "What you want to do" },
  ];

  const progress = ((currentStep + 1) / (steps.length || 1)) * 100;

  const completeMutation = useMutation({
    mutationFn: async (welcomeData: WelcomeData) => {
      const response = await apiRequest(
        "POST",
        "/api/onboarding/complete-welcome",
        welcomeData,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "🎉 Profile Complete!",
        description: "You're all set to start your music journey.",
        variant: "success",
      });
      onComplete(data);
    },
    onError: (error: Error) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
      announce(
        `Step ${currentStep + 2} of ${steps.length}: ${steps[currentStep + 1].title}`,
      );
    } else {
      completeMutation.mutate(data);
    }
  }, [currentStep, steps, data, completeMutation]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      announce(
        `Step ${currentStep} of ${steps.length}: ${steps[currentStep - 1].title}`,
      );
    }
  }, [currentStep, steps]);

  const handleSkip = useCallback(() => {
    toast({
      title: "Complete Later",
      description: "You can finish your profile setup from Settings anytime.",
      action: (
        <Button variant="outline" size="sm" onClick={() => onSkip()}>
          <Clock className="w-4 h-4 mr-1" />
          Remind Me
        </Button>
      ),
    });
    onSkip();
  }, [onSkip, toast]);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files[0];
    if (!file || avatarUploading) return;
    const previewUrl = createLocalPreview(file);
    setAvatarPreview(previewUrl);
    setAvatarFile(file);
    setShowCropDialog(true);
  };

  const handleCropConfirm = async () => {
    if (!avatarFile || avatarUploading) return;
    setAvatarUploading(true);
    try {
      const serverUrl = await uploadImageFile(
        avatarFile,
        "/api/auth/avatar",
        "avatar",
      );
      setData((prev) => ({ ...prev, avatarUrl: serverUrl }));
      setShowCropDialog(false);
      toast({
        title: "Avatar Updated",
        description: "Your profile picture has been saved.",
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (avatarPreview) revokeLocalPreview(avatarPreview);
      setAvatarPreview(null);
      setAvatarFile(null);
      setAvatarUploading(false);
    }
  };

  const toggleGenre = (genreId: string) => {
    setData((prev) => ({
      ...prev,
      genres: prev.genres.includes(genreId)
        ? prev.genres.filter((g) => g !== genreId)
        : [...prev.genres, genreId],
    }));
  };

  const toggleInterest = (interestId: string) => {
    setData((prev) => ({
      ...prev,
      interests: prev.interests.includes(interestId)
        ? prev.interests.filter((i) => i !== interestId)
        : [...prev.interests, interestId],
    }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return true;
      case 1:
        return data.displayName.trim().length > 0 && data.artistType !== "";
      case 2:
        return true;
      case 3:
        return data.genres.length > 0;
      case 4:
        return data.interests.length > 0;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="text-center space-y-6 py-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Welcome to Max Booster!
              </h2>
              <p className="text-muted-foreground text-lg max-w-md mx-auto">
                {isFirstLogin
                  ? "Let's set up your profile to personalize your experience"
                  : "Complete your profile to unlock all features"}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 pt-4">
              {["AI Studio", "Distribution", "Analytics", "Marketing"].map(
                (feature) => (
                  <Badge
                    key={feature}
                    variant="secondary"
                    className="text-sm py-1 px-3"
                  >
                    {feature}
                  </Badge>
                ),
              )}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Tell us about yourself</h2>
              <p className="text-muted-foreground">
                This helps us personalize your experience
              </p>
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
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label>What describes you best? *</Label>
                <div className="grid grid-cols-1 gap-2">
                  {ARTIST_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() =>
                        setData((prev) => ({ ...prev, artistType: type.id }))
                      }
                      className={cn(
                        "p-3 rounded-lg border-2 text-left transition-all",
                        data.artistType === type.id
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                          : "border-border hover:border-blue-300",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{type.label}</p>
                          <p className="text-sm text-muted-foreground">
                            {type.description}
                          </p>
                        </div>
                        {data.artistType === type.id && (
                          <Check className="w-5 h-5 text-blue-500" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">Add a profile photo</h2>
              <p className="text-muted-foreground">Help fans recognize you</p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <Avatar className="w-32 h-32 border-4 border-border">
                  <AvatarImage src={data.avatarUrl || undefined} />
                  <AvatarFallback className="text-4xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                    {data.displayName?.[0]?.toUpperCase() || (
                      <User className="w-12 h-12" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="absolute bottom-0 right-0 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
                className="hidden"
              />

              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                <Upload className="w-4 h-4 mr-2" />
                {avatarUploading
                  ? "Uploading…"
                  : data.avatarUrl
                    ? "Change Photo"
                    : "Upload Photo"}
              </Button>

              {data.avatarUrl && !avatarUploading && (
                <p className="text-sm text-green-600 font-medium">
                  ✓ Photo saved to your profile
                </p>
              )}

              <p className="text-sm text-muted-foreground text-center">
                You can skip this step and add a photo later
              </p>
            </div>
          </div>
        );

      case 3:
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
                    onClick={() => toggleGenre(genre.id)}
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
              <div className="text-center text-sm text-muted-foreground">
                {data.genres.length} genre{data.genres.length > 1 ? "s" : ""}{" "}
                selected
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-semibold">
                What do you want to do?
              </h2>
              <p className="text-muted-foreground">
                We'll customize your dashboard
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {INTERESTS.map((interest) => {
                const isSelected = data.interests.includes(interest.id);
                return (
                  <button
                    key={interest.id}
                    onClick={() => toggleInterest(interest.id)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30"
                        : "border-border hover:border-purple-300",
                    )}
                  >
                    <span className="font-medium">{interest.label}</span>
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

            {data.interests.length > 0 && (
              <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-lg p-4 text-center">
                <p className="text-sm font-medium">
                  Your dashboard will be optimized for {data.interests.length}{" "}
                  area{data.interests.length > 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => handleSkip()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">
                {steps[currentStep].title}
              </DialogTitle>
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                <X className="w-4 h-4 mr-1" />
                Skip
              </Button>
            </div>
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Step {currentStep + 1} of {steps.length}
                </span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
              <div className="flex gap-1">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={cn(
                      "flex-1 h-1 rounded-full transition-colors",
                      index <= currentStep ? "bg-blue-500" : "bg-muted",
                    )}
                  />
                ))}
              </div>
            </div>
          </DialogHeader>

          <div className="py-4">{renderStep()}</div>

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <Button
              onClick={handleNext}
              disabled={!canProceed() || completeMutation.isPending}
              className="min-w-[120px]"
            >
              {completeMutation.isPending ? (
                "Saving..."
              ) : currentStep === steps.length - 1 ? (
                <>
                  Complete
                  <Sparkles className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crop className="w-5 h-5" />
              Adjust Photo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${cropScale}) translate(${cropPosition.x}px, ${cropPosition.y}px)`,
                  }}
                />
              )}
              <div className="absolute inset-0 border-4 border-white/50 rounded-full pointer-events-none m-4" />
            </div>

            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCropScale((s) => Math.max(0.5, s - 0.1))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <div className="flex-1 text-center text-sm text-muted-foreground">
                {Math.round(cropScale * 100)}%
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCropScale((s) => Math.min(2, s + 0.1))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCropScale(1);
                  setCropPosition({ x: 0, y: 0 });
                }}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (avatarPreview) revokeLocalPreview(avatarPreview);
                  setAvatarPreview(null);
                  setAvatarFile(null);
                  setShowCropDialog(false);
                }}
                disabled={avatarUploading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCropConfirm}
                disabled={avatarUploading}
              >
                {avatarUploading ? (
                  "Uploading…"
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Save Photo
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
