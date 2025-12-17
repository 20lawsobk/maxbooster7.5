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
  BudgetPacing,
  ROASPredictor,
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

const mockAudienceSegments: AudienceSegment[] = [
  { id: '1', name: 'Hip Hop Fans 18-24', size: 125000, overlapPercentage: 34, cpa: 2.1, roas: 5.8 },
  { id: '2', name: 'Indie Music Lovers', size: 89000, overlapPercentage: 28, cpa: 3.4, roas: 4.2 },
  { id: '3', name: 'Electronic Enthusiasts', size: 156000, overlapPercentage: 45, cpa: 4.1, roas: 3.9 },
  { id: '4', name: 'Pop Music Mainstream', size: 234000, overlapPercentage: 52, cpa: 5.2, roas: 3.2 },
  { id: '5', name: 'R&B Soul Listeners', size: 78000, overlapPercentage: 18, cpa: 1.9, roas: 6.1 },
];

const mockCreativeFatigue: CreativeFatigueData[] = [
  { id: '1', creativeName: 'Summer Release - Video Ad', daysActive: 28, initialCTR: 5.2, currentCTR: 2.8, fatigueLevel: 'high', frequency: 6.8, recommendation: 'Refresh creative immediately - CTR dropped 46%' },
  { id: '2', creativeName: 'Album Promo - Carousel', daysActive: 14, initialCTR: 4.8, currentCTR: 4.2, fatigueLevel: 'low', frequency: 3.2, recommendation: 'Creative performing well, monitor weekly' },
  { id: '3', creativeName: 'Concert Tour - Story Ad', daysActive: 21, initialCTR: 6.1, currentCTR: 4.5, fatigueLevel: 'medium', frequency: 4.8, recommendation: 'Consider A/B testing new variations' },
  { id: '4', creativeName: 'Single Launch - Banner', daysActive: 35, initialCTR: 3.8, currentCTR: 1.2, fatigueLevel: 'critical', frequency: 9.4, recommendation: 'Pause and replace immediately' },
];

const mockBiddingStrategies: BiddingStrategy[] = [
  { id: '1', name: 'Campaign A - Streams', type: 'maximize_conversions', currentPerformance: 78, recommendedAction: 'Switch to Target ROAS at 4.0x', potentialImprovement: 23, confidence: 89 },
  { id: '2', name: 'Campaign B - Followers', type: 'target_cpa', currentPerformance: 92, recommendedAction: 'Increase bid cap by 15%', potentialImprovement: 12, confidence: 94 },
  { id: '3', name: 'Campaign C - Awareness', type: 'maximize_clicks', currentPerformance: 65, recommendedAction: 'Switch to Smart Bidding', potentialImprovement: 35, confidence: 82 },
  { id: '4', name: 'Campaign D - Engagement', type: 'manual', currentPerformance: 45, recommendedAction: 'Enable automated bidding', potentialImprovement: 48, confidence: 91 },
];

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

const mockLookalikeAudiences: LookalikeAudience[] = [
  { id: '1', name: 'High-Value Fans Lookalike', sourceAudience: 'Top 10% Spenders', similarityScore: 95, estimatedSize: 450000, expansionLevel: 1, predictedCPA: 1.8, predictedROAS: 6.2, status: 'active' },
  { id: '2', name: 'Engaged Listeners Lookalike', sourceAudience: 'Monthly Active Users', similarityScore: 87, estimatedSize: 890000, expansionLevel: 2, predictedCPA: 2.4, predictedROAS: 5.1, status: 'active' },
  { id: '3', name: 'Concert Attendees Lookalike', sourceAudience: 'Ticket Buyers', similarityScore: 82, estimatedSize: 1200000, expansionLevel: 3, predictedCPA: 3.1, predictedROAS: 4.3, status: 'pending' },
  { id: '4', name: 'Merch Buyers Lookalike', sourceAudience: 'Store Customers', similarityScore: 78, estimatedSize: 670000, expansionLevel: 2, predictedCPA: 2.8, predictedROAS: 4.8, status: 'paused' },
];

