import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreHorizontal,
  Send,
  ThumbsUp,
  Eye,
  Play,
  Clock,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Maximize2,
  Hash,
  AtSign,
  MapPin,
  Image as ImageIcon,
  Video,
} from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  TikTokIcon,
  LinkedInIcon,
  TwitterIcon,
  ThreadsIcon,
} from '@/components/ui/brand-icons';

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';

export interface PostPreviewData {
  id?: string;
  content: string;
  platforms: string[];
  mediaUrls?: string[];
  mediaType?: 'image' | 'video' | 'carousel';
  hashtags?: string[];
  mentions?: string[];
  location?: string;
  scheduledTime?: string;
  status?: PostStatus;
  statusMessage?: string;
  characterCounts?: Record<string, { count: number; limit: number }>;
  estimatedReach?: number;
  optimalTime?: string;
}

interface PostPreviewProps {
  post: PostPreviewData;
  authorName?: string;
  authorHandle?: string;
  authorAvatar?: string;
  onEdit?: () => void;
  onSchedule?: () => void;
  onPublish?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  showStats?: boolean;
}

const PLATFORM_CONFIG: Record<string, {
  icon: any;
  name: string;
  color: string;
  bgColor: string;
  maxChars: number;
  features: string[];
}> = {
  twitter: {
    icon: TwitterIcon,
    name: 'Twitter',
    color: '#000000',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    maxChars: 280,
    features: ['threads', 'quotes', 'polls'],
  },
  instagram: {
    icon: InstagramIcon,
    name: 'Instagram',
    color: '#E4405F',
    bgColor: 'bg-gradient-to-br from-purple-500/10 to-pink-500/10',
    maxChars: 2200,
    features: ['stories', 'reels', 'carousel'],
  },
  facebook: {
    icon: FacebookIcon,
    name: 'Facebook',
    color: '#1877F2',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    maxChars: 63206,
    features: ['stories', 'reels', 'groups'],
  },
  linkedin: {
    icon: LinkedInIcon,
    name: 'LinkedIn',
    color: '#0077B5',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    maxChars: 3000,
    features: ['articles', 'polls', 'documents'],
  },
  tiktok: {
    icon: TikTokIcon,
    name: 'TikTok',
    color: '#000000',
    bgColor: 'bg-gradient-to-br from-pink-500/10 to-cyan-500/10',
    maxChars: 2200,
    features: ['duets', 'stitches', 'sounds'],
  },
  youtube: {
    icon: YouTubeIcon,
    name: 'YouTube',
    color: '#FF0000',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    maxChars: 5000,
    features: ['shorts', 'community', 'premiere'],
  },
  threads: {
    icon: ThreadsIcon,
    name: 'Threads',
    color: '#000000',
    bgColor: 'bg-gray-50 dark:bg-gray-800',
    maxChars: 500,
    features: ['replies', 'reposts'],
  },
};

