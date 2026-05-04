import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
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

interface CalendarPost {
  id: string;
  title?: string;
  scheduledFor?: string;
  scheduledAt?: string;
  platform?: string;
  platforms?: string[];
  postType?: string;
  contentType?: string;
  status?: string;
  content?: string | { caption?: string; text?: string; hashtags?: string[] };
  tags?: string[];
}

interface ContentCalendarViewProps {
  posts: CalendarPost[];
  onDateClick: (date: Date, posts: CalendarPost[]) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

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

const STATUS_DOT: Record<string, string> = {
  published: 'bg-green-500',
  scheduled: 'bg-blue-500',
  draft:     'bg-gray-400',
  failed:    'bg-red-500',
  pending:   'bg-yellow-400',
};

export function ContentCalendarView({
  posts,
  onDateClick,
  selectedIds,
  onToggleSelect,
}: ContentCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const batchMode = !!(selectedIds && onToggleSelect);

  const previousMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  const nextMonth     = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  const today         = () => setCurrentDate(new Date());

  const getPostsForDate = (day: number): CalendarPost[] => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return posts.filter((post) => {
      const rawDate = post.scheduledAt || post.scheduledFor;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return false;
      return d.toISOString().split('T')[0] === dateStr;
    });
  };

  const getContentLabel = (post: CalendarPost): string => {
    if (post.title) return post.title;
    if (typeof post.content === 'object' && post.content !== null) {
      return post.content.caption || post.content.text || 'Untitled';
    }
    if (typeof post.content === 'string') {
      try {
        const p = JSON.parse(post.content);
        return p.text || p.caption || post.content;
      } catch {
        return post.content;
      }
    }
    return 'Untitled';
  };

  const getPlatformList = (post: CalendarPost): string[] => {
    if (Array.isArray(post.platforms) && post.platforms.length > 0) return post.platforms;
    if (post.platform) return [post.platform];
    return [];
  };

  const renderCalendarDays = () => {
    const days = [];
    const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
      const dayNumber = i - firstDayOfMonth + 1;
      const isValidDay = dayNumber > 0 && dayNumber <= daysInMonth;
      const isToday =
        isValidDay &&
        dayNumber === new Date().getDate() &&
        currentDate.getMonth() === new Date().getMonth() &&
        currentDate.getFullYear() === new Date().getFullYear();

      if (isValidDay) {
        const dayPosts = getPostsForDate(dayNumber);
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNumber);
        const anySelected = batchMode && dayPosts.some(p => selectedIds!.has(p.id));
        const allDaySelected = batchMode && dayPosts.length > 0 && dayPosts.every(p => selectedIds!.has(p.id));

        days.push(
          <div
            key={i}
            className={`
              min-h-24 p-2 border
              ${isToday ? 'bg-blue-50 dark:bg-blue-950 border-blue-500' : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'}
              ${anySelected ? 'ring-1 ring-blue-400' : ''}
              transition-colors
            `}
          >
            <div className="flex items-center justify-between mb-1">
              <span className={`text-sm font-medium ${isToday ? 'text-blue-600 dark:text-blue-400' : ''}`}>
                {dayNumber}
              </span>
              {batchMode && dayPosts.length > 1 && (
                <button
                  onClick={e => {
                    e.stopPropagation();
                    dayPosts.forEach(p => {
                      const isChecked = selectedIds!.has(p.id);
                      if (allDaySelected ? isChecked : !isChecked) onToggleSelect!(p.id);
                    });
                  }}
                  className="text-[10px] text-blue-500 hover:underline leading-none"
                >
                  {allDaySelected ? 'Deselect' : 'All'}
                </button>
              )}
            </div>

            {dayPosts.length > 0 && (
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const isSelected = selectedIds?.has(post.id) ?? false;
                  return (
                    <div
                      key={post.id}
                      className={`text-xs p-1 rounded transition-colors cursor-pointer group relative ${
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-700'
                          : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                      onClick={e => {
                        if (batchMode) {
                          e.stopPropagation();
                          onToggleSelect!(post.id);
                        }
                      }}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        {batchMode && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => onToggleSelect!(post.id)}
                            className="h-3 w-3 flex-shrink-0"
                            onClick={e => e.stopPropagation()}
                          />
                        )}
                        {/* Status dot */}
                        <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[post.status ?? ''] ?? 'bg-gray-400'}`} />
                        {getPlatformList(post).slice(0, 2).map((platform) => {
                          const Icon = PLATFORM_ICONS[platform];
                          return Icon ? (
                            <Icon key={platform} size={10} style={{ color: PLATFORM_COLORS[platform] }} />
                          ) : null;
                        })}
                        {getPlatformList(post).length > 2 && (
                          <span className="text-[9px] text-gray-500">+{getPlatformList(post).length - 2}</span>
                        )}
                      </div>
                      <div className="truncate leading-tight">{getContentLabel(post)}</div>
                    </div>
                  );
                })}
                {dayPosts.length > 3 && (
                  <button
                    className="text-[10px] text-gray-500 hover:text-blue-600 text-center w-full"
                    onClick={() => onDateClick(date, dayPosts)}
                  >
                    +{dayPosts.length - 3} more
                  </button>
                )}
                {!batchMode && dayPosts.length <= 3 && (
                  <button
                    className="text-[10px] text-gray-400 hover:text-blue-500 w-full text-center mt-0.5"
                    onClick={() => onDateClick(date, dayPosts)}
                  >
                    View
                  </button>
                )}
              </div>
            )}
          </div>
        );
      } else {
        days.push(
          <div
            key={i}
            className="min-h-24 p-2 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950"
          />
        );
      }
    }

    return days;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Content Calendar
            {batchMode && (
              <Badge variant="outline" className="ml-2 text-xs border-blue-300 text-blue-600">
                Click posts to select
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={today}>Today</Button>
            <Button variant="outline" size="icon" onClick={previousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[150px] text-center font-semibold">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </div>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-0">
          {dayNames.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-sm font-semibold border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
            >
              {day}
            </div>
          ))}
          {renderCalendarDays()}
        </div>

        <div className="mt-4 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Published</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-xs text-gray-600 dark:text-gray-400">Failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
