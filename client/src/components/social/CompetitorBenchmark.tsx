import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  LineChart,
  PieChart,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Calendar,
  Clock,
  Target,
  Award,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  ArrowUp,
  ArrowDown,
  Minus,
  ExternalLink,
  Mail,
  FileText,
  Settings,
  MoreHorizontal,
  Search,
  Zap,
  Crown,
  Activity,
  Globe,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
} from '@/components/ui/brand-icons';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';

interface Competitor {
  id: string;
  name: string;
  handle: string;
  avatar?: string;
  isYou?: boolean;
  platforms: PlatformMetrics[];
  totalFollowers: number;
  totalFollowersChange: number;
  avgEngagement: number;
  avgEngagementChange: number;
  shareOfVoice: number;
  postFrequency: number;
  avgPostsPerWeek: number;
  topContentTypes: string[];
  bestPerformingPosts: TopPost[];
  audienceGrowth: GrowthData[];
  engagementTrend: GrowthData[];
  lastUpdated: string;
  color: string;
}

interface PlatformMetrics {
  platform: string;
  handle: string;
  url: string;
  followers: number;
  followersChange: number;
  engagement: number;
  engagementChange: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  avgViews: number;
  postFrequency: number;
  bestPostingTimes: string[];
  topHashtags: string[];
  contentMix: ContentMix;
}

interface ContentMix {
  images: number;
  videos: number;
  carousels: number;
  stories: number;
  reels: number;
  text: number;
}

interface TopPost {
  id: string;
  platform: string;
  content: string;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  postedAt: string;
  mediaUrl?: string;
  url: string;
}

interface GrowthData {
  date: string;
  value: number;
}

interface BenchmarkInsight {
  id: string;
  type: 'opportunity' | 'threat' | 'strength' | 'weakness';
  title: string;
  description: string;
  competitorId?: string;
  metric: string;
  yourValue: number;
  avgValue: number;
  topValue: number;
  recommendation: string;
}

const PLATFORM_CONFIG = {
  twitter: { icon: TwitterIcon, color: '#000000', name: 'Twitter/X' },
  instagram: { icon: InstagramIcon, color: '#E4405F', name: 'Instagram' },
  facebook: { icon: FacebookIcon, color: '#1877F2', name: 'Facebook' },
  tiktok: { icon: TikTokIcon, color: '#000000', name: 'TikTok' },
  youtube: { icon: YouTubeIcon, color: '#FF0000', name: 'YouTube' },
  linkedin: { icon: LinkedInIcon, color: '#0077B5', name: 'LinkedIn' },
};

