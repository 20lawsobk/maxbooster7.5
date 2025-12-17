import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  Sparkles,
  Wand2,
  Image,
  Type,
  MousePointerClick,
  TrendingUp,
  Trophy,
  RefreshCw,
  Copy,
  CheckCircle,
  AlertCircle,
  Play,
  Pause,
  BarChart3,
  Target,
  Zap,
  Eye,
  Layers,
  Settings,
  Plus,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Brain,
  Shuffle,
  Crown,
  Medal,
  Award,
  Rocket,
  Activity,
  Users,
  DollarSign,
  Lightbulb,
  FlaskConical,
  GitBranch,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';

interface CreativeVariant {
  id: string;
  name: string;
  headline: string;
  description: string;
  cta: string;
  imageUrl?: string;
  status: 'draft' | 'testing' | 'winner' | 'loser' | 'paused' | 'pending';
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
  confidence: number;
  aiScore: number;
  costPerConversion: number;
  revenue: number;
  createdAt: string;
}

interface ABTest {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed' | 'paused';
  startDate: string;
  endDate?: string;
  variants: CreativeVariant[];
  winningVariantId?: string;
  statisticalSignificance: number;
  sampleSize: number;
  targetSampleSize: number;
  testType: 'a/b' | 'multivariate' | 'sequential';
  objective: 'ctr' | 'conversions' | 'revenue';
  trafficAllocation: number;
}

interface AIGenerationConfig {
  baseContent: string;
  targetAudience: string;
  tone: string;
  variantCount: number;
  includeEmoji: boolean;
  maxLength: number;
}

const mockVariants: CreativeVariant[] = [
  {
    id: '1',
    name: 'Variant A - Original',
    headline: 'Stream Your Music Worldwide',
    description: 'Get your tracks on Spotify, Apple Music & 150+ platforms',
    cta: 'Start Free Trial',
    status: 'testing',
    impressions: 45230,
    clicks: 2890,
    conversions: 234,
    ctr: 6.39,
    conversionRate: 8.1,
    confidence: 92,
    aiScore: 78,
    costPerConversion: 4.25,
    revenue: 11750,
    createdAt: '2024-01-15',
  },
  {
    id: '2',
    name: 'Variant B - Bold CTA',
    headline: 'Your Music. Every Platform.',
    description: 'Join 500K+ artists distributing globally',
    cta: 'Go Live Now',
    status: 'winner',
    impressions: 44890,
    clicks: 3456,
    conversions: 312,
    ctr: 7.7,
    conversionRate: 9.03,
    confidence: 96,
    aiScore: 89,
    costPerConversion: 3.18,
    revenue: 15680,
    createdAt: '2024-01-15',
  },
  {
    id: '3',
    name: 'Variant C - Social Proof',
    headline: 'Join 500,000+ Artists',
    description: 'The #1 rated music distribution platform',
    cta: 'Start Distributing',
    status: 'testing',
    impressions: 43120,
    clicks: 2654,
    conversions: 198,
    ctr: 6.15,
    conversionRate: 7.46,
    confidence: 78,
    aiScore: 72,
    costPerConversion: 5.12,
    revenue: 9920,
    createdAt: '2024-01-15',
  },
  {
    id: '4',
    name: 'Variant D - Urgency',
    headline: 'Limited Time: Free Distribution',
    description: 'Get unlimited releases for 30 days - no credit card',
    cta: 'Claim Free Trial',
    status: 'loser',
    impressions: 42890,
    clicks: 2234,
    conversions: 156,
    ctr: 5.21,
    conversionRate: 6.98,
    confidence: 85,
    aiScore: 65,
    costPerConversion: 6.28,
    revenue: 7800,
    createdAt: '2024-01-15',
  },
];