const mockForecasts: ForecastData[] = [
  { id: '1', campaignName: 'Summer Single Launch', currentSpend: 2500, projectedSpend: 5000, currentConversions: 1250, projectedConversions: 2800, currentROAS: 4.2, projectedROAS: 4.8, confidence: 91, trend: 'up', recommendations: ['Increase budget by 30%', 'Expand to Instagram Reels', 'Test new video creative'] },
  { id: '2', campaignName: 'Album Pre-Save', currentSpend: 1800, projectedSpend: 3600, currentConversions: 890, projectedConversions: 1650, currentROAS: 3.8, projectedROAS: 3.5, confidence: 78, trend: 'down', recommendations: ['Refresh creative assets', 'Narrow audience targeting', 'Reduce frequency cap'] },
  { id: '3', campaignName: 'Tour Announcement', currentSpend: 4200, projectedSpend: 8000, currentConversions: 2100, projectedConversions: 4500, currentROAS: 5.6, projectedROAS: 6.1, confidence: 94, trend: 'up', recommendations: ['Scale budget aggressively', 'Add TikTok placements', 'Enable automated bidding'] },
  { id: '4', campaignName: 'Fan Community Growth', currentSpend: 1200, projectedSpend: 2400, currentConversions: 560, projectedConversions: 1100, currentROAS: 3.2, projectedROAS: 3.4, confidence: 85, trend: 'stable', recommendations: ['Maintain current strategy', 'Test new audience segments'] },
];

const mockCompetitorInsights: CompetitorInsight[] = [
  { id: '1', competitorName: 'Similar Artist A', estimatedSpend: '$15K-25K/month', topCreativeFormats: ['Video Ads', 'Story Ads', 'Carousel'], targetingFocus: ['18-34', 'Hip Hop', 'Urban'], adFrequency: '6-8x per user', shareOfVoice: 23, lastSeen: '2 hours ago' },
  { id: '2', competitorName: 'Similar Artist B', estimatedSpend: '$8K-12K/month', topCreativeFormats: ['Static Images', 'Video Ads'], targetingFocus: ['21-40', 'R&B', 'Soul'], adFrequency: '4-5x per user', shareOfVoice: 15, lastSeen: '5 hours ago' },
  { id: '3', competitorName: 'Major Label Campaign', estimatedSpend: '$50K+/month', topCreativeFormats: ['Video Ads', 'Sponsored Content', 'Influencer'], targetingFocus: ['Broad', 'Music Lovers'], adFrequency: '10-12x per user', shareOfVoice: 42, lastSeen: '1 hour ago' },
  { id: '4', competitorName: 'Indie Artist C', estimatedSpend: '$3K-5K/month', topCreativeFormats: ['Story Ads', 'Reels'], targetingFocus: ['18-28', 'Indie', 'Alternative'], adFrequency: '3-4x per user', shareOfVoice: 8, lastSeen: '1 day ago' },
];

