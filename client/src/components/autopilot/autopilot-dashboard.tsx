import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  Play,
  Pause,
  Settings as SettingsIcon,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Zap,
  Image,
  Video,
  Music,
  FileText,
  Target,
  Users,
  Hash,
  Globe,
  Brain,
  Sparkles,
  RefreshCw,
  Save,
  RotateCcw,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  ThreadsIcon,
} from '@/components/ui/brand-icons';

interface AutopilotConfig {
  enabled: boolean;
  platforms: string[];
  topics: string[];
  postingFrequency: 'hourly' | 'daily' | 'twice-daily' | 'weekly';
  brandVoice: 'professional' | 'casual' | 'energetic' | 'informative';
  contentTypes: string[];
  mediaTypes: string[];
  targetAudience: string;
  businessGoals: string[];
  autoPublish: boolean;
  optimalTimesOnly: boolean;
  crossPostingEnabled: boolean;
  engagementThreshold: number;
  minConfidenceThreshold: number;
  autoAnalyzeBeforePosting: boolean;
}

const PLATFORMS = [
  { id: 'twitter', name: 'Twitter (X)', icon: null, color: '#000000' },
  { id: 'instagram', name: 'Instagram', icon: InstagramIcon, color: '#E4405F' },
  { id: 'facebook', name: 'Facebook', icon: FacebookIcon, color: '#1877F2' },
  { id: 'tiktok', name: 'TikTok', icon: TikTokIcon, color: '#000000' },
  { id: 'youtube', name: 'YouTube', icon: YouTubeIcon, color: '#FF0000' },
  { id: 'linkedin', name: 'LinkedIn', icon: LinkedInIcon, color: '#0077B5' },
  { id: 'threads', name: 'Threads', icon: ThreadsIcon, color: '#000000' },
];

const CONTENT_TYPES = [
  { id: 'tips', label: 'Tips & Advice', description: 'Share helpful tips with your audience' },
  { id: 'insights', label: 'Industry Insights', description: 'Share knowledge and expertise' },
  { id: 'questions', label: 'Questions', description: 'Engage your audience with questions' },
  { id: 'announcements', label: 'Announcements', description: 'Share news and updates' },
  { id: 'behind-the-scenes', label: 'Behind the Scenes', description: 'Show your creative process' },
  { id: 'promotions', label: 'Promotions', description: 'Promote your music and releases' },
];

const MEDIA_TYPES = [
  { id: 'text', label: 'Text Posts', icon: FileText, description: 'Text-only content' },
  { id: 'image', label: 'Images', icon: Image, description: 'AI-generated graphics' },
  { id: 'audio', label: 'Audio', icon: Music, description: 'AI-generated audio clips' },
  { id: 'video', label: 'Video', icon: Video, description: 'AI-generated video content' },
];

const BUSINESS_GOALS = [
  { id: 'engagement', label: 'Increase Engagement' },
  { id: 'followers', label: 'Grow Followers' },
  { id: 'brand-awareness', label: 'Build Brand Awareness' },
  { id: 'traffic', label: 'Drive Traffic' },
  { id: 'sales', label: 'Generate Sales' },
  { id: 'community', label: 'Build Community' },
];

const DEFAULT_CONFIG: AutopilotConfig = {
  enabled: false,
  platforms: [],
  topics: [],
  postingFrequency: 'daily',
  brandVoice: 'professional',
  contentTypes: ['tips', 'insights'],
  mediaTypes: ['text', 'image'],
  targetAudience: '',
  businessGoals: ['engagement', 'brand-awareness'],
  autoPublish: false,
  optimalTimesOnly: true,
  crossPostingEnabled: false,
  engagementThreshold: 0.02,
  minConfidenceThreshold: 0.70,
  autoAnalyzeBeforePosting: true,
};

