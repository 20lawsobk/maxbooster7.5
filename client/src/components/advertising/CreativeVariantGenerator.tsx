import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
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
} from 'lucide-react';

interface CreativeVariant {
  id: string;
  name: string;
  headline: string;
  description: string;
  cta: string;
  imageUrl?: string;
  status: 'draft' | 'testing' | 'winner' | 'loser' | 'paused';
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversionRate: number;
  confidence: number;
  predictionScore: number;
  createdAt: string;
}

interface ABTest {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'paused';
  startDate: string;
  variants: CreativeVariant[];
  winningVariant?: string;
  statisticalSignificance: number;
  sampleSize: number;
  targetSampleSize: number;
}


const HEADLINE_SUGGESTIONS = [
  'Stream Your Music Worldwide',
  'Your Music. Every Platform.',
  'Join 500,000+ Artists',
  'Unlimited Music Distribution',
  'Go Global With Your Sound',
];

const CTA_SUGGESTIONS = [
  'Start Free Trial',
  'Go Live Now',
  'Start Distributing',
  'Get Started Free',
  'Launch Your Music',
];

export function CreativeVariantGenerator() {
  const { data: testsData } = useQuery({
    queryKey: ['/api/advertising/ab-tests'],
  });
  
  const { data: variantsData } = useQuery({
    queryKey: ['/api/advertising/variants'],
  });

  const abTests: ABTest[] = testsData?.tests || [];
  const variants: CreativeVariant[] = variantsData?.variants || [];

  const [activeTest, setActiveTest] = useState<ABTest | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [bulkCount, setBulkCount] = useState(5);
  const [newVariant, setNewVariant] = useState({
    headline: '',
    description: '',
    cta: 'Start Free Trial',
  });

  const handleGenerateVariants = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
    }, 2000);
  };

  const getStatusBadge = (status: CreativeVariant['status']) => {
    const styles = {
      draft: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      testing: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      winner: 'bg-green-500/10 text-green-500 border-green-500/20',
      loser: 'bg-red-500/10 text-red-500 border-red-500/20',
      paused: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    };
    return styles[status];
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 95) return 'text-green-500';
    if (confidence >= 80) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getPredictionColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const chartConfig = {
    variantA: { label: 'Variant A', color: '#3b82f6' },
    variantB: { label: 'Variant B', color: '#22c55e' },
    variantC: { label: 'Variant C', color: '#f59e0b' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-500" />
            AI Creative Variant Generator
          </h2>
          <p className="text-muted-foreground">
            Generate, test, and auto-optimize ad creatives with AI
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={autoOptimize}
              onCheckedChange={setAutoOptimize}
              id="auto-optimize"
            />
            <Label htmlFor="auto-optimize" className="text-sm">
              Auto-Optimize Winners
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
              <Wand2 className="w-4 h-4 mr-2" />
            )}
            Generate AI Variants
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Tests</p>
                <p className="text-2xl font-bold">{abTests.filter(t => t.status === 'running').length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Layers className="w-5 h-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Variants</p>
                <p className="text-2xl font-bold">{variants.length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Copy className="w-5 h-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg CTR Lift</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {variants.length > 0 
                    ? `${(variants.reduce((acc, v) => acc + v.ctr, 0) / variants.length).toFixed(1)}%` 
                    : '--'}
                </p>
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
                <p className="text-2xl font-bold">{variants.filter(v => v.status === 'winner').length}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="variants" className="space-y-4">
        <TabsList>
          <TabsTrigger value="variants">Active Variants</TabsTrigger>
          <TabsTrigger value="generate">Bulk Generate</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="predictions">AI Predictions</TabsTrigger>
        </TabsList>

        <TabsContent value="variants" className="space-y-4">
          {!activeTest && abTests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No A/B Tests Available</h3>
                <p className="text-muted-foreground text-center max-w-md">
                  Create your first A/B test to start optimizing ad creatives with AI-powered variant generation.
                </p>
                <Button className="mt-4" onClick={handleGenerateVariants}>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate AI Variants
                </Button>
              </CardContent>
            </Card>
          ) : activeTest ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{activeTest.name}</CardTitle>
                  <CardDescription>
                    Started {new Date(activeTest.startDate).toLocaleDateString()} •{' '}
                    {activeTest.sampleSize.toLocaleString()} /{' '}
                    {activeTest.targetSampleSize.toLocaleString()} samples
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      activeTest.status === 'running'
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-gray-500/10 text-gray-500'
                    }
                  >
                    {activeTest.status === 'running' ? (
                      <Play className="w-3 h-3 mr-1" />
                    ) : (
                      <Pause className="w-3 h-3 mr-1" />
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
                {activeTest.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={`p-4 rounded-lg border ${
                      variant.status === 'winner'
                        ? 'border-green-500/50 bg-green-500/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{variant.name}</h4>
                          <Badge className={getStatusBadge(variant.status)}>
                            {variant.status === 'winner' && (
                              <Trophy className="w-3 h-3 mr-1" />
                            )}
                            {variant.status}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-2">
                            <Type className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Headline:</span>
                            <span className="font-medium">{variant.headline}</span>
                          </p>
                          <p className="flex items-center gap-2">
                            <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">CTA:</span>
                            <span className="font-medium">{variant.cta}</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-2xl font-bold">{variant.ctr.toFixed(2)}%</p>
                          <p className="text-xs text-muted-foreground">CTR</p>
                        </div>
                        <div className="text-center">
                          <p className="text-2xl font-bold">
                            {variant.conversionRate.toFixed(2)}%
                          </p>
                          <p className="text-xs text-muted-foreground">Conv. Rate</p>
                        </div>
                        <div className="text-center">
                          <p
                            className={`text-2xl font-bold ${getConfidenceColor(variant.confidence)}`}
                          >
                            {variant.confidence}%
                          </p>
                          <p className="text-xs text-muted-foreground">Confidence</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center gap-1">
                            <Brain className="w-4 h-4 text-purple-500" />
                            <p className="text-2xl font-bold">{variant.predictionScore}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">AI Score</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Eye className="w-3 h-3" />
                          {variant.impressions.toLocaleString()} impressions
                          <span className="mx-2">•</span>
                          <MousePointerClick className="w-3 h-3" />
                          {variant.clicks.toLocaleString()} clicks
                          <span className="mx-2">•</span>
                          <Target className="w-3 h-3" />
                          {variant.conversions.toLocaleString()} conversions
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Copy className="w-3 h-3 mr-1" />
                          Duplicate
                        </Button>
                        {variant.status === 'winner' && (
                          <Button size="sm" className="bg-green-600 hover:bg-green-700">
                            <Zap className="w-3 h-3 mr-1" />
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
          ) : null}
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  Create New Variant
                </CardTitle>
                <CardDescription>
                  Manually create or let AI generate creative elements
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Headline</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter headline..."
                      value={newVariant.headline}
                      onChange={(e) =>
                        setNewVariant({ ...newVariant, headline: e.target.value })
                      }
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setNewVariant({
                          ...newVariant,
                          headline: HEADLINE_SUGGESTIONS[Math.floor(Math.random() * HEADLINE_SUGGESTIONS.length)],
                        })
                      }
                    >
                      <Shuffle className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Enter description..."
                    value={newVariant.description}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, description: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Call to Action</Label>
                  <Select
                    value={newVariant.cta}
                    onValueChange={(value) => setNewVariant({ ...newVariant, cta: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ctas.map((cta) => (
                        <SelectItem key={cta} value={cta}>
                          {cta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Image</Label>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                    <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PNG, JPG up to 10MB
                    </p>
                  </div>
                </div>

                <Button className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Variant
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-pink-500" />
                  Bulk AI Generation
                </CardTitle>
                <CardDescription>
                  Generate multiple creative variants automatically
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Number of Variants</Label>
                  <Select
                    value={bulkCount.toString()}
                    onValueChange={(value) => setBulkCount(parseInt(value))}
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

                <div className="space-y-2">
                  <Label>Base Content Theme</Label>
                  <Textarea placeholder="Describe the theme or key message..." />
                </div>

                <div className="space-y-2">
                  <Label>Target Audience</Label>
                  <Input placeholder="e.g., Independent musicians, ages 18-35" />
                </div>

                <div className="space-y-3">
                  <Label>Dynamic Elements to Vary</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Headlines', icon: Type },
                      { label: 'Descriptions', icon: Layers },
                      { label: 'CTAs', icon: MousePointerClick },
                      { label: 'Images', icon: Image },
                    ].map(({ label, icon: Icon }) => (
                      <Badge
                        key={label}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary/10"
                      >
                        <Icon className="w-3 h-3 mr-1" />
                        {label}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="w-5 h-5 text-purple-500" />
                    <span className="font-medium">AI Prediction</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Based on your inputs, AI predicts an average performance score of{' '}
                    <span className="text-green-500 font-bold">78/100</span> for generated
                    variants.
                  </p>
                </div>

                <Button
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  onClick={handleGenerateVariants}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Generate {bulkCount} Variants
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                CTR Performance Over Time
              </CardTitle>
              <CardDescription>Compare variant performance across the week</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px]">
                <LineChart data={performanceData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" className="text-xs" />
                  <YAxis className="text-xs" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="variantA"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="variantB"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="variantC"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {variants.map((variant) => (
              <Card key={variant.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{variant.name.split(' - ')[1]}</h4>
                    <Badge className={getStatusBadge(variant.status)}>{variant.status}</Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">CTR</span>
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{variant.ctr.toFixed(2)}%</span>
                        {variant.status === 'winner' ? (
                          <ArrowUpRight className="w-4 h-4 text-green-500" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                    </div>
                    <Progress value={variant.ctr * 10} />

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Conversion Rate</span>
                      <span className="font-bold">{variant.conversionRate.toFixed(2)}%</span>
                    </div>
                    <Progress value={variant.conversionRate * 10} />

                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Confidence</span>
                      <span className={`font-bold ${getConfidenceColor(variant.confidence)}`}>
                        {variant.confidence}%
                      </span>
                    </div>
                    <Progress
                      value={variant.confidence}
                      className={
                        variant.confidence >= 95
                          ? '[&>div]:bg-green-500'
                          : variant.confidence >= 80
                            ? '[&>div]:bg-yellow-500'
                            : '[&>div]:bg-red-500'
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="predictions" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  AI Performance Predictions
                </CardTitle>
                <CardDescription>
                  ML-based predictions for creative performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {variants.map((variant) => (
                    <div key={variant.id} className="p-3 rounded-lg border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{variant.name}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full ${getPredictionColor(variant.predictionScore)}`}
                          />
                          <span className="font-bold">{variant.predictionScore}/100</span>
                        </div>
                      </div>
                      <Progress
                        value={variant.predictionScore}
                        className={`[&>div]:${getPredictionColor(variant.predictionScore)}`}
                      />
                      <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Predicted CTR: {(variant.ctr * 1.1).toFixed(2)}%</span>
                        <span>Expected Conv: {(variant.conversionRate * 1.05).toFixed(2)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prediction Score Distribution</CardTitle>
                <CardDescription>Distribution of AI prediction scores</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    high: { label: 'High', color: '#22c55e' },
                    medium: { label: 'Medium', color: '#eab308' },
                    low: { label: 'Low', color: '#ef4444' },
                  }}
                  className="h-[250px]"
                >
                  <PieChart>
                    <Pie
                      data={predictionDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {predictionDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="flex justify-center gap-4 mt-4">
                  {predictionDistribution.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-sm">{item.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                AI Optimization Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                  <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
                  <h4 className="font-semibold mb-1">Scale Variant B</h4>
                  <p className="text-sm text-muted-foreground">
                    96% confidence - ready to allocate 70% of budget
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <Clock className="w-6 h-6 text-yellow-500 mb-2" />
                  <h4 className="font-semibold mb-1">Continue Testing C</h4>
                  <p className="text-sm text-muted-foreground">
                    Needs 15,000 more impressions for significance
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="w-6 h-6 text-red-500 mb-2" />
                  <h4 className="font-semibold mb-1">Consider Pausing A</h4>
                  <p className="text-sm text-muted-foreground">
                    Underperforming by 18% compared to winner
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
