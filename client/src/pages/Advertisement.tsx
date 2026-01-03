import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { AutonomousDashboard } from '@/components/autonomous/autonomous-dashboard';
import { ContentAnalyzer } from '@/components/content/ContentAnalyzer';
import {
  CreativeVariantGenerator,
  CrossChannelAttribution,
  CreativeAutomation,
} from '@/components/advertising';
import {
  Target,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  Play,
  Eye,
  MousePointerClick,
  BarChart3,
  Plus,
  Settings,
  Calendar,
  Music,
  Tv,
  Zap,
  Shield,
  Brain,
  Rocket,
  Crown,
  Sparkles,
  Activity,
  Globe,
  CheckCircle,
  AlertTriangle,
  Info,
  Lightbulb,
  Clock,
  Upload,
  X,
  Bot,
  RefreshCw,
  Gauge,
  Layers,
  GitBranch,
  Network,
  PieChart,
  AlertCircle,
  FlaskConical,
  Timer,
  Radio,
  UserPlus,
  Copy,
  Search,
  ExternalLink,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Percent,
  Lock,
  Unlock,
  Filter,
  Scan,
} from 'lucide-react';

interface AdCampaign {
  id: string;
  name: string;
  objective: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  status: 'active' | 'paused' | 'completed';
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

interface SocialConnections {
  [platform: string]: {
    connected: boolean;
    username?: string;
    followers?: number;
  };
}

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
    budgetOptimization?: boolean;
    targetAudience?: {
      ageMin: number;
      ageMax: number;
      interests: string[];
      locations: string[];
    };
    optimizationSettings?: {
      autoAdjustBudget: boolean;
      viralOptimization: boolean;
      algorithmicTargeting: boolean;
    };
  };
}