const mockABTests: ABTest[] = [
  {
    id: '1',
    name: 'Q1 Landing Page Test',
    status: 'running',
    startDate: '2024-01-15',
    variants: mockVariants,
    winningVariantId: '2',
    statisticalSignificance: 96,
    sampleSize: 176130,
    targetSampleSize: 200000,
    testType: 'a/b',
    objective: 'conversions',
    trafficAllocation: 100,
  },
  {
    id: '2',
    name: 'CTA Button Color Test',
    status: 'completed',
    startDate: '2024-01-01',
    endDate: '2024-01-14',
    variants: mockVariants.slice(0, 2),
    winningVariantId: '2',
    statisticalSignificance: 99,
    sampleSize: 150000,
    targetSampleSize: 150000,
    testType: 'a/b',
    objective: 'ctr',
    trafficAllocation: 100,
  },
];

const performanceTrendData = [
  { day: 'Mon', variantA: 6.2, variantB: 7.4, variantC: 5.9, variantD: 5.1 },
  { day: 'Tue', variantA: 6.5, variantB: 7.8, variantC: 6.1, variantD: 5.3 },
  { day: 'Wed', variantA: 6.1, variantB: 7.6, variantC: 6.3, variantD: 5.0 },
  { day: 'Thu', variantA: 6.8, variantB: 8.1, variantC: 6.0, variantD: 5.4 },
  { day: 'Fri', variantA: 6.4, variantB: 7.9, variantC: 6.2, variantD: 5.2 },
  { day: 'Sat', variantA: 5.9, variantB: 7.2, variantC: 5.8, variantD: 4.8 },
  { day: 'Sun', variantA: 6.0, variantB: 7.5, variantC: 5.7, variantD: 5.0 },
];

const conversionFunnelData = [
  { stage: 'Impressions', variantA: 45230, variantB: 44890, variantC: 43120, variantD: 42890 },
  { stage: 'Clicks', variantA: 2890, variantB: 3456, variantC: 2654, variantD: 2234 },
  { stage: 'Landing Page', variantA: 2456, variantB: 3012, variantC: 2245, variantD: 1890 },
  { stage: 'Sign Up Start', variantA: 890, variantB: 1234, variantC: 756, variantD: 623 },
  { stage: 'Conversions', variantA: 234, variantB: 312, variantC: 198, variantD: 156 },
];

const elementPerformanceData = [
  { element: 'Headline', variantA: 72, variantB: 89, variantC: 68, variantD: 61 },
  { element: 'Description', variantA: 75, variantB: 84, variantC: 72, variantD: 65 },
  { element: 'CTA', variantA: 68, variantB: 92, variantC: 71, variantD: 58 },
  { element: 'Image', variantA: 78, variantB: 86, variantC: 74, variantD: 69 },
  { element: 'Layout', variantA: 74, variantB: 88, variantC: 70, variantD: 63 },
];

