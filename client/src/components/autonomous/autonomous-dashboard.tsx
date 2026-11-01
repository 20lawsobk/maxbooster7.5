// @ts-nocheck
import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Play, Pause, Brain, Settings as SettingsIcon, Clock, CheckCircle, AlertCircle, Image, Video, Music, FileText, Globe, RefreshCw, Save, RotateCcw, Megaphone } from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  ThreadsIcon,
} from "@/components/ui/brand-icons";

interface AdvertisingAutopilotConfig {
  enabled: boolean;
  platforms: string[];
  campaignObjective:
    | "awareness"
    | "engagement"
    | "conversions"
    | "traffic"
    | "viral";
  campaignFrequency: "hourly" | "twice-daily" | "daily" | "every-2-days" | "weekly";
  brandVoice: "professional" | "casual" | "energetic" | "informative";
  contentTypes: string[];
  mediaTypes: string[];
  dailyPostLimit: number;
  autoPublish: boolean;
  optimalTimesOnly: boolean;
  crossPlatformCampaigns: boolean;
}

const PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook Profile",
    icon: FacebookIcon,
    color: "#1877F2",
  },
  {
    id: "instagram",
    name: "Instagram Profile",
    icon: InstagramIcon,
    color: "#E4405F",
  },
  { id: "twitter", name: "Twitter (X) Profile", icon: null, color: "#000000" },
  { id: "tiktok", name: "TikTok Profile", icon: TikTokIcon, color: "#000000" },
  {
    id: "youtube",
    name: "YouTube Channel",
    icon: YouTubeIcon,
    color: "#FF0000",
  },
  {
    id: "linkedin",
    name: "LinkedIn Profile",
    icon: LinkedInIcon,
    color: "#0077B5",
  },
  {
    id: "threads",
    name: "Threads Profile",
    icon: ThreadsIcon,
    color: "#000000",
  },
];

const CONTENT_TYPES = [
  {
    id: "beat",
    label: "Beats",
    description: "Promote owned beat listings",
  },
  {
    id: "release",
    label: "Releases",
    description: "Promote owned releases",
  },
  {
    id: "storefront",
    label: "Storefront",
    description: "Promote your owned storefront",
  },
  {
    id: "social_post",
    label: "Owned social posts",
    description: "Redistribute your published posts",
  },
  {
    id: "epk",
    label: "Artist EPK",
    description: "Promote your artist profile",
  },
];

const MEDIA_TYPES = [
  {
    id: "text",
    label: "Text Posts",
    icon: FileText,
    description: "Text-only social copy",
  },
  {
    id: "image",
    label: "Image Posts",
    icon: Image,
    description: "Use existing artwork or generate an image",
  },
  {
    id: "audio",
    label: "Audio Posts",
    icon: Music,
    description: "Generate an audio asset",
  },
  {
    id: "video",
    label: "Video Posts",
    icon: Video,
    description: "Generate a video asset",
  },
];

const CAMPAIGN_OBJECTIVES = [
  {
    id: "awareness",
    label: "Brand Awareness",
    description: "Reach more people",
  },
  {
    id: "engagement",
    label: "Engagement",
    description: "Get more interactions",
  },
  {
    id: "conversions",
    label: "Conversions",
    description: "Drive actions and sales",
  },
  { id: "traffic", label: "Traffic", description: "Drive website visits" },
  {
    id: "viral",
    label: "Viral Growth",
    description: "Maximize organic sharing",
  },
];

const DEFAULT_CONFIG: AdvertisingAutopilotConfig = {
  enabled: false,
  platforms: [],
  campaignObjective: "awareness",
  campaignFrequency: "daily",
  brandVoice: "professional",
  contentTypes: ["release", "social_post"],
  mediaTypes: ["text", "image"],
  dailyPostLimit: 0,
  autoPublish: false,
  optimalTimesOnly: false,
  crossPlatformCampaigns: false,
};

