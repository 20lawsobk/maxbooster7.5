import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequireSubscription } from "@/hooks/useRequireAuth";
import { useOnboardingProgress } from "@/hooks/useOnboardingProgress";

import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAnalyticsInvalidation } from "@/hooks/useAnalyticsInvalidation";
import { apiRequest, uploadWithProgress } from "@/lib/queryClient";
import { AutonomousDashboard } from "@/components/autonomous/autonomous-dashboard";
import { ContentAnalyzer } from "@/components/content/ContentAnalyzer";
import {
  VideoContentGenerator,
  type Platform as VideoPlatform,
} from "@/components/content/VideoContentGenerator";
import { ServerVideoGenerator } from "@/components/content/ServerVideoGenerator";
import {
  AIImageGenerator,
  type ImagePlatform,
} from "@/components/content/AIImageGenerator";
import { CreativeVariantGenerator, CreativeAutomation } from "@/components/advertising";
import { Target, TrendingUp, TrendingDown, Users, Play, Eye, MousePointerClick, Plus, Music, Tv, Zap, Brain, Rocket, Sparkles, Globe, CheckCircle, AlertTriangle, Lightbulb, Clock, Upload, X, Bot, RefreshCw, Layers, Network, PieChart, Timer, Radio, UserPlus, Copy, Search, Lock, Unlock, FileImage, Loader2, Trash2 } from "lucide-react";

interface PressKitPhoto {
  url: string;
  caption?: string;
}

interface PressKitSocialLinks {
  instagram?: string;
  twitter?: string;
  youtube?: string;
  facebook?: string;
  spotify?: string;
}

interface PressKitData {
  id?: string;
  artistName?: string;
  bio?: string;
  shortBio?: string;
  genres?: string[];
  contactEmail?: string;
  bookingEmail?: string;
  website?: string;
  socialLinks?: PressKitSocialLinks;
  photos?: PressKitPhoto[];
  technicalRider?: string;
  hospitalityRider?: string;
  isPublic?: boolean;
  slug?: string;
}

interface StorageUploadResponse {
  file: { url: string };
}

interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  impressions: number;
  clicks: number;
  conversions: number;
  status: "active" | "paused" | "completed";
  startDate: Date;
  endDate: Date;
  platforms: string[];
  connectedPlatforms?: {
    facebook: string;
    instagram: string;
    twitter: string;
    linkedin: string;
    tiktok: string;
    youtube: string;
    threads: string;
    googleBusiness: string;
  };
  personalAdNetwork?: {
    connectedAccounts: number;
    totalPlatforms: number;
    networkStrength: number;
    personalizedReach: string;
    organicAmplification: string;
  };
  aiOptimizations?: {
    performanceBoost: string;
    costReduction: string;
    viralityScore: number;
    algorithmicAdvantage: string;
    realTimeOptimization: boolean;
  };
}

interface SocialConnection {
  id: string;
  name: string;
  isConnected: boolean;
  followers: number;
  engagement: number;
  lastSync: string;
  status: string;
  username?: string;
}

type SocialConnections = SocialConnection[];

interface AutopilotStatus {
  isRunning: boolean;
  status: {
    activeCampaigns: number;
    performanceMetrics?: {
      conversions: number;
      reach: number;
      engagement: number;
      revenue: number;
    };
    recentActions?: Array<{
      action: string;
      campaign: string;
      status: string;
      timestamp?: string;
    }>;
  };
  config: {
    campaignMode?: string;
    objective?: string;
    targetAudience?: {
      ageMin: number;
      ageMax: number;
      interests: string[];
      locations: string[];
    };
    optimizationSettings?: {
      viralOptimization: boolean;
      algorithmicTargeting: boolean;
    };
  };
}

interface AIInsights {
  recommendations: Array<{
    title: string;
    description: string;
    impact: "high" | "medium" | "low";
    category: string;
  }>;
  performancePredictions?: {
    expectedReach: number;
    expectedEngagement: number;
    viralPotential: number;
  };
  audienceInsights?: {
    topInterests: string[];
    bestPostingTimes: string[];
    optimalPlatforms: string[];
  };
}

interface AudienceSegment {
  id: string;
  name: string;
  size: number;
  overlapPercentage: number;
}

interface CreativeFatigueData {
  id: string;
  creativeName: string;
  daysActive: number;
  initialCTR: number;
  currentCTR: number;
  fatigueLevel: "low" | "medium" | "high" | "critical";
  frequency: number;
  recommendation: string;
}

interface LookalikeAudience {
  id: string;
  name: string;
  sourceAudience: string;
  similarityScore: number;
  estimatedSize: number;
  expansionLevel: 1 | 2 | 3 | 4 | 5;
  status: "active" | "paused" | "pending";
}

interface ForecastData {
  id: string;
  campaignName: string;
  currentConversions: number;
  projectedConversions: number;
  confidence: number;
  trend: "up" | "down" | "stable";
  recommendations: string[];
}

interface CompetitorInsight {
  id: string;
  competitorName: string;
  topCreativeFormats: string[];
  targetingFocus: string[];
  adFrequency: string;
  shareOfVoice: number;
  lastSeen: string;
}