const STATUS_CONFIG: Record<PostStatus, { label: string; icon: any; color: string }> = {
  draft: { label: 'Draft', icon: Clock, color: 'text-gray-500' },
  scheduled: { label: 'Scheduled', icon: Calendar, color: 'text-blue-500' },
  publishing: { label: 'Publishing...', icon: Loader2, color: 'text-yellow-500' },
  published: { label: 'Published', icon: CheckCircle, color: 'text-green-500' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-500' },
};

function TwitterPreview({ post, authorName, authorHandle, authorAvatar }: {
  post: PostPreviewData;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
}) {
  const charCount = post.content.length;
  const isOverLimit = charCount > 280;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 max-w-[500px]">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
          {authorAvatar ? (
            <img src={authorAvatar} alt={`${authorName} avatar`} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-bold truncate">{authorName}</span>
            <span className="text-muted-foreground">@{authorHandle}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">now</span>
          </div>
          <p className={`mt-1 text-sm whitespace-pre-wrap ${isOverLimit ? 'text-red-500' : ''}`}>
            {post.content}
          </p>
          {post.mediaUrls && post.mediaUrls.length > 0 && (
            <div className={`mt-3 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 ${post.mediaUrls.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}`}>
              {post.mediaUrls.slice(0, 4).map((url, idx) => (
                <div key={idx} className="aspect-video bg-gray-100 dark:bg-gray-800 relative">
                  {post.mediaType === 'video' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play className="w-12 h-12 text-white drop-shadow-lg" />
                    </div>
                  ) : (
                    <img src={url} alt="Post media" className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-muted-foreground">
            <Button variant="ghost" size="sm" className="hover:text-blue-500 hover:bg-blue-50">
              <MessageCircle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="hover:text-green-500 hover:bg-green-50">
              <Share2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="hover:text-pink-500 hover:bg-pink-50">
              <Heart className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="hover:text-blue-500 hover:bg-blue-50">
              <Bookmark className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className={`mt-2 text-xs text-right ${isOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
        {charCount}/280 characters
      </div>
    </div>
  );
}

function InstagramPreview({ post, authorName, authorHandle, authorAvatar }: {
  post: PostPreviewData;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 max-w-[400px] overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-0.5">
            <div className="w-full h-full rounded-full bg-white dark:bg-gray-900 p-0.5">
              {authorAvatar ? (
                <img src={authorAvatar} alt={`${authorName} avatar`} className="w-full h-full rounded-full object-cover" />
              ) : (
                <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-blue-600" />
              )}
            </div>
          </div>
          <span className="font-semibold text-sm">{authorHandle}</span>
        </div>
        <MoreHorizontal className="w-5 h-5" />
      </div>

      {post.mediaUrls && post.mediaUrls.length > 0 ? (
        <div className="aspect-square bg-gray-100 dark:bg-gray-800 relative">
          {post.mediaType === 'video' ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Play className="w-16 h-16 text-white drop-shadow-lg" />
            </div>
          ) : (
            <img src={post.mediaUrls[0]} alt="Post media" className="w-full h-full object-cover" />
          )}
          {post.mediaUrls.length > 1 && (
            <div className="absolute top-2 right-2">
              <Badge variant="secondary" className="text-xs">
                1/{post.mediaUrls.length}
              </Badge>
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
          <ImageIcon className="w-16 h-16 text-muted-foreground/50" />
        </div>
      )}

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Heart className="w-6 h-6" />
            <MessageCircle className="w-6 h-6" />
            <Send className="w-6 h-6" />
          </div>
          <Bookmark className="w-6 h-6" />
        </div>

        <div className="text-sm">
          <span className="font-semibold">{authorHandle}</span>{' '}
          <span className="whitespace-pre-wrap">{post.content.slice(0, 125)}</span>
          {post.content.length > 125 && (
            <span className="text-muted-foreground">... more</span>
          )}
        </div>

        {post.hashtags && post.hashtags.length > 0 && (
          <div className="text-sm text-blue-500">
            {post.hashtags.slice(0, 5).map(tag => `#${tag}`).join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}

function LinkedInPreview({ post, authorName, authorHandle, authorAvatar }: {
  post: PostPreviewData;
  authorName: string;
  authorHandle: string;
  authorAvatar?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 max-w-[500px] overflow-hidden">
      <div className="p-4">
        <div className="flex gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
            {authorAvatar ? (
              <img src={authorAvatar} alt={`${authorName} avatar`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
            )}
          </div>
          <div>
            <p className="font-semibold">{authorName}</p>
            <p className="text-xs text-muted-foreground">{authorHandle}</p>
            <p className="text-xs text-muted-foreground">Just now · 🌐</p>
          </div>
        </div>

        <p className="mt-3 text-sm whitespace-pre-wrap">
          {post.content.slice(0, 210)}
          {post.content.length > 210 && (
            <span className="text-muted-foreground">... see more</span>
          )}
        </p>

        {post.hashtags && post.hashtags.length > 0 && (
          <div className="mt-2 text-sm text-blue-600">
            {post.hashtags.slice(0, 3).map(tag => `#${tag}`).join(' ')}
          </div>
        )}
      </div>

      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative border-t border-gray-200 dark:border-gray-700">
          <img src={post.mediaUrls[0]} alt="Post media" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around text-sm text-muted-foreground">
        <Button variant="ghost" size="sm">
          <ThumbsUp className="w-4 h-4 mr-1" />
          Like
        </Button>
        <Button variant="ghost" size="sm">
          <MessageCircle className="w-4 h-4 mr-1" />
          Comment
        </Button>
        <Button variant="ghost" size="sm">
          <Share2 className="w-4 h-4 mr-1" />
          Repost
        </Button>
        <Button variant="ghost" size="sm">
          <Send className="w-4 h-4 mr-1" />
          Send
        </Button>
      </div>
    </div>
  );
}

function FacebookPreview({ post, authorName, authorAvatar }: {
  post: PostPreviewData;
  authorName: string;
  authorAvatar?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 max-w-[500px] overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-300 flex-shrink-0 overflow-hidden">
              {authorAvatar ? (
                <img src={authorAvatar} alt={`${authorName} avatar`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600" />
              )}
            </div>
            <div>
              <p className="font-semibold text-sm">{authorName}</p>
              <p className="text-xs text-muted-foreground">Just now · 🌐</p>
            </div>
          </div>
          <MoreHorizontal className="w-5 h-5" />
        </div>

        <p className="mt-3 text-sm whitespace-pre-wrap">{post.content}</p>
      </div>

      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="aspect-video bg-gray-100 dark:bg-gray-800 relative">
          <img src={post.mediaUrls[0]} alt="Post media" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-around text-sm text-muted-foreground">
        <Button variant="ghost" size="sm">
          <ThumbsUp className="w-4 h-4 mr-1" />
          Like
        </Button>
        <Button variant="ghost" size="sm">
          <MessageCircle className="w-4 h-4 mr-1" />
          Comment
        </Button>
        <Button variant="ghost" size="sm">
          <Share2 className="w-4 h-4 mr-1" />
          Share
        </Button>
      </div>
    </div>
  );
}

export function PostPreview({
  post,
  authorName = 'Your Name',
  authorHandle = 'yourhandle',
  authorAvatar,
  onEdit,
  onSchedule,
  onPublish,
  onDelete,
  showActions = true,
  showStats = true,
}: PostPreviewProps) {
  const [selectedPlatform, setSelectedPlatform] = useState(post.platforms[0] || 'twitter');
  const status = post.status || 'draft';
  const StatusIcon = STATUS_CONFIG[status].icon;

  const renderPreview = () => {
    switch (selectedPlatform) {
      case 'twitter':
        return <TwitterPreview post={post} authorName={authorName} authorHandle={authorHandle} authorAvatar={authorAvatar} />;
      case 'instagram':
        return <InstagramPreview post={post} authorName={authorName} authorHandle={authorHandle} authorAvatar={authorAvatar} />;
      case 'linkedin':
        return <LinkedInPreview post={post} authorName={authorName} authorHandle={authorHandle} authorAvatar={authorAvatar} />;
      case 'facebook':
        return <FacebookPreview post={post} authorName={authorName} authorAvatar={authorAvatar} />;
      default:
        return <TwitterPreview post={post} authorName={authorName} authorHandle={authorHandle} authorAvatar={authorAvatar} />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Post Preview</CardTitle>
          <Badge
            variant="outline"
            className={STATUS_CONFIG[status].color}
          >
            <StatusIcon className={`w-3 h-3 mr-1 ${status === 'publishing' ? 'animate-spin' : ''}`} />
            {STATUS_CONFIG[status].label}
          </Badge>
        </div>
        {post.statusMessage && (
          <p className="text-sm text-muted-foreground">{post.statusMessage}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {post.platforms.length > 1 && (
          <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <TabsList className="w-full grid" style={{ gridTemplateColumns: `repeat(${post.platforms.length}, 1fr)` }}>
              {post.platforms.map((platform) => {
                const config = PLATFORM_CONFIG[platform];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <TabsTrigger key={platform} value={platform} className="gap-1">
                    <Icon className="w-4 h-4" style={{ color: config.color }} />
                    <span className="hidden sm:inline">{config.name}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        <ScrollArea className="max-h-[500px]">
          <div className="flex justify-center py-4">
            {renderPreview()}
          </div>
        </ScrollArea>

        {showStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
            <div className="text-center">
              <p className="text-lg font-semibold">{post.content.length}</p>
              <p className="text-xs text-muted-foreground">Characters</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{post.hashtags?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Hashtags</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{post.mediaUrls?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Media</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">{post.platforms.length}</p>
              <p className="text-xs text-muted-foreground">Platforms</p>
            </div>
          </div>
        )}

        {post.estimatedReach && (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <Eye className="w-5 h-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium">Estimated Reach</p>
              <p className="text-xs text-muted-foreground">
                ~{post.estimatedReach.toLocaleString()} people
              </p>
            </div>
          </div>
        )}

        {post.optimalTime && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <Clock className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium">Best Time to Post</p>
              <p className="text-xs text-muted-foreground">{post.optimalTime}</p>
            </div>
          </div>
        )}

        {showActions && (
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit
              </Button>
            )}
            {onSchedule && status === 'draft' && (
              <Button variant="outline" size="sm" onClick={onSchedule}>
                <Calendar className="w-4 h-4 mr-1" />
                Schedule
              </Button>
            )}
            {onPublish && (status === 'draft' || status === 'scheduled') && (
              <Button size="sm" onClick={onPublish}>
                <Send className="w-4 h-4 mr-1" />
                Publish Now
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-red-500 ml-auto" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PostPreview;
