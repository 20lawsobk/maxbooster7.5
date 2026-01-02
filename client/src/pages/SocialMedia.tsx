import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRequireSubscription } from '@/hooks/useRequireAuth';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard, StatCardRow } from '@/components/ui/stat-card';
import { ChartCard, SimpleAreaChart, PlatformBreakdown } from '@/components/ui/chart-card';
import { ContentCard } from '@/components/ui/content-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Share2,
  Plus,
  Calendar,
  BarChart2,
  BarChart3,
  Users,
  Heart,
  MessageCircle,
  MessageSquare,
  Eye,
  ExternalLink,
  Settings,
  RefreshCw,
  Upload,
  Image,
  Video,
  Music,
  Link,
  Hash,
  AtSign,
  Globe,
  Lock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  TrendingUp,
  Target,
  Zap,
  Brain,
  Sparkles,
  Wand2,
  Bot,
  Send,
  Edit,
  Trash2,
  Copy,
  Download,
  Filter,
  Search,
  Play,
  Star,
  Activity,
  X,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  ThreadsIcon,
  GoogleIcon,
} from '@/components/ui/brand-icons';
import { ContentCalendarView } from '@/components/social/ContentCalendarView';
import { SchedulePostDialog, SchedulePostData } from '@/components/social/SchedulePostDialog';
import { PostTimelineView } from '@/components/social/PostTimelineView';
import { AutopilotDashboard } from '@/components/autopilot/autopilot-dashboard';
import { ContentAnalyzer } from '@/components/content/ContentAnalyzer';
import { UnifiedInbox } from '@/components/social/UnifiedInbox';
import { SocialListening } from '@/components/social/SocialListening';
import { CompetitorBenchmarking } from '@/components/social/CompetitorBenchmarking';
import { UnifiedCalendar } from '@/components/social/UnifiedCalendar';

// Social Media Platform Interfaces
interface SocialPlatform {
  id: string;
  name: string;
  icon: any;
  color: string;
  isConnected: boolean;
  followers: number;
  engagement: number;
  lastSync: string;
  status: 'active' | 'inactive' | 'error';
}

interface SocialPost {
  id: string;
  content: string;
  platforms: string[];
  scheduledTime: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  media: {
    type: 'image' | 'video' | 'audio';
    url: string;
    thumbnail?: string;
  }[];
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    views: number;
    reach: number;
    engagement: number;
  };
  createdAt: string;
  publishedAt?: string;
}

interface AIContent {
  id: string;
  platform: string;
  content: string;
  hashtags: string[];
  mentions: string[];
  media: string[];
  tone: 'professional' | 'casual' | 'funny' | 'inspirational' | 'promotional';
  engagement: number;
  virality: number;
}

interface GeneratedContent {
  platform: string;
  content: string;
  hashtags?: string[];
  mediaUrl?: string;
  format?: string;
}

interface PlatformPerformance {
  id?: string;
  name: string;
  growth: number;
  reach: string | number;
  engagement: number;
}

interface FollowersGrowth {
  thisWeek?: number;
  weeklyChange?: number;
  thisMonth?: number;
  monthlyChange?: number;
  rate?: number;
  projected?: number;
}

interface PlatformGrowthData {
  growth?: number;
  percentage?: number;
}

interface ContentPerformanceData {
  engagement?: number;
  reach?: string;
}

interface EngagementBreakdown {
  likes?: number;
  likesChange?: number;
  comments?: number;
  commentsChange?: number;
  shares?: number;
  sharesChange?: number;
}

interface TrendingTopic {
  tag: string;
  volume: number;
  relevance: number;
  platforms?: string[];
}

interface SocialMetrics {
  totalFollowers?: number;
  followerGrowth?: { percentChange?: number };
  totalEngagement?: number;
  engagementRate?: number;
  avgEngagementRate?: number;
  engagementGrowth?: { percentChange?: number };
  totalReach?: number;
  reachGrowth?: { percentChange?: number };
  platformPerformance?: PlatformPerformance[];
  followersGrowth?: FollowersGrowth;
  platformGrowth?: Record<string, PlatformGrowthData>;
  contentPerformance?: {
    images?: ContentPerformanceData;
    videos?: ContentPerformanceData;
    carousels?: ContentPerformanceData;
    text?: ContentPerformanceData;
  };
  aiRecommendation?: string;
  heatmapData?: Record<string, Record<string, number>>;
  engagementBreakdown?: EngagementBreakdown;
  trendingTopics?: TrendingTopic[];
}

interface AIInsight {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  actionType?: string;
  timeframe?: string;
}

interface AIRecommendation {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  action?: string;
  actionLabel?: string;
}

interface ContentIdea {
  idea: string;
  platform: string;
  score: number;
}

interface AIInsightsData {
  insights?: AIInsight[];
  recommendations?: AIRecommendation[];
  contentIdeas?: ContentIdea[];
  summary?: {
    totalInsights?: number;
    highImpact?: number;
    mediumImpact?: number;
    lowImpact?: number;
  };
}

interface ActivityItem {
  id: string;
  type: string;
  platform: string;
  user?: string;
  content: string;
  time: string;
  action?: string;
  engagement?: string;
}

interface WeeklyStats {
  totalReach?: number;
  engagementRate?: number;
  postsThisWeek?: number;
  dailyEngagement?: Array<{ date: string; engagement: number }>;
}

interface CalendarPost {
  id: string;
  title: string;
  content?: string;
  scheduledFor: string;
  platforms?: string[];
  postType?: string;
  mediaUrls?: string[];
  hashtags?: string[];
  mentions?: string[];
  location?: string;
  status?: string;
}

interface CalendarStats {
  upcomingThisWeek?: number;
  totalScheduled?: number;
  totalPublished?: number;
}

interface AutopilotStatus {
  isRunning?: boolean;
  postsGenerated?: number;
  postsPublished?: number;
  engagement?: number;
  lastActivity?: string;
}

