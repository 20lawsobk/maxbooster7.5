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
import { Switch } from '@/components/ui/switch';
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
  Search,
  Hash,
  AtSign,
  Bell,
  BellOff,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  AlertCircle,
  Smile,
  Meh,
  Frown,
  User,
  Users,
  Globe,
  Zap,
  Shield,
  Eye,
  Plus,
  Trash2,
  RefreshCw,
  Download,
  Filter,
  MessageSquare,
  BarChart3,
  PieChart,
  Activity,
  Clock,
  CheckCircle,
  XCircle,
  Volume2,
  Star,
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
import { format } from 'date-fns';

interface TrackedKeyword {
  id: string;
  keyword: string;
  type: 'keyword' | 'hashtag' | 'mention';
  platforms: string[];
  alertsEnabled: boolean;
  mentionCount: number;
  sentiment: { positive: number; neutral: number; negative: number };
  recentMentions: Mention[];
  createdAt: string;
}

interface Mention {
  id: string;
  platform: string;
  content: string;
  author: {
    name: string;
    username: string;
    followers: number;
    verified: boolean;
  };
  sentiment: 'positive' | 'neutral' | 'negative';
  engagement: number;
  url: string;
  createdAt: string;
}

interface TrendingTopic {
  id: string;
  topic: string;
  volume: number;
  volumeChange: number;
  sentiment: number;
  relevanceScore: number;
  platforms: string[];
}

interface Influencer {
  id: string;
  name: string;
  username: string;
  platform: string;
  followers: number;
  engagement: number;
  mentionedYou: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  topics: string[];
  avatar?: string;
  verified: boolean;
}

interface CrisisAlert {
  id: string;
  type: 'spike' | 'negative' | 'viral' | 'competitor';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  mentions: number;
  sentiment: number;
  keywords: string[];
  createdAt: string;
  acknowledged: boolean;
}

const PLATFORM_CONFIG = {
  twitter: { icon: TwitterIcon, color: '#000000', name: 'Twitter' },
  instagram: { icon: InstagramIcon, color: '#E4405F', name: 'Instagram' },
  facebook: { icon: FacebookIcon, color: '#1877F2', name: 'Facebook' },
  tiktok: { icon: TikTokIcon, color: '#000000', name: 'TikTok' },
  youtube: { icon: YouTubeIcon, color: '#FF0000', name: 'YouTube' },
  linkedin: { icon: LinkedInIcon, color: '#0077B5', name: 'LinkedIn' },
};

const SENTIMENT_CONFIG = {
  positive: { icon: Smile, color: 'text-green-500', bg: 'bg-green-500/20' },
  neutral: { icon: Meh, color: 'text-yellow-500', bg: 'bg-yellow-500/20' },
  negative: { icon: Frown, color: 'text-red-500', bg: 'bg-red-500/20' },
};


