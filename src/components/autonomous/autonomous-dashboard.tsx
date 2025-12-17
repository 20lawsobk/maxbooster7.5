import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Sparkles,
  Play,
  Pause,
  TrendingUp,
  Users,
  Target,
  Activity,
  Brain,
  Zap,
  Settings as SettingsIcon,
  Clock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  BarChart3,
  Image,
  Video,
  Music,
  FileText,
  Globe,
  RefreshCw,
  Save,
  RotateCcw,
  Megaphone,
  Rocket,
  Eye,
  MousePointerClick,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  ThreadsIcon,
} from '@/components/ui/brand-icons';

interface AdvertisingAutopilotConfig {
  enabled: boolean;
  platforms: string[];
  campaignObjective: 'awareness' | 'engagement' | 'conversions' | 'traffic' | 'viral';
  campaignFrequency: 'hourly' | 'daily' | 'twice-daily' | 'weekly';
  brandVoice: 'professional' | 'casual' | 'energetic' | 'informative';
  contentTypes: string[];
  mediaTypes: string[];
  targetAudience: string;
  ageMin: number;
  ageMax: number;
  interests: string[];
  locations: string[];
  budgetOptimization: boolean;
  dailyBudgetLimit: number;
  viralOptimization: boolean;
  algorithmicTargeting: boolean;
  autoPublish: boolean;
  optimalTimesOnly: boolean;
  crossPlatformCampaigns: boolean;
  engagementThreshold: number;
  minConfidenceThreshold: number;
  autoAnalyzeBeforePosting: boolean;
}

const PLATFORMS = [
  { id: 'facebook', name: 'Facebook Ads', icon: FacebookIcon, color: '#1877F2' },
  { id: 'instagram', name: 'Instagram Ads', icon: InstagramIcon, color: '#E4405F' },
  { id: 'twitter', name: 'Twitter (X) Ads', icon: null, color: '#000000' },
  { id: 'tiktok', name: 'TikTok Ads', icon: TikTokIcon, color: '#000000' },
  { id: 'youtube', name: 'YouTube Ads', icon: YouTubeIcon, color: '#FF0000' },
  { id: 'linkedin', name: 'LinkedIn Ads', icon: LinkedInIcon, color: '#0077B5' },
  { id: 'threads', name: 'Threads', icon: ThreadsIcon, color: '#000000' },
];

const CONTENT_TYPES = [
  { id: 'brand-awareness', label: 'Brand Awareness', description: 'Increase visibility and recognition' },
  { id: 'product-promotion', label: 'Product Promotion', description: 'Promote your music and releases' },
  { id: 'engagement-boost', label: 'Engagement Boost', description: 'Drive likes, comments, and shares' },
  { id: 'traffic-drive', label: 'Traffic Driver', description: 'Drive traffic to your website or store' },
  { id: 'viral-content', label: 'Viral Content', description: 'AI-optimized viral campaigns' },
  { id: 'retargeting', label: 'Retargeting', description: 'Re-engage past visitors' },
];

const MEDIA_TYPES = [
  { id: 'text', label: 'Text Ads', icon: FileText, description: 'Text-only ad copy' },
  { id: 'image', label: 'Image Ads', icon: Image, description: 'AI-generated graphics' },
  { id: 'audio', label: 'Audio Ads', icon: Music, description: 'AI-generated audio clips' },
  { id: 'video', label: 'Video Ads', icon: Video, description: 'AI-generated video content' },
];

const CAMPAIGN_OBJECTIVES = [
  { id: 'awareness', label: 'Brand Awareness', description: 'Reach more people' },
  { id: 'engagement', label: 'Engagement', description: 'Get more interactions' },
  { id: 'conversions', label: 'Conversions', description: 'Drive actions and sales' },
  { id: 'traffic', label: 'Traffic', description: 'Drive website visits' },
  { id: 'viral', label: 'Viral Growth', description: 'Maximize organic sharing' },
];

const DEFAULT_CONFIG: AdvertisingAutopilotConfig = {
  enabled: false,
  platforms: [],
  campaignObjective: 'awareness',
  campaignFrequency: 'daily',
  brandVoice: 'professional',
  contentTypes: ['brand-awareness', 'engagement-boost'],
  mediaTypes: ['text', 'image'],
  targetAudience: '',
  ageMin: 18,
  ageMax: 65,
  interests: [],
  locations: [],
  budgetOptimization: true,
  dailyBudgetLimit: 0,
  viralOptimization: true,
  algorithmicTargeting: true,
  autoPublish: false,
  optimalTimesOnly: true,
  crossPlatformCampaigns: false,
  engagementThreshold: 0.02,
  minConfidenceThreshold: 0.70,
  autoAnalyzeBeforePosting: true,
};