interface AIInsights {
  recommendations: Array<{
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
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
  cpa: number;
  roas: number;
}

interface CreativeFatigueData {
  id: string;
  creativeName: string;
  daysActive: number;
  initialCTR: number;
  currentCTR: number;
  fatigueLevel: 'low' | 'medium' | 'high' | 'critical';
  frequency: number;
  recommendation: string;
}

interface BiddingStrategy {
  id: string;
  name: string;
  type: 'maximize_conversions' | 'target_roas' | 'target_cpa' | 'maximize_clicks' | 'manual';
  currentPerformance: number;
  recommendedAction: string;
  potentialImprovement: number;
  confidence: number;
}


interface LookalikeAudience {
  id: string;
  name: string;
  sourceAudience: string;
  similarityScore: number;
  estimatedSize: number;
  expansionLevel: 1 | 2 | 3 | 4 | 5;
  predictedCPA: number;
  predictedROAS: number;
  status: 'active' | 'paused' | 'pending';
}

interface ForecastData {
  id: string;
  campaignName: string;
  currentSpend: number;
  projectedSpend: number;
  currentConversions: number;
  projectedConversions: number;
  currentROAS: number;
  projectedROAS: number;
  confidence: number;
  trend: 'up' | 'down' | 'stable';
  recommendations: string[];
}

interface CompetitorInsight {
  id: string;
  competitorName: string;
  estimatedSpend: string;
  topCreativeFormats: string[];
  targetingFocus: string[];
  adFrequency: string;
  shareOfVoice: number;
  lastSeen: string;
}

function ComingSoonAdvertisement() {
  return (
    <AppLayout>
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-orange-600 to-red-600 flex items-center justify-center">
                <Target className="w-12 h-12 text-white" />
              </div>
              <Badge variant="outline" className="mb-4 text-orange-400 border-orange-400">
                <Clock className="w-3 h-3 mr-1" />
                Extended Testing
              </Badge>
              <h1 className="text-4xl font-bold text-white mb-4">Advertisement</h1>
              <p className="text-xl text-gray-400 mb-2">Coming Soon</p>
              <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-orange-400">
                <Calendar className="w-6 h-6" />
                February 1st, 2026
              </div>
            </div>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              We're conducting extended testing on our AI-powered advertising and 
              organic growth systems to ensure maximum reach and engagement for your music.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">AI Optimized</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Organic Growth</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Brain className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Smart Targeting</p>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-700/50">
              <p className="text-sm text-orange-300">
                <Sparkles className="w-4 h-4 inline mr-2" />
                Your Personal Ad Network will leverage your connected social accounts for 
                maximum organic reach without traditional ad spend.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Advertisement() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: audienceSegmentsData } = useQuery<{ segments: AudienceSegment[] }>({
    queryKey: ['/api/advertising/audience-segments'],
    enabled: !!user,
  });
  const { data: creativeFatigueData } = useQuery<{ creatives: CreativeFatigueData[] }>({
    queryKey: ['/api/advertising/creative-fatigue'],
    enabled: !!user,
  });
  const { data: biddingStrategiesData } = useQuery<{ strategies: BiddingStrategy[] }>({
    queryKey: ['/api/advertising/bidding-strategies'],
    enabled: !!user,
  });
  const { data: lookalikeAudiencesData } = useQuery<{ audiences: LookalikeAudience[] }>({
    queryKey: ['/api/advertising/lookalike-audiences'],
    enabled: !!user,
  });
  const { data: forecastsData } = useQuery<{ forecasts: ForecastData[] }>({
    queryKey: ['/api/advertising/forecasts'],
    enabled: !!user,
  });
  const { data: competitorInsightsData } = useQuery<{ insights: CompetitorInsight[] }>({
    queryKey: ['/api/advertising/competitor-insights'],
    enabled: !!user,
  });
  
  const { data: organicMetrics } = useQuery<{
    reach?: number;
    impressions?: number;
    impressionsChange?: number;
    engagement?: number;
    viralScore?: number;
  }>({
    queryKey: ['/api/organic/metrics'],
    enabled: !!user,
  });
  
  const { data: aiRecommendationsData } = useQuery<{ recommendations?: Array<{ title: string; description: string; impact: string; category: string }> }>({
    queryKey: ['/api/organic/recommendations'],
    enabled: !!user,
  });
  const aiRecommendations = aiRecommendationsData?.recommendations ?? [];
  
  const audienceSegments: AudienceSegment[] = Array.isArray(audienceSegmentsData) ? audienceSegmentsData : audienceSegmentsData?.segments || [];
  const creativeFatigue: CreativeFatigueData[] = Array.isArray(creativeFatigueData) ? creativeFatigueData : creativeFatigueData?.creatives || [];
  const biddingStrategies: BiddingStrategy[] = Array.isArray(biddingStrategiesData) ? biddingStrategiesData : biddingStrategiesData?.strategies || [];
  const lookalikeAudiences: LookalikeAudience[] = Array.isArray(lookalikeAudiencesData) ? lookalikeAudiencesData : lookalikeAudiencesData?.audiences || [];
  const forecasts: ForecastData[] = Array.isArray(forecastsData) ? forecastsData : forecastsData?.forecasts || [];
  const competitorInsights: CompetitorInsight[] = Array.isArray(competitorInsightsData) ? competitorInsightsData : competitorInsightsData?.insights || [];

  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false);
  const [activeEnterpriseTab, setActiveEnterpriseTab] = useState('creative-automation');
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    objective: '',
    budget: 100,
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

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<AdCampaign[]>({
    queryKey: ['/api/advertising/campaigns'],
    enabled: !!user,
  });

  const { data: aiInsights, isLoading: insightsLoading } = useQuery<AIInsights>({
    queryKey: ['/api/advertising/ai-insights'],
    enabled: !!user,
  });

  const { data: socialConnections, isLoading: connectionsLoading } = useQuery<SocialConnections>({
    queryKey: ['/api/social/platform-status'],
    enabled: !!user,
  });

