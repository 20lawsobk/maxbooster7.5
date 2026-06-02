import React, { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import {
  User,
  Users,
  Mic2,
  Building2,
  Disc,
  PenTool,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Sparkles,
  Music,
  Upload,
  BarChart3,
  DollarSign,
  Target,
  Zap,
  Settings,
  Globe,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ArtistType =
  | "solo"
  | "band"
  | "producer"
  | "label"
  | "dj"
  | "songwriter";
export type CareerStage =
  | "emerging"
  | "developing"
  | "established"
  | "professional";

interface SmartDefaultsProps {
  onComplete?: (settings: SmartDefaultsResult) => void;
  onSkip?: () => void;
  initialStep?: number;
  showSkip?: boolean;
}

interface SmartDefaultsResult {
  artistType: ArtistType;
  careerStage: CareerStage;
  primaryGoals: string[];
  genres: string[];
  enabledFeatures: string[];
}

interface ArtistTypeOption {
  id: ArtistType;
  label: string;
  description: string;
  icon: React.ElementType;
  defaultFeatures: string[];
  color: string;
}

interface CareerStageOption {
  id: CareerStage;
  label: string;
  description: string;
  icon: React.ElementType;
}

interface GoalOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  forArtistTypes: ArtistType[];
}

const artistTypeOptions: ArtistTypeOption[] = [
  {
    id: "solo",
    label: "Solo Artist",
    description:
      "Focus on distribution, social media, and growing your fanbase",
    icon: User,
    defaultFeatures: ["distribution", "social-media", "analytics", "ai-coach"],
    color: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
  },
  {
    id: "band",
    label: "Band / Group",
    description: "Collaborate with bandmates and manage shared projects",
    icon: Users,
    defaultFeatures: [
      "collaboration",
      "distribution",
      "splits",
      "tour-management",
    ],
    color: "border-purple-500 bg-purple-50 dark:bg-purple-950/30",
  },
  {
    id: "producer",
    label: "Producer",
    description: "Sell beats, manage licensing, and work with artists",
    icon: Mic2,
    defaultFeatures: ["marketplace", "studio", "licensing", "storefront"],
    color: "border-green-500 bg-green-50 dark:bg-green-950/30",
  },
  {
    id: "label",
    label: "Record Label",
    description: "Manage multiple artists, royalties, and distribution",
    icon: Building2,
    defaultFeatures: [
      "roster-management",
      "analytics",
      "contracts",
      "royalties",
    ],
    color: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
  },
  {
    id: "dj",
    label: "DJ",
    description: "Build your track library and promote events",
    icon: Disc,
    defaultFeatures: ["library", "events", "social-media", "mixes"],
    color: "border-pink-500 bg-pink-50 dark:bg-pink-950/30",
  },
  {
    id: "songwriter",
    label: "Songwriter",
    description: "Track publishing royalties and find sync opportunities",
    icon: PenTool,
    defaultFeatures: ["publishing", "sync", "collaboration", "royalties"],
    color: "border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30",
  },
];

const careerStageOptions: CareerStageOption[] = [
  {
    id: "emerging",
    label: "Emerging",
    description: "Just starting out, learning the ropes",
    icon: Sparkles,
  },
  {
    id: "developing",
    label: "Developing",
    description: "Building momentum, growing audience",
    icon: Target,
  },
  {
    id: "established",
    label: "Established",
    description: "Consistent releases, loyal fanbase",
    icon: CheckCircle,
  },
  {
    id: "professional",
    label: "Professional",
    description: "Full-time career, industry recognition",
    icon: Zap,
  },
];

const goalOptions: GoalOption[] = [
  {
    id: "grow-fanbase",
    label: "Grow My Fanbase",
    description: "Expand reach and gain new listeners",
    icon: Users,
    forArtistTypes: ["solo", "band", "dj"],
  },
  {
    id: "increase-revenue",
    label: "Increase Revenue",
    description: "Monetize music and earn more",
    icon: DollarSign,
    forArtistTypes: ["solo", "band", "producer", "label", "songwriter"],
  },
  {
    id: "release-music",
    label: "Release More Music",
    description: "Streamline distribution process",
    icon: Upload,
    forArtistTypes: ["solo", "band", "producer"],
  },
  {
    id: "sell-beats",
    label: "Sell More Beats",
    description: "Grow beat marketplace presence",
    icon: Music,
    forArtistTypes: ["producer"],
  },
  {
    id: "find-collaborators",
    label: "Find Collaborators",
    description: "Connect with other artists",
    icon: Users,
    forArtistTypes: ["solo", "producer", "songwriter"],
  },
  {
    id: "manage-artists",
    label: "Manage Artists",
    description: "Build and support your roster",
    icon: Building2,
    forArtistTypes: ["label"],
  },
  {
    id: "sync-placements",
    label: "Get Sync Placements",
    description: "License music for TV/film/ads",
    icon: Globe,
    forArtistTypes: ["solo", "songwriter", "producer"],
  },
  {
    id: "track-analytics",
    label: "Track Analytics",
    description: "Understand performance metrics",
    icon: BarChart3,
    forArtistTypes: ["solo", "band", "producer", "label"],
  },
  {
    id: "automate-social",
    label: "Automate Social Media",
    description: "Save time on content posting",
    icon: Clock,
    forArtistTypes: ["solo", "band", "dj", "producer"],
  },
];

const genreOptions = [
  "Hip-Hop",
  "Pop",
  "Electronic",
  "Rock",
  "R&B",
  "Country",
  "Jazz",
  "Classical",
  "Indie",
  "Metal",
  "Folk",
  "Reggae",
  "Latin",
  "Soul",
  "Funk",
  "Blues",
  "World",
  "Ambient",
];

export function SmartDefaults({
  onComplete,
  onSkip,
  initialStep = 0,
  showSkip = true,
}: SmartDefaultsProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [artistType, setArtistType] = useState<ArtistType | null>(null);
  const [careerStage, setCareerStage] = useState<CareerStage | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  const totalSteps = 4;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  const applyDefaultsMutation = useMutation({
    mutationFn: async (settings: SmartDefaultsResult) => {
      const response = await apiRequest(
        "PUT",
        "/api/personalization/defaults",
        settings,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/preferences"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/personalization/dashboard-layout"],
      });
    },
  });

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      const result: SmartDefaultsResult = {
        artistType: artistType!,
        careerStage: careerStage!,
        primaryGoals: selectedGoals,
        genres: selectedGenres,
        enabledFeatures:
          artistTypeOptions.find((o) => o.id === artistType)?.defaultFeatures ||
          [],
      };
      applyDefaultsMutation.mutate(result, {
        onSuccess: () => {
          onComplete?.(result);
        },
      });
    }
  }, [
    currentStep,
    artistType,
    careerStage,
    selectedGoals,
    selectedGenres,
    applyDefaultsMutation,
    onComplete,
  ]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return artistType !== null;
      case 1:
        return careerStage !== null;
      case 2:
        return selectedGoals.length > 0;
      case 3:
        return selectedGenres.length > 0;
      default:
        return false;
    }
  };

  const toggleGoal = (goalId: string) => {
    setSelectedGoals((prev) =>
      prev.includes(goalId)
        ? prev.filter((g) => g !== goalId)
        : [...prev, goalId],
    );
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre],
    );
  };

  const filteredGoals = goalOptions.filter(
    (goal) => !artistType || goal.forArtistTypes.includes(artistType),
  );

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Personalize Your Experience
          </h1>
          {showSkip && (
            <Button variant="ghost" onClick={onSkip}>
              Skip for now
            </Button>
          )}
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground mt-2">
          Step {currentStep + 1} of {totalSteps}
        </p>
      </div>

      <Card className="mb-6">
        {currentStep === 0 && (
          <>
            <CardHeader>
              <CardTitle>What best describes you?</CardTitle>
              <CardDescription>
                We'll customize your dashboard and features based on your role
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {artistTypeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = artistType === option.id;
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        "p-4 rounded-lg border-2 cursor-pointer transition-all",
                        isSelected
                          ? option.color + " border-2"
                          : "border-muted hover:border-primary/50",
                      )}
                      onClick={() => setArtistType(option.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg",
                            isSelected
                              ? "bg-white/80 dark:bg-black/30"
                              : "bg-muted",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{option.label}</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {option.description}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="h-5 w-5 text-primary ml-auto" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </>
        )}

        {currentStep === 1 && (
          <>
            <CardHeader>
              <CardTitle>Where are you in your career?</CardTitle>
              <CardDescription>
                This helps us suggest the right features and tutorials
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={careerStage || ""}
                onValueChange={(value) => setCareerStage(value as CareerStage)}
              >
                <div className="space-y-3">
                  {careerStageOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <div
                        key={option.id}
                        className={cn(
                          "flex items-center space-x-4 p-4 rounded-lg border-2 cursor-pointer transition-all",
                          careerStage === option.id
                            ? "border-primary bg-primary/5"
                            : "border-muted hover:border-primary/50",
                        )}
                        onClick={() => setCareerStage(option.id)}
                      >
                        <RadioGroupItem value={option.id} id={option.id} />
                        <div className="p-2 rounded-lg bg-muted">
                          <Icon className="h-5 w-5" />
                        </div>
                        <Label
                          htmlFor={option.id}
                          className="flex-1 cursor-pointer"
                        >
                          <span className="font-semibold">{option.label}</span>
                          <p className="text-sm text-muted-foreground">
                            {option.description}
                          </p>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              </RadioGroup>
            </CardContent>
          </>
        )}

        {currentStep === 2 && (
          <>
            <CardHeader>
              <CardTitle>What are your main goals?</CardTitle>
              <CardDescription>
                Select all that apply - we'll prioritize features accordingly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredGoals.map((goal) => {
                  const Icon = goal.icon;
                  const isSelected = selectedGoals.includes(goal.id);
                  return (
                    <div
                      key={goal.id}
                      className={cn(
                        "flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-all",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-muted hover:border-primary/50",
                      )}
                      onClick={() => toggleGoal(goal.id)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleGoal(goal.id)}
                      />
                      <div className="p-1.5 rounded bg-muted">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <span className="font-medium text-sm">
                          {goal.label}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {goal.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </>
        )}

        {currentStep === 3 && (
          <>
            <CardHeader>
              <CardTitle>What genres do you work with?</CardTitle>
              <CardDescription>
                Select your primary genres for better recommendations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {genreOptions.map((genre) => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <Badge
                      key={genre}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer transition-all text-sm py-1.5 px-3",
                        isSelected && "bg-primary",
                      )}
                      onClick={() => toggleGenre(genre)}
                    >
                      {genre}
                      {isSelected && <CheckCircle className="h-3 w-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
              {selectedGenres.length > 0 && (
                <p className="text-sm text-muted-foreground mt-4">
                  Selected: {selectedGenres.join(", ")}
                </p>
              )}
            </CardContent>
          </>
        )}

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button
            onClick={handleNext}
            disabled={!canProceed() || applyDefaultsMutation.isPending}
          >
            {currentStep === totalSteps - 1 ? (
              <>
                {applyDefaultsMutation.isPending
                  ? "Saving..."
                  : "Complete Setup"}
                <CheckCircle className="h-4 w-4 ml-2" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>

      {artistType && (
        <Card className="bg-muted/50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">
                Preview: Features we'll enable
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {artistTypeOptions
                .find((o) => o.id === artistType)
                ?.defaultFeatures.map((feature) => (
                  <Badge key={feature} variant="secondary" className="text-xs">
                    {feature.replace("-", " ")}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default SmartDefaults;
