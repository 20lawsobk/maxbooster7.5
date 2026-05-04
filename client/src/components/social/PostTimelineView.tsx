import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Edit,
  Trash2,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
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
import { MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

interface TimelinePost {
  id: string;
  title?: string;
  content?: string | { caption?: string; text?: string; hashtags?: string[] };
  scheduledFor?: string;
  scheduledAt?: string;
  publishedAt?: string | null;
  platform?: string;
  platforms?: string[];
  postType?: string;
  contentType?: string;
  type?: string;
  status?: string;
  hashtags?: string[];
  tags?: string[];
  mentions?: string[];
  location?: string;
}

interface PostTimelineViewProps {
  posts: TimelinePost[];
  onEdit: (post: TimelinePost) => void;
  onDelete: (postId: string) => void;
  onPublish: (postId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
}

const PLATFORM_ICONS: Record<string, any> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  twitter: MessageCircle,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  threads: ThreadsIcon,
  googlebusiness: GoogleIcon,
};

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  twitter: '#000000',
  youtube: '#FF0000',
  tiktok: '#000000',
  linkedin: '#0077B5',
  threads: '#000000',
  googlebusiness: '#4285F4',
};

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  draft: {
    icon: AlertCircle,
    color: 'text-gray-500',
    bg: 'bg-gray-100 dark:bg-gray-800',
    label: 'Draft',
  },
  scheduled: {
    icon: Clock,
    color: 'text-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-900',
    label: 'Scheduled',
  },
  pending: {
    icon: Clock,
    color: 'text-yellow-500',
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    label: 'Pending',
  },
  planned: {
    icon: Clock,
    color: 'text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950',
    label: 'Planned',
  },
  published: {
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-100 dark:bg-green-900',
    label: 'Published',
  },
  failed: {
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-100 dark:bg-red-900',
    label: 'Failed',
  },
};

const DEFAULT_STATUS_CONFIG = {
  icon: AlertCircle,
  color: 'text-gray-500',
  bg: 'bg-gray-100 dark:bg-gray-800',
  label: 'Unknown',
};

function resolveDate(post: TimelinePost): string {
  return post.scheduledAt || post.scheduledFor || '';
}

function resolveContent(post: TimelinePost): { text: string; hashtags: string[] } {
  const raw = post.content;
  if (!raw) return { text: '', hashtags: [] };
  if (typeof raw === 'object') {
    return { text: raw.caption || raw.text || '', hashtags: raw.hashtags || [] };
  }
  try {
    const p = JSON.parse(raw);
    return { text: p.text || p.caption || raw, hashtags: Array.isArray(p.hashtags) ? p.hashtags : [] };
  } catch {
    return { text: raw, hashtags: [] };
  }
}

export function PostTimelineView({
  posts,
  onEdit,
  onDelete,
  onPublish,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: PostTimelineViewProps) {
  const sortedPosts = [...posts].sort((a, b) => {
    const ta = resolveDate(a) ? new Date(resolveDate(a)).getTime() : 0;
    const tb = resolveDate(b) ? new Date(resolveDate(b)).getTime() : 0;
    return ta - tb;
  });

  const batchMode = !!(selectedIds && onToggleSelect);
  const allSelected = batchMode && posts.length > 0 && posts.every(p => selectedIds!.has(p.id));

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return {
        date: format(date, 'MMM dd, yyyy'),
        time: format(date, 'h:mm a'),
      };
    } catch {
      return { date: 'Invalid date', time: '' };
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Scheduled Posts Timeline
          </CardTitle>
          {batchMode && posts.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() => onSelectAll?.()}
                id="select-all-timeline"
              />
              <label
                htmlFor="select-all-timeline"
                className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none"
              >
                Select all
              </label>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {sortedPosts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No scheduled posts yet</p>
            <p className="text-sm mt-2">Create your first scheduled post to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedPosts.map((post) => {
              const statusConfig = STATUS_CONFIG[post.status ?? ''] ?? DEFAULT_STATUS_CONFIG;
              const StatusIcon = statusConfig.icon;
              const dateTime = formatDateTime(resolveDate(post));
              const isSelected = selectedIds?.has(post.id) ?? false;

              const platformList: string[] =
                Array.isArray(post.platforms) && post.platforms.length > 0
                  ? post.platforms
                  : post.platform
                  ? [post.platform]
                  : [];

              const { text: contentText, hashtags: inlineHashtags } = resolveContent(post);

              const hashtags =
                (post.hashtags ?? []).length > 0
                  ? (post.hashtags ?? [])
                  : (post.tags ?? []).length > 0
                  ? (post.tags ?? [])
                  : inlineHashtags;
              const postLabel = post.postType ?? post.contentType ?? post.type ?? 'post';
              const title = post.title ?? (contentText.slice(0, 40) || 'Untitled');

              return (
                <div
                  key={post.id}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-600'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {batchMode && (
                      <div className="pt-1 flex-shrink-0">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleSelect!(post.id)}
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="font-semibold text-lg truncate">{title}</h3>
                            <Badge className={`${statusConfig.bg} ${statusConfig.color} flex-shrink-0`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusConfig.label}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              <span>
                                {dateTime.date} at {dateTime.time}
                              </span>
                            </div>
                            <Badge variant="outline">{postLabel}</Badge>
                          </div>

                          {platformList.length > 0 && (
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              {platformList.map((platform) => {
                                const Icon = PLATFORM_ICONS[platform];
                                return Icon ? (
                                  <div
                                    key={platform}
                                    className="flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                                  >
                                    <Icon size={14} style={{ color: PLATFORM_COLORS[platform] }} />
                                    <span className="capitalize">{platform}</span>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          )}

                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-2 line-clamp-2">
                            {contentText}
                          </p>

                          {hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {hashtags.map((tag, index) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {post.location && (
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <span>📍</span>
                              <span>{post.location}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 ml-4 flex-shrink-0">
                          {(post.status === 'draft' || post.status === 'scheduled' || post.status === 'pending') && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => onEdit(post)}>
                                <Edit className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => onPublish(post.id)}>
                                <Send className="h-4 w-4 mr-1" />
                                Publish Now
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => onDelete(post.id)}>
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </>
                          )}
                          {post.status === 'published' && post.publishedAt && typeof post.publishedAt === 'string' && (
                            <div className="text-xs text-green-600 dark:text-green-400">
                              Published {formatDateTime(post.publishedAt).date}
                            </div>
                          )}
                          {post.status === 'failed' && (
                            <Button size="sm" variant="outline" onClick={() => onPublish(post.id)}>
                              <Send className="h-4 w-4 mr-1" />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
