import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Bot,
  Sparkles,
  Save,
  RefreshCw,
  Music,
  Users,
  MessageSquare,
  Hash,
  Clock,
  Target,
  Zap,
  Settings,
} from "lucide-react";

interface PlatformSetting {
  enabled: boolean;
  postsPerDay: number;
  autoPost: boolean;
  contentTypes: string[];
}

interface PostingSchedule {
  timezone: string;
  preferredHours: number[];
  preferredDays: string[];
  avoidHours: number[];
  avoidDays: string[];
}

interface ContentExamples {
  goodPosts: string[];
  badPosts: string[];
  inspirationalAccounts: string[];
}

interface CurrentRelease {
  title: string;
  type: string;
  releaseDate: string;
  streamingLinks: Record<string, string>;
  promoUntil: string;
}

interface AutopilotPreferencesData {
  userId?: string;
  artistName: string;
  artistBio: string;
  genre: string;
  subGenres: string[];
  brandVoice: string;
  targetAudience: string;
  uniqueSellingPoints: string[];
  contentTone: string;
  preferredEmojis: string[];
  avoidEmojis: boolean;
  preferredHashtags: string[];
  avoidHashtags: string[];
  contentThemes: string[];
  avoidTopics: string[];
  callToActionStyle: string;
  contentQualityThreshold: number;
  platformSettings: Record<string, PlatformSetting>;
  postingSchedule: PostingSchedule;
  adAutopilotEnabled: boolean;
  organicGrowthPriority: string;
  crossPostingEnabled: boolean;
  viralOptimizationLevel: string;
  contentExamples: ContentExamples;
  currentReleases: CurrentRelease[];
  customInstructions: string;
  isActive: boolean;
}

const defaultPreferences: AutopilotPreferencesData = {
  artistName: "",
  artistBio: "",
  genre: "",
  subGenres: [],
  brandVoice: "casual",
  targetAudience: "",
  uniqueSellingPoints: [],
  contentTone: "casual",
  preferredEmojis: [],
  avoidEmojis: false,
  preferredHashtags: [],
  avoidHashtags: [],
  contentThemes: [],
  avoidTopics: [],
  callToActionStyle: "direct",
  contentQualityThreshold: 90,
  platformSettings: {},
  postingSchedule: {
    timezone: "America/New_York",
    preferredHours: [9, 12, 18, 21],
    preferredDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    avoidHours: [],
    avoidDays: [],
  },
  adAutopilotEnabled: false,
  organicGrowthPriority: "engagement",
  crossPostingEnabled: true,
  viralOptimizationLevel: "moderate",
  contentExamples: { goodPosts: [], badPosts: [], inspirationalAccounts: [] },
  currentReleases: [],
  customInstructions: "",
  isActive: true,
};

const PLATFORMS = [
  { id: "twitter", name: "Twitter/X" },
  { id: "instagram", name: "Instagram" },
  { id: "tiktok", name: "TikTok" },
  { id: "facebook", name: "Facebook" },
  { id: "youtube", name: "YouTube" },
  { id: "linkedin", name: "LinkedIn" },
  { id: "threads", name: "Threads" },
  { id: "googlebusiness", name: "Google Business" },
];

const GENRES = [
  "Hip-Hop/Rap",
  "R&B/Soul",
  "Pop",
  "Rock",
  "Electronic/EDM",
  "Country",
  "Jazz",
  "Classical",
  "Reggae",
  "Latin",
  "Metal",
  "Indie",
  "Other",
];

const CONTENT_THEMES = [
  "New Releases",
  "Behind The Scenes",
  "Fan Engagement",
  "Promotions",
  "Personal Updates",
  "Industry News",
  "Collaborations",
  "Live Shows",
  "Studio Sessions",
  "Music Production Tips",
  "Throwbacks",
  "Challenges",
];

