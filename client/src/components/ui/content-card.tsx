import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Heart, MessageCircle, Share2, Eye, Clock } from 'lucide-react';
import { InstagramIcon, TikTokIcon, YouTubeIcon, TwitterIcon, FacebookIcon } from '@/components/ui/brand-icons';

interface ContentCardProps {
  image?: string;
  title?: string;
  description?: string;
  platform: 'instagram' | 'tiktok' | 'youtube' | 'twitter' | 'facebook';
  status?: 'scheduled' | 'published' | 'draft' | 'pending';
  scheduledTime?: string;
  stats?: {
    likes?: number;
    comments?: number;
    shares?: number;
    views?: number;
  };
  className?: string;
  onClick?: () => void;
}

const platformIcons = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  twitter: TwitterIcon,
  facebook: FacebookIcon,
};

const platformColors = {
  instagram: 'from-pink-500 to-purple-500',
  tiktok: 'from-black to-slate-800',
  youtube: 'from-red-500 to-red-600',
  twitter: 'from-blue-400 to-blue-500',
  facebook: 'from-blue-600 to-blue-700',
};

const statusColors = {
  scheduled: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  published: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export function ContentCard({
  image,
  title,
  description,
  platform,
  status = 'draft',
  scheduledTime,
  stats,
  className,
  onClick,
}: ContentCardProps) {
  const PlatformIcon = platformIcons[platform];

  return (
    <Card
      className={cn(
        'group overflow-hidden bg-slate-800/50 border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer hover:shadow-xl hover:shadow-cyan-500/5',
        className
      )}
      onClick={onClick}
    >
      {image && (
        <div className="relative aspect-square overflow-hidden">
          <img
            src={image}
            alt={title || 'Content'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className={cn('border', statusColors[status])}>
              {status}
            </Badge>
          </div>
          <div
            className={cn(
              'absolute bottom-2 left-2 p-2 rounded-lg bg-gradient-to-r',
              platformColors[platform]
            )}
          >
            <PlatformIcon className="h-4 w-4 text-white" />
          </div>
        </div>
      )}
      <CardContent className="p-4 space-y-3">
        {title && (
          <h3 className="font-medium text-white truncate">{title}</h3>
        )}
        {description && (
          <p className="text-sm text-slate-400 line-clamp-2">{description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-slate-500">
            <PlatformIcon className="h-4 w-4" />
            <span className="text-xs capitalize">{platform}</span>
          </div>
          {scheduledTime && (
            <div className="flex items-center gap-1 text-slate-500">
              <Clock className="h-3 w-3" />
              <span className="text-xs">{scheduledTime}</span>
            </div>
          )}
        </div>

        {stats && (
          <div className="flex items-center gap-4 pt-2 border-t border-slate-700/50">
            {stats.likes !== undefined && (
              <div className="flex items-center gap-1 text-slate-400">
                <Heart className="h-3 w-3" />
                <span className="text-xs">{formatNumber(stats.likes)}</span>
              </div>
            )}
            {stats.comments !== undefined && (
              <div className="flex items-center gap-1 text-slate-400">
                <MessageCircle className="h-3 w-3" />
                <span className="text-xs">{formatNumber(stats.comments)}</span>
              </div>
            )}
            {stats.shares !== undefined && (
              <div className="flex items-center gap-1 text-slate-400">
                <Share2 className="h-3 w-3" />
                <span className="text-xs">{formatNumber(stats.shares)}</span>
              </div>
            )}
            {stats.views !== undefined && (
              <div className="flex items-center gap-1 text-slate-400">
                <Eye className="h-3 w-3" />
                <span className="text-xs">{formatNumber(stats.views)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

interface ContentGridProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentGrid({ children, className }: ContentGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}

interface EngagementPanelProps {
  likes: number;
  comments: number;
  reach: number;
  impressions?: number;
  className?: string;
}

export function EngagementPanel({
  likes,
  comments,
  reach,
  impressions,
  className,
}: EngagementPanelProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <h3 className="text-lg font-semibold text-white">Engagement</h3>
      <div className="space-y-3">
        <EngagementStat icon={Heart} label="Likes" value={likes} color="text-red-400" />
        <EngagementStat
          icon={MessageCircle}
          label="Comments"
          value={comments}
          color="text-blue-400"
        />
        <EngagementStat icon={Eye} label="Reach" value={reach} color="text-emerald-400" />
        {impressions && (
          <EngagementStat
            icon={Eye}
            label="Impressions"
            value={impressions}
            color="text-purple-400"
          />
        )}
      </div>
    </div>
  );
}

interface EngagementStatProps {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}

function EngagementStat({ icon: Icon, label, value, color }: EngagementStatProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-5 w-5', color)} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className="font-semibold text-white">{formatNumber(value)}</span>
    </div>
  );
}