const confidenceHistoryData = [
  { hour: '0h', variantA: 50, variantB: 52, variantC: 48, variantD: 51 },
  { hour: '6h', variantA: 58, variantB: 62, variantC: 55, variantD: 52 },
  { hour: '12h', variantA: 65, variantB: 74, variantC: 61, variantD: 56 },
  { hour: '24h', variantA: 72, variantB: 82, variantC: 68, variantD: 63 },
  { hour: '48h', variantA: 78, variantB: 88, variantC: 72, variantD: 72 },
  { hour: '72h', variantA: 85, variantB: 93, variantC: 76, variantD: 78 },
  { hour: '96h', variantA: 92, variantB: 96, variantC: 78, variantD: 85 },
];

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export function CreativeAutomation() {
  const [activeTest, setActiveTest] = useState<ABTest>(mockABTests[0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [autoWinnerSelection, setAutoWinnerSelection] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(95);
  const [selectedVariant, setSelectedVariant] = useState<CreativeVariant | null>(null);
  const [aiConfig, setAiConfig] = useState<AIGenerationConfig>({
    baseContent: '',
    targetAudience: '',
    tone: 'professional',
    variantCount: 5,
    includeEmoji: false,
    maxLength: 150,
  });

  const handleGenerateVariants = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 3000);
  };

  const getStatusBadge = (status: CreativeVariant['status']) => {
    const styles = {
      draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      testing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      winner: 'bg-green-500/10 text-green-500 border-green-500/20',
      loser: 'bg-red-500/10 text-red-500 border-red-500/20',
      paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      pending: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
    };
    return styles[status];
  };

  const getStatusIcon = (status: CreativeVariant['status']) => {
    switch (status) {
      case 'winner':
        return <Trophy className="w-3 h-3" />;
      case 'loser':
        return <ThumbsDown className="w-3 h-3" />;
      case 'testing':
        return <FlaskConical className="w-3 h-3" />;
      case 'paused':
        return <Pause className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'text-green-500';
    if (confidence >= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getAIScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500 bg-green-500/10';
    if (score >= 60) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  const chartConfig = {
    variantA: { label: 'Variant A', color: '#3b82f6' },
    variantB: { label: 'Variant B', color: '#22c55e' },
    variantC: { label: 'Variant C', color: '#f59e0b' },
    variantD: { label: 'Variant D', color: '#ef4444' },
    confidence: { label: 'Confidence', color: '#8b5cf6' },
  };

  const totalImpressions = mockVariants.reduce((acc, v) => acc + v.impressions, 0);
  const totalConversions = mockVariants.reduce((acc, v) => acc + v.conversions, 0);
  const totalRevenue = mockVariants.reduce((acc, v) => acc + v.revenue, 0);
  const avgCTR = mockVariants.reduce((acc, v) => acc + v.ctr, 0) / mockVariants.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-500" />
            AI Creative Automation
          </h2>
          <p className="text-muted-foreground">
            Automated variant generation, A/B testing, and winner selection powered by AI
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={autoWinnerSelection}
              onCheckedChange={setAutoWinnerSelection}
              id="auto-winner"
            />
            <Label htmlFor="auto-winner" className="text-sm">
              Auto Winner Selection
            </Label>
          </div>
          <Button
            onClick={handleGenerateVariants}
            disabled={isGenerating}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isGenerating ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Brain className="w-4 h-4 mr-2" />
            )}
            Generate AI Variants
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tests</p>
                <p className="text-2xl font-bold">{mockABTests.filter(t => t.status === 'running').length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <FlaskConical className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Variants</p>
                <p className="text-2xl font-bold">{mockVariants.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg CTR Lift</p>
                <p className="text-2xl font-bold text-green-500">+28.4%</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Winners Found</p>
                <p className="text-2xl font-bold">
                  {mockVariants.filter((v) => v.status === 'winner').length}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">${(totalRevenue / 1000).toFixed(1)}K</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="variants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="variants">Active Variants</TabsTrigger>
          <TabsTrigger value="generate">AI Generation</TabsTrigger>
          <TabsTrigger value="testing">A/B Test Setup</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="winner">Winner Selection</TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-blue-500" />
                    {activeTest.name}
                  </CardTitle>
                  <CardDescription>
                    Started {new Date(activeTest.startDate).toLocaleDateString()} •{' '}
                    {activeTest.sampleSize.toLocaleString()} /{' '}
                    {activeTest.targetSampleSize.toLocaleString()} samples
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4">
                  <Badge
                    className={
                      activeTest.status === 'running'
                        ? 'bg-green-500/10 text-green-500'
                        : activeTest.status === 'completed'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-gray-500/10 text-gray-500'
                    }
                  >
                    {activeTest.status === 'running' ? (
                      <Play className="w-3 h-3 mr-1" />
                    ) : (
                      <CheckCircle className="w-3 h-3 mr-1" />
                    )}
                    {activeTest.status}
                  </Badge>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Statistical Significance</p>
                    <p
                      className={`text-lg font-bold ${getConfidenceColor(activeTest.statisticalSignificance)}`}
                    >
                      {activeTest.statisticalSignificance}%
                    </p>
                  </div>
                </div>
              </div>
              <Progress
                value={(activeTest.sampleSize / activeTest.targetSampleSize) * 100}
                className="mt-2"
              />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeTest.variants.map((variant, idx) => (
                  <div
                    key={variant.id}
                    className={`p-4 rounded-lg border transition-all ${
                      variant.status === 'winner'
                        ? 'border-green-500/50 bg-green-500/5 ring-2 ring-green-500/20'
                        : variant.status === 'loser'
                          ? 'border-red-500/30 bg-red-500/5 opacity-75'
                          : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                          />
                          <h4 className="font-semibold">{variant.name}</h4>
                          <Badge className={getStatusBadge(variant.status)}>
                            {getStatusIcon(variant.status)}
                            <span className="ml-1">{variant.status}</span>
                          </Badge>
                          {variant.status === 'winner' && (
                            <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">
                              <Crown className="w-3 h-3 mr-1" />
                              Champion
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="flex items-center gap-2">
                              <Type className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Headline:</span>
                              <span className="font-medium">{variant.headline}</span>
                            </p>
                            <p className="flex items-center gap-2 mt-1">
                              <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                              <span className="text-muted-foreground">CTA:</span>
                              <span className="font-medium">{variant.cta}</span>
                            </p>
                          </div>
                          <p className="text-muted-foreground line-clamp-2">{variant.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 ml-4">
                        <div className="text-center">
                          <p className="text-2xl font-bold">{variant.ctr.toFixed(2)}%</p>
                          <p className="text-xs text-muted-foreground">CTR</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">{variant.conversionRate.toFixed(2)}%</p>
                          <p className="text-xs text-muted-foreground">Conv. Rate</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-2xl font-bold ${getConfidenceColor(variant.confidence)}`}>
                            {variant.confidence}%
                          </p>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                        </div>
                        <div className="text-center">
                          <div className={`px-3 py-1 rounded-full ${getAIScoreColor(variant.aiScore)}`}>
                            <p className="text-lg font-bold">{variant.aiScore}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">AI Score</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {variant.impressions.toLocaleString()} impressions
                        </span>
                        <span className="flex items-center gap-1">
                          <MousePointerClick className="w-3 h-3" />
                          {variant.clicks.toLocaleString()} clicks
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {variant.conversions.toLocaleString()} conversions
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          ${variant.revenue.toLocaleString()} revenue
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Copy className="w-3 h-3 mr-1" />
                          Duplicate
                        </Button>
                        {variant.status === 'testing' && (
                          <Button size="sm" variant="outline">
                            <Pause className="w-3 h-3 mr-1" />
                            Pause
                          </Button>
                        )}
                        {variant.status === 'winner' && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            <Rocket className="w-3 h-3 mr-1" />
                            Scale Winner
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  AI Variant Generator
                </CardTitle>
                <CardDescription>
                  Describe your content and let AI create optimized variants
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Base Content / Key Message</Label>
                  <Textarea
                    placeholder="Describe the core message or product you want to promote..."
                    value={aiConfig.baseContent}
                    onChange={(e) => setAiConfig({ ...aiConfig, baseContent: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Input
                    placeholder="e.g., Independent musicians ages 18-35, music producers"
                    value={aiConfig.targetAudience}
                    onChange={(e) => setAiConfig({ ...aiConfig, targetAudience: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select
                      value={aiConfig.tone}
                      onValueChange={(value) => setAiConfig({ ...aiConfig, tone: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="playful">Playful</SelectItem>
                        <SelectItem value="inspirational">Inspirational</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Variants</Label>
                    <Select
                      value={aiConfig.variantCount.toString()}
                      onValueChange={(value) => setAiConfig({ ...aiConfig, variantCount: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[3, 5, 10, 15, 20].map((num) => (
                          <SelectItem key={num} value={num.toString()}>
                            {num} variants
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Max Character Length</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[aiConfig.maxLength]}
                      onValueChange={(v) => setAiConfig({ ...aiConfig, maxLength: v[0] })}
                      min={50}
                      max={300}
                      step={10}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-16">{aiConfig.maxLength} chars</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={aiConfig.includeEmoji}
                    onCheckedChange={(checked) => setAiConfig({ ...aiConfig, includeEmoji: checked })}
                    id="include-emoji"
                  />
                  <Label htmlFor="include-emoji">Include emojis in copy</Label>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onClick={handleGenerateVariants}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating {aiConfig.variantCount} Variants...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Generate {aiConfig.variantCount} AI Variants
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-500" />
                  Generation Preview
                </CardTitle>
                <CardDescription>
                  AI-generated variants based on your configuration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isGenerating ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <RefreshCw className="w-12 h-12 text-purple-500 animate-spin mb-4" />
                      <p className="text-muted-foreground">Generating AI variants...</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Analyzing target audience and optimizing copy
                      </p>
                    </div>
                  ) : (
                    <>
                      {['Headline Focus', 'Social Proof', 'Urgency', 'Benefit-Led', 'Question-Based'].slice(0, aiConfig.variantCount > 5 ? 5 : aiConfig.variantCount).map((type, idx) => (
                        <div key={idx} className="p-4 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <Badge variant="outline" className="text-xs">
                              <Sparkles className="w-3 h-3 mr-1" />
                              {type}
                            </Badge>
                            <span className="text-xs text-muted-foreground">AI Score: {75 + idx * 3}</span>
                          </div>
                          <p className="text-sm font-medium mb-1">
                            {idx === 0 && 'Stream Your Music to the World'}
                            {idx === 1 && 'Join 500K+ Artists Already Distributing'}
                            {idx === 2 && 'Limited Time: Unlimited Distribution Free'}
                            {idx === 3 && 'Earn More from Every Stream'}
                            {idx === 4 && 'Ready to Go Global with Your Music?'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Predicted CTR: {(6.5 + idx * 0.3).toFixed(1)}%
                          </p>
                        </div>
                      ))}
                      {aiConfig.variantCount > 5 && (
                        <p className="text-center text-sm text-muted-foreground">
                          + {aiConfig.variantCount - 5} more variants will be generated
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FlaskConical className="w-5 h-5 text-blue-500" />
                  A/B Test Configuration
                </CardTitle>
                <CardDescription>
                  Set up and configure your experiments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Test Name</Label>
                    <Input placeholder="e.g., Q1 Landing Page Test" />
                  </div>
                  <div className="space-y-2">
                    <Label>Test Type</Label>
                    <Select defaultValue="a/b">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a/b">A/B Test</SelectItem>
                        <SelectItem value="multivariate">Multivariate</SelectItem>
                        <SelectItem value="sequential">Sequential</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Primary Objective</Label>
                    <Select defaultValue="conversions">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ctr">Click-Through Rate</SelectItem>
                        <SelectItem value="conversions">Conversions</SelectItem>
                        <SelectItem value="revenue">Revenue</SelectItem>
                        <SelectItem value="engagement">Engagement</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Traffic Allocation</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        defaultValue={[100]}
                        min={10}
                        max={100}
                        step={5}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium w-12">100%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Confidence Threshold for Winner Declaration</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[confidenceThreshold]}
                      onValueChange={(v) => setConfidenceThreshold(v[0])}
                      min={80}
                      max={99}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-12">{confidenceThreshold}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Higher thresholds require more data but provide more reliable results
                  </p>
                </div>

                <div className="space-y-4">
                  <Label>Variants to Include</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {mockVariants.map((variant, idx) => (
                      <div
                        key={variant.id}
                        className="flex items-center gap-3 p-3 rounded-lg border hover:border-primary/50 cursor-pointer transition-colors"
                      >
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: COLORS[idx] }}
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{variant.name}</p>
                          <p className="text-xs text-muted-foreground">{variant.headline}</p>
                        </div>
                        <Switch defaultChecked={variant.status !== 'loser'} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button className="flex-1">
                    <Play className="w-4 h-4 mr-2" />
                    Start Test
                  </Button>
                  <Button variant="outline">
                    <Settings className="w-4 h-4 mr-2" />
                    Advanced Settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-green-500" />
                  Sample Size Calculator
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="text-center mb-4">
                    <p className="text-3xl font-bold text-green-500">~25,000</p>
                    <p className="text-sm text-muted-foreground">samples per variant</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Baseline Conv. Rate</span>
                      <span className="font-medium">8%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Min Detectable Effect</span>
                      <span className="font-medium">10%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Statistical Power</span>
                      <span className="font-medium">80%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Confidence Level</span>
                      <span className="font-medium">{confidenceThreshold}%</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-start gap-2">
                    <Clock className="w-4 h-4 text-blue-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Estimated Duration</p>
                      <p className="text-xs text-muted-foreground">
                        At current traffic levels, this test will reach statistical significance in approximately <span className="font-medium">7-10 days</span>
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" />
                  CTR Performance Over Time
                </CardTitle>
                <CardDescription>
                  Daily click-through rate comparison across variants
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <LineChart data={performanceTrendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" className="text-xs" />
                    <YAxis className="text-xs" domain={[4, 9]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="variantA" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="variantB" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="variantC" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="variantD" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-purple-500" />
                  Confidence Level History
                </CardTitle>
                <CardDescription>
                  Statistical confidence progression over test duration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <ComposedChart data={confidenceHistoryData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" className="text-xs" />
                    <YAxis className="text-xs" domain={[40, 100]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="variantB" stroke="#22c55e" fill="#22c55e" fillOpacity={0.2} />
                    <Line type="monotone" dataKey="variantA" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="variantC" stroke="#f59e0b" strokeWidth={2} />
                    <Line type="monotone" dataKey="variantD" stroke="#ef4444" strokeWidth={2} />
                  </ComposedChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-green-500" />
                  Element Performance Analysis
                </CardTitle>
                <CardDescription>
                  AI-scored performance of each creative element
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <RadarChart data={elementPerformanceData} cx="50%" cy="50%" outerRadius="80%">
                    <PolarGrid />
                    <PolarAngleAxis dataKey="element" className="text-xs" />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar name="Variant A" dataKey="variantA" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                    <Radar name="Variant B" dataKey="variantB" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} />
                    <Radar name="Variant C" dataKey="variantC" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </RadarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-yellow-500" />
                  Conversion Funnel Comparison
                </CardTitle>
                <CardDescription>
                  Drop-off analysis at each funnel stage
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={chartConfig} className="h-[300px]">
                  <BarChart data={conversionFunnelData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" className="text-xs" />
                    <YAxis dataKey="stage" type="category" className="text-xs" width={100} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="variantA" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="variantB" fill="#22c55e" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="variantC" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="variantD" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="winner" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  Winner Selection Dashboard
                </CardTitle>
                <CardDescription>
                  AI-powered winner determination with statistical validation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-6 rounded-lg border-2 border-green-500/50 bg-green-500/5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                          <Crown className="w-8 h-8 text-green-500" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-xl font-bold">Variant B - Bold CTA</h3>
                            <Badge className="bg-green-500/10 text-green-500">
                              <Trophy className="w-3 h-3 mr-1" />
                              Winner
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mb-3">&quot;Your Music. Every Platform.&quot;</p>
                          <div className="flex gap-6">
                            <div>
                              <p className="text-2xl font-bold text-green-500">7.70%</p>
                              <p className="text-xs text-muted-foreground">CTR</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-green-500">9.03%</p>
                              <p className="text-xs text-muted-foreground">Conv. Rate</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-green-500">96%</p>
                              <p className="text-xs text-muted-foreground">Confidence</p>
                            </div>
                            <div>
                              <p className="text-2xl font-bold text-green-500">$15.6K</p>
                              <p className="text-xs text-muted-foreground">Revenue</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button className="bg-green-600 hover:bg-green-700">
                          <Rocket className="w-4 h-4 mr-2" />
                          Scale Winner
                        </Button>
                        <Button variant="outline">
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Continue Testing
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <ThumbsUp className="w-4 h-4 text-green-500" />
                        Winner Advantages
                      </h4>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>+20.5% higher CTR vs control</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>+11.5% better conversion rate</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>25% lower cost per conversion</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span>Statistically significant (96% confidence)</span>
                        </li>
                      </ul>
                    </div>

                    <div className="p-4 rounded-lg bg-muted/50">
                      <h4 className="font-medium mb-3 flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-500" />
                        AI Insights
                      </h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li className="flex items-start gap-2">
                          <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                          <span>Bold, action-oriented CTA drives 35% more clicks</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                          <span>Shorter headline with periods creates urgency</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Lightbulb className="w-4 h-4 text-yellow-500 mt-0.5" />
                          <span>Social proof in description builds trust</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">All Variants Performance Comparison</h4>
                    {mockVariants.map((variant, idx) => (
                      <div
                        key={variant.id}
                        className={`p-3 rounded-lg border ${
                          variant.status === 'winner'
                            ? 'border-green-500/50 bg-green-500/5'
                            : variant.status === 'loser'
                              ? 'border-red-500/30 bg-red-500/5'
                              : 'border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: COLORS[idx] }}
                            />
                            <span className="font-medium">{variant.name}</span>
                            <Badge className={getStatusBadge(variant.status)}>
                              {getStatusIcon(variant.status)}
                              <span className="ml-1">{variant.status}</span>
                            </Badge>
                          </div>
                          <div className="flex items-center gap-6 text-sm">
                            <div className="text-center">
                              <p className="font-bold">{variant.ctr.toFixed(2)}%</p>
                              <p className="text-xs text-muted-foreground">CTR</p>
                            </div>
                            <div className="text-center">
                              <p className="font-bold">{variant.conversionRate.toFixed(2)}%</p>
                              <p className="text-xs text-muted-foreground">Conv.</p>
                            </div>
                            <div className="text-center">
                              <p className={`font-bold ${getConfidenceColor(variant.confidence)}`}>
                                {variant.confidence}%
                              </p>
                              <p className="text-xs text-muted-foreground">Conf.</p>
                            </div>
                            <div className="w-32">
                              <Progress
                                value={variant.conversionRate * 10}
                                className={
                                  variant.status === 'winner'
                                    ? '[&>div]:bg-green-500'
                                    : variant.status === 'loser'
                                      ? '[&>div]:bg-red-500'
                                      : ''
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-gray-500" />
                  Auto-Selection Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Winner Selection</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically declare winners when confidence is reached
                    </p>
                  </div>
                  <Switch checked={autoWinnerSelection} onCheckedChange={setAutoWinnerSelection} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-Pause Losers</Label>
                    <p className="text-xs text-muted-foreground">
                      Stop underperforming variants early
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Smart Traffic Allocation</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically shift traffic to winning variants
                    </p>
                  </div>
                  <Switch checked={autoOptimize} onCheckedChange={setAutoOptimize} />
                </div>

                <div className="space-y-2">
                  <Label>Minimum Confidence Threshold</Label>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[confidenceThreshold]}
                      onValueChange={(v) => setConfidenceThreshold(v[0])}
                      min={80}
                      max={99}
                      step={1}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium w-12">{confidenceThreshold}%</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Recommendation</p>
                      <p className="text-xs text-muted-foreground">
                        Based on your traffic levels, a 95% confidence threshold is optimal for reliable results without over-testing.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="w-full" variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recalculate Winners
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