export default function Advertisement() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
                  <div className="text-xl font-bold text-teal-600">📈</div>
                  <div className="text-xs">Forecasting</div>
                </div>
                <div className="text-center p-3 bg-white/50 dark:bg-gray-900/50 rounded-lg">
                  <div className="text-xl font-bold text-red-600">⚡</div>
                  <div className="text-xs">Auto-Bidding</div>
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
          <TabsList className="grid w-full grid-cols-6 lg:grid-cols-11 gap-1">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="creative">Creative AI</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
            <TabsTrigger value="roas">ROAS</TabsTrigger>
            <TabsTrigger value="attribution">Attribution</TabsTrigger>
            <TabsTrigger value="testing">A/B Testing</TabsTrigger>
            <TabsTrigger value="lookalike"><UserPlus className="w-3 h-3 mr-1 inline" />Lookalike</TabsTrigger>
            <TabsTrigger value="forecasting"><LineChart className="w-3 h-3 mr-1 inline" />Forecast</TabsTrigger>
            <TabsTrigger value="competitors"><Search className="w-3 h-3 mr-1 inline" />Intel</TabsTrigger>
            <TabsTrigger value="optimization">Optimize</TabsTrigger>
            <TabsTrigger value="autopilot"><Bot className="w-3 h-3 mr-1 inline" />Autopilot</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <DollarSign className="w-5 h-5 text-green-500" />
                    <span className="text-sm font-medium">Total Budget</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-green-600">$10,000</div>
                    <div className="text-sm text-muted-foreground">AI-optimized allocation</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <Eye className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium">Impressions</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-bold">{totalImpressions.toLocaleString()}</div>
                    <div className="text-sm text-green-600">+23% vs last week</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <MousePointerClick className="w-5 h-5 text-purple-500" />
                    <span className="text-sm font-medium">Clicks</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-bold">{totalClicks.toLocaleString()}</div>
                    <div className="text-sm text-green-600">CTR: 7.2%</div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-2">
                    <Target className="w-5 h-5 text-orange-500" />
                    <span className="text-sm font-medium">ROAS</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-2xl font-bold text-green-600">4.8x</div>
                    <div className="text-sm text-green-600">Above target (4.0x)</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center"><Lightbulb className="w-5 h-5 mr-2 text-yellow-600" />AI Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { title: 'Increase Budget on Top Performer', description: 'Campaign A is 34% above ROAS target. Consider +20% budget.', impact: 'high', icon: TrendingUp },
                    { title: 'Refresh Creative Assets', description: '2 creatives showing fatigue signs. CTR dropped 28% in 7 days.', impact: 'high', icon: RefreshCw },
                    { title: 'Expand Audience Segments', description: 'R&B Soul Listeners segment has 6.1x ROAS with low overlap.', impact: 'medium', icon: Users },
                    { title: 'Optimize Bid Strategy', description: 'Switch Campaign D to automated bidding for 48% improvement.', impact: 'medium', icon: Zap },
                  ].map((rec, idx) => (
                    <div key={idx} className={`p-4 rounded-lg border ${rec.impact === 'high' ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20'}`}>
                      <div className="flex items-start gap-3">
                        <rec.icon className={`w-5 h-5 mt-0.5 ${rec.impact === 'high' ? 'text-green-600' : 'text-yellow-600'}`} />
                        <div>
                          <h4 className="font-medium">{rec.title}</h4>
                          <p className="text-sm text-muted-foreground">{rec.description}</p>
                          <Badge className={`mt-2 ${rec.impact === 'high' ? 'bg-green-500/10 text-green-600' : 'bg-yellow-500/10 text-yellow-600'}`}>{rec.impact} impact</Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
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

          <TabsContent value="budget" className="space-y-6">
            <BudgetPacing />
          </TabsContent>

          <TabsContent value="roas" className="space-y-6">
            <ROASPredictor />
          </TabsContent>

          <TabsContent value="attribution" className="space-y-6">
            <CrossChannelAttribution />
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
                    <p className="text-2xl font-bold text-blue-600">{mockLookalikeAudiences.filter(a => a.status === 'active').length}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Total Reach</p>
                    <p className="text-2xl font-bold text-green-600">{(mockLookalikeAudiences.reduce((acc, a) => acc + a.estimatedSize, 0) / 1000000).toFixed(1)}M</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Avg. Similarity</p>
                    <p className="text-2xl font-bold text-purple-600">{(mockLookalikeAudiences.reduce((acc, a) => acc + a.similarityScore, 0) / mockLookalikeAudiences.length).toFixed(0)}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Predicted ROAS</p>
                    <p className="text-2xl font-bold text-orange-600">{(mockLookalikeAudiences.reduce((acc, a) => acc + a.predictedROAS, 0) / mockLookalikeAudiences.length).toFixed(1)}x</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {mockLookalikeAudiences.map((audience) => (
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

          <TabsContent value="forecasting" className="space-y-6">
            <Card className="border-2 border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="w-6 h-6 text-green-500" />
                  Campaign Performance Forecasting
                </CardTitle>
                <CardDescription>AI-powered predictions for your campaign performance with Google Performance Max style insights</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Projected Spend</p>
                    <p className="text-2xl font-bold text-blue-600">${(mockForecasts.reduce((acc, f) => acc + f.projectedSpend, 0) / 1000).toFixed(1)}K</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Projected Conversions</p>
                    <p className="text-2xl font-bold text-green-600">{mockForecasts.reduce((acc, f) => acc + f.projectedConversions, 0).toLocaleString()}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Avg. Projected ROAS</p>
                    <p className="text-2xl font-bold text-purple-600">{(mockForecasts.reduce((acc, f) => acc + f.projectedROAS, 0) / mockForecasts.length).toFixed(1)}x</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Avg. Confidence</p>
                    <p className="text-2xl font-bold text-orange-600">{(mockForecasts.reduce((acc, f) => acc + f.confidence, 0) / mockForecasts.length).toFixed(0)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {mockForecasts.map((forecast) => (
                <Card key={forecast.id} className={`${forecast.trend === 'up' ? 'border-green-200' : forecast.trend === 'down' ? 'border-red-200' : 'border-gray-200'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${forecast.trend === 'up' ? 'bg-green-500/10' : forecast.trend === 'down' ? 'bg-red-500/10' : 'bg-gray-500/10'}`}>
                          {forecast.trend === 'up' ? (
                            <ArrowUpRight className="w-5 h-5 text-green-500" />
                          ) : forecast.trend === 'down' ? (
                            <ArrowDownRight className="w-5 h-5 text-red-500" />
                          ) : (
                            <Activity className="w-5 h-5 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold">{forecast.campaignName}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge className={`${forecast.trend === 'up' ? 'bg-green-500/10 text-green-600' : forecast.trend === 'down' ? 'bg-red-500/10 text-red-600' : 'bg-gray-500/10 text-gray-600'}`}>
                              {forecast.trend === 'up' ? 'Trending Up' : forecast.trend === 'down' ? 'Needs Attention' : 'Stable'}
                            </Badge>
                            <Badge variant="outline">{forecast.confidence}% confidence</Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-1">Current Spend</p>
                        <p className="font-bold">${forecast.currentSpend.toLocaleString()}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <ArrowUpRight className="w-3 h-3 text-blue-500" />
                          <span className="text-blue-500">${forecast.projectedSpend.toLocaleString()}</span> projected
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-1">Current Conversions</p>
                        <p className="font-bold">{forecast.currentConversions.toLocaleString()}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <ArrowUpRight className="w-3 h-3 text-green-500" />
                          <span className="text-green-500">{forecast.projectedConversions.toLocaleString()}</span> projected
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-1">Current ROAS</p>
                        <p className="font-bold">{forecast.currentROAS}x</p>
                        <div className="flex items-center gap-1 text-xs mt-1">
                          {forecast.projectedROAS >= forecast.currentROAS ? (
                            <>
                              <ArrowUpRight className="w-3 h-3 text-green-500" />
                              <span className="text-green-500">{forecast.projectedROAS}x</span>
                            </>
                          ) : (
                            <>
                              <ArrowDownRight className="w-3 h-3 text-red-500" />
                              <span className="text-red-500">{forecast.projectedROAS}x</span>
                            </>
                          )}
                          <span className="text-muted-foreground">projected</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-1">ROAS Change</p>
                        <p className={`font-bold ${forecast.projectedROAS >= forecast.currentROAS ? 'text-green-500' : 'text-red-500'}`}>
                          {forecast.projectedROAS >= forecast.currentROAS ? '+' : ''}{((forecast.projectedROAS - forecast.currentROAS) / forecast.currentROAS * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-purple-500" />
                        <span className="font-medium text-sm">AI Recommendations</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {forecast.recommendations.map((rec, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">{rec}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="competitors" className="space-y-6">
            <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-6 h-6 text-purple-500" />
                  Competitor Ad Intelligence
                  <Badge className="bg-purple-500/10 text-purple-600">Beta</Badge>
                </CardTitle>
                <CardDescription>Track competitor advertising activity and gain strategic insights (Placeholder for future API integration)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Competitors Tracked</p>
                    <p className="text-2xl font-bold text-purple-600">{mockCompetitorInsights.length}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Your Share of Voice</p>
                    <p className="text-2xl font-bold text-blue-600">{100 - mockCompetitorInsights.reduce((acc, c) => acc + c.shareOfVoice, 0)}%</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">Ads Detected Today</p>
                    <p className="text-2xl font-bold text-green-600">47</p>
                  </div>
                  <div className="p-4 rounded-lg bg-white/50 dark:bg-gray-900/50 text-center">
                    <p className="text-sm text-muted-foreground">New Creatives</p>
                    <p className="text-2xl font-bold text-orange-600">12</p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-800 dark:text-yellow-200">API Integration Coming Soon</p>
                      <p className="text-sm text-yellow-700 dark:text-yellow-300">Full competitor tracking will require connection to Meta Ad Library and other advertising transparency APIs. Current data is simulated for demonstration.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {mockCompetitorInsights.map((competitor) => (
                <Card key={competitor.id}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{competitor.competitorName}</h4>
                          <Badge variant="outline" className="text-xs">Last seen: {competitor.lastSeen}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Estimated spend: {competitor.estimatedSpend}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Share of Voice</p>
                        <p className="text-xl font-bold text-purple-600">{competitor.shareOfVoice}%</p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Market Presence</span>
                        <span className="font-medium">{competitor.shareOfVoice}%</span>
                      </div>
                      <Progress value={competitor.shareOfVoice} className="bg-purple-100" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-2">Top Creative Formats</p>
                        <div className="flex flex-wrap gap-1">
                          {competitor.topCreativeFormats.map((format, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{format}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-2">Targeting Focus</p>
                        <div className="flex flex-wrap gap-1">
                          {competitor.targetingFocus.map((target, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">{target}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                        <p className="text-xs text-muted-foreground mb-2">Ad Frequency</p>
                        <p className="font-medium">{competitor.adFrequency}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Ads
                      </Button>
                      <Button size="sm" variant="outline">
                        <Copy className="w-3 h-3 mr-1" />
                        Export Report
                      </Button>
                      <Button size="sm" variant="outline">
                        <Scan className="w-3 h-3 mr-1" />
                        Deep Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-purple-500" />
                  Add Competitor to Track
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Competitor Name or URL</Label>
                    <Input placeholder="Enter artist/brand name or social URL..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Tracking Focus</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select focus..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Platforms</SelectItem>
                        <SelectItem value="meta">Meta (FB/IG)</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                        <SelectItem value="youtube">YouTube</SelectItem>
                        <SelectItem value="google">Google Ads</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white">
                      <Search className="w-4 h-4 mr-2" />
                      Start Tracking
                    </Button>
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
                      <p className="text-2xl font-bold">{mockAudienceSegments.length}</p>
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
                      <p className="text-2xl font-bold text-orange-500">{mockCreativeFatigue.filter(c => c.fatigueLevel === 'high' || c.fatigueLevel === 'critical').length}</p>
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
                      <p className="text-2xl font-bold text-green-500">{mockBiddingStrategies.filter(s => s.potentialImprovement > 20).length}</p>
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
                      {mockAudienceSegments.map((segment) => (
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
                      {mockCreativeFatigue.map((creative) => (
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
                      {mockBiddingStrategies.map((strategy) => (
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