export function AutonomousDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeConfigTab, setActiveConfigTab] = useState("basic");
  const [localConfig, setLocalConfig] =
    useState<AdvertisingAutopilotConfig>(DEFAULT_CONFIG);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const {
    data: autopilotData,
    isLoading: statusLoading,
    error: statusError,
  } = useQuery({
    queryKey: ["/api/advertising/status"],
    refetchInterval: 30000,
    meta: { silentError: true },
  });

  useEffect(() => {
    if (autopilotData?.config) {
      const serverConfig = autopilotData.config;
      setLocalConfig({
        ...DEFAULT_CONFIG,
        ...serverConfig,
        platforms: Array.isArray(serverConfig.platforms)
          ? serverConfig.platforms
          : DEFAULT_CONFIG.platforms,
        mediaTypes: Array.isArray(serverConfig.mediaTypes)
          ? serverConfig.mediaTypes
          : DEFAULT_CONFIG.mediaTypes,
        contentTypes: Array.isArray(serverConfig.contentTypes)
          ? serverConfig.contentTypes
          : DEFAULT_CONFIG.contentTypes,
      });
      setHasUnsavedChanges(false);
    }
  }, [autopilotData]);

  const toggleAutopilotMutation = useMutation({
    mutationFn: async (shouldStart: boolean) => {
      const endpoint = shouldStart
        ? "/api/advertising/start"
        : "/api/advertising/stop";
      const response = await apiRequest("POST", endpoint, {});
      return response.json();
    },
    onSuccess: (_, shouldStart) => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertising/status"] });
      toast({
        title: shouldStart
          ? "Advertising Autopilot Started"
          : "Advertising Autopilot Paused",
        description: shouldStart
          ? "AI is now generating and managing ad campaigns automatically"
          : "Advertising autopilot has been paused",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update autopilot status. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: AdvertisingAutopilotConfig) => {
      const response = await apiRequest(
        "POST",
        "/api/advertising/configure",
        config,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/advertising/status"] });
      setHasUnsavedChanges(false);
      toast({
        title: "Configuration Saved",
        description: "Your advertising autopilot settings have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Save Failed",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateConfig = (updates: Partial<AdvertisingAutopilotConfig>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const handleSaveConfig = () => {
    const {
      enabled, platforms, campaignObjective, campaignFrequency, brandVoice,
      contentTypes, mediaTypes, dailyPostLimit, autoPublish,
      optimalTimesOnly, crossPlatformCampaigns,
    } = localConfig;
    saveConfigMutation.mutate({
      enabled, platforms, campaignObjective, campaignFrequency, brandVoice,
      contentTypes, mediaTypes, dailyPostLimit, autoPublish,
      optimalTimesOnly, crossPlatformCampaigns,
    } as AdvertisingAutopilotConfig);
  };

  const handleResetConfig = () => {
    if (autopilotData?.config) {
      setLocalConfig({
        ...DEFAULT_CONFIG,
        ...autopilotData.config,
        platforms: Array.isArray(autopilotData.config.platforms)
          ? autopilotData.config.platforms
          : DEFAULT_CONFIG.platforms,
        mediaTypes: Array.isArray(autopilotData.config.mediaTypes)
          ? autopilotData.config.mediaTypes
          : DEFAULT_CONFIG.mediaTypes,
        contentTypes: Array.isArray(autopilotData.config.contentTypes)
          ? autopilotData.config.contentTypes
          : DEFAULT_CONFIG.contentTypes,
      });
    } else {
      setLocalConfig(DEFAULT_CONFIG);
    }
    setHasUnsavedChanges(false);
  };

  const toggleArrayItem = (array: string[], item: string): string[] => {
    if (array.includes(item)) {
      return array.filter((i) => i !== item);
    }
    return [...array, item];
  };

  const isRunning = autopilotData?.isRunning || false;
  const status = autopilotData?.status || {};
  const modelStatus = autopilotData?.modelStatus || {};
  const canStart =
    !hasUnsavedChanges &&
    !saveConfigMutation.isPending &&
    localConfig.platforms.length > 0 &&
    localConfig.contentTypes.length > 0 &&
    localConfig.mediaTypes.length > 0 &&
    ["hourly", "twice-daily", "daily", "every-2-days", "weekly"].includes(
      localConfig.campaignFrequency,
    ) &&
    ["awareness", "engagement", "conversions", "traffic", "viral"].includes(
      localConfig.campaignObjective,
    ) &&
    ["professional", "casual", "energetic", "informative"].includes(
      localConfig.brandVoice,
    ) &&
    Number.isInteger(localConfig.dailyPostLimit) &&
    localConfig.dailyPostLimit >= 0 &&
    typeof localConfig.autoPublish === "boolean" &&
    typeof localConfig.optimalTimesOnly === "boolean" &&
    typeof localConfig.crossPlatformCampaigns === "boolean";

  if (statusError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>
              Failed to load advertising autopilot status. Please refresh the
              page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-gradient-to-br from-orange-50/50 to-red-50/50 dark:from-orange-950/20 dark:to-red-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-orange-600" />
                Advertising Autopilot
              </CardTitle>
              <CardDescription>
                MaxCore generates organic promotions for content you own and
                distributes them through connected social profiles. No ad spend.
                Save at least one platform before starting.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={isRunning ? "default" : "secondary"}
                className={isRunning ? "bg-green-600" : ""}
              >
                {isRunning ? "Active" : "Paused"}
              </Badge>
              <Button
                onClick={() => toggleAutopilotMutation.mutate(!isRunning)}
                variant={isRunning ? "destructive" : "default"}
                disabled={
                  toggleAutopilotMutation.isPending ||
                  statusLoading ||
                  (!isRunning && !canStart)
                }
                className={
                  !isRunning ? "bg-orange-600 hover:bg-orange-700" : ""
                }
              >
                {toggleAutopilotMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : isRunning ? (
                  <Pause className="h-4 w-4 mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isRunning ? "Pause" : "Start"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Campaigns Created
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {status.totalCampaigns || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  AI-generated campaigns
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Reach
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {status.totalReach
                    ? (status.totalReach / 1000).toFixed(1) + "K"
                    : "0"}
                </div>
                <p className="text-xs text-muted-foreground">People reached</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Engagement Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {status.avgEngagementRate
                    ? (status.avgEngagementRate * 100).toFixed(1) + "%"
                    : "0%"}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg. across campaigns
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Next Campaign
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">
                  {status.nextScheduledCampaign
                    ? new Date(
                        status.nextScheduledCampaign,
                      ).toLocaleTimeString()
                    : "No campaigns scheduled"}
                </div>
                <p className="text-xs text-muted-foreground">Upcoming task</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <SettingsIcon className="h-5 w-5" />
                  Configuration
                </CardTitle>
                <div className="flex items-center gap-2">
                  {hasUnsavedChanges && (
                    <Badge
                      variant="outline"
                      className="text-yellow-600 border-yellow-600"
                    >
                      Unsaved Changes
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetConfig}
                    disabled={!hasUnsavedChanges}
                  >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Reset
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={
                      !hasUnsavedChanges || saveConfigMutation.isPending
                    }
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {saveConfigMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs value={activeConfigTab} onValueChange={setActiveConfigTab}>
                <TabsList className="grid grid-cols-4 mb-4">
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                  <TabsTrigger value="platforms">Platforms</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Campaign Frequency</Label>
                      <Select
                        value={localConfig.campaignFrequency}
                        onValueChange={(value) =>
                          updateConfig({
                            campaignFrequency:
                              value as AdvertisingAutopilotConfig["campaignFrequency"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="twice-daily">
                            Twice Daily
                          </SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="every-2-days">Every 2 days</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        How often to create and optimize campaigns
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Brand Voice</Label>
                      <Select
                        value={localConfig.brandVoice}
                        onValueChange={(value) =>
                          updateConfig({
                            brandVoice:
                              value as AdvertisingAutopilotConfig["brandVoice"],
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">
                            Professional
                          </SelectItem>
                          <SelectItem value="casual">
                            Casual &amp; Friendly
                          </SelectItem>
                          <SelectItem value="energetic">
                            Energetic &amp; Bold
                          </SelectItem>
                          <SelectItem value="informative">
                            Informative &amp; Educational
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Tone for AI-generated ad copy
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Daily Promotion Limit</Label>
                      <Input
                        type="number"
                        min={0}
                       value={localConfig.dailyPostLimit}
                        onChange={(e) =>
                          updateConfig({
                             dailyPostLimit: parseInt(e.target.value) || 0,
                          })
                        }
                         placeholder="0 = unlimited"
                      />
                      <p className="text-xs text-muted-foreground">
                         Maximum new organic promotions per day; 0 means unlimited
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="auto-publish" className="font-medium">
                        Auto-Publish Campaigns
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically publish AI-generated campaigns without
                        review
                      </p>
                    </div>
                    <Switch
                      id="auto-publish"
                      checked={localConfig.autoPublish}
                      onCheckedChange={(checked) =>
                        updateConfig({ autoPublish: checked })
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="campaigns" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Primary Campaign Objective</Label>
                    <Select
                      value={localConfig.campaignObjective}
                      onValueChange={(value) =>
                        updateConfig({
                          campaignObjective:
                            value as AdvertisingAutopilotConfig["campaignObjective"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map((objective) => (
                          <SelectItem key={objective.id} value={objective.id}>
                            <div className="flex flex-col">
                              <span>{objective.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {objective.description}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label>Campaign Types</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {CONTENT_TYPES.map((type) => (
                        <div
                          key={type.id}
                          className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            localConfig.contentTypes.includes(type.id)
                              ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                              : "border-muted hover:border-muted-foreground/50"
                          }`}
                          onClick={() =>
                            updateConfig({
                              contentTypes: toggleArrayItem(
                                localConfig.contentTypes,
                                type.id,
                              ),
                            })
                          }
                        >
                          <Checkbox
                            checked={localConfig.contentTypes.includes(type.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <Label className="font-medium cursor-pointer">
                              {type.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              {type.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Ad Media Types</Label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {MEDIA_TYPES.map((type) => {
                        const Icon = type.icon;
                        return (
                          <div
                            key={type.id}
                            className={`flex flex-col items-center p-4 rounded-lg border cursor-pointer transition-colors ${
                              localConfig.mediaTypes.includes(type.id)
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                                : "border-muted hover:border-muted-foreground/50"
                            }`}
                            onClick={() =>
                              updateConfig({
                                mediaTypes: toggleArrayItem(
                                  localConfig.mediaTypes,
                                  type.id,
                                ),
                              })
                            }
                          >
                            <Icon
                              className={`h-8 w-8 mb-2 ${
                                localConfig.mediaTypes.includes(type.id)
                                  ? "text-orange-600"
                                  : "text-muted-foreground"
                              }`}
                            />
                            <Label className="font-medium text-center cursor-pointer">
                              {type.label}
                            </Label>
                            <p className="text-xs text-muted-foreground text-center mt-1">
                              {type.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All media is AI-generated in-house. No external APIs used.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="platforms" className="space-y-4">
                  <div className="space-y-3">
                    <Label>Ad Platforms</Label>
                    <p className="text-sm text-muted-foreground">
                      Select platforms where AI will create and optimize ad
                      campaigns
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {PLATFORMS.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`flex flex-col items-center p-4 rounded-lg border cursor-pointer transition-all ${
                              localConfig.platforms.includes(platform.id)
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20 shadow-sm"
                                : "border-muted hover:border-muted-foreground/50"
                            }`}
                            onClick={() =>
                              updateConfig({
                                platforms: toggleArrayItem(
                                  localConfig.platforms,
                                  platform.id,
                                ),
                              })
                            }
                          >
                            <div
                              className="h-12 w-12 rounded-full flex items-center justify-center mb-2"
                              style={{
                                backgroundColor: localConfig.platforms.includes(
                                  platform.id,
                                )
                                  ? platform.color
                                  : "#e5e7eb",
                                color: localConfig.platforms.includes(
                                  platform.id,
                                )
                                  ? "white"
                                  : "#6b7280",
                              }}
                            >
                              {Icon ? (
                                <Icon className="h-5 w-5" />
                              ) : (
                                <Globe className="h-5 w-5" />
                              )}
                            </div>
                            <span className="font-medium text-sm text-center">
                              {platform.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="cross-platform" className="font-medium">
                        Cross-Platform Campaigns
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Optimize and run the same campaign across multiple
                        platforms
                      </p>
                    </div>
                    <Switch
                      id="cross-platform"
                      checked={localConfig.crossPlatformCampaigns}
                      onCheckedChange={(checked) =>
                        updateConfig({ crossPlatformCampaigns: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="optimal-times" className="font-medium">
                        Optimal Times Only
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        When auto-publish is on, use your top measured day and
                        hour for the lead platform. Without history, publishing
                        waits; review drafts are still generated.
                      </p>
                    </div>
                    <Switch
                      id="optimal-times"
                      checked={localConfig.optimalTimesOnly}
                      onCheckedChange={(checked) =>
                        updateConfig({ optimalTimesOnly: checked })
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Organic promotion only
                    </p>
                    <p className="mt-1">
                      This autopilot creates zero-budget social promotions for
                      content you own. Paid audience targeting, viral scores,
                      and engagement predictions are not available here.
                      MaxCore-generated creative is used without inventing
                      performance estimates.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                MaxCore Model Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Badge variant={modelStatus.trained ? "default" : "secondary"}>
                  {modelStatus.trained ? "Model ready" : "Model not trained"}
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Authority: {modelStatus.authority || "MaxCore"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Version: {modelStatus.version || "Not reported"}
                </p>
                <p className="text-xs text-muted-foreground">
                  No quality, reach, or viral-prediction percentages are shown
                  unless MaxCore provides measured results.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {status.recentActivity && status.recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {status.recentActivity.map(
                    (activity: Record<string, unknown>, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                      >
                        {activity.status === "completed" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : activity.status === "failed" ? (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {activity.title || "Campaign processed"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.description ||
                              "Platform optimization completed"}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {activity.time
                            ? new Date(activity.time).toLocaleTimeString()
                            : ""}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2" />
                  <p>
                    No activity yet. Start the autopilot to begin generating
                    campaigns.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
