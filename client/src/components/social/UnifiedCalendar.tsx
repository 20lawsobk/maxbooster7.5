import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit,
  Trash2,
  Copy,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  Megaphone,
  FileText,
  MoreHorizontal,
  GripVertical,
  Send,
  Eye,
  Users,
  Target,
  Sparkles,
  Zap,
  Filter,
  Download,
  RefreshCw,
  PartyPopper,
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
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from 'date-fns';

interface ScheduledPost {
  id: string;
  title: string;
  content: string;
  platforms: string[];
  scheduledFor: string;
  type: 'organic' | 'paid' | 'story' | 'reel' | 'live';
  status: 'draft' | 'scheduled' | 'pending_approval' | 'approved' | 'published' | 'failed';
  campaign?: string;
  budget?: number;
  mediaUrls?: string[];
  hashtags?: string[];
  approvedBy?: string;
  createdAt: string;
  optimalTimeScore?: number;
}

interface Campaign {
  id: string;
  name: string;
  color: string;
  startDate: string;
  endDate: string;
  posts: number;
  budget: number;
}

interface Holiday {
  date: string;
  name: string;
  type: 'holiday' | 'event' | 'awareness';
}

interface QueueItem {
  id: string;
  content: string;
  platforms: string[];
  optimalTime: string;
  score: number;
}

const PLATFORM_CONFIG = {
  twitter: { icon: TwitterIcon, color: '#000000', name: 'Twitter' },
  instagram: { icon: InstagramIcon, color: '#E4405F', name: 'Instagram' },
  facebook: { icon: FacebookIcon, color: '#1877F2', name: 'Facebook' },
  tiktok: { icon: TikTokIcon, color: '#000000', name: 'TikTok' },
  youtube: { icon: YouTubeIcon, color: '#FF0000', name: 'YouTube' },
  linkedin: { icon: LinkedInIcon, color: '#0077B5', name: 'LinkedIn' },
};

const POST_TYPE_CONFIG = {
  organic: { label: 'Organic', color: 'bg-green-500/20 text-green-500', icon: FileText },
  paid: { label: 'Paid', color: 'bg-blue-500/20 text-blue-500', icon: DollarSign },
  story: { label: 'Story', color: 'bg-purple-500/20 text-purple-500', icon: Clock },
  reel: { label: 'Reel', color: 'bg-pink-500/20 text-pink-500', icon: Zap },
  live: { label: 'Live', color: 'bg-red-500/20 text-red-500', icon: Megaphone },
};

const STATUS_CONFIG = {
  draft: { label: 'Draft', color: 'bg-gray-500/20 text-gray-500', icon: FileText },
  scheduled: { label: 'Scheduled', color: 'bg-blue-500/20 text-blue-500', icon: Clock },
  pending_approval: { label: 'Pending Approval', color: 'bg-yellow-500/20 text-yellow-500', icon: AlertCircle },
  approved: { label: 'Approved', color: 'bg-green-500/20 text-green-500', icon: CheckCircle },
  published: { label: 'Published', color: 'bg-emerald-500/20 text-emerald-500', icon: Send },
  failed: { label: 'Failed', color: 'bg-red-500/20 text-red-500', icon: XCircle },
};