export function AutopilotPreferences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [preferences, setPreferences] =
    useState<AutopilotPreferencesData>(defaultPreferences);
  const [newHashtag, setNewHashtag] = useState("");
  const [newTheme, setNewTheme] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["autopilot-preferences"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/autopilot/preferences");
      return res.json();
    },
  });

  useEffect(() => {
    if (data) {
      setPreferences({ ...defaultPreferences, ...data });
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (data: AutopilotPreferencesData) =>
      apiRequest("POST", "/api/autopilot/preferences", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["autopilot-preferences"] });
      toast({
        title: "Preferences Saved",
        description:
          "Your autopilot preferences have been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save preferences. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(preferences);
  };

  const addHashtag = () => {
    if (newHashtag && !preferences.preferredHashtags.includes(newHashtag)) {
      setPreferences({
        ...preferences,
        preferredHashtags: [
          ...preferences.preferredHashtags,
          newHashtag.startsWith("#") ? newHashtag : `#${newHashtag}`,
        ],
      });
      setNewHashtag("");
    }
  };

  const removeHashtag = (tag: string) => {
    setPreferences({
      ...preferences,
      preferredHashtags: preferences.preferredHashtags.filter((t) => t !== tag),
    });
  };

  const toggleTheme = (theme: string) => {
    const themes = preferences.contentThemes.includes(theme)
      ? preferences.contentThemes.filter((t) => t !== theme)
      : [...preferences.contentThemes, theme];
    setPreferences({ ...preferences, contentThemes: themes });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Autopilot Preferences
          </h2>
          <p className="text-muted-foreground">
            Configure how the AI generates and posts content on your behalf
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "Saving..." : "Save Preferences"}
        </Button>
      </div>

      <Tabs defaultValue="identity" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="identity">
            <Music className="h-4 w-4 mr-2" />
            Identity
          </TabsTrigger>
          <TabsTrigger value="content">
            <MessageSquare className="h-4 w-4 mr-2" />
            Content
          </TabsTrigger>
          <TabsTrigger value="platforms">
            <Settings className="h-4 w-4 mr-2" />
            Platforms
          </TabsTrigger>
          <TabsTrigger value="schedule">
            <Clock className="h-4 w-4 mr-2" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="optimization">
            <Zap className="h-4 w-4 mr-2" />
            Optimization
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Artist/Brand Identity</CardTitle>
              <CardDescription>
                Tell the AI about your artist persona and brand voice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="artistName">Artist/Brand Name</Label>
                  <Input
                    id="artistName"
                    value={preferences.artistName}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        artistName: e.target.value,
                      })
                    }
                    placeholder="Your artist name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre">Primary Genre</Label>
                  <Select
                    value={preferences.genre}
                    onValueChange={(value) =>
                      setPreferences({ ...preferences, genre: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select genre" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENRES.map((genre) => (
                        <SelectItem key={genre} value={genre}>
                          {genre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="artistBio">Artist Bio / Description</Label>
                <Textarea
                  id="artistBio"
                  value={preferences.artistBio}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      artistBio: e.target.value,
                    })
                  }
                  placeholder="Brief description of your music and brand..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="targetAudience">Target Audience</Label>
                <Input
                  id="targetAudience"
                  value={preferences.targetAudience}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      targetAudience: e.target.value,
                    })
                  }
                  placeholder="e.g., 18-35 year olds who love hip-hop and streetwear"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brandVoice">Brand Voice</Label>
                  <Select
                    value={preferences.brandVoice}
                    onValueChange={(value) =>
                      setPreferences({ ...preferences, brandVoice: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select voice" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="energetic">Energetic</SelectItem>
                      <SelectItem value="edgy">Edgy</SelectItem>
                      <SelectItem value="inspirational">
                        Inspirational
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contentTone">Content Tone</Label>
                  <Select
                    value={preferences.contentTone}
                    onValueChange={(value) =>
                      setPreferences({ ...preferences, contentTone: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="energetic">Energetic</SelectItem>
                      <SelectItem value="promotional">Promotional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Content Generation Settings</CardTitle>
              <CardDescription>
                Control what type of content the AI creates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Content Themes</Label>
                <p className="text-sm text-muted-foreground">
                  Select the types of content you want the AI to create
                </p>
                <div className="flex flex-wrap gap-2">
                  {CONTENT_THEMES.map((theme) => (
                    <Badge
                      key={theme}
                      variant={
                        preferences.contentThemes.includes(theme)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer"
                      onClick={() => toggleTheme(theme)}
                    >
                      {theme}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preferred Hashtags</Label>
                <div className="flex gap-2">
                  <Input
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    placeholder="Add a hashtag"
                    onKeyPress={(e) => e.key === "Enter" && addHashtag()}
                  />
                  <Button onClick={addHashtag} variant="outline">
                    <Hash className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {preferences.preferredHashtags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="cursor-pointer"
                      onClick={() => removeHashtag(tag)}
                    >
                      {tag} ×
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ctaStyle">Call-to-Action Style</Label>
                  <Select
                    value={preferences.callToActionStyle}
                    onValueChange={(value) =>
                      setPreferences({
                        ...preferences,
                        callToActionStyle: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select CTA style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">
                        Direct (e.g., "Stream now!")
                      </SelectItem>
                      <SelectItem value="subtle">
                        Subtle (e.g., "Link in bio")
                      </SelectItem>
                      <SelectItem value="question">
                        Question (e.g., "Ready to listen?")
                      </SelectItem>
                      <SelectItem value="urgency">
                        Urgency (e.g., "Don't miss out!")
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-8">
                  <Switch
                    id="avoidEmojis"
                    checked={preferences.avoidEmojis}
                    onCheckedChange={(checked) =>
                      setPreferences({ ...preferences, avoidEmojis: checked })
                    }
                  />
                  <Label htmlFor="avoidEmojis">Avoid using emojis</Label>
                </div>
              </div>

              <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                    <span className="text-sm font-semibold text-purple-300">
                      AI Quality Gate — Active
                    </span>
                  </div>
                  <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">
                    {preferences.contentQualityThreshold}% minimum
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Before any post goes live, the autopilot runs up to 8
                  generation rounds with A/B variant testing until a piece of
                  content scores at least {preferences.contentQualityThreshold}
                  /100. Every rejected attempt is archived in Pocket Dimension
                  to continuously train the models. The AI learns 3x faster than
                  human capacity — the bar stays high and the output keeps
                  improving.
                </p>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-purple-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${preferences.contentQualityThreshold}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customInstructions">Custom Instructions</Label>
                <Textarea
                  id="customInstructions"
                  value={preferences.customInstructions}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      customInstructions: e.target.value,
                    })
                  }
                  placeholder="Any specific instructions for the AI when generating content..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="platforms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Platform Settings</CardTitle>
              <CardDescription>
                Configure auto-posting for each platform
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {PLATFORMS.map((platform) => {
                const settings = preferences.platformSettings[platform.id] || {
                  enabled: false,
                  postsPerDay: 1,
                  autoPost: false,
                  contentTypes: [],
                };

                return (
                  <div
                    key={platform.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <Switch
                        checked={settings.enabled}
                        onCheckedChange={(checked) => {
                          setPreferences({
                            ...preferences,
                            platformSettings: {
                              ...preferences.platformSettings,
                              [platform.id]: { ...settings, enabled: checked },
                            },
                          });
                        }}
                      />
                      <span className="font-medium">{platform.name}</span>
                    </div>
                    {settings.enabled && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm">Posts/day:</Label>
                          <Select
                            value={String(settings.postsPerDay)}
                            onValueChange={(value) => {
                              setPreferences({
                                ...preferences,
                                platformSettings: {
                                  ...preferences.platformSettings,
                                  [platform.id]: {
                                    ...settings,
                                    postsPerDay: parseInt(value),
                                  },
                                },
                              });
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <SelectItem key={n} value={String(n)}>
                                  {n}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={settings.autoPost}
                            onCheckedChange={(checked) => {
                              setPreferences({
                                ...preferences,
                                platformSettings: {
                                  ...preferences.platformSettings,
                                  [platform.id]: {
                                    ...settings,
                                    autoPost: checked,
                                  },
                                },
                              });
                            }}
                          />
                          <Label className="text-sm">Auto-post</Label>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Posting Schedule</CardTitle>
              <CardDescription>
                Set your preferred posting times
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Preferred Posting Hours</Label>
                <p className="text-sm text-muted-foreground">
                  Select the hours when you want content to be posted
                </p>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                    <Badge
                      key={hour}
                      variant={
                        preferences.postingSchedule.preferredHours.includes(
                          hour,
                        )
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer w-12 justify-center"
                      onClick={() => {
                        const hours =
                          preferences.postingSchedule.preferredHours.includes(
                            hour,
                          )
                            ? preferences.postingSchedule.preferredHours.filter(
                                (h) => h !== hour,
                              )
                            : [
                                ...preferences.postingSchedule.preferredHours,
                                hour,
                              ];
                        setPreferences({
                          ...preferences,
                          postingSchedule: {
                            ...preferences.postingSchedule,
                            preferredHours: hours,
                          },
                        });
                      }}
                    >
                      {hour.toString().padStart(2, "0")}:00
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Preferred Posting Days</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ].map((day) => (
                    <Badge
                      key={day}
                      variant={
                        preferences.postingSchedule.preferredDays.includes(day)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer capitalize"
                      onClick={() => {
                        const days =
                          preferences.postingSchedule.preferredDays.includes(
                            day,
                          )
                            ? preferences.postingSchedule.preferredDays.filter(
                                (d) => d !== day,
                              )
                            : [
                                ...preferences.postingSchedule.preferredDays,
                                day,
                              ];
                        setPreferences({
                          ...preferences,
                          postingSchedule: {
                            ...preferences.postingSchedule,
                            preferredDays: days,
                          },
                        });
                      }}
                    >
                      {day}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Settings</CardTitle>
              <CardDescription>
                Configure growth and optimization strategies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Advertisement Autopilot</p>
                  <p className="text-sm text-muted-foreground">
                    Enable AI-powered organic growth optimization
                  </p>
                </div>
                <Switch
                  checked={preferences.adAutopilotEnabled}
                  onCheckedChange={(checked) =>
                    setPreferences({
                      ...preferences,
                      adAutopilotEnabled: checked,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Cross-Platform Posting</p>
                  <p className="text-sm text-muted-foreground">
                    Automatically adapt and post content across platforms
                  </p>
                </div>
                <Switch
                  checked={preferences.crossPostingEnabled}
                  onCheckedChange={(checked) =>
                    setPreferences({
                      ...preferences,
                      crossPostingEnabled: checked,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Organic Growth Priority</Label>
                  <Select
                    value={preferences.organicGrowthPriority}
                    onValueChange={(value) =>
                      setPreferences({
                        ...preferences,
                        organicGrowthPriority: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reach">Maximize Reach</SelectItem>
                      <SelectItem value="engagement">
                        Maximize Engagement
                      </SelectItem>
                      <SelectItem value="followers">Grow Followers</SelectItem>
                      <SelectItem value="conversions">
                        Drive Conversions
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Viral Optimization Level</Label>
                  <Select
                    value={preferences.viralOptimizationLevel}
                    onValueChange={(value) =>
                      setPreferences({
                        ...preferences,
                        viralOptimizationLevel: value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