export default function Advertisement() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { invalidateOnCampaignChange } = useAnalyticsInvalidation();
  const { trackZeroCostAdvertisingExplored } = useOnboardingProgress();
  const advertisingExploredRef = useRef(false);

  const handleTrackAdvertisingExplored = () => {
    if (!advertisingExploredRef.current) {
      advertisingExploredRef.current = true;
      trackZeroCostAdvertisingExplored();
    }
  };

  const { data: audienceSegmentsData } = useQuery<{
    segments: AudienceSegment[];
  }>({
    queryKey: ["/api/advertising/audience-segments"],
    enabled: !!user,
  });
  const { data: creativeFatigueData } = useQuery<{
    creatives: CreativeFatigueData[];
  }>({
    queryKey: ["/api/advertising/creative-fatigue"],
    enabled: !!user,
  });
  const { data: lookalikeAudiencesData } = useQuery<{
    audiences: LookalikeAudience[];
  }>({
    queryKey: ["/api/advertising/lookalike-audiences"],
    enabled: !!user,
  });
  const { data: forecastsData } = useQuery<{ forecasts: ForecastData[] }>({
    queryKey: ["/api/advertising/forecasts"],
    enabled: !!user,
  });
  const { data: competitorInsightsData } = useQuery<{
    insights: CompetitorInsight[];
  }>({
    queryKey: ["/api/advertising/competitor-insights"],
    enabled: !!user,
  });

  const { data: organicMetrics } = useQuery<{
    reach?: number;
    impressions?: number;
    impressionsChange?: number;
    engagement?: number;
    engagementRate?: number;
    viralScore?: number;
  }>({
    queryKey: ["/api/organic/metrics"],
    enabled: !!user,
  });

  const { data: aiRecommendationsData } = useQuery<{
    recommendations?: Array<{
      title: string;
      description: string;
      impact: string;
      category: string;
    }>;
  }>({
    queryKey: ["/api/organic/recommendations"],
    enabled: !!user,
  });
  const aiRecommendations = aiRecommendationsData?.recommendations ?? [];

  const audienceSegments: AudienceSegment[] = Array.isArray(
    audienceSegmentsData,
  )
    ? audienceSegmentsData
    : audienceSegmentsData?.segments || [];
  const creativeFatigue: CreativeFatigueData[] = Array.isArray(
    creativeFatigueData,
  )
    ? creativeFatigueData
    : creativeFatigueData?.creatives || [];
  const lookalikeAudiences: LookalikeAudience[] = Array.isArray(
    lookalikeAudiencesData,
  )
    ? lookalikeAudiencesData
    : lookalikeAudiencesData?.audiences || [];
  Array.isArray(forecastsData)
    ? forecastsData
    : forecastsData?.forecasts || [];
  Array.isArray(
    competitorInsightsData,
  )
    ? competitorInsightsData
    : competitorInsightsData?.insights || [];

  const [isCreateCampaignOpen, setIsCreateCampaignOpenState] = useState(false);
  const [, setActiveEnterpriseTabState] = useState(
    "creative-automation",
  );

  const setIsCreateCampaignOpen = (open: boolean) => {
    setIsCreateCampaignOpenState(open);
    if (open) {
      handleTrackAdvertisingExplored();
    }
  };

  ((tab: string) => {
    setActiveEnterpriseTabState(tab);
    handleTrackAdvertisingExplored();
  });
  const [videoPlatform, setVideoPlatform] =
    useState<VideoPlatform>("instagram");
  const [adCreativePlatform, setAdCreativePlatform] =
    useState<ImagePlatform>("instagram");
  const [adCreativeTab, setAdCreativeTab] = useState<
    "video-ai" | "video-browser" | "image"
  >("video-ai");
  const [generatedVideos, setGeneratedVideos] = useState<
    Array<{ url: string; blob: Blob; createdAt: Date }>
  >([]);
  const [generatedAdImages, setGeneratedAdImages] = useState<
    Array<{ url: string; createdAt: Date }>
  >([]);
  const [adVideoTopic, setAdVideoTopic] = useState("");
  const [adImageTopic, setAdImageTopic] = useState("");
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    objective: "",
    duration: 7,
    targetAudience: {
      ageMin: 18,
      ageMax: 65,
      interests: [] as string[],
      locations: [] as string[],
      platforms: [] as string[],
    },
  });
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lookalikeSourceType, setLookalikeSourceType] = useState("top-engaged");
  const [lookalikeExpansionLevel, setLookalikeExpansionLevel] = useState(2);

  const { data: campaigns = [] } = useQuery<
    AdCampaign[]
  >({
    queryKey: ["/api/advertising/campaigns"],
    enabled: !!user,
  });

  useQuery<AIInsights>(
    {
      queryKey: ["/api/advertising/ai-insights"],
      enabled: !!user,
    },
  );

  const { data: socialConnections } =
    useQuery<SocialConnections>({
      queryKey: ["/api/social/platform-status"],
      enabled: !!user,
    });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      return uploadWithProgress("/api/advertising/upload-image", formData, {
        timeout: 300000, // 5 minutes
      }) as Promise<{ url?: string; fileUrl?: string }>;
    },
    onSuccess: (data) => {
      // Replace the temporary blob URL with the permanent server URL and free memory
      const serverUrl =
        (data as { url?: string; fileUrl?: string })?.url ??
        (data as { url?: string; fileUrl?: string })?.fileUrl;
      if (serverUrl) {
        setImagePreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return serverUrl;
        });
      }
      toast({
        title: "Image Uploaded!",
        description: "Your campaign image has been uploaded successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description:
          error.message || "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createLookalikeMutation = useMutation({
    mutationFn: async (data: {
      sourceAudienceType: string;
      expansionLevel: number;
    }) => {
      const response = await apiRequest(
        "POST",
        "/api/advertising/lookalike-audiences",
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Lookalike Audience Created",
        description: "Your new lookalike audience is being built.",
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/advertising/lookalike-audiences"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create lookalike audience",
        variant: "destructive",
      });
    },
  });

  const updateAudienceStatusMutation = useMutation({
    mutationFn: async ({
      audienceId,
      status,
    }: {
      audienceId: string;
      status: "active" | "paused";
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/advertising/lookalike-audiences/${audienceId}`,
        { status },
      );
      return response.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title:
          vars.status === "active" ? "Audience Activated" : "Audience Paused",
        description: `Lookalike audience has been ${vars.status === "active" ? "activated" : "paused"}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/advertising/lookalike-audiences"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update audience status",
        variant: "destructive",
      });
    },
  });

  const updateCreativeStatusMutation = useMutation({
    mutationFn: async ({
      creativeId,
      action,
    }: {
      creativeId: string;
      action: "refresh" | "pause";
    }) => {
      const response = await apiRequest(
        "PATCH",
        `/api/advertising/creatives/${creativeId}`,
        { action },
      );
      return response.json();
    },
    onSuccess: (_, vars) => {
      toast({
        title:
          vars.action === "refresh" ? "Creative Refreshed" : "Creative Paused",
        description: `Creative has been ${vars.action === "refresh" ? "refreshed to reduce fatigue" : "paused"}.`,
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/advertising/creative-fatigue"],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update creative",
        variant: "destructive",
      });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (campaignData: unknown) => {
      const response = await apiRequest(
        "POST",
        "/api/advertising/campaigns",
        campaignData,
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Created",
        description:
          "Your revolutionary AI advertising campaign has been activated successfully.",
      });
      setIsCreateCampaignOpen(false);
      setCampaignForm({
        name: "",
        objective: "",
        duration: 7,
        targetAudience: {
          ageMin: 18,
          ageMax: 65,
          interests: [],
          locations: [],
          platforms: [],
        },
      });
      setUploadedImage(null);
      setImagePreviewUrl(null);
      queryClient.invalidateQueries({
        queryKey: ["/api/advertising/campaigns"],
      });
      invalidateOnCampaignChange();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Campaign",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useQuery<AutopilotStatus>({
      queryKey: ["/api/autopilot/status"],
      enabled: !!user,
      refetchInterval: 30000,
      meta: { silentError: true },
    });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your campaigns…</p>
        </div>
      </div>
    );
  }

  const adObjectives = [
    { value: "awareness", label: "Brand Awareness", icon: Eye },
    { value: "traffic", label: "Drive Traffic", icon: MousePointerClick },
    { value: "engagement", label: "Increase Engagement", icon: Users },
    { value: "conversions", label: "Get More Streams", icon: Play },
    { value: "followers", label: "Grow Following", icon: TrendingUp },
  ];

  const platforms = [
    {
      value: "spotify",
      label: "Spotify Personal Network",
      icon: Music,
      description: "Use your Spotify for Artists profile for organic promotion",
    },
    {
      value: "youtube",
      label: "YouTube Channel Network",
      icon: Tv,
      description: "Leverage your YouTube channel for cross-promotion",
    },
    {
      value: "instagram",
      label: "Instagram Profile Power",
      icon: Users,
      description: "Transform your Instagram into a promotional hub",
    },
    {
      value: "facebook",
      label: "Facebook Profile Amplification",
      icon: Users,
      description: "Use your Facebook profile and connections",
    },
    {
      value: "tiktok",
      label: "TikTok Personal Brand",
      icon: Play,
      description: "Amplify through your TikTok presence",
    },
    {
      value: "twitter",
      label: "Twitter Personal Network",
      icon: Radio,
      description: "Leverage your Twitter following and engagement",
    },
  ];

  const musicInterests = [
    "Hip Hop",
    "Pop",
    "R&B",
    "Rock",
    "Electronic",
    "Country",
    "Jazz",
    "Classical",
    "Reggae",
    "Alternative",
    "Indie",
    "Folk",
  ];

  const handleCreateCampaign = () => {
    if (!campaignForm.name.trim()) {
      toast({
        title: "Campaign Name Required",
        description: "Please enter a name for your campaign.",
        variant: "destructive",
      });
      return;
    }
    if (!campaignForm.objective) {
      toast({
        title: "Objective Required",
        description: "Please select a campaign objective.",
        variant: "destructive",
      });
      return;
    }
    createCampaignMutation.mutate(campaignForm);
  };

  campaigns.reduce(
    (acc: number, campaign: AdCampaign) => acc + campaign.impressions,
    0,
  );
  campaigns.reduce(
    (acc: number, campaign: AdCampaign) => acc + campaign.clicks,
    0,
  );

  const handleVideoGenerated = (url: string, blob: Blob) => {
    setGeneratedVideos((prev) => [
      ...prev,
      { url, blob, createdAt: new Date() },
    ]);
    toast({
      title: "Video Creative Generated",
      description:
        "Your video creative has been saved and is ready for campaign use.",
    });
  };

  const getSelectedCampaignPlatform = (): VideoPlatform => {
    const platformMap: Record<string, VideoPlatform> = {
      instagram: "instagram",
      facebook: "facebook",
      tiktok: "tiktok",
      youtube: "youtube",
      twitter: "twitter",
      linkedin: "linkedin",
    };
    const selectedPlatforms = campaignForm.targetAudience.platforms;
    if (selectedPlatforms.length > 0) {
      const platform = selectedPlatforms[0].toLowerCase();
      return platformMap[platform] || videoPlatform;
    }
    return videoPlatform;
  };

  const getFatigueColor = (level: CreativeFatigueData["fatigueLevel"]) => {
    const colors = {
      low: "bg-green-500",
      medium: "bg-yellow-500",
      high: "bg-orange-500",
      critical: "bg-red-500",
    };
    return colors[level];
  };

  const getFatigueBadge = (level: CreativeFatigueData["fatigueLevel"]) => {
    const styles = {
      low: "bg-green-500/10 text-green-500 border-green-500/20",
      medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      critical: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    return styles[level];
  };

  if (!user) return null;

  return (
    <AppLayout>
      {authLoading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                🚀 AI-Powered Organic Advertising
              </h1>
              <p className="text-muted-foreground">
                MaxCore AI generates peak-performance content distributed
                through your connected social profiles — no ad spend required
              </p>
            </div>
            <Dialog
              open={isCreateCampaignOpen}
              onOpenChange={setIsCreateCampaignOpen}
            >
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white">
                  <Rocket className="w-4 h-4 mr-2" />
                  Activate AI Campaign
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Brain className="w-5 h-5 mr-2 text-blue-600" />
                    Activate AI Campaign
                  </DialogTitle>
                  <DialogDescription>
                    MaxCore AI will generate optimized content and publish it
                    through your connected social profiles
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="campaign-name">Campaign Name</Label>
                    <Input
                      id="campaign-name"
                      placeholder="e.g., Summer Single Release Campaign"
                      value={campaignForm.name}
                      onChange={(e) =>
                        setCampaignForm((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-3">
                    <Label>Campaign Objective</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {adObjectives.map(({ value, label, icon: Icon }) => (
                        <div
                          key={value}
                          className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${campaignForm.objective === value ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-border hover:border-blue-400"}`}
                          onClick={() =>
                            setCampaignForm((prev) => ({
                              ...prev,
                              objective: value,
                            }))
                          }
                        >
                          <Icon className="w-5 h-5" />
                          <span className="text-sm font-medium">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (Days)</Label>
                    <div className="space-y-3">
                      <Slider
                        value={[campaignForm.duration]}
                        onValueChange={(value) =>
                          setCampaignForm((prev) => ({
                            ...prev,
                            duration: value[0],
                          }))
                        }
                        max={30}
                        min={1}
                        step={1}
                      />
                      <div className="text-center font-semibold">
                        {campaignForm.duration} days
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Target Platforms</Label>
                    <div className="grid grid-cols-1 gap-3">
                      {platforms.map(
                        ({ value, label, icon: Icon, description }) => (
                          <div
                            key={value}
                            className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${campaignForm.targetAudience.platforms.includes(value) ? "border-green-500 bg-green-50 dark:bg-green-950/20" : "border-border hover:border-green-400"}`}
                            onClick={() => {
                              setCampaignForm((prev) => ({
                                ...prev,
                                targetAudience: {
                                  ...prev.targetAudience,
                                  platforms:
                                    prev.targetAudience.platforms.includes(
                                      value,
                                    )
                                      ? prev.targetAudience.platforms.filter(
                                          (p) => p !== value,
                                        )
                                      : [
                                          ...prev.targetAudience.platforms,
                                          value,
                                        ],
                                },
                              }));
                            }}
                          >
                            <Icon className="w-5 h-5 mt-0.5" />
                            <div className="flex-1">
                              <div className="text-sm font-medium">{label}</div>
                              <div className="text-xs text-muted-foreground">
                                {description}
                              </div>
                            </div>
                            {campaignForm.targetAudience.platforms.includes(
                              value,
                            ) && (
                              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Target Age Range</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm">
                          Min Age: {campaignForm.targetAudience.ageMin}
                        </Label>
                        <Slider
                          value={[campaignForm.targetAudience.ageMin]}
                          onValueChange={(value) =>
                            setCampaignForm((prev) => ({
                              ...prev,
                              targetAudience: {
                                ...prev.targetAudience,
                                ageMin: value[0],
                              },
                            }))
                          }
                          max={65}
                          min={13}
                          step={1}
                        />
                      </div>
                      <div>
                        <Label className="text-sm">
                          Max Age: {campaignForm.targetAudience.ageMax}
                        </Label>
                        <Slider
                          value={[campaignForm.targetAudience.ageMax]}
                          onValueChange={(value) =>
                            setCampaignForm((prev) => ({
                              ...prev,
                              targetAudience: {
                                ...prev.targetAudience,
                                ageMax: value[0],
                              },
                            }))
                          }
                          max={65}
                          min={13}
                          step={1}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Music Interests</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {musicInterests.map((interest) => (
                        <div
                          key={interest}
                          className={`p-2 text-center rounded-lg border cursor-pointer transition-colors text-sm ${campaignForm.targetAudience.interests.includes(interest) ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-border hover:border-blue-400"}`}
                          onClick={() => {
                            setCampaignForm((prev) => ({
                              ...prev,
                              targetAudience: {
                                ...prev.targetAudience,
                                interests:
                                  prev.targetAudience.interests.includes(
                                    interest,
                                  )
                                    ? prev.targetAudience.interests.filter(
                                        (i) => i !== interest,
                                      )
                                    : [
                                        ...prev.targetAudience.interests,
                                        interest,
                                      ],
                              },
                            }));
                          }}
                        >
                          {interest}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Campaign Image (Optional)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadedImage(file);
                          const previewUrl = URL.createObjectURL(file);
                          setImagePreviewUrl(previewUrl);
                          uploadImageMutation.mutate(file);
                        }
                      }}
                    />
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadImageMutation.isPending}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadImageMutation.isPending
                          ? "Uploading..."
                          : "Upload Campaign Image"}
                      </Button>
                      {uploadedImage && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedImage(null);
                            setImagePreviewUrl((prev) => {
                              if (prev?.startsWith("blob:"))
                                URL.revokeObjectURL(prev);
                              return null;
                            });
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        >
                          <X className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    {imagePreviewUrl && (
                      <img
                        src={imagePreviewUrl}
                        alt="Campaign preview"
                        className="max-h-40 rounded-lg mt-2"
                      />
                    )}
                  </div>
                  <div className="flex justify-end space-x-3">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateCampaignOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateCampaign}
                      disabled={createCampaignMutation.isPending}
                      className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white"
                    >
                      {createCampaignMutation.isPending
                        ? "Creating..."
                        : "Create Campaign"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card className="border-2 border-gradient-to-r from-purple-500 to-pink-600 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  🎯 How the AI Advertising System Works
                </h2>
                <p className="text-lg text-muted-foreground">
                  MaxCore AI replicates peak paid-ad performance using your
                  connected social profiles as organic distribution channels
                </p>
                <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-3 mt-6">
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-purple-600">AI</div>
                    <div className="text-xs">Creative Automation</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-green-600">MTA</div>
                    <div className="text-xs">Multi-Touch</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-orange-600">A/B</div>
                    <div className="text-xs">Testing</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-cyan-600">LAL</div>
                    <div className="text-xs">Lookalike</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-teal-600">🔗</div>
                    <div className="text-xs">Personal Ads</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-red-600">⚡</div>
                    <div className="text-xs">Auto-Optimize</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-amber-600">🔍</div>
                    <div className="text-xs">Fatigue Detection</div>
                  </div>
                  <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                    <div className="text-xl font-bold text-indigo-600">🎯</div>
                    <div className="text-xs">Competitor Intel</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="creative">Creative AI</TabsTrigger>
              <TabsTrigger value="testing">A/B Testing</TabsTrigger>
              <TabsTrigger value="lookalike">
                <UserPlus className="w-3 h-3 mr-1 inline" />
                Audience
              </TabsTrigger>
              <TabsTrigger value="competitors">
                <Search className="w-3 h-3 mr-1 inline" />
                Intel
              </TabsTrigger>
              <TabsTrigger value="optimization">Optimize</TabsTrigger>
              <TabsTrigger value="autopilot">
                <Bot className="w-3 h-3 mr-1 inline" />
                Autopilot
              </TabsTrigger>
              <TabsTrigger value="press-kit">
                <FileImage className="w-3 h-3 mr-1 inline" />
                Press Kit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Users className="w-5 h-5 text-blue-500" />
                      <span className="text-sm font-medium">Organic Reach</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold">
                        {organicMetrics?.reach?.toLocaleString() ?? 0}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        AI-amplified audience
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Eye className="w-5 h-5 text-green-500" />
                      <span className="text-sm font-medium">Impressions</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold">
                        {organicMetrics?.impressions?.toLocaleString() ?? 0}
                      </div>
                      {organicMetrics?.impressionsChange != null && (
                        <div
                          className={`text-sm ${organicMetrics.impressionsChange >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {organicMetrics.impressionsChange >= 0 ? "+" : ""}
                          {organicMetrics.impressionsChange}% vs last week
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="w-5 h-5 text-purple-500" />
                      <span className="text-sm font-medium">Engagement</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold">
                        {organicMetrics?.engagement?.toLocaleString() ?? 0}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Likes, comments, shares
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-5 h-5 text-orange-500" />
                      <span className="text-sm font-medium">Viral Score</span>
                    </div>
                    <div className="mt-2">
                      <div className="text-2xl font-bold text-orange-600">
                        {organicMetrics?.viralScore ?? 0}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        AI virality prediction
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Brain className="w-5 h-5 mr-2 text-purple-600" />
                    AI Growth Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {aiRecommendations && aiRecommendations.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {aiRecommendations.map(
                        (
                          rec: {
                            title: string;
                            description: string;
                            impact: string;
                            category: string;
                          },
                          idx: number,
                        ) => (
                          <div
                            key={idx}
                            className={`p-4 rounded-lg border ${rec.impact === "high" ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20"}`}
                          >
                            <div className="flex items-start gap-3">
                              <Lightbulb
                                className={`w-5 h-5 mt-0.5 ${rec.impact === "high" ? "text-green-600" : "text-yellow-600"}`}
                              />
                              <div>
                                <h4 className="font-medium">{rec.title}</h4>
                                <p className="text-sm text-muted-foreground">
                                  {rec.description}
                                </p>
                                <Badge
                                  className={`mt-2 ${rec.impact === "high" ? "bg-green-500/10 text-green-600" : "bg-yellow-500/10 text-yellow-600"}`}
                                >
                                  {rec.impact} impact
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <h4 className="font-semibold mb-2">
                        No AI Recommendations Yet
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Connect your social platforms and start posting to
                        receive AI-powered growth recommendations
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card
                  className="p-4 border rounded-lg hover:border-blue-500 transition-colors cursor-pointer bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20"
                  onClick={() => setIsCreateCampaignOpen(true)}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <Music className="w-6 h-6 text-blue-500" />
                    <h4 className="font-semibold">Viral Release Campaign</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI-powered multi-platform release strategy
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
                  >
                    Start Campaign
                  </Button>
                </Card>
                <Card
                  className="p-4 border rounded-lg hover:border-green-500 transition-colors cursor-pointer bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20"
                  onClick={() => setIsCreateCampaignOpen(true)}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <Users className="w-6 h-6 text-green-500" />
                    <h4 className="font-semibold">Fan Base Explosion</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Explode your fan base with AI community building
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-green-200 text-green-600 hover:bg-green-50"
                  >
                    Activate Growth
                  </Button>
                </Card>
                <Card
                  className="p-4 border rounded-lg hover:border-purple-500 transition-colors cursor-pointer bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20"
                  onClick={() => setIsCreateCampaignOpen(true)}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <Play className="w-6 h-6 text-purple-500" />
                    <h4 className="font-semibold">Stream Enhancement</h4>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Maximize streaming with AI-optimized content
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-purple-200 text-purple-600 hover:bg-purple-50"
                  >
                    Boost Streams
                  </Button>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="creative" className="space-y-6">
              <CreativeVariantGenerator />

              <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-purple-500" />
                    AI Creative Generator
                  </CardTitle>
                  <CardDescription>
                    Generate platform-optimized video and image creatives using
                    the Max Booster AI model — cinematic video rendering, AI
                    image generation, and browser-based composition.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div>
                      <Label className="mb-1 block text-xs">Platform</Label>
                      <Select
                        value={adCreativePlatform}
                        onValueChange={(v) => {
                          setAdCreativePlatform(v as ImagePlatform);
                          setVideoPlatform(v as VideoPlatform);
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="instagram">
                            Instagram Feed
                          </SelectItem>
                          <SelectItem value="instagram_reels">
                            Instagram Reels
                          </SelectItem>
                          <SelectItem value="tiktok">TikTok</SelectItem>
                          <SelectItem value="youtube">YouTube</SelectItem>
                          <SelectItem value="youtube_shorts">
                            YouTube Shorts
                          </SelectItem>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="twitter">Twitter/X</SelectItem>
                          <SelectItem value="linkedin">LinkedIn</SelectItem>
                          <SelectItem value="threads">Threads</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1" />
                    <div className="flex gap-1 bg-muted rounded-lg p-1">
                      <button
                        onClick={() => setAdCreativeTab("video-ai")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${adCreativeTab === "video-ai" ? "bg-background shadow-sm text-purple-600" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        AI Video
                      </button>
                      <button
                        onClick={() => setAdCreativeTab("image")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${adCreativeTab === "image" ? "bg-background shadow-sm text-indigo-600" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        AI Image
                      </button>
                      <button
                        onClick={() => setAdCreativeTab("video-browser")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${adCreativeTab === "video-browser" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        Browser Video
                      </button>
                    </div>
                  </div>

                  {adCreativeTab === "video-ai" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                          Video Description
                        </Label>
                        <Textarea
                          value={adVideoTopic}
                          onChange={(e) => setAdVideoTopic(e.target.value)}
                          placeholder={
                            campaignForm.name ||
                            campaignForm.objective ||
                            'Describe what you want in the video — e.g. "Energetic new single promo with neon visuals and bass drop"'
                          }
                          rows={2}
                          className="resize-none text-sm"
                        />
                      </div>
                      <ServerVideoGenerator
                        platform={adCreativePlatform}
                        topic={
                          adVideoTopic ||
                          campaignForm.name ||
                          campaignForm.objective ||
                          "New music release"
                        }
                        tone="energetic"
                        goal={campaignForm.objective || "growth"}
                        artistName={
                          user?.displayName ||
                          user?.email?.split("@")[0] ||
                          "Artist"
                        }
                        onVideoGenerated={(url) => {
                          setGeneratedVideos((prev) => [
                            ...prev,
                            { url, blob: new Blob(), createdAt: new Date() },
                          ]);
                        }}
                        className="border-0 shadow-none p-0 bg-transparent"
                      />
                    </div>
                  )}

                  {adCreativeTab === "image" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                          Image Description
                        </Label>
                        <Textarea
                          value={adImageTopic}
                          onChange={(e) => setAdImageTopic(e.target.value)}
                          placeholder={
                            campaignForm.name ||
                            campaignForm.objective ||
                            'Describe the image — e.g. "Artist silhouette against city skyline, moody purple tones, album promo"'
                          }
                          rows={2}
                          className="resize-none text-sm"
                        />
                      </div>
                      <AIImageGenerator
                        platform={adCreativePlatform}
                        topic={
                          adImageTopic ||
                          campaignForm.name ||
                          campaignForm.objective ||
                          "New music release"
                        }
                        tone="energetic"
                        goal={campaignForm.objective || "growth"}
                        artistName={
                          user?.displayName ||
                          user?.email?.split("@")[0] ||
                          "Artist"
                        }
                        endpoint="/api/multimodal/generate"
                        onImageGenerated={(url) => {
                          setGeneratedAdImages((prev) => [
                            ...prev,
                            { url, createdAt: new Date() },
                          ]);
                        }}
                        className="border-0 shadow-none p-0 bg-transparent"
                      />
                    </div>
                  )}

                  {adCreativeTab === "video-browser" && (
                    <VideoContentGenerator
                      platform={getSelectedCampaignPlatform()}
                      contentText={
                        campaignForm.name ||
                        campaignForm.objective ||
                        "New music release"
                      }
                      artistName={
                        user?.displayName ||
                        user?.email?.split("@")[0] ||
                        "Artist"
                      }
                      releaseName={campaignForm.name || "New Release"}
                      onVideoGenerated={handleVideoGenerated}
                      className="border-0 shadow-none p-0"
                    />
                  )}

                  {generatedVideos.length > 0 && (
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                        <Layers className="w-4 h-4" />
                        Generated Video Creatives ({generatedVideos.length})
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {generatedVideos.slice(-6).map((video, index) => (
                          <div
                            key={index}
                            className="rounded-lg overflow-hidden border bg-card"
                          >
                            <video
                              src={video.url}
                              className="w-full aspect-video object-cover"
                              controls
                            />
                            <div className="p-2 text-xs text-muted-foreground">
                              {video.createdAt.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {generatedAdImages.length > 0 && (
                    <div className="pt-4 border-t">
                      <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                        <Layers className="w-4 h-4" />
                        Generated Image Creatives ({generatedAdImages.length})
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {generatedAdImages.slice(-8).map((img, index) => (
                          <div
                            key={index}
                            className="rounded-lg overflow-hidden border bg-card"
                          >
                            <img
                              src={img.url}
                              alt="Ad creative"
                              className="w-full aspect-square object-cover"
                            />
                            <div className="p-1.5 text-xs text-muted-foreground">
                              {img.createdAt.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testing" className="space-y-6">
              <CreativeAutomation />
            </TabsContent>

            <TabsContent value="lookalike" className="space-y-6">
              <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserPlus className="w-6 h-6 text-blue-500" />
                    Audience Lookalike Expansion Controls
                  </CardTitle>
                  <CardDescription>
                    Build audience profiles based on your best-performing
                    followers — AI targets similar users organically across your
                    connected profiles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Active Lookalikes
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {
                          lookalikeAudiences.filter(
                            (a) => a.status === "active",
                          ).length
                        }
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Total Reach
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {(
                          lookalikeAudiences.reduce(
                            (acc, a) => acc + a.estimatedSize,
                            0,
                          ) / 1000000
                        ).toFixed(1)}
                        M
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Avg. Similarity
                      </p>
                      <p className="text-2xl font-bold text-purple-600">
                        {lookalikeAudiences.length > 0
                          ? (
                              lookalikeAudiences.reduce(
                                (acc, a) => acc + a.similarityScore,
                                0,
                              ) / lookalikeAudiences.length
                            ).toFixed(0)
                          : 0}
                        %
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {lookalikeAudiences.map((audience) => (
                  <Card
                    key={audience.id}
                    className={`${audience.status === "active" ? "border-green-200" : audience.status === "paused" ? "border-yellow-200" : "border-gray-200"}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{audience.name}</h4>
                            <Badge
                              className={`${audience.status === "active" ? "bg-green-500/10 text-green-600" : audience.status === "paused" ? "bg-yellow-500/10 text-yellow-600" : "bg-gray-500/10 text-gray-600"}`}
                            >
                              {audience.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Source: {audience.sourceAudience}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {audience.status === "active" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateAudienceStatusMutation.mutate({
                                  audienceId: audience.id,
                                  status: "paused",
                                })
                              }
                              disabled={updateAudienceStatusMutation.isPending}
                            >
                              <Lock className="w-3 h-3 mr-1" />
                              Pause
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-green-300 text-green-600"
                              onClick={() =>
                                updateAudienceStatusMutation.mutate({
                                  audienceId: audience.id,
                                  status: "active",
                                })
                              }
                              disabled={updateAudienceStatusMutation.isPending}
                            >
                              <Unlock className="w-3 h-3 mr-1" />
                              Activate
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-950/20">
                          <p className="text-xs text-muted-foreground">
                            Similarity
                          </p>
                          <p className="font-bold text-blue-600">
                            {audience.similarityScore}%
                          </p>
                        </div>
                        <div className="text-center p-2 rounded bg-green-50 dark:bg-green-950/20">
                          <p className="text-xs text-muted-foreground">
                            Est. Size
                          </p>
                          <p className="font-bold text-green-600">
                            {(audience.estimatedSize / 1000).toFixed(0)}K
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-muted-foreground">
                              Expansion Level
                            </span>
                            <span className="font-medium">
                              {audience.expansionLevel}/5
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((level) => (
                              <div
                                key={level}
                                className={`flex-1 h-2 rounded ${level <= audience.expansionLevel ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"}`}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>More Similar</span>
                            <span>Broader Reach</span>
                          </div>
                        </div>

                        <div className="p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-purple-500" />
                            <span className="text-sm font-medium">
                              AI Optimization
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Similar to {audience.similarityScore}% of your{" "}
                            {audience.sourceAudience}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-500" />
                    Create New Lookalike Audience
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Source Audience</Label>
                      <Select
                        value={lookalikeSourceType}
                        onValueChange={setLookalikeSourceType}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select source..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top-engaged">
                            Top 10% Most Engaged Fans
                          </SelectItem>
                          <SelectItem value="engaged-users">
                            Highly Engaged Users
                          </SelectItem>
                          <SelectItem value="converters">
                            Recent Converters
                          </SelectItem>
                          <SelectItem value="subscribers">
                            Email Subscribers
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Expansion Level (1-5): {lookalikeExpansionLevel}
                      </Label>
                      <Slider
                        value={[lookalikeExpansionLevel]}
                        onValueChange={([v]) => setLookalikeExpansionLevel(v)}
                        max={5}
                        min={1}
                        step={1}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                        onClick={() =>
                          createLookalikeMutation.mutate({
                            sourceAudienceType: lookalikeSourceType,
                            expansionLevel: lookalikeExpansionLevel,
                          })
                        }
                        disabled={createLookalikeMutation.isPending}
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        {createLookalikeMutation.isPending
                          ? "Creating..."
                          : "Create Lookalike"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="competitors" className="space-y-6">
              <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Network className="w-6 h-6 text-purple-500" />
                    Personal Ad Network Intelligence
                  </CardTitle>
                  <CardDescription>
                    Analytics and insights from your connected social media
                    profiles - your personal advertising network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Connected Profiles
                      </p>
                      <p className="text-2xl font-bold text-purple-600">
                        {socialConnections
                          ? socialConnections.filter((p) => p.isConnected)
                              .length
                          : 0}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Network Reach
                      </p>
                      <p className="text-2xl font-bold text-green-600">
                        {organicMetrics?.reach?.toLocaleString() ?? 0}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Organic Impressions
                      </p>
                      <p className="text-2xl font-bold text-blue-600">
                        {organicMetrics?.impressions?.toLocaleString() ?? 0}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        Engagement Rate
                      </p>
                      <p className="text-2xl font-bold text-orange-600">
                        {organicMetrics?.engagementRate ?? 0}%
                      </p>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800 mb-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-purple-800 dark:text-purple-200">
                          Your Personal Ad Network
                        </p>
                        <p className="text-sm text-purple-700 dark:text-purple-300">
                          Each connected profile acts as an organic advertising
                          outlet. AI analyzes performance across all your
                          profiles to maximize reach without ad spend.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-purple-500" />
                    Connected Profile Performance
                  </CardTitle>
                  <CardDescription>
                    Real-time analytics from your personal ad network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {socialConnections &&
                    socialConnections.filter((p) => p.isConnected).length >
                      0 ? (
                      socialConnections
                        .filter((p) => p.isConnected)
                        .map((platform) => (
                          <div
                            key={platform.id}
                            className="p-4 rounded-lg border bg-card"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                  {platform.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <h4 className="font-semibold">
                                    {platform.name}
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    @{platform.username ?? "connected"}
                                  </p>
                                </div>
                              </div>
                              <Badge className="bg-green-500/10 text-green-600">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Active
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                                <p className="text-xs text-muted-foreground">
                                  Followers
                                </p>
                                <p className="font-bold">
                                  {platform.followers?.toLocaleString() ?? "--"}
                                </p>
                              </div>
                              <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                                <p className="text-xs text-muted-foreground">
                                  Posts
                                </p>
                                <p className="font-bold">--</p>
                              </div>
                              <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                                <p className="text-xs text-muted-foreground">
                                  Engagement
                                </p>
                                <p className="font-bold">--</p>
                              </div>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="font-medium">No profiles connected yet</p>
                        <p className="text-sm">
                          Connect your social media accounts to build your
                          personal ad network
                        </p>
                        <Button className="mt-4" variant="outline">
                          <Plus className="w-4 h-4 mr-2" />
                          Connect Profile
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-500" />
                    AI Network Insights
                  </CardTitle>
                  <CardDescription>
                    AI-powered recommendations to maximize your personal ad
                    network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="font-medium text-sm">
                          Best Posting Times
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        AI analyzes engagement patterns across all connected
                        profiles
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <span className="font-medium text-sm">
                          Viral Potential
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Content scoring based on platform algorithms
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-4 h-4 text-orange-500" />
                        <span className="font-medium text-sm">
                          Audience Overlap
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Cross-platform audience analysis
                      </p>
                    </div>
                    <div className="p-4 rounded-lg border bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-sm">
                          Content Amplification
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Coordinated posting across your network
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="optimization" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Audience Segments
                        </p>
                        <p className="text-2xl font-bold">
                          {audienceSegments.length}
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Fatigued Creatives
                        </p>
                        <p className="text-2xl font-bold text-orange-500">
                          {
                            creativeFatigue.filter(
                              (c) =>
                                c.fatigueLevel === "high" ||
                                c.fatigueLevel === "critical",
                            ).length
                          }
                        </p>
                      </div>
                      <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 text-orange-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="audience-overlap" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="audience-overlap">
                    Audience Overlap
                  </TabsTrigger>
                  <TabsTrigger value="creative-fatigue">
                    Creative Fatigue
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="audience-overlap" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-blue-500" />
                        Audience Overlap Analysis
                      </CardTitle>
                      <CardDescription>
                        Identify audience segment overlaps to maximize reach and
                        optimize targeting precision
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {audienceSegments.map((segment) => (
                          <div
                            key={segment.id}
                            className="p-4 rounded-lg border"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <h4 className="font-medium">{segment.name}</h4>
                                <Badge variant="outline">
                                  {(segment.size / 1000).toFixed(0)}K users
                                </Badge>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Overlap with other segments
                                </span>
                                <span
                                  className={`font-medium ${segment.overlapPercentage > 40 ? "text-red-500" : segment.overlapPercentage > 25 ? "text-yellow-500" : "text-green-500"}`}
                                >
                                  {segment.overlapPercentage}%
                                </span>
                              </div>
                              <Progress
                                value={segment.overlapPercentage}
                                className={
                                  segment.overlapPercentage > 40
                                    ? "bg-red-100"
                                    : segment.overlapPercentage > 25
                                      ? "bg-yellow-100"
                                      : "bg-green-100"
                                }
                              />
                            </div>
                            {segment.overlapPercentage > 40 && (
                              <div className="mt-3 p-2 rounded bg-red-500/10 text-red-600 text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />
                                High overlap detected. Consider excluding from
                                similar campaigns.
                              </div>
                            )}
                            {segment.overlapPercentage < 25 && (
                              <div className="mt-3 p-2 rounded bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                                <Sparkles className="w-4 h-4" />
                                Low overlap detected. AI has prioritized this
                                segment for maximum reach.
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="creative-fatigue" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Timer className="w-5 h-5 text-orange-500" />
                        Creative Fatigue Detection
                      </CardTitle>
                      <CardDescription>
                        Monitor creative performance decline and get refresh
                        recommendations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {creativeFatigue.map((creative) => (
                          <div
                            key={creative.id}
                            className={`p-4 rounded-lg border ${creative.fatigueLevel === "critical" ? "border-red-300 bg-red-50 dark:bg-red-950/20" : creative.fatigueLevel === "high" ? "border-orange-300 bg-orange-50 dark:bg-orange-950/20" : ""}`}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium">
                                    {creative.creativeName}
                                  </h4>
                                  <Badge
                                    className={getFatigueBadge(
                                      creative.fatigueLevel,
                                    )}
                                  >
                                    {creative.fatigueLevel}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Active for {creative.daysActive} days •
                                  Frequency: {creative.frequency}
                                </p>
                              </div>
                              <div className="text-right">
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Initial CTR
                                    </p>
                                    <p className="font-bold text-green-500">
                                      {creative.initialCTR}%
                                    </p>
                                  </div>
                                  <TrendingDown className="w-4 h-4 text-red-500" />
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Current CTR
                                    </p>
                                    <p
                                      className={`font-bold ${creative.currentCTR < creative.initialCTR * 0.6 ? "text-red-500" : "text-yellow-500"}`}
                                    >
                                      {creative.currentCTR}%
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2 mb-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Performance Decline
                                </span>
                                <span className="font-medium text-red-500">
                                  -
                                  {(
                                    (1 -
                                      creative.currentCTR /
                                        creative.initialCTR) *
                                    100
                                  ).toFixed(0)}
                                  %
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                <div
                                  className={`h-full ${getFatigueColor(creative.fatigueLevel)}`}
                                  style={{
                                    width: `${(1 - creative.currentCTR / creative.initialCTR) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                            <div
                              className={`p-2 rounded text-sm flex items-center gap-2 ${creative.fatigueLevel === "critical" ? "bg-red-100 text-red-700 dark:bg-red-900/30" : creative.fatigueLevel === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30"}`}
                            >
                              <Lightbulb className="w-4 h-4" />
                              {creative.recommendation}
                            </div>
                            {(creative.fatigueLevel === "high" ||
                              creative.fatigueLevel === "critical") && (
                              <div className="mt-3 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                  onClick={() =>
                                    updateCreativeStatusMutation.mutate({
                                      creativeId: creative.id,
                                      action: "refresh",
                                    })
                                  }
                                  disabled={
                                    updateCreativeStatusMutation.isPending
                                  }
                                >
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                  Refresh Creative
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    updateCreativeStatusMutation.mutate({
                                      creativeId: creative.id,
                                      action: "pause",
                                    })
                                  }
                                  disabled={
                                    updateCreativeStatusMutation.isPending
                                  }
                                >
                                  Pause Creative
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="autopilot" className="space-y-6">
              <AutonomousDashboard />
              <ContentAnalyzer />
            </TabsContent>

            <TabsContent value="press-kit" className="space-y-6">
              <PressKitTabContent />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </AppLayout>
  );
}

function PressKitTabContent() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: pressKit, isLoading } = useQuery<PressKitData>({
    queryKey: ["/api/press-kit"],
  });

  const updatePressKitMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PUT", "/api/press-kit", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/press-kit"] });
      toast({
        title: "Success",
        description: "Press kit updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Could not update press kit",
        variant: "destructive",
      });
    },
  });

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    const genres = (data.genres as string)
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean);
    const socialLinks = {
      instagram: data.instagram,
      twitter: data.twitter,
      youtube: data.youtube,
      facebook: data.facebook,
      spotify: data.spotify,
    };

    updatePressKitMutation.mutate({
      ...data,
      genres,
      socialLinks,
      isPublic: pressKit.isPublic ?? false,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "press-kit");

      const res = (await uploadWithProgress(
        "/api/storage/upload",
        formData,
      )) as StorageUploadResponse;
      const photoUrl = res.file.url;

      const currentPhotos = pressKit?.photos || [];
      updatePressKitMutation.mutate({
        ...pressKit,
        photos: [...currentPhotos, { url: photoUrl, caption: "" }],
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Could not upload photo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (index: number) => {
    const currentPhotos = [...(pressKit?.photos ?? [])];
    currentPhotos.splice(index, 1);
    updatePressKitMutation.mutate({ ...pressKit, photos: currentPhotos });
  };

  const copyPublicLink = () => {
    if (pressKit?.slug) {
      const url = `${window.location.origin}/epk/${pressKit.slug}`;
      navigator.clipboard.writeText(url);
      toast({
        title: "Link Copied",
        description: "Public EPK link copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Electronic Press Kit (EPK)
          </h2>
          <p className="text-muted-foreground">
            Build your professional artist profile for promoters and press.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pressKit?.isPublic && (
            <Button variant="outline" size="sm" onClick={copyPublicLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Public Link
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Artist Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="artistName">Artist Name</Label>
                    <Input
                      id="artistName"
                      name="artistName"
                      defaultValue={pressKit?.artistName}
                      placeholder="Stage Name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="genres">Genres</Label>
                    <Input
                      id="genres"
                      name="genres"
                      defaultValue={pressKit?.genres?.join(", ")}
                      placeholder="Indie, Rock, Pop"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortBio">Short Bio (One Liner)</Label>
                  <Input
                    id="shortBio"
                    name="shortBio"
                    defaultValue={pressKit?.shortBio}
                    placeholder="A brief catchy description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">Full Biography</Label>
                  <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={pressKit?.bio}
                    placeholder="Your full story..."
                    className="min-h-[150px]"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Photo Gallery</CardTitle>
                <div className="relative">
                  <Input
                    type="file"
                    id="photo-upload"
                    className="hidden"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                  />
                  <Label
                    htmlFor="photo-upload"
                    className={`cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3 ${uploading ? "opacity-50" : ""}`}
                  >
                    {uploading ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Add Photo
                  </Label>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {pressKit?.photos?.map(
                    (photo: PressKitPhoto, index: number) => (
                      <div
                        key={index}
                        className="group relative aspect-square rounded-md overflow-hidden border"
                      >
                        <img
                          src={photo.url}
                          alt="Press"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ),
                  )}
                  {(!pressKit?.photos || pressKit.photos.length === 0) && (
                    <div className="col-span-full py-8 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                      No photos added yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Contact & Booking</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    name="contactEmail"
                    type="email"
                    defaultValue={pressKit?.contactEmail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bookingEmail">Booking Email</Label>
                  <Input
                    id="bookingEmail"
                    name="bookingEmail"
                    type="email"
                    defaultValue={pressKit?.bookingEmail}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="technicalRider">
                    Technical Rider (Link or Text)
                  </Label>
                  <Textarea
                    id="technicalRider"
                    name="technicalRider"
                    defaultValue={pressKit?.technicalRider}
                    placeholder="Technical requirements..."
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Social Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Instagram</Label>
                  <Input
                    name="instagram"
                    defaultValue={pressKit?.socialLinks?.instagram}
                    placeholder="URL"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Twitter/X</Label>
                  <Input
                    name="twitter"
                    defaultValue={pressKit?.socialLinks?.twitter}
                    placeholder="URL"
                  />
                </div>
                <div className="space-y-2">
                  <Label>YouTube</Label>
                  <Input
                    name="youtube"
                    defaultValue={pressKit?.socialLinks?.youtube}
                    placeholder="URL"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Spotify</Label>
                  <Input
                    name="spotify"
                    defaultValue={pressKit?.socialLinks?.spotify}
                    placeholder="URL"
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-dashed">
              <div className="flex flex-col">
                <span className="font-medium">Public Visibility</span>
                <span className="text-xs text-muted-foreground">
                  Make your EPK public
                </span>
              </div>
              <Switch
                checked={pressKit?.isPublic}
                onCheckedChange={(checked) =>
                  updatePressKitMutation.mutate({
                    ...pressKit,
                    isPublic: checked,
                  })
                }
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={updatePressKitMutation.isPending}
            >
              {updatePressKitMutation.isPending && (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Press Kit
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