export function AutopilotDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeConfigTab, setActiveConfigTab] = useState('basic');
  const [localConfig, setLocalConfig] = useState<AutopilotConfig>(DEFAULT_CONFIG);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: autopilotData, isLoading: statusLoading, error: statusError } = useQuery({
    queryKey: ['/api/autopilot/status'],
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (autopilotData?.config) {
      const serverConfig = autopilotData.config;
      setLocalConfig({
        ...DEFAULT_CONFIG,
        ...serverConfig,
        mediaTypes: serverConfig.mediaTypes || DEFAULT_CONFIG.mediaTypes,
        topics: serverConfig.topics || DEFAULT_CONFIG.topics,
        businessGoals: serverConfig.businessGoals || DEFAULT_CONFIG.businessGoals,
      });
      setHasUnsavedChanges(false);
    }
  }, [autopilotData]);

  const toggleAutopilotMutation = useMutation({
    mutationFn: async (shouldStart: boolean) => {
      const endpoint = shouldStart ? '/api/autopilot/start' : '/api/autopilot/stop';
      const response = await apiRequest('POST', endpoint, {});
      return response.json();
    },
    onSuccess: (_, shouldStart) => {
      queryClient.invalidateQueries({ queryKey: ['/api/autopilot/status'] });
      toast({
        title: shouldStart ? 'Autopilot Started' : 'Autopilot Paused',
        description: shouldStart 
          ? 'AI is now generating and publishing content automatically' 
          : 'Autopilot has been paused',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update autopilot status. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (config: AutopilotConfig) => {
      const response = await apiRequest('POST', '/api/autopilot/configure', config);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/autopilot/status'] });
      setHasUnsavedChanges(false);
      toast({
        title: 'Configuration Saved',
        description: 'Your autopilot settings have been updated.',
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

  const updateConfig = (updates: Partial<AutopilotConfig>) => {
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

  if (statusError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="text-center text-destructive">
            <AlertCircle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load autopilot status. Please refresh the page.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Social Media Autopilot
              </CardTitle>
              <CardDescription>
                AI-powered content creation, optimization, and automatic publishing
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
                <CardTitle className="text-sm font-medium">Total Generated</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{status.totalGenerated || 0}</div>
                <p className="text-xs text-muted-foreground">Content pieces</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Published</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {status.totalPublished || 0}
                </div>
                <p className="text-xs text-muted-foreground">Successfully posted</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {status.pendingCount || 0}
                </div>
                <p className="text-xs text-muted-foreground">Queued for publishing</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Next Scheduled</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">
                  {status.nextScheduledJob
                    ? new Date(status.nextScheduledJob).toLocaleTimeString()
                    : 'No jobs scheduled'}
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
                  <TabsTrigger value="content">Content</TabsTrigger>
                  <TabsTrigger value="platforms">Platforms</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Posting Frequency</Label>
                      <Select
                        value={localConfig.postingFrequency}
                        onValueChange={(value) => updateConfig({ postingFrequency: value as AutopilotConfig['postingFrequency'] })}
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
                      <p className="text-xs text-muted-foreground">How often to generate and post content</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Brand Voice</Label>
                      <Select
                        value={localConfig.brandVoice}
                        onValueChange={(value) => updateConfig({ brandVoice: value as AutopilotConfig['brandVoice'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="energetic">Energetic</SelectItem>
                          <SelectItem value="informative">Informative</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">The tone of generated content</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Input
                      value={localConfig.targetAudience}
                      onChange={(e) => updateConfig({ targetAudience: e.target.value })}
                      placeholder="e.g., Music lovers, Hip-hop fans, Gen Z, Artists"
                    />
                    <p className="text-xs text-muted-foreground">Describe who you want to reach</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Topics (comma separated)</Label>
                    <Textarea
                      value={localConfig.topics.join(', ')}
                      onChange={(e) => updateConfig({ 
                        topics: e.target.value.split(',').map(t => t.trim()).filter(Boolean) 
                      })}
                      placeholder="e.g., new music, production tips, studio sessions, music industry"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">Topics to focus on in generated content</p>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="auto-publish" className="font-medium">Auto-Publish Content</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Automatically publish content when it meets confidence threshold
                      </p>
                    </div>
                    <Switch
                      id="auto-publish"
                      checked={localConfig.autoPublish}
                      onCheckedChange={(checked) => updateConfig({ autoPublish: checked })}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="content" className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-medium mb-3 block">Content Types</Label>
                      <p className="text-sm text-muted-foreground mb-3">Select what types of content to generate</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {CONTENT_TYPES.map((type) => (
                          <div
                            key={type.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              localConfig.contentTypes.includes(type.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                              contentTypes: toggleArrayItem(localConfig.contentTypes, type.id)
                            })}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox 
                                checked={localConfig.contentTypes.includes(type.id)}
                                className="pointer-events-none"
                              />
                              <div>
                                <p className="font-medium text-sm">{type.label}</p>
                                <p className="text-xs text-muted-foreground">{type.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-medium mb-3 block">Media Types</Label>
                      <p className="text-sm text-muted-foreground mb-3">Select what media formats to generate</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {MEDIA_TYPES.map((type) => {
                          const Icon = type.icon;
                          return (
                            <div
                              key={type.id}
                              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                localConfig.mediaTypes.includes(type.id)
                                  ? 'border-primary bg-primary/10'
                                  : 'border-muted hover:border-primary/50'
                              }`}
                              onClick={() => updateConfig({
                                mediaTypes: toggleArrayItem(localConfig.mediaTypes, type.id)
                              })}
                            >
                              <div className="flex flex-col items-center gap-2 text-center">
                                <div className={`p-2 rounded-full ${
                                  localConfig.mediaTypes.includes(type.id)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }`}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <p className="font-medium text-sm">{type.label}</p>
                                <p className="text-xs text-muted-foreground">{type.description}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-medium mb-3 block">Business Goals</Label>
                      <p className="text-sm text-muted-foreground mb-3">What do you want to achieve?</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {BUSINESS_GOALS.map((goal) => (
                          <div
                            key={goal.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              localConfig.businessGoals.includes(goal.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                              businessGoals: toggleArrayItem(localConfig.businessGoals, goal.id)
                            })}
                          >
                            <div className="flex items-center gap-2">
                              <Checkbox 
                                checked={localConfig.businessGoals.includes(goal.id)}
                                className="pointer-events-none"
                              />
                              <span className="font-medium text-sm">{goal.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="platforms" className="space-y-4">
                  <div>
                    <Label className="text-base font-medium mb-3 block">Target Platforms</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Select which platforms to publish to automatically
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {PLATFORMS.map((platform) => {
                        const Icon = platform.icon;
                        return (
                          <div
                            key={platform.id}
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                              localConfig.platforms.includes(platform.id)
                                ? 'border-primary bg-primary/10'
                                : 'border-muted hover:border-primary/50'
                            }`}
                            onClick={() => updateConfig({
                              platforms: toggleArrayItem(localConfig.platforms, platform.id)
                            })}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <div 
                                className="p-2 rounded-full"
                                style={{ 
                                  backgroundColor: localConfig.platforms.includes(platform.id) 
                                    ? platform.color 
                                    : '#e5e7eb',
                                  color: localConfig.platforms.includes(platform.id) ? 'white' : '#6b7280'
                                }}
                              >
                                {Icon ? <Icon className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
                              </div>
                              <span className="font-medium text-sm">{platform.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="cross-posting" className="font-medium">Cross-Platform Posting</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Optimize and post the same content to multiple platforms
                      </p>
                    </div>
                    <Switch
                      id="cross-posting"
                      checked={localConfig.crossPostingEnabled}
                      onCheckedChange={(checked) => updateConfig({ crossPostingEnabled: checked })}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="optimal-times" className="font-medium">Optimal Times Only</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Only post during peak engagement hours for each platform
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
                        Minimum expected engagement rate to publish content
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
                          Automatically analyze content quality before posting
                        </p>
                      </div>
                      <Switch
                        id="auto-analyze"
                        checked={localConfig.autoAnalyzeBeforePosting}
                        onCheckedChange={(checked) => updateConfig({ autoAnalyzeBeforePosting: checked })}
                      />
                    </div>

                    <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Brain className="h-5 w-5 text-blue-600 mt-0.5" />
                          <div>
                            <h4 className="font-medium text-blue-900 dark:text-blue-100">AI Learning</h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                              The autopilot continuously learns from your content performance to improve 
                              future recommendations. Higher engagement content styles and topics will be 
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
                        <p className="text-sm font-medium">{activity.title || 'Content processed'}</p>
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
                  <p>No activity yet. Start the autopilot to begin generating content.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
