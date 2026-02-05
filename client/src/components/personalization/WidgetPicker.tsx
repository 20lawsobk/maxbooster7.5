import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  Plus,
  Check,
  Sparkles,
  BarChart3,
  DollarSign,
  Users,
  Upload,
  Music,
  MessageSquare,
  Calendar,
  Bell,
  Shield,
  Settings,
  Target,
  TrendingUp,
  Zap,
  Play,
  Heart,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Widget {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: React.ElementType;
  defaultSize: 'small' | 'medium' | 'large';
  isAI?: boolean;
  isPremium?: boolean;
  tags: string[];
}

interface WidgetPickerProps {
  selectedWidgets: string[];
  onWidgetToggle: (widgetId: string) => void;
  onWidgetAdd?: (widgetId: string) => void;
  maxWidgets?: number;
  showCategories?: boolean;
  compact?: boolean;
}

const categoryIcons: Record<string, React.ElementType> = {
  analytics: BarChart3,
  finance: DollarSign,
  social: Users,
  distribution: Upload,
  content: Music,
  collaboration: Users,
  releases: Play,
  notifications: Bell,
  ai: Sparkles,
  gamification: Star,
  system: Settings,
  legal: Shield,
  discovery: Search,
  actions: Zap,
};

const allWidgets: Widget[] = [
  {
    id: 'streams',
    title: 'Total Streams',
    description: 'Track your streaming numbers across platforms',
    category: 'analytics',
    icon: TrendingUp,
    defaultSize: 'small',
    tags: ['streams', 'plays', 'listening'],
  },
  {
    id: 'revenue',
    title: 'Revenue Overview',
    description: 'Monitor your earnings and payouts',
    category: 'finance',
    icon: DollarSign,
    defaultSize: 'small',
    tags: ['money', 'earnings', 'income'],
  },
  {
    id: 'social-reach',
    title: 'Social Reach',
    description: 'Track followers and engagement across social media',
    category: 'social',
    icon: Users,
    defaultSize: 'small',
    tags: ['followers', 'engagement', 'social media'],
  },
  {
    id: 'quick-actions',
    title: 'Quick Actions',
    description: 'Fast access to common tasks',
    category: 'actions',
    icon: Zap,
    defaultSize: 'medium',
    tags: ['shortcuts', 'actions', 'tasks'],
  },
  {
    id: 'ai-coach',
    title: 'AI Career Coach',
    description: 'Personalized AI guidance for your music career',
    category: 'ai',
    icon: Sparkles,
    defaultSize: 'medium',
    isAI: true,
    tags: ['ai', 'coaching', 'advice'],
  },
  {
    id: 'next-release',
    title: 'Upcoming Releases',
    description: 'Countdown to your next release',
    category: 'releases',
    icon: Play,
    defaultSize: 'medium',
    tags: ['releases', 'countdown', 'launch'],
  },
  {
    id: 'analytics-chart',
    title: 'Analytics Chart',
    description: 'Visual representation of your performance',
    category: 'analytics',
    icon: BarChart3,
    defaultSize: 'large',
    tags: ['charts', 'graphs', 'visualization'],
  },
  {
    id: 'content-calendar',
    title: 'Content Calendar',
    description: 'Plan and schedule your content',
    category: 'content',
    icon: Calendar,
    defaultSize: 'medium',
    tags: ['schedule', 'planning', 'posts'],
  },
  {
    id: 'collaborators',
    title: 'Suggested Collaborators',
    description: 'AI-suggested artists to collaborate with',
    category: 'collaboration',
    icon: Users,
    defaultSize: 'medium',
    isAI: true,
    tags: ['collaboration', 'networking', 'artists'],
  },
  {
    id: 'royalties',
    title: 'Royalties Overview',
    description: 'Track royalty payments and splits',
    category: 'finance',
    icon: DollarSign,
    defaultSize: 'medium',
    tags: ['royalties', 'splits', 'payments'],
  },
  {
    id: 'distribution-status',
    title: 'Distribution Status',
    description: 'Monitor your releases across platforms',
    category: 'distribution',
    icon: Upload,
    defaultSize: 'medium',
    tags: ['distribution', 'platforms', 'status'],
  },
  {
    id: 'audience-insights',
    title: 'Audience Insights',
    description: 'Understand your listener demographics',
    category: 'analytics',
    icon: Target,
    defaultSize: 'medium',
    isAI: true,
    tags: ['audience', 'demographics', 'listeners'],
  },
  {
    id: 'trends',
    title: 'Trending',
    description: 'See what\'s trending in music',
    category: 'discovery',
    icon: TrendingUp,
    defaultSize: 'small',
    tags: ['trends', 'popular', 'charts'],
  },
  {
    id: 'contracts',
    title: 'Active Contracts',
    description: 'Manage your agreements and contracts',
    category: 'legal',
    icon: Shield,
    defaultSize: 'medium',
    tags: ['contracts', 'legal', 'agreements'],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Stay updated on important events',
    category: 'notifications',
    icon: Bell,
    defaultSize: 'small',
    tags: ['alerts', 'updates', 'notifications'],
  },
  {
    id: 'achievements',
    title: 'Achievements',
    description: 'Track your milestones and badges',
    category: 'gamification',
    icon: Star,
    defaultSize: 'small',
    tags: ['achievements', 'badges', 'milestones'],
  },
  {
    id: 'smart-schedule',
    title: 'Smart Schedule',
    description: 'AI-optimized posting times',
    category: 'ai',
    icon: Sparkles,
    defaultSize: 'medium',
    isAI: true,
    isPremium: true,
    tags: ['schedule', 'ai', 'optimization'],
  },
  {
    id: 'fan-engagement',
    title: 'Fan Engagement',
    description: 'Track fan interactions and loyalty',
    category: 'social',
    icon: Heart,
    defaultSize: 'medium',
    tags: ['fans', 'engagement', 'loyalty'],
  },
];