  const uploadImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('image', file);
      const response = await apiRequest('POST', '/api/advertising/upload-image', formData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Image Uploaded!',
        description: 'Your campaign image has been uploaded successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload image. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (campaignData: unknown) => {
      const response = await apiRequest('POST', '/api/advertising/campaigns', campaignData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Campaign Created',
        description: 'Your revolutionary AI advertising campaign has been activated successfully.',
      });
      setIsCreateCampaignOpen(false);
      setCampaignForm({
        name: '',
        objective: '',
        budget: 100,
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
      queryClient.invalidateQueries({ queryKey: ['/api/advertising/campaigns'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create Campaign',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data: autopilotStatus, isLoading: autopilotLoading } = useQuery<AutopilotStatus>({
    queryKey: ['/api/autopilot/status'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const adObjectives = [
    { value: 'awareness', label: 'Brand Awareness', icon: Eye },
    { value: 'traffic', label: 'Drive Traffic', icon: MousePointerClick },
    { value: 'engagement', label: 'Increase Engagement', icon: Users },
    { value: 'conversions', label: 'Get More Streams', icon: Play },
    { value: 'followers', label: 'Grow Following', icon: TrendingUp },
  ];

  const platforms = [
    { value: 'spotify', label: 'Spotify Personal Network', icon: Music, description: 'Use your Spotify for Artists profile for organic promotion' },
    { value: 'youtube', label: 'YouTube Channel Network', icon: Tv, description: 'Leverage your YouTube channel for cross-promotion' },
    { value: 'instagram', label: 'Instagram Profile Power', icon: Users, description: 'Transform your Instagram into a promotional hub' },
    { value: 'facebook', label: 'Facebook Profile Amplification', icon: Users, description: 'Use your Facebook profile and connections' },
    { value: 'tiktok', label: 'TikTok Personal Brand', icon: Play, description: 'Amplify through your TikTok presence' },
    { value: 'twitter', label: 'Twitter Personal Network', icon: Radio, description: 'Leverage your Twitter following and engagement' },
  ];

  const musicInterests = ['Hip Hop', 'Pop', 'R&B', 'Rock', 'Electronic', 'Country', 'Jazz', 'Classical', 'Reggae', 'Alternative', 'Indie', 'Folk'];

  const handleCreateCampaign = () => {
    if (!campaignForm.name.trim()) {
      toast({ title: 'Campaign Name Required', description: 'Please enter a name for your campaign.', variant: 'destructive' });
      return;
    }
    if (!campaignForm.objective) {
      toast({ title: 'Objective Required', description: 'Please select a campaign objective.', variant: 'destructive' });
      return;
    }
    createCampaignMutation.mutate(campaignForm);
  };

  const totalImpressions = campaigns.reduce((acc: number, campaign: AdCampaign) => acc + campaign.impressions, 0);
  const totalClicks = campaigns.reduce((acc: number, campaign: AdCampaign) => acc + campaign.clicks, 0);

  const getFatigueColor = (level: CreativeFatigueData['fatigueLevel']) => {
    const colors = { low: 'bg-green-500', medium: 'bg-yellow-500', high: 'bg-orange-500', critical: 'bg-red-500' };
    return colors[level];
  };

  const getFatigueBadge = (level: CreativeFatigueData['fatigueLevel']) => {
    const styles = {
      low: 'bg-green-500/10 text-green-500 border-green-500/20',
      medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    return styles[level];
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  if (!user) return null;

  if (user.role !== 'admin') {
    return <ComingSoonAdvertisement />;
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
              🚀 Performance Max AI Advertising
            </h1>
            <p className="text-muted-foreground">Enterprise-grade advertising with Meta Advantage + Google Performance Max features</p>
          </div>
          <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
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
                  Create Performance Max Campaign
                </DialogTitle>
                <DialogDescription>Set up an AI-enhanced advertising campaign with automated optimization</DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input id="campaign-name" placeholder="e.g., Summer Single Release Campaign" value={campaignForm.name} onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="space-y-3">
                  <Label>Campaign Objective</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {adObjectives.map(({ value, label, icon: Icon }) => (
                      <div key={value} className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${campaignForm.objective === value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-border hover:border-blue-400'}`} onClick={() => setCampaignForm((prev) => ({ ...prev, objective: value }))}>
                        <Icon className="w-5 h-5" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Budget (AI Optimized)</Label>
                    <div className="space-y-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">${campaignForm.budget}</div>
                        <div className="text-xs text-muted-foreground">AI-optimized budget allocation</div>
                      </div>
                      <Slider value={[campaignForm.budget]} onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, budget: value[0] }))} max={1000} min={10} step={10} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (Days)</Label>
                    <div className="space-y-3">
                      <Slider value={[campaignForm.duration]} onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, duration: value[0] }))} max={30} min={1} step={1} />
                      <div className="text-center font-semibold">{campaignForm.duration} days</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Target Platforms</Label>
                  <div className="grid grid-cols-1 gap-3">
                    {platforms.map(({ value, label, icon: Icon, description }) => (
                      <div key={value} className={`flex items-start space-x-3 p-4 rounded-lg border cursor-pointer transition-colors ${campaignForm.targetAudience.platforms.includes(value) ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-border hover:border-green-400'}`} onClick={() => { setCampaignForm((prev) => ({ ...prev, targetAudience: { ...prev.targetAudience, platforms: prev.targetAudience.platforms.includes(value) ? prev.targetAudience.platforms.filter((p) => p !== value) : [...prev.targetAudience.platforms, value] } })); }}>
                        <Icon className="w-5 h-5 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{label}</div>
                          <div className="text-xs text-muted-foreground">{description}</div>
                        </div>
                        {campaignForm.targetAudience.platforms.includes(value) && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Target Age Range</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm">Min Age: {campaignForm.targetAudience.ageMin}</Label>
                      <Slider value={[campaignForm.targetAudience.ageMin]} onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, targetAudience: { ...prev.targetAudience, ageMin: value[0] } }))} max={65} min={13} step={1} />
                    </div>
                    <div>
                      <Label className="text-sm">Max Age: {campaignForm.targetAudience.ageMax}</Label>
                      <Slider value={[campaignForm.targetAudience.ageMax]} onValueChange={(value) => setCampaignForm((prev) => ({ ...prev, targetAudience: { ...prev.targetAudience, ageMax: value[0] } }))} max={65} min={13} step={1} />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Music Interests</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {musicInterests.map((interest) => (
                      <div key={interest} className={`p-2 text-center rounded-lg border cursor-pointer transition-colors text-sm ${campaignForm.targetAudience.interests.includes(interest) ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20' : 'border-border hover:border-blue-400'}`} onClick={() => { setCampaignForm((prev) => ({ ...prev, targetAudience: { ...prev.targetAudience, interests: prev.targetAudience.interests.includes(interest) ? prev.targetAudience.interests.filter((i) => i !== interest) : [...prev.targetAudience.interests, interest] } })); }}>
                        {interest}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <Label>Campaign Image (Optional)</Label>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setUploadedImage(file); const previewUrl = URL.createObjectURL(file); setImagePreviewUrl(previewUrl); uploadImageMutation.mutate(file); } }} />
                  <div className="flex items-center space-x-2">
                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadImageMutation.isPending}>
                      <Upload className="w-4 h-4 mr-2" />
                      {uploadImageMutation.isPending ? 'Uploading...' : 'Upload Campaign Image'}
                    </Button>
                    {uploadedImage && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => { setUploadedImage(null); setImagePreviewUrl(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                        <X className="w-4 h-4 mr-1" />Remove
                      </Button>
                    )}
                  </div>
                  {imagePreviewUrl && <img src={imagePreviewUrl} alt="Campaign preview" className="max-h-40 rounded-lg mt-2" />}
                </div>
                <div className="flex justify-end space-x-3">
                  <Button variant="outline" onClick={() => setIsCreateCampaignOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateCampaign} disabled={createCampaignMutation.isPending} className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white">
                    {createCampaignMutation.isPending ? 'Creating...' : 'Create Campaign'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="border-2 border-gradient-to-r from-purple-500 to-pink-600 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">🎯 Enterprise Performance Max Features</h2>
              <p className="text-lg text-muted-foreground">Meta Advantage + Google Performance Max capabilities powered by AI</p>
              <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-3 mt-6">
                <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                  <div className="text-xl font-bold text-purple-600">AI</div>
                  <div className="text-xs">Creative Automation</div>
                </div>
                <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                  <div className="text-xl font-bold text-blue-600">ML</div>
                  <div className="text-xs">ROAS Prediction</div>
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
            <TabsTrigger value="lookalike"><UserPlus className="w-3 h-3 mr-1 inline" />Audience</TabsTrigger>
            <TabsTrigger value="competitors"><Search className="w-3 h-3 mr-1 inline" />Intel</TabsTrigger>
            <TabsTrigger value="optimization">Optimize</TabsTrigger>
            <TabsTrigger value="autopilot"><Bot className="w-3 h-3 mr-1 inline" />Autopilot</TabsTrigger>
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
                    <div className="text-2xl font-bold">{organicMetrics?.reach?.toLocaleString() ?? 0}</div>
                    <div className="text-sm text-muted-foreground">AI-amplified audience</div>
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
                    <div className="text-2xl font-bold">{organicMetrics?.impressions?.toLocaleString() ?? 0}</div>
                    {organicMetrics?.impressionsChange != null && (
                      <div className={`text-sm ${organicMetrics.impressionsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {organicMetrics.impressionsChange >= 0 ? '+' : ''}{organicMetrics.impressionsChange}% vs last week
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
                    <div className="text-2xl font-bold">{organicMetrics?.engagement?.toLocaleString() ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Likes, comments, shares</div>
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
                    <div className="text-2xl font-bold text-orange-600">{organicMetrics?.viralScore ?? 0}</div>
                    <div className="text-sm text-muted-foreground">AI virality prediction</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Brain className="w-5 h-5 mr-2 text-purple-600" />AI Growth Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                {aiRecommendations && aiRecommendations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {aiRecommendations.map((rec: { title: string; description: string; impact: string; category: string }, idx: number) => (
                      <div key={idx} className={`p-4 rounded-lg border ${rec.impact === 'high' ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'}`}>
                        <div className="flex items-start gap-3">
                          <Lightbulb className={`w-5 h-5 mt-0.5 ${rec.impact === 'high' ? 'text-green-600' : 'text-yellow-600'}`} />
                          <div>
                            <h4 className="font-medium">{rec.title}</h4>
                            <p className="text-sm text-muted-foreground">{rec.description}</p>
                            <Badge className={`mt-2 ${rec.impact === 'high' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>{rec.impact} impact</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h4 className="font-semibold mb-2">No AI Recommendations Yet</h4>
                    <p className="text-sm text-muted-foreground">Connect your social platforms and start posting to receive AI-powered growth recommendations</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 border rounded-lg hover:border-blue-500 transition-colors cursor-pointer bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20" onClick={() => setIsCreateCampaignOpen(true)}>
                <div className="flex items-center space-x-3 mb-3">
                  <Music className="w-6 h-6 text-blue-500" />
                  <h4 className="font-semibold">Viral Release Campaign</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-4">AI-powered multi-platform release strategy</p>
                <Button variant="outline" size="sm" className="w-full border-blue-200 text-blue-600 hover:bg-blue-50">Start Campaign</Button>
              </Card>
              <Card className="p-4 border rounded-lg hover:border-green-500 transition-colors cursor-pointer bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20" onClick={() => setIsCreateCampaignOpen(true)}>
                <div className="flex items-center space-x-3 mb-3">
                  <Users className="w-6 h-6 text-green-500" />
                  <h4 className="font-semibold">Fan Base Explosion</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Explode your fan base with AI community building</p>
                <Button variant="outline" size="sm" className="w-full border-green-200 text-green-600 hover:bg-green-50">Activate Growth</Button>
              </Card>
              <Card className="p-4 border rounded-lg hover:border-purple-500 transition-colors cursor-pointer bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20" onClick={() => setIsCreateCampaignOpen(true)}>
                <div className="flex items-center space-x-3 mb-3">
                  <Play className="w-6 h-6 text-purple-500" />
                  <h4 className="font-semibold">Stream Enhancement</h4>
                </div>
                <p className="text-sm text-muted-foreground mb-4">Maximize streaming with AI-optimized content</p>
                <Button variant="outline" size="sm" className="w-full border-purple-200 text-purple-600 hover:bg-purple-50">Boost Streams</Button>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="creative" className="space-y-6">
            <CreativeVariantGenerator />
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
                <CardDescription>Create and manage lookalike audiences based on your best-performing segments with Meta Advantage+ style controls</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Active Lookalikes</p>
                    <p className="text-2xl font-bold text-blue-600">{lookalikeAudiences.filter(a => a.status === 'active').length}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Total Reach</p>
                    <p className="text-2xl font-bold text-green-600">{(lookalikeAudiences.reduce((acc, a) => acc + a.estimatedSize, 0) / 1000000).toFixed(1)}M</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Avg. Similarity</p>
                    <p className="text-2xl font-bold text-purple-600">{lookalikeAudiences.length > 0 ? (lookalikeAudiences.reduce((acc, a) => acc + a.similarityScore, 0) / lookalikeAudiences.length).toFixed(0) : 0}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Predicted ROAS</p>
                    <p className="text-2xl font-bold text-orange-600">{lookalikeAudiences.length > 0 ? (lookalikeAudiences.reduce((acc, a) => acc + a.predictedROAS, 0) / lookalikeAudiences.length).toFixed(1) : 0}x</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {lookalikeAudiences.map((audience) => (
                <Card key={audience.id} className={`${audience.status === 'active' ? 'border-green-200' : audience.status === 'paused' ? 'border-yellow-200' : 'border-gray-200'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{audience.name}</h4>
                          <Badge className={`${audience.status === 'active' ? 'bg-green-500/10 text-green-600' : audience.status === 'paused' ? 'bg-yellow-500/10 text-yellow-600' : 'bg-gray-500/10 text-gray-600'}`}>
                            {audience.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Source: {audience.sourceAudience}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {audience.status === 'active' ? (
                          <Button variant="outline" size="sm"><Lock className="w-3 h-3 mr-1" />Pause</Button>
                        ) : (
                          <Button variant="outline" size="sm" className="border-green-300 text-green-600"><Unlock className="w-3 h-3 mr-1" />Activate</Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-950/20">
                        <p className="text-xs text-muted-foreground">Similarity</p>
                        <p className="font-bold text-blue-600">{audience.similarityScore}%</p>
                      </div>
                      <div className="text-center p-2 rounded bg-green-50 dark:bg-green-950/20">
                        <p className="text-xs text-muted-foreground">Est. Size</p>
                        <p className="font-bold text-green-600">{(audience.estimatedSize / 1000).toFixed(0)}K</p>
                      </div>
                      <div className="text-center p-2 rounded bg-purple-50 dark:bg-purple-950/20">
                        <p className="text-xs text-muted-foreground">Pred. ROAS</p>
                        <p className="font-bold text-purple-600">{audience.predictedROAS}x</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Expansion Level</span>
                          <span className="font-medium">{audience.expansionLevel}/5</span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div
                              key={level}
                              className={`flex-1 h-2 rounded ${level <= audience.expansionLevel ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}`}
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
                          <span className="text-sm font-medium">AI Optimization</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Predicted CPA: <span className="font-medium text-green-600">${audience.predictedCPA}</span> • 
                          Similar to {audience.similarityScore}% of your {audience.sourceAudience}
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
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="top-spenders">Top 10% Spenders</SelectItem>
                        <SelectItem value="engaged-users">Highly Engaged Users</SelectItem>
                        <SelectItem value="converters">Recent Converters</SelectItem>
                        <SelectItem value="subscribers">Email Subscribers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expansion Level (1-5)</Label>
                    <Slider defaultValue={[2]} max={5} min={1} step={1} />
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Lookalike
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
                <CardDescription>Analytics and insights from your connected social media profiles - your personal advertising network</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Connected Profiles</p>
                    <p className="text-2xl font-bold text-purple-600">{socialConnections ? Object.values(socialConnections).filter((p: any) => p.connected).length : 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Network Reach</p>
                    <p className="text-2xl font-bold text-green-600">{organicMetrics?.reach?.toLocaleString() ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Organic Impressions</p>
                    <p className="text-2xl font-bold text-blue-600">{organicMetrics?.impressions?.toLocaleString() ?? 0}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Engagement Rate</p>
                    <p className="text-2xl font-bold text-orange-600">{organicMetrics?.engagementRate ?? 0}%</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20 border border-purple-200 dark:border-purple-800 mb-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-purple-800 dark:text-purple-200">Your Personal Ad Network</p>
                      <p className="text-sm text-purple-700 dark:text-purple-300">Each connected profile acts as an organic advertising outlet. AI analyzes performance across all your profiles to maximize reach without ad spend.</p>
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
                <CardDescription>Real-time analytics from your personal ad network</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {socialConnections && Object.entries(socialConnections).filter(([_, data]: [string, any]) => data.connected).length > 0 ? (
                    Object.entries(socialConnections).filter(([_, data]: [string, any]) => data.connected).map(([platform, data]: [string, any]) => (
                      <div key={platform} className="p-4 rounded-lg border bg-card">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                              {platform.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <h4 className="font-semibold capitalize">{platform}</h4>
                              <p className="text-sm text-muted-foreground">@{data.username ?? 'connected'}</p>
                            </div>
                          </div>
                          <Badge className="bg-green-500/10 text-green-600">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                            <p className="text-xs text-muted-foreground">Followers</p>
                            <p className="font-bold">{data.followers?.toLocaleString() ?? '--'}</p>
                          </div>
                          <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                            <p className="text-xs text-muted-foreground">Posts</p>
                            <p className="font-bold">--</p>
                          </div>
                          <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/50">
                            <p className="text-xs text-muted-foreground">Engagement</p>
                            <p className="font-bold">--</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Network className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="font-medium">No profiles connected yet</p>
                      <p className="text-sm">Connect your social media accounts to build your personal ad network</p>
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
                <CardDescription>AI-powered recommendations to maximize your personal ad network</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="font-medium text-sm">Best Posting Times</span>
                    </div>
                    <p className="text-sm text-muted-foreground">AI analyzes engagement patterns across all connected profiles</p>
                  </div>
                  <div className="p-4 rounded-lg border bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-sm">Viral Potential</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Content scoring based on platform algorithms</p>
                  </div>
                  <div className="p-4 rounded-lg border bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-orange-500" />
                      <span className="font-medium text-sm">Audience Overlap</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Cross-platform audience analysis</p>
                  </div>
                  <div className="p-4 rounded-lg border bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="w-4 h-4 text-purple-500" />
                      <span className="font-medium text-sm">Content Amplification</span>
                    </div>
                    <p className="text-sm text-muted-foreground">Coordinated posting across your network</p>
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
                      <p className="text-sm text-muted-foreground">Audience Segments</p>
                      <p className="text-2xl font-bold">{audienceSegments.length}</p>
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
                      <p className="text-sm text-muted-foreground">Fatigued Creatives</p>
                      <p className="text-2xl font-bold text-orange-500">{creativeFatigue.filter(c => c.fatigueLevel === 'high' || c.fatigueLevel === 'critical').length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Bid Optimizations</p>
                      <p className="text-2xl font-bold text-green-500">{biddingStrategies.filter(s => s.potentialImprovement > 20).length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="audience-overlap" className="space-y-4">
              <TabsList>
                <TabsTrigger value="audience-overlap">Audience Overlap</TabsTrigger>
                <TabsTrigger value="creative-fatigue">Creative Fatigue</TabsTrigger>
                <TabsTrigger value="bidding">Bidding Strategies</TabsTrigger>
              </TabsList>

              <TabsContent value="audience-overlap" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><PieChart className="w-5 h-5 text-blue-500" />Audience Overlap Analysis</CardTitle>
                    <CardDescription>Identify audience segment overlaps to optimize targeting and reduce wasted spend</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {audienceSegments.map((segment) => (
                        <div key={segment.id} className="p-4 rounded-lg border">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <h4 className="font-medium">{segment.name}</h4>
                              <Badge variant="outline">{(segment.size / 1000).toFixed(0)}K users</Badge>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">ROAS</p>
                                <p className={`font-bold ${segment.roas >= 5 ? 'text-green-500' : segment.roas >= 3 ? 'text-yellow-500' : 'text-red-500'}`}>{segment.roas}x</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">CPA</p>
                                <p className="font-bold">${segment.cpa.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Overlap with other segments</span>
                              <span className={`font-medium ${segment.overlapPercentage > 40 ? 'text-red-500' : segment.overlapPercentage > 25 ? 'text-yellow-500' : 'text-green-500'}`}>{segment.overlapPercentage}%</span>
                            </div>
                            <Progress value={segment.overlapPercentage} className={segment.overlapPercentage > 40 ? 'bg-red-100' : segment.overlapPercentage > 25 ? 'bg-yellow-100' : 'bg-green-100'} />
                          </div>
                          {segment.overlapPercentage > 40 && (
                            <div className="mt-3 p-2 rounded bg-red-500/10 text-red-600 text-sm flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4" />
                              High overlap detected. Consider excluding from similar campaigns.
                            </div>
                          )}
                          {segment.roas >= 5 && segment.overlapPercentage < 25 && (
                            <div className="mt-3 p-2 rounded bg-green-500/10 text-green-600 text-sm flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              High-value segment with low overlap. Increase budget allocation.
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
                    <CardTitle className="flex items-center gap-2"><Timer className="w-5 h-5 text-orange-500" />Creative Fatigue Detection</CardTitle>
                    <CardDescription>Monitor creative performance decline and get refresh recommendations</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {creativeFatigue.map((creative) => (
                        <div key={creative.id} className={`p-4 rounded-lg border ${creative.fatigueLevel === 'critical' ? 'border-red-300 bg-red-50 dark:bg-red-950/20' : creative.fatigueLevel === 'high' ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20' : ''}`}>
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{creative.creativeName}</h4>
                                <Badge className={getFatigueBadge(creative.fatigueLevel)}>{creative.fatigueLevel}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">Active for {creative.daysActive} days • Frequency: {creative.frequency}</p>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="text-xs text-muted-foreground">Initial CTR</p>
                                  <p className="font-bold text-green-500">{creative.initialCTR}%</p>
                                </div>
                                <TrendingDown className="w-4 h-4 text-red-500" />
                                <div>
                                  <p className="text-xs text-muted-foreground">Current CTR</p>
                                  <p className={`font-bold ${creative.currentCTR < creative.initialCTR * 0.6 ? 'text-red-500' : 'text-yellow-500'}`}>{creative.currentCTR}%</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Performance Decline</span>
                              <span className="font-medium text-red-500">-{((1 - creative.currentCTR / creative.initialCTR) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                              <div className={`h-full ${getFatigueColor(creative.fatigueLevel)}`} style={{ width: `${(1 - creative.currentCTR / creative.initialCTR) * 100}%` }} />
                            </div>
                          </div>
                          <div className={`p-2 rounded text-sm flex items-center gap-2 ${creative.fatigueLevel === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30' : creative.fatigueLevel === 'high' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'}`}>
                            <Lightbulb className="w-4 h-4" />
                            {creative.recommendation}
                          </div>
                          {(creative.fatigueLevel === 'high' || creative.fatigueLevel === 'critical') && (
                            <div className="mt-3 flex gap-2">
                              <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50"><RefreshCw className="w-3 h-3 mr-1" />Refresh Creative</Button>
                              <Button size="sm" variant="outline">Pause Creative</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="bidding" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-500" />Automated Bidding Recommendations</CardTitle>
                    <CardDescription>AI-powered bidding strategy optimization based on campaign performance</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {biddingStrategies.map((strategy) => (
                        <div key={strategy.id} className="p-4 rounded-lg border">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{strategy.name}</h4>
                                <Badge variant="outline" className="capitalize">{strategy.type.replace(/_/g, ' ')}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">Current strategy performance</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Performance Score</p>
                              <p className={`text-2xl font-bold ${strategy.currentPerformance >= 80 ? 'text-green-500' : strategy.currentPerformance >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>{strategy.currentPerformance}%</p>
                            </div>
                          </div>
                          <div className="space-y-2 mb-3">
                            <Progress value={strategy.currentPerformance} />
                          </div>
                          <div className="p-3 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800 mb-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Brain className="w-4 h-4 text-purple-500" />
                                <span className="text-sm font-medium">AI Recommendation</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-500/10 text-green-600">+{strategy.potentialImprovement}% potential</Badge>
                                <Badge variant="outline">{strategy.confidence}% confidence</Badge>
                              </div>
                            </div>
                            <p className="text-sm mt-2">{strategy.recommendedAction}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"><Zap className="w-3 h-3 mr-1" />Apply Recommendation</Button>
                            <Button size="sm" variant="outline">View Details</Button>
                          </div>
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
        </Tabs>
      </div>
    </AppLayout>
  );
}