export function UnifiedCalendar() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedPost, setSelectedPost] = useState<ScheduledPost | null>(null);
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [draggedPost, setDraggedPost] = useState<ScheduledPost | null>(null);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCampaign, setFilterCampaign] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('calendar');
  
  const [newPost, setNewPost] = useState({
    title: '',
    content: '',
    platforms: [] as string[],
    scheduledFor: '',
    type: 'organic' as const,
    campaign: '',
    budget: 0,
  });

  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['/api/social/unified-calendar/posts'],
  });

  const { data: campaignsData } = useQuery({
    queryKey: ['/api/social/unified-calendar/campaigns'],
  });

  const { data: holidaysData } = useQuery({
    queryKey: ['/api/social/unified-calendar/holidays'],
  });

  const { data: queueData } = useQuery({
    queryKey: ['/api/social/unified-calendar/queue'],
  });

  const posts: ScheduledPost[] = postsData?.posts || [];
  const campaigns: Campaign[] = campaignsData?.campaigns || [];
  const holidays: Holiday[] = holidaysData?.holidays || [];
  const queue: QueueItem[] = queueData?.queue || [];

  const filteredPosts = posts.filter((post: ScheduledPost) => {
    if (filterPlatform !== 'all' && !post.platforms.includes(filterPlatform)) return false;
    if (filterType !== 'all' && post.type !== filterType) return false;
    if (filterCampaign !== 'all' && post.campaign !== filterCampaign) return false;
    return true;
  });

  const stats = {
    scheduled: posts.filter((p: ScheduledPost) => p.status === 'scheduled').length,
    pending: posts.filter((p: ScheduledPost) => p.status === 'pending_approval').length,
    published: posts.filter((p: ScheduledPost) => p.status === 'published').length,
    totalBudget: posts.reduce((acc: number, p: ScheduledPost) => acc + (p.budget || 0), 0),
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    return { daysInMonth, startingDay, year, month };
  };

  const getPostsForDate = (day: number) => {
    const { year, month } = getDaysInMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return filteredPosts.filter((post: ScheduledPost) => {
      const postDate = new Date(post.scheduledFor).toISOString().split('T')[0];
      return postDate === dateStr;
    });
  };

  const getHolidayForDate = (day: number) => {
    const { year, month } = getDaysInMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return holidays.find((h: Holiday) => h.date === dateStr);
  };

  const handleDragStart = (post: ScheduledPost) => {
    setDraggedPost(post);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (day: number) => {
    if (!draggedPost) return;
    
    const { year, month } = getDaysInMonth();
    const newDate = new Date(year, month, day, 12, 0, 0);
    
    toast({
      title: 'Post Rescheduled',
      description: `"${draggedPost.title}" moved to ${format(newDate, 'MMM d, yyyy')}`,
    });
    
    setDraggedPost(null);
  };

  const handleCreatePost = () => {
    if (!newPost.title || !newPost.content || newPost.platforms.length === 0) {
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive',
      });
      return;
    }
    
    toast({
      title: 'Post Created',
      description: 'Your post has been scheduled.',
    });
    
    setNewPost({
      title: '',
      content: '',
      platforms: [],
      scheduledFor: '',
      type: 'organic',
      campaign: '',
      budget: 0,
    });
    setShowPostDialog(false);
  };

  const handleApprove = (post: ScheduledPost) => {
    toast({
      title: 'Post Approved',
      description: `"${post.title}" has been approved for publishing.`,
    });
    setShowApprovalDialog(false);
  };

  const handleReject = (post: ScheduledPost) => {
    toast({
      title: 'Post Rejected',
      description: `"${post.title}" has been sent back for revisions.`,
    });
    setShowApprovalDialog(false);
  };

  const handlePublishNow = (post: ScheduledPost) => {
    toast({
      title: 'Publishing...',
      description: `"${post.title}" is being published to ${post.platforms.length} platforms.`,
    });
  };

  const handleAddToQueue = (item: QueueItem) => {
    toast({
      title: 'Added to Schedule',
      description: `Post scheduled for ${item.optimalTime}`,
    });
  };

  const renderCalendarDays = () => {
    const { daysInMonth, startingDay, year, month } = getDaysInMonth();
    const days = [];
    const totalCells = Math.ceil((startingDay + daysInMonth) / 7) * 7;
    
    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - startingDay + 1;
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
      const isCurrentDay = isValidDay && isToday(new Date(year, month, dayNumber));
      
      if (isValidDay) {
        const dayPosts = getPostsForDate(dayNumber);
        const holiday = getHolidayForDate(dayNumber);
        
        return days.push(
          <div
            key={i}
            className={`min-h-28 p-2 border border-border transition-colors ${
              isCurrentDay ? 'bg-primary/10 border-primary' : 'bg-card hover:bg-muted/50'
            }`}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(dayNumber)}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm font-medium ${isCurrentDay ? 'text-primary' : ''}`}>
                {dayNumber}
              </span>
              {holiday && (
                <Badge variant="outline" className="text-[10px] px-1">
                  <PartyPopper className="w-3 h-3 mr-1" />
                  {holiday.name}
                </Badge>
              )}
            </div>
            
            <div className="space-y-1">
              {dayPosts.slice(0, 3).map((post: ScheduledPost) => {
                const TypeConfig = POST_TYPE_CONFIG[post.type];
                return (
                  <div
                    key={post.id}
                    className={`text-xs p-1.5 rounded cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${TypeConfig.color}`}
                    draggable
                    onDragStart={() => handleDragStart(post)}
                    onClick={() => {
                      setSelectedPost(post);
                      if (post.status === 'pending_approval') {
                        setShowApprovalDialog(true);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      {post.platforms.slice(0, 2).map((platform) => {
                        const PlatformIcon = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.icon;
                        return PlatformIcon ? (
                          <PlatformIcon
                            key={platform}
                            className="w-3 h-3"
                            style={{ color: PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG]?.color }}
                          />
                        ) : null;
                      })}
                      {post.platforms.length > 2 && (
                        <span className="text-[10px] text-muted-foreground">+{post.platforms.length - 2}</span>
                      )}
                      {post.type === 'paid' && <DollarSign className="w-3 h-3 ml-auto" />}
                    </div>
                    <p className="truncate">{post.title}</p>
                  </div>
                );
              })}
              {dayPosts.length > 3 && (
                <div className="text-[10px] text-center text-muted-foreground">
                  +{dayPosts.length - 3} more
                </div>
              )}
            </div>
          </div>
        );
      } else {
        days.push(
          <div key={i} className="min-h-28 p-2 border border-border bg-muted/30" />
        );
      }
    }
    
    return days;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-pink-600 bg-clip-text text-transparent">
            Unified Calendar
          </h2>
          <p className="text-muted-foreground mt-1">
            Manage paid & organic content across all platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowPostDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Post
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Scheduled</p>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 border-yellow-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Approval</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Published</p>
                <p className="text-2xl font-bold">{stats.published}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Ad Spend</p>
                <p className="text-2xl font-bold">${stats.totalBudget.toLocaleString()}</p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="calendar">
                  <Calendar className="w-4 h-4 mr-2" />
                  Calendar
                </TabsTrigger>
                <TabsTrigger value="queue">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Smart Queue
                </TabsTrigger>
                <TabsTrigger value="campaigns">
                  <Target className="w-4 h-4 mr-2" />
                  Campaigns
                </TabsTrigger>
                <TabsTrigger value="approvals">
                  <Users className="w-4 h-4 mr-2" />
                  Approvals
                  {stats.pending > 0 && (
                    <Badge variant="destructive" className="ml-2">{stats.pending}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            {activeTab === 'calendar' && (
              <div className="flex items-center gap-2">
                <Select value={filterPlatform} onValueChange={setFilterPlatform}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Platforms</SelectItem>
                    {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterCampaign} onValueChange={setFilterCampaign}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map((campaign: Campaign) => (
                      <SelectItem key={campaign.id} value={campaign.name}>{campaign.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          <TabsContent value="calendar" className="mt-0">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <h3 className="text-lg font-semibold min-w-[180px]">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
              </div>
              
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <div className="flex items-center border rounded-lg">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                  >
                    Month
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                  >
                    Week
                  </Button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-0">
              {dayNames.map((day) => (
                <div key={day} className="p-2 text-center text-sm font-semibold border-b border-border bg-muted">
                  {day}
                </div>
              ))}
              {renderCalendarDays()}
            </div>
            
            <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
              {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded ${config.color.split(' ')[0]}`} />
                  <span className="text-xs text-muted-foreground">{config.label}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="queue" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Smart Content Queue</h3>
                  <p className="text-sm text-muted-foreground">
                    AI-optimized posting times based on your audience engagement
                  </p>
                </div>
                <Button variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recalculate Times
                </Button>
              </div>
              
              {queue.map((item: QueueItem) => (
                <Card key={item.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="cursor-grab">
                        <GripVertical className="w-5 h-5 text-muted-foreground" />
                      </div>
                      
                      <div className="flex-1">
                        <p className="text-sm mb-2">{item.content}</p>
                        <div className="flex items-center gap-2">
                          {item.platforms.map((platform) => {
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
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="w-4 h-4 text-yellow-500" />
                          <span className="font-medium">{item.score}%</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.optimalTime}</p>
                      </div>
                      
                      <Button size="sm" onClick={() => handleAddToQueue(item)}>
                        <Plus className="w-4 h-4 mr-1" />
                        Schedule
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="campaigns" className="mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Active Campaigns</h3>
                <Button variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Campaign
                </Button>
              </div>
              
              {campaigns.map((campaign: Campaign) => (
                <Card key={campaign.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-4 h-12 rounded" style={{ backgroundColor: campaign.color }} />
                      
                      <div className="flex-1">
                        <h4 className="font-medium">{campaign.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(campaign.startDate), 'MMM d')} - {format(new Date(campaign.endDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                      
                      <div className="text-center px-4 border-l">
                        <p className="text-lg font-bold">{campaign.posts}</p>
                        <p className="text-xs text-muted-foreground">Posts</p>
                      </div>
                      
                      <div className="text-center px-4 border-l">
                        <p className="text-lg font-bold">${campaign.budget.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Budget</p>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Campaign
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Eye className="w-4 h-4 mr-2" />
                            View Analytics
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-500">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="approvals" className="mt-0">
            <div className="space-y-4">
              {posts.filter((p: ScheduledPost) => p.status === 'pending_approval').length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500 opacity-50" />
                  <p className="text-lg font-medium">All Caught Up!</p>
                  <p className="text-muted-foreground">No posts pending approval</p>
                </div>
              ) : (
                posts.filter((p: ScheduledPost) => p.status === 'pending_approval').map((post: ScheduledPost) => (
                  <Card key={post.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium">{post.title}</h4>
                            <Badge className={POST_TYPE_CONFIG[post.type].color}>
                              {POST_TYPE_CONFIG[post.type].label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-3">{post.content}</p>
                          
                          <div className="flex items-center gap-4 text-sm">
                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {format(new Date(post.scheduledFor), 'MMM d, yyyy h:mm a')}
                            </span>
                            <div className="flex items-center gap-1">
                              {post.platforms.map((platform) => {
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
                        </div>
                        
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => handleReject(post)}>
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                          <Button onClick={() => handleApprove(post)}>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
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

      <Dialog open={showPostDialog} onOpenChange={setShowPostDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Post</DialogTitle>
            <DialogDescription>
              Schedule content across multiple platforms
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                placeholder="Post title for internal reference"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={newPost.content}
                onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                placeholder="Write your post content..."
                rows={4}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Post Type</Label>
                <Select
                  value={newPost.type}
                  onValueChange={(value: 'organic' | 'paid' | 'story' | 'reel' | 'live') => setNewPost({ ...newPost, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(POST_TYPE_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="scheduledFor">Schedule For</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={newPost.scheduledFor}
                  onChange={(e) => setNewPost({ ...newPost, scheduledFor: e.target.value })}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLATFORM_CONFIG).map(([key, config]) => {
                  const PlatformIcon = config.icon;
                  const isSelected = newPost.platforms.includes(key);
                  return (
                    <Button
                      key={key}
                      variant={isSelected ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        if (isSelected) {
                          setNewPost({
                            ...newPost,
                            platforms: newPost.platforms.filter((p) => p !== key),
                          });
                        } else {
                          setNewPost({
                            ...newPost,
                            platforms: [...newPost.platforms, key],
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
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Campaign (Optional)</Label>
                <Select
                  value={newPost.campaign}
                  onValueChange={(value) => setNewPost({ ...newPost, campaign: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign: Campaign) => (
                      <SelectItem key={campaign.id} value={campaign.name}>{campaign.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {newPost.type === 'paid' && (
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget ($)</Label>
                  <Input
                    id="budget"
                    type="number"
                    value={newPost.budget}
                    onChange={(e) => setNewPost({ ...newPost, budget: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPostDialog(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => handleCreatePost()}>
              Save as Draft
            </Button>
            <Button onClick={() => handleCreatePost()}>
              <Clock className="w-4 h-4 mr-2" />
              Schedule Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Post</DialogTitle>
            <DialogDescription>
              Review and approve this post for publishing
            </DialogDescription>
          </DialogHeader>
          {selectedPost && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">{selectedPost.title}</h4>
                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                  {selectedPost.content}
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{format(new Date(selectedPost.scheduledFor), 'MMM d, yyyy h:mm a')}</span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedPost.platforms.map((platform) => {
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => selectedPost && handleReject(selectedPost)}>
              <XCircle className="w-4 h-4 mr-2" />
              Request Changes
            </Button>
            <Button onClick={() => selectedPost && handleApprove(selectedPost)}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