// Social Media Platforms
const SOCIAL_PLATFORMS: SocialPlatform[] = [
  {
    id: 'facebook',
    name: 'Facebook',
    icon: FacebookIcon,
    color: '#1877F2',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: InstagramIcon,
    color: '#E4405F',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'twitter',
    name: 'Twitter (X)',
    icon: MessageCircle,
    color: '#000000',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: YouTubeIcon,
    color: '#FF0000',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: TikTokIcon,
    color: '#000000',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: LinkedInIcon,
    color: '#0077B5',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'threads',
    name: 'Threads',
    icon: ThreadsIcon,
    color: '#000000',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
  {
    id: 'googlebusiness',
    name: 'Google Business',
    icon: GoogleIcon,
    color: '#4285F4',
    isConnected: false,
    followers: 0,
    engagement: 0,
    lastSync: '',
    status: 'inactive',
  },
];

export default function SocialMedia() {
  const { user, isLoading } = useRequireSubscription();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [postContent, setPostContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [selectedTone, setSelectedTone] = useState('professional');
  const [contentUrl, setContentUrl] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [urlGeneratedContent, setUrlGeneratedContent] = useState<GeneratedContent[]>([]);
  const [isGeneratingFromUrl, setIsGeneratingFromUrl] = useState(false);
  const [contentFormat, setContentFormat] = useState('text');
  const [regularContentFormat, setRegularContentFormat] = useState('text');
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Calendar state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [editingCalendarPost, setEditingCalendarPost] = useState<CalendarPost | null>(null);

  // Helper function to format numbers with K/M suffix
  const formatNumber = (num: number): string => {
    if (!num || num === 0) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Data Queries
  const { data: platformsFromApi = [], isLoading: platformsLoading } = useQuery<SocialPlatform[]>({
    queryKey: ['/api/social/platform-status'],
    enabled: !!user,
  });

  // Merge API data with defaults to ensure icons and colors are present
  // Ensure platformsFromApi is always an array
  const platformsApiArray = Array.isArray(platformsFromApi) ? platformsFromApi : [];
  const platforms = SOCIAL_PLATFORMS.map((defaultPlatform) => {
    const apiPlatform = platformsApiArray.find((p) => p.id === defaultPlatform.id);
    return apiPlatform
      ? {
          ...defaultPlatform,
          ...apiPlatform,
          icon: defaultPlatform.icon, // Always use default icon
          color: defaultPlatform.color, // Always use default color
        }
      : defaultPlatform;
  });

  const { data: posts = [], isLoading: postsLoading } = useQuery<SocialPost[]>({
    queryKey: ['/api/social/posts'],
    enabled: !!user,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<SocialMetrics>({
    queryKey: ['/api/social/metrics'],
    enabled: !!user,
  });

  const { data: aiInsights, isLoading: aiInsightsLoading } = useQuery<AIInsightsData>({
    queryKey: ['/api/social/ai-insights'],
    enabled: !!user,
  });

  const { data: activity = [], isLoading: activityLoading } = useQuery<ActivityItem[]>({
    queryKey: ['/api/social/activity'],
    enabled: !!user,
  });

  const { data: weeklyStats, isLoading: weeklyStatsLoading } = useQuery<WeeklyStats>({
    queryKey: ['/api/social/weekly-stats'],
    enabled: !!user,
  });

  // Calendar queries
  const { data: calendarPosts = [], isLoading: calendarLoading } = useQuery<CalendarPost[] | { posts: CalendarPost[] }>({
    queryKey: ['/api/social/calendar'],
    enabled: !!user,
  });

  const { data: calendarStats, isLoading: calendarStatsLoading } = useQuery<CalendarStats>({
    queryKey: ['/api/social/calendar/stats'],
    enabled: !!user,
  });

  // Mutations
  const generateContentMutation = useMutation({
    mutationFn: async (data: {
      platforms: string[];
      tone: string;
      topic?: string;
      format?: string;
    }) => {
      const response = await apiRequest('POST', '/api/social/generate-content', data);
      return response.json();
    },
    onSuccess: (data) => {
      setPostContent(data.content || '');
      if (data.generatedContent) {
        setUrlGeneratedContent(data.generatedContent);
      } else {
        setUrlGeneratedContent([]);
      }
      const formatLabel =
        regularContentFormat === 'text'
          ? 'text'
          : regularContentFormat === 'image'
            ? 'image'
            : regularContentFormat === 'audio'
              ? 'audio'
              : 'video';
      toast({
        title: 'Content Generated!',
        description: `AI has created ${formatLabel} content for your selected platforms.`,
      });
      setIsGeneratingContent(false);
    },
    onError: () => {
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate content. Please try again.',
        variant: 'destructive',
      });
      setIsGeneratingContent(false);
    },
  });

  const schedulePostMutation = useMutation({
    mutationFn: async (postData: Partial<SocialPost>) => {
      const response = await apiRequest('POST', '/api/social/schedule-post', postData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Scheduled!',
        description: 'Your post has been scheduled for the selected platforms.',
      });
      setPostContent('');
      setScheduledTime('');
      setSelectedPlatforms([]);
      queryClient.invalidateQueries({ queryKey: ['/api/social/posts'] });
    },
    onError: () => {
      toast({
        title: 'Scheduling Failed',
        description: 'Failed to schedule post. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const generateFromUrlMutation = useMutation({
    mutationFn: async (data: {
      url: string;
      platforms: string[];
      targetAudience: string;
      format: string;
    }) => {
      const response = await apiRequest('POST', '/api/social/generate-from-url', data);
      return response.json();
    },
    onSuccess: (data) => {
      setUrlGeneratedContent(data.generatedContent || data);
      const formatLabel =
        contentFormat === 'text'
          ? 'text'
          : contentFormat === 'image'
            ? 'image'
            : contentFormat === 'audio'
              ? 'audio'
              : 'video';
      toast({
        title: 'Content Generated from URL!',
        description: `AI has created ${formatLabel} content for your selected platforms.`,
      });
      setIsGeneratingFromUrl(false);
    },
    onError: () => {
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate content from URL. Please check the URL and try again.',
        variant: 'destructive',
      });
      setIsGeneratingFromUrl(false);
    },
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest('DELETE', `/api/social/posts/${postId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Deleted',
        description: 'Scheduled post removed successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/posts'] });
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete post. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const uploadMediaMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('media', file);
      const response = await apiRequest('POST', '/api/social/upload-media', formData);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Media Uploaded!',
        description: 'Your media has been uploaded successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Upload Failed',
        description: 'Failed to upload media. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Calendar mutations
  const createCalendarPostMutation = useMutation({
    mutationFn: async (data: SchedulePostData) => {
      const response = await apiRequest('POST', '/api/social/calendar', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Scheduled!',
        description: 'Your post has been added to the calendar.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar/stats'] });
      setScheduleDialogOpen(false);
      setEditingCalendarPost(null);
    },
    onError: () => {
      toast({
        title: 'Scheduling Failed',
        description: 'Failed to schedule post to calendar. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const updateCalendarPostMutation = useMutation({
    mutationFn: async ({ postId, data }: { postId: string; data: Partial<SchedulePostData> }) => {
      const response = await apiRequest('PUT', `/api/social/calendar/${postId}`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Updated!',
        description: 'Your scheduled post has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar/stats'] });
      setScheduleDialogOpen(false);
      setEditingCalendarPost(null);
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update scheduled post. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const deleteCalendarPostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest('DELETE', `/api/social/calendar/${postId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Deleted',
        description: 'Scheduled post removed from calendar.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar/stats'] });
    },
    onError: () => {
      toast({
        title: 'Delete Failed',
        description: 'Failed to delete scheduled post. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const publishCalendarPostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const response = await apiRequest('POST', `/api/social/calendar/${postId}/publish`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post Published!',
        description: 'Your post has been published to selected platforms.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar'] });
      queryClient.invalidateQueries({ queryKey: ['/api/social/calendar/stats'] });
    },
    onError: () => {
      toast({
        title: 'Publish Failed',
        description: 'Failed to publish post. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Autopilot Queries and Mutations
  const { data: autopilotStatus, isLoading: autopilotLoading } = useQuery<AutopilotStatus>({
    queryKey: ['/api/autopilot/status'],
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const configureAutopilotMutation = useMutation({
    mutationFn: async (config: unknown) => {
      const response = await apiRequest('POST', '/api/autopilot/configure', config);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Autopilot Configured',
        description: 'Your autopilot settings have been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/autopilot/status'] });
    },
    onError: () => {
      toast({
        title: 'Configuration Failed',
        description: 'Failed to configure autopilot. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const startAutopilotMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/autopilot/start', {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Autopilot Started',
        description: 'Autopilot is now managing your social media posts.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/autopilot/status'] });
    },
    onError: () => {
      toast({
        title: 'Start Failed',
        description: 'Failed to start autopilot. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const stopAutopilotMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/autopilot/stop', {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Autopilot Stopped',
        description: 'Autopilot has been stopped.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/autopilot/status'] });
    },
    onError: () => {
      toast({
        title: 'Stop Failed',
        description: 'Failed to stop autopilot. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handler Functions
  const handleConnectPlatform = async (platformId: string) => {
    try {
      const response = await fetch(`/api/social/connect/${platformId}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else if (data.message) {
        toast({
          title: 'Connection Issue',
          description: data.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Connection Failed',
        description: 'Failed to connect to platform. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateContent = () => {
    if (selectedPlatforms.length === 0) {
      toast({
        title: 'Select Platforms',
        description: 'Please select at least one platform to generate content for.',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingContent(true);
    generateContentMutation.mutate({
      platforms: selectedPlatforms,
      tone: selectedTone,
      format: regularContentFormat,
    });
  };

  const handleSchedulePostFromTab = () => {
    if (!postContent.trim()) {
      toast({
        title: 'Content Required',
        description: 'Please add content to your post.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({
        title: 'Select Platforms',
        description: 'Please select at least one platform.',
        variant: 'destructive',
      });
      return;
    }
    schedulePostMutation.mutate({
      content: postContent,
      platforms: selectedPlatforms,
      scheduledTime: scheduledTime || new Date().toISOString(),
    });
  };

  const handleGenerateFromUrl = () => {
    if (!contentUrl.trim()) {
      toast({
        title: 'URL Required',
        description: 'Please enter a URL to generate content from.',
        variant: 'destructive',
      });
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast({
        title: 'Select Platforms',
        description: 'Please select at least one platform.',
        variant: 'destructive',
      });
      return;
    }
    setIsGeneratingFromUrl(true);
    generateFromUrlMutation.mutate({
      url: contentUrl,
      platforms: selectedPlatforms,
      targetAudience: targetAudience,
      format: contentFormat,
    });
  };

  const handleDownloadContent = (
    platform: string,
    content: string,
    hashtags?: string[],
    mediaUrl?: string,
    format?: string
  ) => {
    const platformName = SOCIAL_PLATFORMS.find((p) => p.id === platform)?.name || platform;
    const currentFormat = format || contentFormat;

    if (currentFormat === 'text') {
      let textContent = `Platform: ${platformName}\n\n${content}`;

      if (hashtags && hashtags.length > 0) {
        textContent += `\n\nHashtags:\n${hashtags.join(' ')}`;
      }

      const blob = new Blob([textContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${platform}-content.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (mediaUrl) {
      const a = document.createElement('a');
      a.href = mediaUrl;
      const extension =
        currentFormat === 'image' ? 'png' : currentFormat === 'audio' ? 'mp3' : 'mp4';
      a.download = `${platform}-${currentFormat}.${extension}`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast({
        title: 'Download Failed',
        description: 'Media URL not available',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Downloaded!',
      description: `${platformName} ${currentFormat} content saved to file`,
    });
  };

  const handleDownloadAllContent = () => {
    if (urlGeneratedContent.length === 0) return;

    let allContent = `Social Media Content Generated from: ${contentUrl}\n`;
    if (targetAudience) {
      allContent += `Target Audience: ${targetAudience}\n`;
    }
    allContent += `\n${'='.repeat(60)}\n\n`;

    urlGeneratedContent.forEach((item, index) => {
      const platformName =
        SOCIAL_PLATFORMS.find((p) => p.id === item.platform)?.name || item.platform;
      allContent += `Platform ${index + 1}: ${platformName}\n`;
      allContent += `${'-'.repeat(60)}\n`;
      allContent += `${item.content}\n`;

      if (item.hashtags && item.hashtags.length > 0) {
        allContent += `\nHashtags: ${item.hashtags.join(' ')}\n`;
      }

      allContent += `\n${'='.repeat(60)}\n\n`;
    });

    const blob = new Blob([allContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'social-media-content-all.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Downloaded!',
      description: `All content saved to file`,
    });
  };

  const handleEditPost = (postId: string) => {
    const post = posts.find((p: SocialPost) => p.id === postId);
    if (post) {
      setPostContent(post.content);
      setSelectedPlatforms(post.platforms);
      setScheduledTime(post.scheduledTime);
      setActiveTab('create');
      setEditingPost(postId);
    }
  };

  const handleAddTrend = (tag: string) => {
    setPostContent((prev) => prev + ` #${tag}`);
    setActiveTab('create');
    toast({
      title: 'Hashtag Added',
      description: `#${tag} added to your post`,
    });
  };

  const handleAIAction = (action: string) => {
    toast({
      title: 'Action Started',
      description: `${action} initiated`,
    });
  };

  // Calendar handlers
  const handleSchedulePost = (data: SchedulePostData) => {
    if (editingCalendarPost) {
      updateCalendarPostMutation.mutate({
        postId: editingCalendarPost.id,
        data,
      });
    } else {
      createCalendarPostMutation.mutate(data);
    }
  };

  const handleDateClick = (date: Date, datePosts: CalendarPost[]) => {
    setSelectedDate(date);
    toast({
      title: 'Posts on this date',
      description: `${datePosts.length} post(s) scheduled for ${date.toLocaleDateString()}`,
    });
  };

  const handleEditCalendarPost = (post: CalendarPost) => {
    setEditingCalendarPost(post);
    setScheduleDialogOpen(true);
  };

  const handleDeleteCalendarPost = (postId: string) => {
    if (confirm('Are you sure you want to delete this scheduled post?')) {
      deleteCalendarPostMutation.mutate(postId);
    }
  };

  const handlePublishCalendarPost = (postId: string) => {
    publishCalendarPostMutation.mutate(postId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          <p className="text-muted-foreground">Loading Social Media...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200/60 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Social Media Management
              </h1>
              <p className="text-gray-600 dark:text-gray-300 mt-2 text-lg">
                AI-Powered Content Creation & Multi-Platform Publishing
              </p>
              <div className="flex items-center space-x-4 mt-4">
                <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50">
                  <Brain className="w-3 h-3 mr-1" />
                  AI Content Generation
                </Badge>
                <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50">
                  <Zap className="w-3 h-3 mr-1" />
                  Multi-Platform Publishing
                </Badge>
                <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Advanced Analytics
                </Badge>
              </div>
            </div>
            <Button
              onClick={handleGenerateContent}
              disabled={isGeneratingContent}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {isGeneratingContent ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Content
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Platform Connection Status */}
        <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Globe className="w-5 h-5 mr-2" />
              Platform Connections
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
              {platforms.map((platform) => {
                const IconComponent = platform.icon;
                return (
                  <div
                    key={platform.id}
                    className={`p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer ${
                      platform.isConnected
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                        : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 hover:border-blue-200 hover:bg-blue-50'
                    }`}
                    onClick={() => !platform.isConnected && handleConnectPlatform(platform.id)}
                    data-testid={
                      platform.isConnected
                        ? `button-disconnect-${platform.id}`
                        : `button-connect-${platform.id}`
                    }
                  >
                    <div className="text-center">
                      <div
                        className="w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: platform.color + '20' }}
                      >
                        <IconComponent className="w-6 h-6" style={{ color: platform.color }} />
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {platform.name}
                      </p>
                      <div className="mt-2">
                        {platform.isConnected ? (
                          <Badge
                            variant="default"
                            className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            data-testid={`badge-status-${platform.id}`}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline" data-testid={`badge-status-${platform.id}`}>
                            Connect
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Main Interface */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-1 h-auto">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="inbox"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              <MessageSquare className="w-3 h-3 mr-1 inline" />
              Inbox
            </TabsTrigger>
            <TabsTrigger
              value="create"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              Create
            </TabsTrigger>
            <TabsTrigger
              value="calendar"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              <Calendar className="w-3 h-3 mr-1 inline" />
              Calendar
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              Schedule
            </TabsTrigger>
            <TabsTrigger
              value="listening"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              <Eye className="w-3 h-3 mr-1 inline" />
              Listening
            </TabsTrigger>
            <TabsTrigger
              value="competitors"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              <Users className="w-3 h-3 mr-1 inline" />
              Competitors
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="ai-insights"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              AI Insights
            </TabsTrigger>
            <TabsTrigger
              value="autopilot"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs px-2 py-1.5"
            >
              <Bot className="w-3 h-3 mr-1 inline" />
              Autopilot
            </TabsTrigger>
          </TabsList>

          {/* Unified Inbox Tab */}
          <TabsContent value="inbox" className="space-y-6">
            <UnifiedInbox />
          </TabsContent>

          {/* Social Listening Tab */}
          <TabsContent value="listening" className="space-y-6">
            <SocialListening />
          </TabsContent>

          {/* Competitor Benchmarking Tab */}
          <TabsContent value="competitors" className="space-y-6">
            <CompetitorBenchmarking />
          </TabsContent>

          {/* Create Tab */}
          <TabsContent value="create" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Content Creation */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Edit className="w-5 h-5 mr-2" />
                    Create Post
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Select Platforms</Label>
                    {platformsLoading ? (
                      <div className="flex items-center justify-center py-4 mt-2">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          Loading platforms...
                        </span>
                      </div>
                    ) : platforms.filter((p) => p.isConnected).length > 0 ? (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {platforms
                          .filter((p) => p.isConnected)
                          .map((platform) => {
                            const IconComponent = platform.icon;
                            return (
                              <div
                                key={platform.id}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                  selectedPlatforms.includes(platform.id)
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                                onClick={() => {
                                  if (selectedPlatforms.includes(platform.id)) {
                                    setSelectedPlatforms(
                                      selectedPlatforms.filter((id) => id !== platform.id)
                                    );
                                  } else {
                                    setSelectedPlatforms([...selectedPlatforms, platform.id]);
                                  }
                                }}
                                data-testid={`create-platform-select-${platform.id}`}
                              >
                                <div className="flex items-center space-x-2">
                                  <IconComponent
                                    className="w-4 h-4"
                                    style={{ color: platform.color }}
                                  />
                                  <span className="text-sm font-medium">{platform.name}</span>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center py-6 mt-2 border rounded-lg">
                        <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-4">No platforms connected</p>
                        <Button
                          onClick={() => setActiveTab('overview')}
                          data-testid="button-connect-platforms"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Connect Platforms
                        </Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Content Tone</Label>
                    <Select value={selectedTone} onValueChange={setSelectedTone}>
                      <SelectTrigger data-testid="select-post-tone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="funny">Funny</SelectItem>
                        <SelectItem value="inspirational">Inspirational</SelectItem>
                        <SelectItem value="promotional">Promotional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Content Format</Label>
                    <Select value={regularContentFormat} onValueChange={setRegularContentFormat}>
                      <SelectTrigger data-testid="select-regular-content-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Text Content</SelectItem>
                        <SelectItem value="image">Image</SelectItem>
                        <SelectItem value="audio">Audio</SelectItem>
                        <SelectItem value="video">Video</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Post Content</Label>
                    <Textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder="Write your post content here... AI will optimize it for each platform."
                      rows={6}
                      data-testid="textarea-post-content"
                    />
                  </div>

                  <div>
                    <Label>Upload Media (Optional)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploadedMedia(file);
                          const previewUrl = URL.createObjectURL(file);
                          setMediaPreviewUrl(previewUrl);
                          uploadMediaMutation.mutate(file);
                        }
                      }}
                      data-testid="input-upload-media"
                    />
                    <div className="flex items-center space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadMediaMutation.isPending}
                        data-testid="button-upload-media"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {uploadMediaMutation.isPending ? 'Uploading...' : 'Upload Image/Video'}
                      </Button>
                      {uploadedMedia && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUploadedMedia(null);
                            setMediaPreviewUrl(null);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                          data-testid="button-remove-media"
                        >
                          <X className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      )}
                    </div>
                    {mediaPreviewUrl && (
                      <div className="mt-2 relative">
                        {uploadedMedia?.type.startsWith('image/') ? (
                          <img
                            src={mediaPreviewUrl}
                            alt="Preview"
                            className="max-h-40 rounded-lg"
                          />
                        ) : (
                          <video src={mediaPreviewUrl} className="max-h-40 rounded-lg" controls />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={handleGenerateContent}
                      disabled={isGeneratingContent}
                      className="flex-1"
                      data-testid="button-generate-content"
                    >
                      {isGeneratingContent ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4 mr-2" />
                          Generate with AI
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={handleSchedulePostFromTab}
                      disabled={!postContent.trim() || selectedPlatforms.length === 0}
                      variant="outline"
                      data-testid="button-schedule-post"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      Schedule
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AI Content Suggestions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Brain className="w-5 h-5 mr-2" />
                    AI Content Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Trending Topics
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {[
                          '#NewMusic',
                          '#MusicProduction',
                          '#ArtistLife',
                          '#StudioSession',
                          '#BehindTheScenes',
                        ].map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="cursor-pointer hover:bg-blue-100"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                        Optimal Posting Times
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span>Instagram:</span>
                          <span className="font-medium">6-9 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Twitter:</span>
                          <span className="font-medium">12-3 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Facebook:</span>
                          <span className="font-medium">1-3 PM</span>
                        </div>
                        <div className="flex justify-between">
                          <span>TikTok:</span>
                          <span className="font-medium">6-10 PM</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">
                        Engagement Tips
                      </h4>
                      <ul className="text-sm space-y-1">
                        <li>• Use 1-2 hashtags for maximum reach</li>
                        <li>• Post videos for 3x more engagement</li>
                        <li>• Ask questions to boost comments</li>
                        <li>• Share behind-the-scenes content</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* URL-Based Content Generation */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Link className="w-5 h-5 mr-2" />
                  Generate Content from URL
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div>
                      <Label>Content URL</Label>
                      <Input
                        value={contentUrl}
                        onChange={(e) => setContentUrl(e.target.value)}
                        placeholder="https://example.com/your-content"
                        data-testid="input-content-url"
                      />
                    </div>

                    <div>
                      <Label>Target Audience (Optional)</Label>
                      <Input
                        value={targetAudience}
                        onChange={(e) => setTargetAudience(e.target.value)}
                        placeholder="e.g., Music lovers, Gen Z, Hip-hop fans"
                        data-testid="input-target-audience"
                      />
                    </div>

                    <div>
                      <Label>Content Format</Label>
                      <Select value={contentFormat} onValueChange={setContentFormat}>
                        <SelectTrigger data-testid="select-content-format">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text Content</SelectItem>
                          <SelectItem value="image">Image / Graphics</SelectItem>
                          <SelectItem value="audio">Audio / Voice</SelectItem>
                          <SelectItem value="video">Video / MP4</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Select Platforms</Label>
                      {platformsLoading ? (
                        <div className="flex items-center justify-center py-4 mt-2">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span className="ml-2 text-sm text-muted-foreground">
                            Loading platforms...
                          </span>
                        </div>
                      ) : platforms.filter((p) => p.isConnected).length > 0 ? (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          {platforms
                            .filter((p) => p.isConnected)
                            .map((platform) => {
                              const IconComponent = platform.icon;
                              return (
                                <div
                                  key={platform.id}
                                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                                    selectedPlatforms.includes(platform.id)
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => {
                                    if (selectedPlatforms.includes(platform.id)) {
                                      setSelectedPlatforms(
                                        selectedPlatforms.filter((id) => id !== platform.id)
                                      );
                                    } else {
                                      setSelectedPlatforms([...selectedPlatforms, platform.id]);
                                    }
                                  }}
                                  data-testid={`url-platform-select-${platform.id}`}
                                >
                                  <div className="flex items-center space-x-2">
                                    <IconComponent
                                      className="w-4 h-4"
                                      style={{ color: platform.color }}
                                    />
                                    <span className="text-sm font-medium">{platform.name}</span>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="text-center py-6 mt-2 border rounded-lg">
                          <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                          <p className="text-muted-foreground mb-4">No platforms connected</p>
                          <Button
                            onClick={() => setActiveTab('overview')}
                            data-testid="button-connect-platforms-url"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Connect Platforms
                          </Button>
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={handleGenerateFromUrl}
                      disabled={
                        isGeneratingFromUrl || !contentUrl.trim() || selectedPlatforms.length === 0
                      }
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                      data-testid="button-generate-from-url"
                    >
                      {isGeneratingFromUrl ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Analyzing URL...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate from URL
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Generated Content</Label>
                      {urlGeneratedContent.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleDownloadAllContent}
                          data-testid="button-download-all"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download All
                        </Button>
                      )}
                    </div>
                    {urlGeneratedContent.length > 0 ? (
                      <div
                        className="space-y-3 max-h-96 overflow-y-auto"
                        data-testid="generated-content-display"
                      >
                        {urlGeneratedContent.map((item, index) => {
                          const platform = SOCIAL_PLATFORMS.find((p) => p.id === item.platform);
                          const IconComponent = platform?.icon;
                          return (
                            <div
                              key={index}
                              className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  {IconComponent && (
                                    <IconComponent
                                      className="w-4 h-4"
                                      style={{ color: platform?.color }}
                                    />
                                  )}
                                  <span className="font-medium">{platform?.name}</span>
                                </div>
                                <div className="flex space-x-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      navigator.clipboard.writeText(item.content);
                                      toast({
                                        title: 'Copied!',
                                        description: 'Content copied to clipboard',
                                      });
                                    }}
                                    data-testid={`button-copy-${item.platform}`}
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      handleDownloadContent(
                                        item.platform,
                                        item.content,
                                        item.hashtags,
                                        item.mediaUrl,
                                        item.format
                                      )
                                    }
                                    data-testid={`button-download-${item.platform}`}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>

                              {item.format === 'image' && item.mediaUrl ? (
                                <div className="mb-2">
                                  <img
                                    src={item.mediaUrl}
                                    alt="Generated content"
                                    className="max-w-full h-auto rounded-lg border"
                                  />
                                </div>
                              ) : item.format === 'audio' && item.mediaUrl ? (
                                <div className="mb-2">
                                  <audio controls className="w-full">
                                    <source src={item.mediaUrl} type="audio/mpeg" />
                                    Your browser does not support the audio element.
                                  </audio>
                                </div>
                              ) : item.format === 'video' && item.mediaUrl ? (
                                <div className="mb-2">
                                  <video controls className="max-w-full h-auto rounded-lg border">
                                    <source src={item.mediaUrl} type="video/mp4" />
                                    Your browser does not support the video element.
                                  </video>
                                </div>
                              ) : null}

                              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                                {item.content}
                              </p>
                              {item.hashtags && item.hashtags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.hashtags.map((tag: string, i: number) => (
                                    <Badge key={i} variant="outline" className="text-xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="h-64 flex items-center justify-center border rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="text-center text-gray-400">
                          <Globe className="w-12 h-12 mx-auto mb-2" />
                          <p className="text-sm">Enter a URL and generate AI content</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Calendar Tab */}
          <TabsContent value="calendar" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">This Week</p>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {calendarStats?.upcomingThisWeek || 0}
                      </p>
                    </div>
                    <Calendar className="w-8 h-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Scheduled</p>
                      <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                        {calendarStats?.totalScheduled || 0}
                      </p>
                    </div>
                    <Clock className="w-8 h-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Published</p>
                      <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                        {calendarStats?.totalPublished || 0}
                      </p>
                    </div>
                    <CheckCircle className="w-8 h-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center justify-center">
                  <Button
                    onClick={() => {
                      setEditingCalendarPost(null);
                      setScheduleDialogOpen(true);
                    }}
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule Post
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Calendar View */}
            <ContentCalendarView
              posts={
                Array.isArray(calendarPosts) ? calendarPosts : (calendarPosts as { posts: CalendarPost[] })?.posts || []
              }
              onDateClick={handleDateClick}
            />

            {/* Timeline View */}
            <PostTimelineView
              posts={
                Array.isArray(calendarPosts) ? calendarPosts : (calendarPosts as { posts: CalendarPost[] })?.posts || []
              }
              onEdit={handleEditCalendarPost}
              onDelete={handleDeleteCalendarPost}
              onPublish={handlePublishCalendarPost}
            />

            {/* Schedule Post Dialog */}
            <SchedulePostDialog
              open={scheduleDialogOpen}
              onOpenChange={setScheduleDialogOpen}
              onSchedule={handleSchedulePost}
              initialData={
                editingCalendarPost
                  ? {
                      title: editingCalendarPost.title,
                      scheduledFor: new Date(editingCalendarPost.scheduledFor)
                        .toISOString()
                        .slice(0, 16),
                      platforms: editingCalendarPost.platforms || [],
                      postType: editingCalendarPost.postType || 'post',
                      content: editingCalendarPost.content || '',
                      mediaUrls: editingCalendarPost.mediaUrls || [],
                      hashtags: editingCalendarPost.hashtags || [],
                      mentions: editingCalendarPost.mentions || [],
                      location: editingCalendarPost.location || '',
                      status: editingCalendarPost.status || 'draft',
                    }
                  : undefined
              }
            />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Platform Connections */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {platforms.map((platform) => {
                const IconComponent = platform.icon;
                return (
                  <Card
                    key={platform.id}
                    className={`${platform.isConnected ? 'border-green-200 dark:border-green-800' : 'border-gray-200'}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <IconComponent className="w-6 h-6" style={{ color: platform.color }} />
                        <div
                          className={`w-2 h-2 rounded-full ${platform.isConnected ? 'bg-green-500' : 'bg-gray-300'}`}
                        />
                      </div>
                      <h3 className="font-semibold text-sm mb-1">{platform.name}</h3>
                      <p className="text-xs text-gray-500">
                        {platform.isConnected ? 'Connected' : 'Not Connected'}
                      </p>
                      {platform.isConnected && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">Followers:</span>
                            <span className="font-semibold">
                              {platform.followers?.toLocaleString() || 0}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-600">Engagement:</span>
                            <span className="font-semibold text-green-600">
                              {platform.engagement || 0}%
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Performance Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total Reach</p>
                      <p
                        className="text-3xl font-bold text-blue-900 dark:text-blue-100"
                        data-testid="text-total-reach"
                      >
                        {weeklyStatsLoading
                          ? '...'
                          : (weeklyStats?.totalReach || 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Impressions this week</p>
                    </div>
                    <TrendingUp className="w-10 h-10 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Engagement Rate</p>
                      <p
                        className="text-3xl font-bold text-purple-900 dark:text-purple-100"
                        data-testid="text-engagement-rate"
                      >
                        {weeklyStatsLoading ? '...' : `${weeklyStats?.engagementRate || 0}%`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Average engagement</p>
                    </div>
                    <Heart className="w-10 h-10 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-orange-50 to-red-100 dark:from-orange-900/20 dark:to-red-900/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Posts This Week</p>
                      <p
                        className="text-3xl font-bold text-orange-900 dark:text-orange-100"
                        data-testid="text-posts-this-week"
                      >
                        {weeklyStatsLoading ? '...' : weeklyStats?.postsThisWeek || 0}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Published posts</p>
                    </div>
                    <MessageSquare className="w-10 h-10 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="w-5 h-5 mr-2" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activity && activity.length > 0 ? (
                    activity.slice(0, 4).map((act: ActivityItem, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center space-x-3">
                          <Share2 className="w-4 h-4 text-blue-600" />
                          <div>
                            <p className="font-semibold text-sm">{act.platform}</p>
                            <p className="text-xs text-gray-600">{act.action}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{act.time}</p>
                          <p className="text-xs text-green-600 font-semibold">{act.engagement}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No recent activity</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Calendar className="w-5 h-5 mr-2" />
                    Scheduled Posts
                  </CardTitle>
                  <Button
                    className="bg-gradient-to-r from-blue-600 to-purple-600"
                    onClick={() => setActiveTab('create')}
                    data-testid="button-schedule-new-post"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Schedule New Post
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {posts.filter((post: SocialPost) => post.status === 'scheduled').length > 0 ? (
                    posts
                      .filter((post: SocialPost) => post.status === 'scheduled')
                      .map((post: SocialPost) => (
                        <Card key={post.id} data-testid={`card-scheduled-post-${post.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="font-medium mb-2">{post.content}</p>
                                <div className="flex flex-wrap gap-2 mb-2">
                                  {post.platforms?.map((platform: string) => (
                                    <Badge key={platform} variant="outline" className="text-xs">
                                      {platform}
                                    </Badge>
                                  ))}
                                </div>
                                <div className="flex items-center text-sm text-gray-600">
                                  <Clock className="w-4 h-4 mr-1" />
                                  {new Date(post.scheduledTime).toLocaleString()}
                                  <Badge className="ml-3 bg-blue-100 text-blue-800">
                                    Scheduled
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditPost(post.id)}
                                  data-testid={`button-edit-post-${post.id}`}
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deletePostMutation.mutate(post.id)}
                                  data-testid={`button-delete-post-${post.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                  ) : (
                    <div className="text-center py-12">
                      <Calendar className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No scheduled posts</p>
                      <Button
                        className="mt-4"
                        onClick={() => setActiveTab('create')}
                        data-testid="button-create-first-post"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Post
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {/* Modern Stat Cards with Sparklines */}
            <StatCardRow data-testid="analytics-stat-row">
              <StatCard
                title="Total Followers"
                value={metrics?.totalFollowers || 0}
                change={metrics?.followersGrowth?.percentChange || 0}
                trend={metrics?.followersGrowth?.percentChange && metrics.followersGrowth.percentChange > 0 ? 'up' : 'neutral'}
                sparklineData={[]}
                icon={<Users className="h-5 w-5" />}
              />
              <StatCard
                title="Total Engagement"
                value={metrics?.totalEngagement || 0}
                change={metrics?.engagementGrowth?.percentChange || 0}
                trend={metrics?.engagementGrowth?.percentChange && metrics.engagementGrowth.percentChange > 0 ? 'up' : 'neutral'}
                sparklineData={[]}
                icon={<Heart className="h-5 w-5" />}
              />
              <StatCard
                title="Avg Engagement"
                value={metrics?.avgEngagementRate || 0}
                change={0}
                trend="neutral"
                suffix="%"
                sparklineData={[]}
                icon={<TrendingUp className="h-5 w-5" />}
              />
              <StatCard
                title="Total Reach"
                value={metrics?.totalReach || 0}
                change={metrics?.reachGrowth?.percentChange || 0}
                trend={metrics?.reachGrowth?.percentChange && metrics.reachGrowth.percentChange > 0 ? 'up' : 'neutral'}
                sparklineData={[]}
                icon={<Eye className="h-5 w-5" />}
              />
            </StatCardRow>

            {/* Engagement & Platform Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Engagement Trends"
                subtitle="Last 14 days activity"
                icon={<Activity className="h-5 w-5 text-blue-500" />}
              >
                {weeklyStats?.dailyEngagement && weeklyStats.dailyEngagement.length > 0 ? (
                  <SimpleAreaChart
                    data={weeklyStats.dailyEngagement?.map((d: { date: string; engagement: number }) => ({
                      label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                      value: d.engagement,
                    })) ?? []}
                    height={180}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Activity className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No engagement data yet</p>
                      <p className="text-xs text-slate-600">Connect platforms to track engagement</p>
                    </div>
                  </div>
                )}
              </ChartCard>

              <ChartCard
                title="Platform Breakdown"
                subtitle="Followers by platform"
                icon={<Globe className="h-5 w-5 text-blue-500" />}
              >
                {platforms.filter(p => p.isConnected && p.followers > 0).length > 0 ? (
                  <PlatformBreakdown
                    platforms={platforms.filter(p => p.isConnected && p.followers > 0).map((p) => ({
                      name: p.name,
                      value: p.followers,
                      color: p.color,
                    }))}
                  />
                ) : (
                  <div className="h-48 flex items-center justify-center text-slate-500">
                    <div className="text-center">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-sm">No platform data yet</p>
                      <p className="text-xs text-slate-600">Connect social accounts to see breakdown</p>
                    </div>
                  </div>
                )}
              </ChartCard>
            </div>

            {/* Platform Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Platform Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {metrics?.platformPerformance && metrics.platformPerformance.length > 0 ? (
                    metrics.platformPerformance.map((platform: PlatformPerformance) => (
                      <div
                        key={platform.name}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        data-testid={`card-platform-${platform.id || platform.name}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold">{platform.name}</span>
                          <Badge className="bg-green-100 text-green-800">+{platform.growth}%</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Reach</p>
                            <p className="font-semibold">{platform.reach}</p>
                          </div>
                          <div>
                            <p className="text-gray-600">Engagement</p>
                            <p className="font-semibold">{platform.engagement}%</p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No platform performance data yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Best Performing Posts */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Star className="w-5 h-5 mr-2 text-yellow-500" />
                  Top Performing Posts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {posts && posts.length > 0 ? (
                    posts
                      .filter((post: SocialPost) => post.status === 'published')
                      .sort(
                        (a: SocialPost, b: SocialPost) =>
                          (b.metrics?.engagement || 0) - (a.metrics?.engagement || 0)
                      )
                      .slice(0, 3)
                      .map((post: SocialPost) => (
                        <div
                          key={post.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        >
                          <div className="flex-1">
                            <p className="font-medium text-sm line-clamp-2">{post.content}</p>
                            <p className="text-xs text-gray-600 mt-1">
                              {post.platforms?.join(', ')}
                            </p>
                          </div>
                          <div className="text-right space-y-1">
                            <p className="text-sm font-semibold">
                              {post.metrics?.likes || 0} likes
                            </p>
                            <p className="text-xs text-green-600">
                              {post.metrics?.engagement || 0}% engagement
                            </p>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8">
                      <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No published posts yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Audience Growth Tracking */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                  Audience Growth Tracking
                </CardTitle>
                <p className="text-sm text-muted-foreground">Track your follower growth across all platforms</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg">
                    <p className="text-sm text-blue-600 dark:text-blue-400">This Week</p>
                    <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">+{metrics?.followersGrowth?.thisWeek ?? 0}</p>
                    <p className="text-xs text-green-600">↑ {metrics?.followersGrowth?.weeklyChange ?? 0}% vs last week</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg">
                    <p className="text-sm text-green-600 dark:text-green-400">This Month</p>
                    <p className="text-2xl font-bold text-green-900 dark:text-green-100">+{metrics?.followersGrowth?.thisMonth ?? 0}</p>
                    <p className="text-xs text-green-600">↑ {metrics?.followersGrowth?.monthlyChange ?? 0}% vs last month</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg">
                    <p className="text-sm text-purple-600 dark:text-purple-400">Growth Rate</p>
                    <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{metrics?.followersGrowth?.rate ?? 0}%</p>
                    <p className="text-xs text-purple-600">Monthly average</p>
                  </div>
                  <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg">
                    <p className="text-sm text-orange-600 dark:text-orange-400">Projected</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">+{metrics?.followersGrowth?.projected ?? 0}</p>
                    <p className="text-xs text-orange-600">Next 30 days</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {platforms.filter(p => p.isConnected).map((platform) => {
                    const IconComponent = platform.icon;
                    const platformGrowth = metrics?.platformGrowth?.[platform.id];
                    return (
                      <div key={platform.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <IconComponent className="w-5 h-5" style={{ color: platform.color }} />
                          <div>
                            <p className="font-medium">{platform.name}</p>
                            <p className="text-xs text-muted-foreground">{platform.followers?.toLocaleString() ?? 0} followers</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">+{platformGrowth?.growth ?? 0}</p>
                          <p className="text-xs text-muted-foreground">↑ {platformGrowth?.percentage ?? 0}% this month</p>
                        </div>
                      </div>
                    );
                  })}
                  {platforms.filter(p => p.isConnected).length === 0 && (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Connect platforms to track audience growth</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Content Performance Comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                  Content Performance Comparison
                </CardTitle>
                <p className="text-sm text-muted-foreground">Compare performance across different content types</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  {[
                    { type: 'Images', icon: Image, engagement: metrics?.contentPerformance?.images?.engagement ?? 0, reach: metrics?.contentPerformance?.images?.reach ?? '0', color: 'from-pink-500 to-rose-500' },
                    { type: 'Videos', icon: Video, engagement: metrics?.contentPerformance?.videos?.engagement ?? 0, reach: metrics?.contentPerformance?.videos?.reach ?? '0', color: 'from-purple-500 to-indigo-500' },
                    { type: 'Carousels', icon: Share2, engagement: metrics?.contentPerformance?.carousels?.engagement ?? 0, reach: metrics?.contentPerformance?.carousels?.reach ?? '0', color: 'from-blue-500 to-cyan-500' },
                    { type: 'Text Posts', icon: Edit, engagement: metrics?.contentPerformance?.text?.engagement ?? 0, reach: metrics?.contentPerformance?.text?.reach ?? '0', color: 'from-green-500 to-emerald-500' },
                  ].map((content) => {
                    const ContentIcon = content.icon;
                    return (
                      <div key={content.type} className="p-4 rounded-lg border bg-white dark:bg-gray-900">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${content.color} flex items-center justify-center mb-3`}>
                          <ContentIcon className="w-5 h-5 text-white" />
                        </div>
                        <h4 className="font-semibold mb-2">{content.type}</h4>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Engagement</span>
                            <span className="font-medium">{content.engagement}%</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Avg. Reach</span>
                            <span className="font-medium">{content.reach}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {metrics?.aiRecommendation ? (
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg">
                    <h4 className="font-semibold mb-2 flex items-center">
                      <Sparkles className="w-4 h-4 mr-2 text-purple-600" />
                      AI Recommendation
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {metrics.aiRecommendation}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                    <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Post content to receive AI-powered recommendations
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Best Time to Post Recommendations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="w-5 h-5 mr-2 text-orange-600" />
                  Best Time to Post
                </CardTitle>
                <p className="text-sm text-muted-foreground">AI-optimized posting schedule based on your audience activity</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-4">Optimal Posting Times by Platform</h4>
                    <div className="space-y-3">
                      {platforms.filter(p => p.isConnected).slice(0, 6).map((platform) => {
                        const IconComponent = platform.icon;
                        const times = [
                          { platform: 'instagram', best: '6:00 PM - 9:00 PM', day: 'Tuesday & Thursday' },
                          { platform: 'facebook', best: '1:00 PM - 4:00 PM', day: 'Wednesday & Friday' },
                          { platform: 'twitter', best: '12:00 PM - 3:00 PM', day: 'Monday & Wednesday' },
                          { platform: 'tiktok', best: '7:00 PM - 10:00 PM', day: 'Thursday & Saturday' },
                          { platform: 'youtube', best: '2:00 PM - 5:00 PM', day: 'Friday & Sunday' },
                          { platform: 'linkedin', best: '8:00 AM - 10:00 AM', day: 'Tuesday & Wednesday' },
                        ];
                        const timeData = times.find(t => t.platform === platform.id) || { best: '9:00 AM - 12:00 PM', day: 'Weekdays' };
                        return (
                          <div key={platform.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <IconComponent className="w-5 h-5" style={{ color: platform.color }} />
                              <span className="font-medium">{platform.name}</span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-green-600">{timeData.best}</p>
                              <p className="text-xs text-muted-foreground">{timeData.day}</p>
                            </div>
                          </div>
                        );
                      })}
                      {platforms.filter(p => p.isConnected).length === 0 && (
                        <div className="text-center py-6">
                          <Clock className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">Connect platforms to see optimal posting times</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-4">Weekly Engagement Heatmap</h4>
                    {metrics?.heatmapData && Object.keys(metrics.heatmapData).length > 0 ? (
                      <div className="space-y-2">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                          <div key={day} className="flex items-center space-x-2">
                            <span className="w-8 text-xs font-medium">{day}</span>
                            <div className="flex-1 grid grid-cols-6 gap-1">
                              {['6AM', '9AM', '12PM', '3PM', '6PM', '9PM'].map((time, idx) => {
                                const intensity = metrics.heatmapData?.[day]?.[time] ?? 0;
                                return (
                                  <div
                                    key={time}
                                    className={`h-6 rounded text-xs flex items-center justify-center ${
                                      intensity > 0.7 ? 'bg-green-500 text-white' :
                                      intensity > 0.4 ? 'bg-green-300 dark:bg-green-700' :
                                      'bg-gray-200 dark:bg-gray-700'
                                    }`}
                                    title={`${day} ${time}: ${Math.floor(intensity * 100)}% engagement`}
                                  >
                                    {idx === 0 && <span className="sr-only">{time}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="flex items-center justify-center space-x-4 mt-3 text-xs">
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                            <span>Low</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 bg-green-300 dark:bg-green-700 rounded"></div>
                            <span>Medium</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 bg-green-500 rounded"></div>
                            <span>High</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <BarChart2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">Post content to see your weekly engagement heatmap</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Engagement Rate Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Heart className="w-5 h-5 mr-2 text-red-500" />
                  Engagement Rate Analytics
                </CardTitle>
                <p className="text-sm text-muted-foreground">Detailed breakdown of engagement metrics across platforms</p>
              </CardHeader>
              <CardContent>
                {metrics?.engagementBreakdown ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-4 bg-gradient-to-br from-red-50 to-pink-100 dark:from-red-900/20 dark:to-pink-900/20 rounded-lg text-center">
                        <Heart className="w-8 h-8 mx-auto text-red-500 mb-2" />
                        <p className="text-3xl font-bold text-red-900 dark:text-red-100">{metrics.engagementBreakdown.likes ?? 0}</p>
                        <p className="text-sm text-red-600">Total Likes</p>
                        {metrics.engagementBreakdown.likesChange != null && (
                          <p className={`text-xs mt-1 ${metrics.engagementBreakdown.likesChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.engagementBreakdown.likesChange >= 0 ? '↑' : '↓'} {Math.abs(metrics.engagementBreakdown.likesChange)}% this week
                          </p>
                        )}
                      </div>
                      <div className="p-4 bg-gradient-to-br from-blue-50 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg text-center">
                        <MessageCircle className="w-8 h-8 mx-auto text-blue-500 mb-2" />
                        <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{metrics.engagementBreakdown.comments ?? 0}</p>
                        <p className="text-sm text-blue-600">Total Comments</p>
                        {metrics.engagementBreakdown.commentsChange != null && (
                          <p className={`text-xs mt-1 ${metrics.engagementBreakdown.commentsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.engagementBreakdown.commentsChange >= 0 ? '↑' : '↓'} {Math.abs(metrics.engagementBreakdown.commentsChange)}% this week
                          </p>
                        )}
                      </div>
                      <div className="p-4 bg-gradient-to-br from-purple-50 to-indigo-100 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg text-center">
                        <Share2 className="w-8 h-8 mx-auto text-purple-500 mb-2" />
                        <p className="text-3xl font-bold text-purple-900 dark:text-purple-100">{metrics.engagementBreakdown.shares ?? 0}</p>
                        <p className="text-sm text-purple-600">Total Shares</p>
                        {metrics.engagementBreakdown.sharesChange != null && (
                          <p className={`text-xs mt-1 ${metrics.engagementBreakdown.sharesChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {metrics.engagementBreakdown.sharesChange >= 0 ? '↑' : '↓'} {Math.abs(metrics.engagementBreakdown.sharesChange)}% this week
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <h4 className="font-semibold">Engagement by Platform</h4>
                      {metrics.engagementBreakdown.byPlatform && metrics.engagementBreakdown.byPlatform.length > 0 ? (
                        metrics.engagementBreakdown.byPlatform.map((platformData: { platform: string; rate: number }) => {
                          const platform = platforms.find(p => p.id === platformData.platform);
                          const IconComponent = platform?.icon;
                          return (
                            <div key={platformData.platform} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {IconComponent && <IconComponent className="w-4 h-4" style={{ color: platform?.color }} />}
                                  <span className="text-sm font-medium">{platform?.name ?? platformData.platform}</span>
                                </div>
                                <span className="text-sm font-semibold">{platformData.rate.toFixed(2)}%</span>
                              </div>
                              <Progress value={platformData.rate * 10} className="h-2" />
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-6">
                          <Heart className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">Post content to see engagement analytics by platform</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <h4 className="font-semibold mb-2">No Engagement Data Yet</h4>
                    <p className="text-sm text-muted-foreground">Connect your social platforms and start posting to see engagement analytics</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* AI Insights Tab */}
          <TabsContent value="ai-insights" className="space-y-6">
            <Card className="bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Brain className="w-5 h-5 mr-2 text-purple-600" />
                  AI-Powered Recommendations
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Personalized insights to maximize your social media performance
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiInsights?.recommendations && aiInsights.recommendations.length > 0 ? (
                  aiInsights.recommendations.map((insight: AIRecommendation, idx: number) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border-l-4 ${
                        insight.priority === 'high'
                          ? 'border-red-500 bg-red-50 dark:bg-red-950/20'
                          : insight.priority === 'medium'
                            ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20'
                            : 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                      }`}
                      data-testid={`card-ai-insight-${idx}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <h4 className="font-semibold">{insight.title}</h4>
                            <Badge
                              className={
                                insight.priority === 'high'
                                  ? 'bg-red-100 text-red-800'
                                  : insight.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-blue-100 text-blue-800'
                              }
                            >
                              {insight.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                            {insight.description}
                          </p>
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{insight.category}</Badge>
                            {insight.action && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-purple-600 hover:text-purple-700"
                                onClick={() => handleAIAction(insight.action)}
                                data-testid={`button-ai-action-${insight.action}`}
                              >
                                <Zap className="w-4 h-4 mr-1" />
                                {insight.actionLabel || insight.action}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Brain className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No AI insights available yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Trend Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                  Trending Topics & Hashtags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {metrics?.trendingTopics && metrics.trendingTopics.length > 0 ? (
                    metrics.trendingTopics.map((trend: TrendingTopic, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        data-testid={`card-trending-topic-${idx}`}
                      >
                        <div className="flex-1">
                          <p className="font-semibold text-blue-600">#{trend.tag}</p>
                          <p className="text-xs text-gray-600">
                            {trend.volume} posts • {trend.relevance}% relevant to you
                          </p>
                          <div className="flex gap-2 mt-2">
                            {trend.platforms?.map((platform: string) => (
                              <Badge key={platform} variant="outline" className="text-xs">
                                {platform}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddTrend(trend.tag)}
                          data-testid={`button-add-trend-${trend.tag}`}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No trending topics available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* AI Content Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-yellow-500" />
                  AI Content Ideas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aiInsights?.contentIdeas && aiInsights.contentIdeas.length > 0 ? (
                    aiInsights.contentIdeas.map((suggestion: ContentIdea, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                        data-testid={`card-content-idea-${idx}`}
                      >
                        <div className="flex-1">
                          <p className="font-medium text-sm mb-1">{suggestion.idea}</p>
                          <Badge variant="outline" className="text-xs">
                            {suggestion.platform}
                          </Badge>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-1">
                            <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                            <span className="font-bold text-sm">{suggestion.score}</span>
                          </div>
                          <p className="text-xs text-gray-600">AI Score</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8">
                      <Sparkles className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No content ideas available yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Autopilot Tab */}
          <TabsContent value="autopilot" className="space-y-6">
            <AutopilotDashboard />
            
            {/* Multimodal Content Analysis for Autopilot */}
            <ContentAnalyzer />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
