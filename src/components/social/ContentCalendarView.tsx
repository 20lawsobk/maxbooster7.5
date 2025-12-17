import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  title: string;
  scheduledFor: string;
  platforms: string[];
  postType: string;
  status: string;
  content: string;
}

interface ContentCalendarViewProps {
  posts: CalendarPost[];
  onDateClick: (date: Date, posts: CalendarPost[]) => void;
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  twitter: '#000000',
  youtube: '#FF0000',
  tiktok: '#000000',
  linkedin: '#0077B5',
  threads: '#000000',
  'google-business': '#4285F4',
};

const PLATFORM_ICONS: Record<string, any> = {
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  twitter: MessageCircle,
  youtube: YouTubeIcon,
  tiktok: TikTokIcon,
  linkedin: LinkedInIcon,
  threads: ThreadsIcon,
  'google-business': GoogleIcon,
};

/**
 * TODO: Add function documentation
 */
export function ContentCalendarView({ posts, onDateClick }: ContentCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  const getPostsForDate = (day: number): CalendarPost[] => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return posts.filter((post) => {
      const postDate = new Date(post.scheduledFor).toISOString().split('T')[0];
      return postDate === dateStr;
    });
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

        days.push(
          <div
            key={i}
            onClick={() => dayPosts.length > 0 && onDateClick(date, dayPosts)}
            className={`
              min-h-24 p-2 border border-gray-200 dark:border-gray-700
              ${isToday ? 'bg-blue-50 dark:bg-blue-950 border-blue-500' : 'bg-white dark:bg-gray-900'}
              ${dayPosts.length > 0 ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
              transition-colors
            `}
          >
            <div
              className={`text-sm font-medium mb-1 ${isToday ? 'text-blue-600 dark:text-blue-400' : ''}`}
            >
              {dayNumber}
            </div>

            {dayPosts.length > 0 && (
              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    className="text-xs p-1 rounded bg-gray-100 dark:bg-gray-800 truncate"
                  >
                    <div className="flex items-center gap-1 mb-1">
                      {post.platforms.slice(0, 3).map((platform) => {
                        const Icon = PLATFORM_ICONS[platform];
                        return Icon ? (
                          <Icon
                            key={platform}
                            size={10}
                            style={{ color: PLATFORM_COLORS[platform] }}
                          />
                        ) : null;
                      })}
                      {post.platforms.length > 3 && (
                        <span className="text-[10px] text-gray-500">
                          +{post.platforms.length - 3}
                        </span>
                      )}
                    </div>
                    <div className="truncate">{post.title || post.content}</div>
                  </div>
                ))}
                {dayPosts.length > 3 && (
                  <div className="text-[10px] text-gray-500 text-center">
                    +{dayPosts.length - 3} more
                  </div>
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
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={today}>
              Today
            </Button>
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
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Published</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Scheduled</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Draft</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Failed</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