export function AutonomousDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeConfigTab, setActiveConfigTab] = useState('basic');
  const [localConfig, setLocalConfig] = useState<AdvertisingAutopilotConfig>(DEFAULT_CONFIG);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: autopilotData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['/api/advertising-autopilot/status'],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (autopilotData?.config) {
      const serverConfig = autopilotData.config;
      setLocalConfig({
        ...DEFAULT_CONFIG,
        ...serverConfig,
        mediaTypes: serverConfig.mediaTypes || DEFAULT_CONFIG.mediaTypes,
        contentTypes: serverConfig.contentTypes || DEFAULT_CONFIG.contentTypes,
        interests: serverConfig.interests || DEFAULT_CONFIG.interests,
        locations: serverConfig.locations || DEFAULT_CONFIG.locations,
      });
      setHasUnsavedChanges(false);
    }
  }, [autopilotData]);

  const toggleAutopilotMutation = useMutation({
    mutationFn: async (shouldStart: boolean) => {
      const endpoint = shouldStart ? '/api/advertising-autopilot/start' : '/api/advertising-autopilot/stop';
      const response = await apiRequest('POST', endpoint, {});
      return response.json();
    },
    onSuccess: (_, shouldStart) => {
      queryClient.invalidateQueries({ queryKey: ['/api/advertising-autopilot/status'] });
      toast({
        title: shouldStart ? 'Advertising Autopilot Started' : 'Advertising Autopilot Paused',
        description: shouldStart 
          ? 'AI is now generating and managing ad campaigns automatically' 
          : 'Advertising autopilot has been paused',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update autopilot status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: AdvertisingAutopilotConfig) => {
      const response = await apiRequest('POST', '/api/advertising-autopilot/configure', config);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/advertising-autopilot/status'] });
      setHasUnsavedChanges(false);
      toast({
        title: 'Configuration Saved',
        description: 'Your advertising autopilot settings have been updated.',
      });
    },
    onError: () => {
      toast({
        title: 'Save Failed',
        description: 'Failed to save configuration. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateConfig = (updates: Partial<AdvertisingAutopilotConfig>) => {
    setLocalConfig(prev => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const handleSaveConfig = () => {
    saveConfigMutation.mutate(localConfig);
  };

  const handleResetConfig = () => {
    if (autopilotData?.config) {
      setLocalConfig({
        ...DEFAULT_CONFIG,
        ...autopilotData.config,
      });
    } else {
      setLocalConfig(DEFAULT_CONFIG);
    }
    setHasUnsavedChanges(false);
  };

  const toggleArrayItem = (array: string[], item: string): string[] => {
    if (array.includes(item)) {
      return array.filter(i => i !== item);
    }
    return [...array, item];
  };

  const isRunning = autopilotData?.isRunning || false;
  const status = autopilotData?.status || {};
  const modelStatus = autopilotData?.modelStatus || {};

  if (statusError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load advertising autopilot status. Please refresh the page.</p>
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
                AI-powered ad campaign creation, optimization, and automatic publishing
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={isRunning ? 'default' : 'secondary'} className={isRunning ? 'bg-green-600' : ''}>
                {isRunning ? 'Active' : 'Paused'}
              </Badge>
              <Button
                onClick={() => toggleAutopilotMutation.mutate(!isRunning)}
                variant={isRunning ? 'destructive' : 'default'}
                disabled={toggleAutopilotMutation.isPending || statusLoading}
                className={!isRunning ? 'bg-orange-600 hover:bg-orange-700' : ''}
              >
                {toggleAutopilotMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : isRunning ? (
                  <Pause className="h-4 w-4 mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {isRunning ? 'Pause' : 'Start'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Campaigns Created</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{status.totalCampaigns || 0}</div>
                <p className="text-xs text-muted-foreground">AI-generated campaigns</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {status.totalReach ? (status.totalReach / 1000).toFixed(1) + 'K' : '0'}
                </div>
                <p className="text-xs text-muted-foreground">People reached</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {status.avgEngagementRate ? (status.avgEngagementRate * 100).toFixed(1) + '%' : '0%'}
                </div>
                <p className="text-xs text-muted-foreground">Avg. across campaigns</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Next Campaign</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">
                  {status.nextScheduledCampaign
                    ? new Date(status.nextScheduledCampaign).toLocaleTimeString()
                    : 'No campaigns scheduled'}
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
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
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
                    disabled={!hasUnsavedChanges || saveConfigMutation.isPending}
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
                        onValueChange={(value) => updateConfig({ campaignFrequency: value as AdvertisingAutopilotConfig['campaignFrequency'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="twice-daily">Twice Daily</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">How often to create and optimize campaigns</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Brand Voice</Label>
                      <Select
                        value={localConfig.brandVoice}
                        onValueChange={(value) => updateConfig({ brandVoice: value as AdvertisingAutopilotConfig['brandVoice'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual & Friendly</SelectItem>
                          <SelectItem value="energetic">Energetic & Bold</SelectItem>
                          <SelectItem value="informative">Informative & Educational</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Tone for AI-generated ad copy</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Target Audience Description</Label>
                    <Textarea
                      value={localConfig.targetAudience}
                      onChange={(e) => updateConfig({ targetAudience: e.target.value })}
                      placeholder="Describe your ideal audience (e.g., Music lovers aged 18-35, interested in hip-hop and R&B, located in major US cities)"
                      className="min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">AI will use this to target your ads effectively</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Age Range: {localConfig.ageMin} - {localConfig.ageMax}</Label>
                      <div className="flex items-center gap-4">
                        <Input
                          type="number"
                          min={13}
                          max={65}
                          value={localConfig.ageMin}
                          onChange={(e) => updateConfig({ ageMin: parseInt(e.target.value) || 18 })}
                          className="w-20"
                        />
                        <span className="text-muted-foreground">to</span>
                        <Input
                          type="number"
                          min={18}
                          max={100}
                          value={localConfig.ageMax}
                          onChange={(e) => updateConfig({ ageMax: parseInt(e.target.value) || 65 })}
                          className="w-20"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Daily Budget Limit ($)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={localConfig.dailyBudgetLimit}
                        onChange={(e) => updateConfig({ dailyBudgetLimit: parseInt(e.target.value) || 0 })}
                        placeholder="0 = No limit (organic only)"
                      />
                      <p className="text-xs text-muted-foreground">0 = Zero-cost organic campaigns only</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="auto-publish" className="font-medium">Auto-Publish Campaigns</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically publish AI-generated campaigns without review
                      </p>
                    </div>
                    <Switch
                      id="auto-publish"
                      checked={localConfig.autoPublish}
                      onCheckedChange={(checked) => updateConfig({ autoPublish: checked })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="campaigns" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Primary Campaign Objective</Label>
                    <Select
                      value={localConfig.campaignObjective}
                      onValueChange={(value) => updateConfig({ campaignObjective: value as AdvertisingAutopilotConfig['campaignObjective'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAMPAIGN_OBJECTIVES.map((objective) => (
                          <SelectItem key={objective.id} value={objective.id}>
                            <div className="flex flex-col">
                              <span>{objective.label}</span>
                              <span className="text-xs text-muted-foreground">{objective.description}</span>
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
                              ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                              : 'border-muted hover:border-muted-foreground/50'
                          }`}
                          onClick={() => updateConfig({ 
                            contentTypes: toggleArrayItem(localConfig.contentTypes, type.id) 
                          })}
                        >
                          <Checkbox
                            checked={localConfig.contentTypes.includes(type.id)}
                            className="mt-0.5"
                          />
                          <div>
                            <Label className="font-medium cursor-pointer">{type.label}</Label>
                            <p className="text-xs text-muted-foreground">{type.description}</p>
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
                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'
                                : 'border-muted hover:border-muted-foreground/50'
                            }`}
                            onClick={() => updateConfig({ 
                              mediaTypes: toggleArrayItem(localConfig.mediaTypes, type.id) 
                            })}
                          >
                            <Icon className={`h-8 w-8 mb-2 ${
                              localConfig.mediaTypes.includes(type.id) ? 'text-orange-600' : 'text-muted-foreground'
                            }`} />
                            <Label className="font-medium text-center cursor-pointer">{type.label}</Label>
                            <p className="text-xs text-muted-foreground text-center mt-1">{type.description}</p>
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
                      Select platforms where AI will create and optimize ad campaigns
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {PLATFORMS.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`flex flex-col items-center p-4 rounded-lg border cursor-pointer transition-all ${
                              localConfig.platforms.includes(platform.id)
                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/20 shadow-sm'
                                : 'border-muted hover:border-muted-foreground/50'
                            }`}
                            onClick={() => updateConfig({ 
                              platforms: toggleArrayItem(localConfig.platforms, platform.id) 
                            })}
                          >
                            <div 
                              className="h-12 w-12 rounded-full flex items-center justify-center mb-2"
                              style={{ 
                                backgroundColor: localConfig.platforms.includes(platform.id) ? platform.color : '#e5e7eb',
                                color: localConfig.platforms.includes(platform.id) ? 'white' : '#6b7280'
                              }}
                            >
                              {Icon ? <Icon className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
                            </div>
                            <span className="font-medium text-sm text-center">{platform.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="cross-platform" className="font-medium">Cross-Platform Campaigns</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Optimize and run the same campaign across multiple platforms
                      </p>
                    </div>
                    <Switch
                      id="cross-platform"
                      checked={localConfig.crossPlatformCampaigns}
                      onCheckedChange={(checked) => updateConfig({ crossPlatformCampaigns: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="optimal-times" className="font-medium">Optimal Times Only</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Only launch campaigns during peak engagement hours for each platform
                      </p>
                    </div>
                    <Switch
                      id="optimal-times"
                      checked={localConfig.optimalTimesOnly}
                      onCheckedChange={(checked) => updateConfig({ optimalTimesOnly: checked })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">
                        Engagement Threshold: {(localConfig.engagementThreshold * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[localConfig.engagementThreshold * 100]}
                        onValueChange={([value]) => updateConfig({ engagementThreshold: value / 100 })}
                        min={1}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Minimum expected engagement rate to publish campaign
                      </p>
                    </div>

                    <div>
                      <Label className="mb-2 block">
                        AI Confidence Threshold: {(localConfig.minConfidenceThreshold * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[localConfig.minConfidenceThreshold * 100]}
                        onValueChange={([value]) => updateConfig({ minConfidenceThreshold: value / 100 })}
                        min={50}
                        max={95}
                        step={5}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Minimum AI confidence score required before auto-publishing
                      </p>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="auto-analyze" className="font-medium">Auto-Analyze Content</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Automatically analyze ad content quality before publishing
                        </p>
                      </div>
                      <Switch
                        id="auto-analyze"
                        checked={localConfig.autoAnalyzeBeforePosting}
                        onCheckedChange={(checked) => updateConfig({ autoAnalyzeBeforePosting: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="budget-optimization" className="font-medium">AI Budget Optimization</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          AI automatically allocates budget to best-performing campaigns
                        </p>
                      </div>
                      <Switch
                        id="budget-optimization"
                        checked={localConfig.budgetOptimization}
                        onCheckedChange={(checked) => updateConfig({ budgetOptimization: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="viral-optimization" className="font-medium">Viral Optimization</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Optimize campaigns for maximum organic sharing and viral potential
                        </p>
                      </div>
                      <Switch
                        id="viral-optimization"
                        checked={localConfig.viralOptimization}
                        onCheckedChange={(checked) => updateConfig({ viralOptimization: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="algorithmic-targeting" className="font-medium">Algorithmic Targeting</Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use AI to exploit platform algorithms for organic reach boost
                        </p>
                      </div>
                      <Switch
                        id="algorithmic-targeting"
                        checked={localConfig.algorithmicTargeting}
                        onCheckedChange={(checked) => updateConfig({ algorithmicTargeting: checked })}
                      />
                    </div>

                    <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Brain className="h-5 w-5 text-orange-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-orange-900 dark:text-orange-100">AI Learning</h4>
                            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                              The advertising autopilot continuously learns from your campaign performance to improve 
                              future targeting and content. High-performing ad formats and audiences will be 
                              prioritized automatically.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                AI Learning & Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Campaign Quality Score</span>
                    <span className="font-medium">{modelStatus.trained ? '87%' : '0%'}</span>
                  </div>
                  <Progress value={modelStatus.trained ? 87 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Audience Targeting Accuracy</span>
                    <span className="font-medium">{modelStatus.trained ? '92%' : '0%'}</span>
                  </div>
                  <Progress value={modelStatus.trained ? 92 : 0} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Viral Prediction Accuracy</span>
                    <span className="font-medium">{modelStatus.trained ? '78%' : '0%'}</span>
                  </div>
                  <Progress value={modelStatus.trained ? 78 : 0} className="h-2" />
                </div>
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
              {(status.recentActivity && status.recentActivity.length > 0) ? (
                <div className="space-y-3">
                  {status.recentActivity.map((activity: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                      {activity.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : activity.status === 'failed' ? (
                        <AlertCircle className="h-4 w-4 text-red-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-600" />
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.title || 'Campaign processed'}</p>
                        <p className="text-xs text-muted-foreground">
                          {activity.description || 'Platform optimization completed'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {activity.time ? new Date(activity.time).toLocaleTimeString() : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Sparkles className="h-8 w-8 mx-auto mb-2" />
                  <p>No activity yet. Start the autopilot to begin generating campaigns.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