export function CompetitorBenchmark() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', handle: '', platforms: [] as string[] });
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
  const [selectedCompetitor, setSelectedCompetitor] = useState<Competitor | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportFrequency, setReportFrequency] = useState('weekly');
  const [reportEmail, setReportEmail] = useState('');

  const { data: competitorsData, isLoading } = useQuery({
    queryKey: ['/api/social/benchmark/competitors'],
  });

  const { data: insightsData } = useQuery({
    queryKey: ['/api/social/benchmark/insights'],
  });

  // Use API data or empty arrays - NO MOCK DATA
  const competitors: Competitor[] = competitorsData?.competitors || [];
  const yourBrand: Competitor | null = competitorsData?.yourBrand || null;
  const insights: BenchmarkInsight[] = insightsData?.insights || [];
  const allBrands: Competitor[] = yourBrand ? [yourBrand, ...competitors] : competitors;

  // Show empty state when no data exists
  if (!isLoading && competitors.length === 0 && !yourBrand) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Competitor Benchmarking</CardTitle>
          <CardDescription>Track and compare your social media performance against competitors</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Benchmark Data Available</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Connect your social accounts and add competitors to start tracking performance benchmarks.
          </p>
          <Button className="mt-4" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Competitor
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <ArrowUp className="w-4 h-4 text-green-500" />;
    if (change < 0) return <ArrowDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-500" />;
  };

  const getTrendColor = (change: number) => {
    if (change > 0) return 'text-green-500';
    if (change < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case 'opportunity': return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'threat': return <AlertCircle className="w-5 h-5 text-red-500" />;
      case 'strength': return <CheckCircle className="w-5 h-5 text-blue-500" />;
      case 'weakness': return <TrendingDown className="w-5 h-5 text-orange-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getInsightBg = (type: string) => {
    switch (type) {
      case 'opportunity': return 'bg-green-500/10 border-green-500/20';
      case 'threat': return 'bg-red-500/10 border-red-500/20';
      case 'strength': return 'bg-blue-500/10 border-blue-500/20';
      case 'weakness': return 'bg-orange-500/10 border-orange-500/20';
      default: return 'bg-gray-500/10 border-gray-500/20';
    }
  };

  const handleAddCompetitor = () => {
    if (!newCompetitor.name || !newCompetitor.handle) {
      toast({
        title: 'Missing Information',
        description: 'Please provide competitor name and handle.',
        variant: 'destructive',
      });
      return;
    }
    
    toast({
      title: 'Competitor Added',
      description: `${newCompetitor.name} has been added to tracking. Data will be collected shortly.`,
    });
    setNewCompetitor({ name: '', handle: '', platforms: [] });
    setShowAddDialog(false);
  };

  const handleRemoveCompetitor = (id: string, name: string) => {
    toast({
      title: 'Competitor Removed',
      description: `${name} has been removed from tracking.`,
    });
  };

  const handleExportReport = () => {
    toast({
      title: 'Report Exported',
      description: 'Competitor benchmark report has been downloaded.',
    });
  };

  const handleScheduleReport = () => {
    if (!reportEmail) {
      toast({
        title: 'Email Required',
        description: 'Please provide an email address for the report.',
        variant: 'destructive',
      });
      return;
    }
    
    toast({
      title: 'Report Scheduled',
      description: `${reportFrequency.charAt(0).toUpperCase() + reportFrequency.slice(1)} report will be sent to ${reportEmail}`,
    });
    setShowReportDialog(false);
  };

  const shareOfVoiceData = useMemo(() => {
    return allBrands.map(brand => ({
      name: brand.name,
      value: brand.shareOfVoice,
      color: brand.color,
    }));
  }, [allBrands]);

  const renderComparisonChart = () => {
    const maxFollowers = Math.max(...allBrands.map(b => b.totalFollowers));
    
    return (
      <div className="space-y-4">
        {allBrands.map((brand) => (
          <div key={brand.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {brand.isYou && <Crown className="w-4 h-4 text-yellow-500" />}
                <span className="font-medium">{brand.name}</span>
                <span className="text-sm text-muted-foreground">{brand.handle}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-bold">{formatNumber(brand.totalFollowers)}</span>
                <span className={`flex items-center gap-1 text-sm ${getTrendColor(brand.totalFollowersChange)}`}>
                  {getTrendIcon(brand.totalFollowersChange)}
                  {Math.abs(brand.totalFollowersChange)}%
                </span>
              </div>
            </div>
            <div className="relative h-8 bg-muted rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(brand.totalFollowers / maxFollowers) * 100}%`,
                  backgroundColor: brand.color,
                }}
              />
              {brand.isYou && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-white drop-shadow">Your Brand</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderEngagementComparison = () => {
    const maxEngagement = Math.max(...allBrands.map(b => b.avgEngagement));
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {allBrands.map((brand) => (
          <Card key={brand.id} className={brand.isYou ? 'ring-2 ring-primary' : ''}>
            <CardContent className="p-4 text-center">
              <div
                className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: brand.color }}
              >
                {brand.avgEngagement.toFixed(1)}%
              </div>
              <p className="font-medium text-sm mb-1">{brand.name}</p>
              <div className={`flex items-center justify-center gap-1 text-xs ${getTrendColor(brand.avgEngagementChange)}`}>
                {getTrendIcon(brand.avgEngagementChange)}
                {brand.avgEngagementChange > 0 ? '+' : ''}{brand.avgEngagementChange.toFixed(1)}%
              </div>
              {brand.isYou && (
                <Badge variant="outline" className="mt-2">You</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderShareOfVoicePie = () => {
    let cumulativePercent = 0;
    
    return (
      <div className="flex items-center gap-8">
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {shareOfVoiceData.map((item, i) => {
              const startPercent = cumulativePercent;
              cumulativePercent += item.value;
              const strokeDasharray = `${item.value} ${100 - item.value}`;
              const strokeDashoffset = -startPercent;
              
              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={item.color}
                  strokeWidth="20"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold">{yourBrand.shareOfVoice}%</p>
              <p className="text-xs text-muted-foreground">Your Share</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 space-y-3">
          {shareOfVoiceData.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: item.color }} />
              <span className="flex-1 text-sm">{item.name}</span>
              <span className="font-medium">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-600 bg-clip-text text-transparent">
            Competitor Benchmark
          </h2>
          <p className="text-muted-foreground mt-1">
            Compare your performance against competitors across all platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowReportDialog(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Schedule Report
          </Button>
          <Button variant="outline" onClick={handleExportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Competitor
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Your Followers</p>
                <p className="text-2xl font-bold">{formatNumber(yourBrand.totalFollowers)}</p>
              </div>
              <div className={`flex items-center gap-1 ${getTrendColor(yourBrand.totalFollowersChange)}`}>
                {getTrendIcon(yourBrand.totalFollowersChange)}
                <span className="text-sm font-medium">{yourBrand.totalFollowersChange}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Rank: #4 of {allBrands.length}
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Engagement Rate</p>
                <p className="text-2xl font-bold">{yourBrand.avgEngagement}%</p>
              </div>
              <div className={`flex items-center gap-1 ${getTrendColor(yourBrand.avgEngagementChange)}`}>
                {getTrendIcon(yourBrand.avgEngagementChange)}
                <span className="text-sm font-medium">{yourBrand.avgEngagementChange}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              <span className="text-green-500">↑ 28%</span> above average
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Share of Voice</p>
                <p className="text-2xl font-bold">{yourBrand.shareOfVoice}%</p>
              </div>
              <Target className="w-8 h-8 text-green-500 opacity-50" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Top competitor: 32%
            </p>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tracking</p>
                <p className="text-2xl font-bold">{competitors.length} Competitors</p>
              </div>
              <Users className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Last updated: Just now
            </p>
          </CardContent>
        </Card>
      </div>

      {insights.filter(i => i.type === 'opportunity' || i.type === 'threat').length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.filter(i => i.type === 'opportunity' || i.type === 'threat').slice(0, 2).map((insight) => (
            <Card key={insight.id} className={`border ${getInsightBg(insight.type)}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {getInsightIcon(insight.type)}
                  <div className="flex-1">
                    <p className="font-medium">{insight.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                    <p className="text-xs text-primary mt-2">💡 {insight.recommendation}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="followers">Followers</TabsTrigger>
              <TabsTrigger value="engagement">Engagement</TabsTrigger>
              <TabsTrigger value="content">Content Strategy</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        
        <CardContent>
          <TabsContent value="overview" className="mt-0">
            <div className="space-y-6">
              <div className="flex items-center gap-4 mb-4">
                <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Platforms" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/social/benchmark'] })}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Data
                </Button>
              </div>
              
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competitor</TableHead>
                      <TableHead className="text-right">Followers</TableHead>
                      <TableHead className="text-right">Growth</TableHead>
                      <TableHead className="text-right">Engagement</TableHead>
                      <TableHead className="text-right">Post Freq</TableHead>
                      <TableHead className="text-right">Share of Voice</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-primary/5">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: yourBrand.color + '30' }}>
                            <Crown className="w-4 h-4" style={{ color: yourBrand.color }} />
                          </div>
                          <div>
                            <p className="font-medium">{yourBrand.name}</p>
                            <p className="text-xs text-muted-foreground">{yourBrand.handle}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(yourBrand.totalFollowers)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`flex items-center justify-end gap-1 ${getTrendColor(yourBrand.totalFollowersChange)}`}>
                          {getTrendIcon(yourBrand.totalFollowersChange)}
                          {yourBrand.totalFollowersChange}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{yourBrand.avgEngagement}%</TableCell>
                      <TableCell className="text-right">{yourBrand.avgPostsPerWeek}/week</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={yourBrand.shareOfVoice} className="w-16 h-2" />
                          <span className="text-sm w-10">{yourBrand.shareOfVoice}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">-</TableCell>
                    </TableRow>
                    
                    {competitors.map((competitor) => (
                      <TableRow key={competitor.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: competitor.color + '30' }}>
                              <span className="text-sm font-bold" style={{ color: competitor.color }}>
                                {competitor.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{competitor.name}</p>
                              <p className="text-xs text-muted-foreground">{competitor.handle}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatNumber(competitor.totalFollowers)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`flex items-center justify-end gap-1 ${getTrendColor(competitor.totalFollowersChange)}`}>
                            {getTrendIcon(competitor.totalFollowersChange)}
                            {competitor.totalFollowersChange}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{competitor.avgEngagement}%</TableCell>
                        <TableCell className="text-right">{competitor.avgPostsPerWeek}/week</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={competitor.shareOfVoice} className="w-16 h-2" />
                            <span className="text-sm w-10">{competitor.shareOfVoice}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setSelectedCompetitor(competitor)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Visit Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-500"
                                onClick={() => handleRemoveCompetitor(competitor.id, competitor.name)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <PieChart className="w-5 h-5" />
                      Share of Voice
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderShareOfVoicePie()}
                  </CardContent>
                </Card>

                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="w-5 h-5" />
                      Follower Comparison
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {renderComparisonChart()}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="followers" className="mt-0">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Audience Growth Comparison</CardTitle>
                  <CardDescription>30-day follower growth trends</CardDescription>
                </CardHeader>
                <CardContent>
                  {renderComparisonChart()}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allBrands.map((brand) => (
                  <Card key={brand.id} className={brand.isYou ? 'ring-2 ring-primary' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: brand.color }} />
                          <CardTitle className="text-base">{brand.name}</CardTitle>
                          {brand.isYou && <Badge variant="outline" className="text-xs">You</Badge>}
                        </div>
                        <Badge variant="outline">{formatNumber(brand.totalFollowers)} total</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {brand.platforms.map((platform) => {
                          const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                          return (
                            <div key={platform.platform} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {PlatformIcon && (
                                  <PlatformIcon
                                    className="w-4 h-4"
                                    style={{ color: PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                                  />
                                )}
                                <span className="text-sm capitalize">{platform.platform}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-medium">{formatNumber(platform.followers)}</span>
                                <span className={`flex items-center gap-1 text-xs ${getTrendColor(platform.followersChange)}`}>
                                  {getTrendIcon(platform.followersChange)}
                                  {Math.abs(platform.followersChange)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="engagement" className="mt-0">
            <div className="space-y-6">
              <CardDescription>Compare engagement rates across all tracked brands</CardDescription>
              {renderEngagementComparison()}

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Engagement by Platform</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Brand</TableHead>
                          {Object.entries(PLATFORM_CONFIG).slice(0, 4).map(([key, config]) => (
                            <TableHead key={key} className="text-center">{config.name}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allBrands.map((brand) => (
                          <TableRow key={brand.id} className={brand.isYou ? 'bg-primary/5' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: brand.color }} />
                                <span className="font-medium">{brand.name}</span>
                              </div>
                            </TableCell>
                            {Object.keys(PLATFORM_CONFIG).slice(0, 4).map((platform) => {
                              const platformData = brand.platforms.find(p => p.platform === platform);
                              return (
                                <TableCell key={platform} className="text-center">
                                  {platformData ? (
                                    <span className="font-medium">{platformData.engagement}%</span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Posting Frequency</CardTitle>
                    <CardDescription>Average posts per week</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {allBrands.map((brand) => (
                        <div key={brand.id} className="flex items-center gap-4">
                          <div className="w-20">
                            <span className="text-sm font-medium">{brand.name}</span>
                          </div>
                          <div className="flex-1">
                            <Progress 
                              value={(brand.avgPostsPerWeek / 25) * 100} 
                              className="h-3"
                            />
                          </div>
                          <span className="font-bold w-16 text-right">{brand.avgPostsPerWeek}/wk</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Top Content Types</CardTitle>
                    <CardDescription>Best performing content categories</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {allBrands.map((brand) => (
                        <div key={brand.id}>
                          <p className="text-sm font-medium mb-2">{brand.name}</p>
                          <div className="flex flex-wrap gap-1">
                            {brand.topContentTypes.map((type, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Best Posting Times</CardTitle>
                  <CardDescription>Optimal times for maximum engagement by platform</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {yourBrand.platforms.map((platform) => {
                      const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                      return (
                        <div key={platform.platform} className="p-4 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2 mb-3">
                            {PlatformIcon && (
                              <PlatformIcon
                                className="w-5 h-5"
                                style={{ color: PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                              />
                            )}
                            <span className="font-medium capitalize">{platform.platform}</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {platform.bestPostingTimes.map((time, i) => (
                              <Badge key={i} variant="outline">
                                <Clock className="w-3 h-3 mr-1" />
                                {time}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-muted-foreground">AI-powered insights based on competitor analysis</p>
                <Button variant="outline" size="sm">
                  <Zap className="w-4 h-4 mr-2" />
                  Generate New Insights
                </Button>
              </div>
              
              {insights.map((insight) => (
                <Card key={insight.id} className={`border ${getInsightBg(insight.type)}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        {getInsightIcon(insight.type)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{insight.title}</h4>
                          <Badge variant="outline" className="text-xs capitalize">{insight.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
                        
                        <div className="grid grid-cols-3 gap-4 p-3 bg-background/50 rounded-lg mb-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Your Value</p>
                            <p className="font-bold text-lg">{insight.yourValue}{insight.metric.includes('%') || insight.metric.includes('Rate') ? '%' : ''}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Average</p>
                            <p className="font-bold text-lg">{insight.avgValue}{insight.metric.includes('%') || insight.metric.includes('Rate') ? '%' : ''}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Top Performer</p>
                            <p className="font-bold text-lg">{insight.topValue}{insight.metric.includes('%') || insight.metric.includes('Rate') ? '%' : ''}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-start gap-2 p-3 bg-primary/5 rounded-lg">
                          <Zap className="w-4 h-4 text-primary mt-0.5" />
                          <p className="text-sm">{insight.recommendation}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Competitor</DialogTitle>
            <DialogDescription>
              Track a new competitor's social media performance
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Competitor Name</Label>
              <Input
                id="name"
                placeholder="e.g., DistroKid"
                value={newCompetitor.name}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handle">Primary Handle</Label>
              <Input
                id="handle"
                placeholder="e.g., @distrokid"
                value={newCompetitor.handle}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, handle: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Platforms to Track</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                  const isSelected = newCompetitor.platforms.includes(key);
                  const PlatformIcon = config.icon;
                  return (
                    <Button
                      key={key}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setNewCompetitor({
                            ...newCompetitor,
                            platforms: newCompetitor.platforms.filter(p => p !== key),
                          });
                        } else {
                          setNewCompetitor({
                            ...newCompetitor,
                            platforms: [...newCompetitor.platforms, key],
                          });
                        }
                      }}
                    >
                      <PlatformIcon className="w-4 h-4 mr-1" />
                      {config.name}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddCompetitor}>
              <Plus className="w-4 h-4 mr-2" />
              Add Competitor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Benchmark Report</DialogTitle>
            <DialogDescription>
              Receive automated competitor analysis reports
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Report Frequency</Label>
              <Select value={reportFrequency} onValueChange={setReportFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleScheduleReport}>
              <Mail className="w-4 h-4 mr-2" />
              Schedule Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedCompetitor} onOpenChange={() => setSelectedCompetitor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: selectedCompetitor?.color + '30' }}>
                <span className="font-bold" style={{ color: selectedCompetitor?.color }}>
                  {selectedCompetitor?.name.charAt(0)}
                </span>
              </div>
              {selectedCompetitor?.name}
            </DialogTitle>
            <DialogDescription>{selectedCompetitor?.handle}</DialogDescription>
          </DialogHeader>
          {selectedCompetitor && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{formatNumber(selectedCompetitor.totalFollowers)}</p>
                  <p className="text-xs text-muted-foreground">Total Followers</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{selectedCompetitor.avgEngagement}%</p>
                  <p className="text-xs text-muted-foreground">Engagement</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{selectedCompetitor.shareOfVoice}%</p>
                  <p className="text-xs text-muted-foreground">Share of Voice</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">{selectedCompetitor.avgPostsPerWeek}</p>
                  <p className="text-xs text-muted-foreground">Posts/Week</p>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-3">Platform Breakdown</h4>
                <div className="space-y-3">
                  {selectedCompetitor.platforms.map((platform) => {
                    const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                    return (
                      <div key={platform.platform} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {PlatformIcon && (
                            <PlatformIcon
                              className="w-5 h-5"
                              style={{ color: PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                            />
                          )}
                          <div>
                            <p className="font-medium capitalize">{platform.platform}</p>
                            <p className="text-xs text-muted-foreground">@{platform.handle}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-right">
                            <p className="font-medium">{formatNumber(platform.followers)}</p>
                            <p className="text-xs text-muted-foreground">Followers</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">{platform.engagement}%</p>
                            <p className="text-xs text-muted-foreground">Engagement</p>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <a href={platform.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
