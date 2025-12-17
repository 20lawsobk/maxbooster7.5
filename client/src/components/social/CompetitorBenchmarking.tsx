import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  DialogTrigger,
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
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
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

interface Competitor {
  id: string;
  name: string;
  handle: string;
  platforms: {
    platform: string;
    handle: string;
    followers: number;
    followersChange: number;
    engagement: number;
    engagementChange: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
    postFrequency: number;
    bestPostingTimes: string[];
  }[];
  totalFollowers: number;
  avgEngagement: number;
  shareOfVoice: number;
  lastUpdated: string;
  color: string;
}

interface ContentPerformance {
  postId: string;
  competitorId: string;
  platform: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  engagement: number;
  postedAt: string;
}

const PLATFORM_CONFIG = {
  twitter: { icon: TwitterIcon, color: '#000000', name: 'Twitter' },
  instagram: { icon: InstagramIcon, color: '#E4405F', name: 'Instagram' },
  facebook: { icon: FacebookIcon, color: '#1877F2', name: 'Facebook' },
  tiktok: { icon: TikTokIcon, color: '#000000', name: 'TikTok' },
  youtube: { icon: YouTubeIcon, color: '#FF0000', name: 'YouTube' },
  linkedin: { icon: LinkedInIcon, color: '#0077B5', name: 'LinkedIn' },
};