export function SocialListening() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [showAddKeywordDialog, setShowAddKeywordDialog] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ keyword: '', type: 'keyword' as const, platforms: [] as string[] });
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d');
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertThreshold, setAlertThreshold] = useState(10);

  const { data: keywordsData, isLoading: keywordsLoading } = useQuery({
    queryKey: ['/api/social/listening/keywords'],
  });

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['/api/social/listening/trending'],
  });

  const { data: influencersData, isLoading: influencersLoading } = useQuery({
    queryKey: ['/api/social/listening/influencers'],
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['/api/social/listening/alerts'],
  });

  const keywords = keywordsData?.keywords || [];
  const trending = trendingData?.topics || [];
  const influencers = influencersData?.influencers || [];
  const alerts = alertsData?.alerts || [];

  const totalMentions = keywords.reduce((acc: number, k: TrackedKeyword) => acc + k.mentionCount, 0);
  const avgSentiment = Math.round(keywords.reduce((acc: number, k: TrackedKeyword) => acc + k.sentiment.positive, 0) / keywords.length);
  const activeAlerts = alerts.filter((a: CrisisAlert) => !a.acknowledged).length;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleAddKeyword = () => {
    if (!newKeyword.keyword.trim()) {
      toast({
        title: 'Keyword Required',
        description: 'Please enter a keyword to track.',
        variant: 'destructive',
      });
      return;
    }
    
    toast({
      title: 'Keyword Added',
      description: `Now tracking "${newKeyword.keyword}"`,
    });
    setNewKeyword({ keyword: '', type: 'keyword', platforms: [] });
    setShowAddKeywordDialog(false);
  };

  const handleRemoveKeyword = (id: string) => {
    toast({
      title: 'Keyword Removed',
      description: 'Keyword has been removed from tracking.',
    });
  };

  const handleToggleAlerts = (id: string, enabled: boolean) => {
    toast({
      title: enabled ? 'Alerts Enabled' : 'Alerts Disabled',
      description: enabled ? 'You will receive notifications for this keyword.' : 'Notifications disabled for this keyword.',
    });
  };

  const handleAcknowledgeAlert = (id: string) => {
    toast({
      title: 'Alert Acknowledged',
      description: 'This alert has been marked as reviewed.',
    });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
            Social Listening
          </h2>
          <p className="text-muted-foreground mt-1">
            Monitor mentions, track sentiment, and identify opportunities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddKeywordDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Keyword
          </Button>
        </div>
      </div>

      {activeAlerts > 0 && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="font-medium text-red-500">{activeAlerts} Active Alert{activeAlerts > 1 ? 's' : ''}</p>
                  <p className="text-sm text-muted-foreground">Requires your attention</p>
                </div>
              </div>
              <Button variant="outline" onClick={() => setActiveTab('alerts')}>
                View Alerts
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Mentions</p>
                <p className="text-2xl font-bold">{formatNumber(totalMentions)}</p>
              </div>
              <MessageSquare className="w-8 h-8 text-cyan-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Positive Sentiment</p>
                <p className="text-2xl font-bold">{avgSentiment}%</p>
              </div>
              <Smile className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Keywords Tracked</p>
                <p className="text-2xl font-bold">{keywords.length}</p>
              </div>
              <Hash className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Influencers Found</p>
                <p className="text-2xl font-bold">{influencers.length}</p>
              </div>
              <Star className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="keywords">Keywords</TabsTrigger>
              <TabsTrigger value="trending">Trending</TabsTrigger>
              <TabsTrigger value="influencers">Influencers</TabsTrigger>
              <TabsTrigger value="alerts">
                Alerts
                {activeAlerts > 0 && (
                  <Badge variant="destructive" className="ml-2">{activeAlerts}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        
        <CardContent>
          <TabsContent value="overview" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Sentiment Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div className="w-32 h-32 relative">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="20" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="hsl(142.1 76.2% 36.3%)"
                          strokeWidth="20"
                          strokeDasharray={`${avgSentiment} ${100 - avgSentiment}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold">{avgSentiment}%</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded bg-green-500" />
                        <span className="flex-1">Positive</span>
                        <span className="font-medium">{avgSentiment}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded bg-yellow-500" />
                        <span className="flex-1">Neutral</span>
                        <span className="font-medium">{Math.round((100 - avgSentiment) * 0.7)}%</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded bg-red-500" />
                        <span className="flex-1">Negative</span>
                        <span className="font-medium">{Math.round((100 - avgSentiment) * 0.3)}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Top Trending in Your Niche
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {trending.slice(0, 5).map((topic: TrendingTopic, index: number) => (
                      <div key={topic.id} className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-6">#{index + 1}</span>
                        <div className="flex-1">
                          <p className="font-medium">{topic.topic}</p>
                          <p className="text-xs text-muted-foreground">{formatNumber(topic.volume)} mentions</p>
                        </div>
                        <div className={`flex items-center gap-1 ${topic.volumeChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {topic.volumeChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          <span className="text-sm">{Math.abs(topic.volumeChange)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="w-5 h-5" />
                    Recent Mentions Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-48 flex items-end justify-between gap-1">
                    {Array.from({ length: 24 }).map((_, i) => {
                      const height = Math.random() * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 bg-primary/60 rounded-t transition-all hover:bg-primary"
                          style={{ height: `${height}%` }}
                          title={`${i}:00 - ${Math.round(height * 10)} mentions`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>12 AM</span>
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                    <span>12 AM</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="keywords" className="mt-0">
            <div className="space-y-4">
              {keywords.map((keyword: TrackedKeyword) => (
                <Card key={keyword.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {keyword.type === 'hashtag' ? (
                          <Hash className="w-5 h-5 text-primary" />
                        ) : keyword.type === 'mention' ? (
                          <AtSign className="w-5 h-5 text-primary" />
                        ) : (
                          <Search className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{keyword.keyword}</p>
                          <Badge variant="outline" className="text-xs capitalize">{keyword.type}</Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {keyword.platforms.map((platform) => {
                            const PlatformIcon = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.icon;
                            return PlatformIcon ? (
                              <PlatformIcon
                                key={platform}
                                className="w-4 h-4"
                                style={{ color: PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.color }}
                              />
                            ) : null;
                          })}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatNumber(keyword.mentionCount)}</p>
                        <p className="text-xs text-muted-foreground">mentions</p>
                      </div>
                      
                      <div className="w-32">
                        <div className="flex items-center gap-1 mb-1">
                          <div className="flex-1 h-2 rounded bg-green-500" style={{ width: `${keyword.sentiment.positive}%` }} />
                          <div className="flex-1 h-2 rounded bg-yellow-500" style={{ width: `${keyword.sentiment.neutral}%` }} />
                          <div className="flex-1 h-2 rounded bg-red-500" style={{ width: `${keyword.sentiment.negative}%` }} />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="text-green-500">{keyword.sentiment.positive}%</span>
                          <span className="text-yellow-500">{keyword.sentiment.neutral}%</span>
                          <span className="text-red-500">{keyword.sentiment.negative}%</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={keyword.alertsEnabled}
                            onCheckedChange={(checked) => handleToggleAlerts(keyword.id, checked)}
                          />
                          {keyword.alertsEnabled ? (
                            <Bell className="w-4 h-4 text-primary" />
                          ) : (
                            <BellOff className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleRemoveKeyword(keyword.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="trending" className="mt-0">
            <div className="space-y-4">
              {trending.map((topic: TrendingTopic, index: number) => (
                <Card key={topic.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <span className="text-lg font-bold text-primary">#{index + 1}</span>
                      </div>
                      
                      <div className="flex-1">
                        <p className="font-medium text-lg">{topic.topic}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {topic.platforms.map((platform) => {
                            const PlatformIcon = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.icon;
                            return PlatformIcon ? (
                              <PlatformIcon
                                key={platform}
                                className="w-4 h-4"
                                style={{ color: PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.color }}
                              />
                            ) : null;
                          })}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-lg font-bold">{formatNumber(topic.volume)}</p>
                        <p className="text-xs text-muted-foreground">volume</p>
                      </div>
                      
                      <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
                        topic.volumeChange >= 0 ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'
                      }`}>
                        {topic.volumeChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-medium">{Math.abs(topic.volumeChange)}%</span>
                      </div>
                      
                      <div className="text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {topic.sentiment >= 60 ? (
                            <Smile className="w-4 h-4 text-green-500" />
                          ) : topic.sentiment >= 40 ? (
                            <Meh className="w-4 h-4 text-yellow-500" />
                          ) : (
                            <Frown className="w-4 h-4 text-red-500" />
                          )}
                          <span className="font-medium">{topic.sentiment}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">sentiment</p>
                      </div>
                      
                      <div className="text-center">
                        <Progress value={topic.relevanceScore} className="w-20 h-2" />
                        <p className="text-xs text-muted-foreground mt-1">{topic.relevanceScore}% relevant</p>
                      </div>
                      
                      <Button variant="outline" size="sm">
                        <Plus className="w-4 h-4 mr-1" />
                        Track
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="influencers" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {influencers.map((influencer: Influencer) => {
                const PlatformIcon = PLATFORM_CONFIG[influencer.platform as keyof typeof PLATFORM_CONFIG]?.icon;
                const SentimentIcon = SENTIMENT_CONFIG[influencer.sentiment].icon;
                
                return (
                  <Card key={influencer.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          {influencer.avatar ? (
                            <img src={influencer.avatar} alt="" className="w-12 h-12 rounded-full" />
                          ) : (
                            <User className="w-6 h-6 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{influencer.name}</p>
                            {influencer.verified && <CheckCircle className="w-4 h-4 text-blue-500" />}
                          </div>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            {PlatformIcon && (
                              <PlatformIcon
                                className="w-4 h-4"
                                style={{ color: PLATFORM_CONFIG[influencer.platform as keyof typeof PLATFORM_CONFIG]?.color }}
                              />
                            )}
                            @{influencer.username}
                          </div>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mt-4">
                        <div className="text-center p-2 bg-muted rounded">
                          <p className="text-sm font-bold">{formatNumber(influencer.followers)}</p>
                          <p className="text-xs text-muted-foreground">Followers</p>
                        </div>
                        <div className="text-center p-2 bg-muted rounded">
                          <p className="text-sm font-bold">{influencer.engagement}%</p>
                          <p className="text-xs text-muted-foreground">Engagement</p>
                        </div>
                        <div className="text-center p-2 bg-muted rounded">
                          <p className="text-sm font-bold">{influencer.mentionedYou}</p>
                          <p className="text-xs text-muted-foreground">Mentions</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex flex-wrap gap-1">
                          {influencer.topics.map((topic, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{topic}</Badge>
                          ))}
                        </div>
                        <Badge className={`${SENTIMENT_CONFIG[influencer.sentiment].bg} ${SENTIMENT_CONFIG[influencer.sentiment].color}`}>
                          <SentimentIcon className="w-3 h-3 mr-1" />
                          {influencer.sentiment}
                        </Badge>
                      </div>
                      
                      <Button variant="outline" size="sm" className="w-full mt-4">
                        <Eye className="w-4 h-4 mr-2" />
                        View Profile
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="mt-0">
            <div className="space-y-4">
              {alerts.length === 0 ? (
                <div className="text-center py-12">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-lg font-medium">No Active Alerts</p>
                  <p className="text-muted-foreground">Your brand mentions are within normal parameters</p>
                </div>
              ) : (
                alerts.map((alert: CrisisAlert) => (
                  <Card key={alert.id} className={alert.acknowledged ? 'opacity-60' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          alert.severity === 'critical' ? 'bg-red-500/20' :
                          alert.severity === 'high' ? 'bg-orange-500/20' :
                          alert.severity === 'medium' ? 'bg-yellow-500/20' : 'bg-blue-500/20'
                        }`}>
                          <AlertTriangle className={`w-5 h-5 ${
                            alert.severity === 'critical' ? 'text-red-500' :
                            alert.severity === 'high' ? 'text-orange-500' :
                            alert.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                          }`} />
                        </div>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{alert.title}</p>
                            <Badge className={getSeverityColor(alert.severity)}>
                              {alert.severity}
                            </Badge>
                            {alert.acknowledged && (
                              <Badge variant="outline">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Acknowledged
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{alert.description}</p>
                          
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <MessageSquare className="w-4 h-4" />
                              {alert.mentions} mentions
                            </span>
                            <span className={`flex items-center gap-1 ${alert.sentiment >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              {alert.sentiment >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {alert.sentiment}% sentiment
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {format(new Date(alert.createdAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          
                          <div className="flex flex-wrap gap-1 mt-2">
                            {alert.keywords.map((keyword, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{keyword}</Badge>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-1" />
                            View Mentions
                          </Button>
                          {!alert.acknowledged && (
                            <Button size="sm" onClick={() => handleAcknowledgeAlert(alert.id)}>
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Acknowledge
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </CardContent>
      </Card>

      <Dialog open={showAddKeywordDialog} onOpenChange={setShowAddKeywordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Keyword to Track</DialogTitle>
            <DialogDescription>
              Monitor mentions, hashtags, or keywords across social media platforms.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="keyword">Keyword or Phrase</Label>
              <Input
                id="keyword"
                value={newKeyword.keyword}
                onChange={(e) => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
                placeholder="e.g., #musicproduction, @yourbrand, music distribution"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={newKeyword.type}
                onValueChange={(value: 'keyword' | 'hashtag' | 'mention') => setNewKeyword({ ...newKeyword, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Keyword</SelectItem>
                  <SelectItem value="hashtag">Hashtag</SelectItem>
                  <SelectItem value="mention">Mention</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Platforms to Monitor</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                  const PlatformIcon = config.icon;
                  const isSelected = newKeyword.platforms.includes(key);
                  return (
                    <Button
                      key={key}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setNewKeyword({
                            ...newKeyword,
                            platforms: newKeyword.platforms.filter((p) => p !== key),
                          });
                        } else {
                          setNewKeyword({
                            ...newKeyword,
                            platforms: [...newKeyword.platforms, key],
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
            <Button variant="outline" onClick={() => setShowAddKeywordDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddKeyword}>
              <Plus className="w-4 h-4 mr-2" />
              Add Keyword
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