const categories = [
  { id: 'all', label: 'All' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'finance', label: 'Finance' },
  { id: 'social', label: 'Social' },
  { id: 'ai', label: 'AI Powered' },
  { id: 'content', label: 'Content' },
  { id: 'releases', label: 'Releases' },
];

export function WidgetPicker({
  selectedWidgets,
  onWidgetToggle,
  onWidgetAdd,
  maxWidgets = 12,
  showCategories = true,
  compact = false,
}: WidgetPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const filteredWidgets = useMemo(() => {
    return allWidgets.filter((widget) => {
      const matchesSearch =
        widget.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        widget.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        widget.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesCategory =
        activeCategory === 'all' || widget.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  const selectedCount = selectedWidgets.length;
  const canAddMore = selectedCount < maxWidgets;

  const handleToggle = useCallback((widgetId: string) => {
    const isSelected = selectedWidgets.includes(widgetId);
    if (!isSelected && !canAddMore) return;
    onWidgetToggle(widgetId);
  }, [selectedWidgets, canAddMore, onWidgetToggle]);

  const aiWidgets = filteredWidgets.filter((w) => w.isAI);
  const regularWidgets = filteredWidgets.filter((w) => !w.isAI);

  return (
    <div className={cn('space-y-4', compact && 'space-y-2')}>
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search widgets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Badge variant="outline" className="ml-4">
          {selectedCount}/{maxWidgets} selected
        </Badge>
      </div>

      {showCategories && (
        <Tabs value={activeCategory} onValueChange={setActiveCategory}>
          <TabsList className="flex-wrap h-auto gap-1">
            {categories.map((category) => (
              <TabsTrigger key={category.id} value={category.id} className="text-xs">
                {category.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <ScrollArea className={cn('pr-4', compact ? 'h-[300px]' : 'h-[400px]')}>
        {aiWidgets.length > 0 && activeCategory !== 'all' && activeCategory !== 'ai' ? null : (
          aiWidgets.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <span className="text-sm font-medium">AI-Powered Widgets</span>
              </div>
              <div className={cn(
                'grid gap-3',
                compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
              )}>
                {aiWidgets.map((widget) => (
                  <WidgetCard
                    key={widget.id}
                    widget={widget}
                    isSelected={selectedWidgets.includes(widget.id)}
                    onToggle={() => handleToggle(widget.id)}
                    disabled={!selectedWidgets.includes(widget.id) && !canAddMore}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          )
        )}

        <div className={cn(
          'grid gap-3',
          compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
        )}>
          {regularWidgets.map((widget) => (
            <WidgetCard
              key={widget.id}
              widget={widget}
              isSelected={selectedWidgets.includes(widget.id)}
              onToggle={() => handleToggle(widget.id)}
              disabled={!selectedWidgets.includes(widget.id) && !canAddMore}
              compact={compact}
            />
          ))}
        </div>

        {filteredWidgets.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No widgets found matching your search</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface WidgetCardProps {
  widget: Widget;
  isSelected: boolean;
  onToggle: () => void;
  disabled?: boolean;
  compact?: boolean;
}

function WidgetCard({ widget, isSelected, onToggle, disabled, compact }: WidgetCardProps) {
  const Icon = widget.icon;
  const CategoryIcon = categoryIcons[widget.category] || Settings;

  return (
    <div
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-muted hover:border-primary/50',
        disabled && !isSelected && 'opacity-50 cursor-not-allowed',
        widget.isAI && 'border-purple-200 dark:border-purple-800'
      )}
      onClick={() => !disabled && onToggle()}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'p-2 rounded-lg',
          widget.isAI
            ? 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400'
            : 'bg-muted'
        )}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{widget.title}</h4>
            {widget.isAI && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            )}
            {widget.isPremium && (
              <Badge variant="outline" className="text-xs">
                Premium
              </Badge>
            )}
          </div>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {widget.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs">
              <CategoryIcon className="h-3 w-3 mr-1" />
              {widget.category}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {widget.defaultSize}
            </Badge>
          </div>
        </div>

        <Button
          variant={isSelected ? 'default' : 'outline'}
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          disabled={disabled && !isSelected}
        >
          {isSelected ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default WidgetPicker;