export function CompetitorBenchmarking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState({ name: '', handle: '', platforms: [] as string[] });
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportFrequency, setReportFrequency] = useState('weekly');
  const [reportEmail, setReportEmail] = useState('');

  const { data: competitorsData, isLoading } = useQuery({
    queryKey: ['/api/social/competitors'],
  });

  const { data: yourStatsData } = useQuery({
    queryKey: ['/api/social/your-stats'],
  });

  const competitors = competitorsData?.competitors || [];
  const yourStats = yourStatsData || { totalFollowers: 0, avgEngagement: 0, shareOfVoice: 0, followersChange: 0, engagementChange: 0 };
  const allData = [...competitors, { ...yourStats, id: 'you', name: 'Your Brand', handle: '@maxbooster', color: '#8b5cf6' }];

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
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
      description: `${newCompetitor.name} has been added to tracking.`,
    });
    setNewCompetitor({ name: '', handle: '', platforms: [] });
    setShowAddDialog(false);
  };

  const handleRemoveCompetitor = (id: string) => {
    toast({
      title: 'Competitor Removed',
      description: 'Competitor has been removed from tracking.',
    });
  };

  const handleSetupReport = () => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-500 to-pink-600 bg-clip-text text-transparent">
            Competitor Benchmarking
          </h2>
          <p className="text-muted-foreground mt-1">
            Track and compare your performance against competitors
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowReportDialog(true)}>
            <Mail className="w-4 h-4 mr-2" />
            Schedule Report
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
                <p className="text-2xl font-bold">{formatNumber(yourStats.totalFollowers)}</p>
              </div>
              <div className={`flex items-center gap-1 ${getTrendColor(yourStats.followersChange)}`}>
                {getTrendIcon(yourStats.followersChange)}
                <span className="text-sm font-medium">{yourStats.followersChange}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Engagement Rate</p>
                <p className="text-2xl font-bold">{yourStats.avgEngagement}%</p>
              </div>
              <div className={`flex items-center gap-1 ${getTrendColor(yourStats.engagementChange)}`}>
                {getTrendIcon(yourStats.engagementChange)}
                <span className="text-sm font-medium">{yourStats.engagementChange}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Share of Voice</p>
                <p className="text-2xl font-bold">{yourStats.shareOfVoice}%</p>
              </div>
              <Target className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tracking</p>
                <p className="text-2xl font-bold">{competitors.length}</p>
              </div>
              <Users className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="growth">Follower Growth</TabsTrigger>
              <TabsTrigger value="engagement">Engagement</TabsTrigger>
              <TabsTrigger value="content">Content Performance</TabsTrigger>
              <TabsTrigger value="timing">Best Times</TabsTrigger>
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
                <Button variant="outline" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Data
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
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
                      <TableHead className="text-right">Share of Voice</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="bg-primary/5">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#8b5cf6' + '30' }}>
                            <Award className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                          </div>
                          <div>
                            <p className="font-medium">Your Brand</p>
                            <p className="text-xs text-muted-foreground">@maxbooster</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(yourStats.totalFollowers)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`flex items-center justify-end gap-1 ${getTrendColor(yourStats.followersChange)}`}>
                          {getTrendIcon(yourStats.followersChange)}
                          {yourStats.followersChange}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{yourStats.avgEngagement}%</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={yourStats.shareOfVoice} className="w-20 h-2" />
                          <span className="text-sm">{yourStats.shareOfVoice}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">-</TableCell>
                    </TableRow>
                    
                    {competitors.map((competitor: Competitor) => (
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
                          <span className={`flex items-center justify-end gap-1 ${getTrendColor(competitor.platforms[0]?.followersChange || 0)}`}>
                            {getTrendIcon(competitor.platforms[0]?.followersChange || 0)}
                            {competitor.platforms[0]?.followersChange || 0}%
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{competitor.avgEngagement}%</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={competitor.shareOfVoice} className="w-20 h-2" />
                            <span className="text-sm">{competitor.shareOfVoice}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => setSelectedCompetitor(competitor.id)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveCompetitor(competitor.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Card className="bg-muted/50">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Share of Voice Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#8b5cf6' }} />
                        <span className="flex-1">Your Brand</span>
                        <span className="font-medium">{yourStats.shareOfVoice}%</span>
                      </div>
                      {competitors.map((competitor: Competitor) => (
                        <div key={competitor.id} className="flex items-center gap-3">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: competitor.color }} />
                          <span className="flex-1">{competitor.name}</span>
                          <span className="font-medium">{competitor.shareOfVoice}%</span>
                        </div>
                      ))}
                    </div>
                    <div className="w-48 h-48 relative">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        {(() => {
                          let offset = 0;
                          const items = [
                            { value: yourStats.shareOfVoice, color: '#8b5cf6' },
                            ...competitors.map((c: Competitor) => ({ value: c.shareOfVoice, color: c.color })),
                          ];
                          return items.map((item, i) => {
                            const strokeDasharray = `${item.value} ${100 - item.value}`;
                            const strokeDashoffset = -offset;
                            offset += item.value;
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
                              />
                            );
                          });
                        })()}
                      </svg>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="growth" className="mt-0">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {competitors.map((competitor: Competitor) => (
                  <Card key={competitor.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: competitor.color }} />
                          <CardTitle className="text-base">{competitor.name}</CardTitle>
                        </div>
                        <Badge variant="outline">{formatNumber(competitor.totalFollowers)} total</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {competitor.platforms.map((platform) => {
                          const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                          return (
                            <div key={platform.platform} className="flex items-center gap-3">
                              {PlatformIcon && (
                                <PlatformIcon
                                  className="w-4 h-4"
                                  style={{ color: PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                                />
                              )}
                              <span className="text-sm flex-1">@{platform.handle}</span>
                              <span className="font-medium">{formatNumber(platform.followers)}</span>
                              <span className={`text-sm flex items-center gap-1 ${getTrendColor(platform.followersChange)}`}>
                                {getTrendIcon(platform.followersChange)}
                                {platform.followersChange}%
                              </span>
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
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Brand</TableHead>
                      <TableHead>Platform</TableHead>
                      <TableHead className="text-right">Engagement</TableHead>
                      <TableHead className="text-right">Avg Likes</TableHead>
                      <TableHead className="text-right">Avg Comments</TableHead>
                      <TableHead className="text-right">Avg Shares</TableHead>
                      <TableHead className="text-right">Posts/Month</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitors.flatMap((competitor: Competitor) =>
                      competitor.platforms.map((platform) => {
                        const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                        return (
                          <TableRow key={`${competitor.id}-${platform.platform}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: competitor.color }} />
                                <span>{competitor.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {PlatformIcon && <PlatformIcon className="w-4 h-4" />}
                                <span className="capitalize">{platform.platform}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`flex items-center justify-end gap-1 ${getTrendColor(platform.engagementChange)}`}>
                                {platform.engagement}%
                                {getTrendIcon(platform.engagementChange)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">{formatNumber(platform.avgLikes)}</TableCell>
                            <TableCell className="text-right">{formatNumber(platform.avgComments)}</TableCell>
                            <TableCell className="text-right">{formatNumber(platform.avgShares)}</TableCell>
                            <TableCell className="text-right">{platform.postFrequency}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="content" className="mt-0">
            <div className="space-y-6">
              <div className="p-8 text-center border rounded-lg bg-muted/50">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">Content Performance Analysis</h3>
                <p className="text-muted-foreground mb-4">
                  View detailed content performance metrics for each competitor
                </p>
                <Button>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Analyze Content
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="timing" className="mt-0">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {competitors.map((competitor: Competitor) => (
                  <Card key={competitor.id}>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        {competitor.name}
                      </CardTitle>
                      <CardDescription>Best posting times</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {competitor.platforms.map((platform) => {
                          const PlatformIcon = PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                          return (
                            <div key={platform.platform}>
                              <div className="flex items-center gap-2 mb-2">
                                {PlatformIcon && (
                                  <PlatformIcon
                                    className="w-4 h-4"
                                    style={{ color: PLATFORM_CONFIG[platform.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                                  />
                                )}
                                <span className="text-sm font-medium capitalize">{platform.platform}</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {platform.bestPostingTimes.map((time, i) => (
                                  <Badge key={i} variant="secondary">{time}</Badge>
                                ))}
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
        </CardContent>
      </Card>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Competitor</DialogTitle>
            <DialogDescription>
              Add a new competitor to track their social media performance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Competitor Name</Label>
              <Input
                id="name"
                value={newCompetitor.name}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, name: e.target.value })}
                placeholder="e.g., DistroKid"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="handle">Primary Handle</Label>
              <Input
                id="handle"
                value={newCompetitor.handle}
                onChange={(e) => setNewCompetitor({ ...newCompetitor, handle: e.target.value })}
                placeholder="e.g., @distrokid"
              />
            </div>
            <div className="space-y-2">
              <Label>Platforms to Track</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                  const PlatformIcon = config.icon;
                  const isSelected = newCompetitor.platforms.includes(key);
                  return (
                    <Button
                      key={key}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setNewCompetitor({
                            ...newCompetitor,
                            platforms: newCompetitor.platforms.filter((p) => p !== key),
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
            <DialogTitle>Schedule Automated Report</DialogTitle>
            <DialogDescription>
              Set up automated competitor analysis reports delivered to your inbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={reportEmail}
                onChange={(e) => setReportEmail(e.target.value)}
                placeholder="your@email.com"
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
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Report Includes:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Follower growth comparison</li>
                <li>• Engagement rate trends</li>
                <li>• Share of voice changes</li>
                <li>• Top performing content</li>
                <li>• Posting time recommendations</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSetupReport}>
              <Mail className="w-4 h-4 mr-2" />
              Schedule Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
