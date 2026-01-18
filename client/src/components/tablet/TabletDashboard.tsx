import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAdaptiveLayout, getGridColumns } from '@/hooks/useAdaptiveLayout';
import { triggerHapticFeedback } from '@/hooks/useTouchGestures';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Music,
  Upload,
  Radio,
  Plus,
  TrendingUp,
  DollarSign,
  Users,
  ChevronRight,
  Sparkles,
  BarChart3,
  Play,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react';

interface TabletDashboardProps {
  user: any;
}

interface Widget {
  id: string;
  type: 'stats' | 'projects' | 'quickActions' | 'aiInsights' | 'goals' | 'chart';
  title: string;
  size: 'small' | 'medium' | 'large';
}

interface MetricData {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}

function DraggableWidget({
  widget,
  children,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  widget: Widget;
  children: React.ReactNode;
  isDragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        'relative transition-all duration-200',
        isDragging && 'opacity-50 scale-95',
        widget.size === 'large' && 'col-span-2',
        widget.size === 'medium' && 'col-span-1'
      )}
      draggable
      onDragStart={() => {
        triggerHapticFeedback('medium');
        onDragStart(widget.id);
      }}
      onDragEnd={() => {
        triggerHapticFeedback('light');
        onDragEnd();
      }}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setIsHovered(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (
        <div className="absolute top-2 right-2 z-10 flex gap-1">
          <button
            className="p-1.5 rounded-md bg-background/80 backdrop-blur-sm border shadow-sm touch-manipulation"
            onTouchStart={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            className="p-1.5 rounded-md bg-background/80 backdrop-blur-sm border shadow-sm touch-manipulation"
            onTouchStart={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricData }) {
  return (
    <div className={cn('p-4 rounded-xl border', metric.bgColor)}>
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', metric.color)}>
        <metric.icon className="w-5 h-5 text-white" />
      </div>
      <p className="text-xs text-muted-foreground mb-1">{metric.title}</p>
      <p className="text-xl font-bold">{metric.value}</p>
      {metric.change && (
        <p className={cn(
          'text-xs flex items-center gap-1 mt-1',
          metric.change.startsWith('+') ? 'text-green-600' : 'text-red-600'
        )}>
          <TrendingUp className="w-3 h-3" />
          {metric.change}
        </p>
      )}
    </div>
  );
}

function QuickActionPanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const actions = [
    { icon: Upload, label: 'Upload', path: '/studio', color: 'bg-blue-500' },
    { icon: Plus, label: 'Create', path: '/projects', color: 'bg-purple-500' },
    { icon: Radio, label: 'Distribute', path: '/distribution', color: 'bg-green-500' },
    { icon: BarChart3, label: 'Analytics', path: '/analytics', color: 'bg-orange-500' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                onNavigate(action.path);
              }}
              className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-colors touch-manipulation active:scale-95"
            >
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', action.color)}>
                <action.icon className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function TabletDashboard({ user }: TabletDashboardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { layoutMode, columns, orientation } = useAdaptiveLayout();
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null);

  const [widgets, setWidgets] = useState<Widget[]>([
    { id: 'quickActions', type: 'quickActions', title: 'Quick Actions', size: 'large' },
    { id: 'stats', type: 'stats', title: 'Statistics', size: 'large' },
    { id: 'projects', type: 'projects', title: 'Recent Projects', size: 'medium' },
    { id: 'aiInsights', type: 'aiInsights', title: 'AI Insights', size: 'medium' },
    { id: 'goals', type: 'goals', title: 'Goals Progress', size: 'medium' },
    { id: 'chart', type: 'chart', title: 'Performance', size: 'medium' },
  ]);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['/api/dashboard/comprehensive'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['/api/projects'],
    staleTime: 5 * 60 * 1000,
  });

  const stats = (dashboardData as any)?.stats || {
    totalTracks: 0,
    activeDistributions: 0,
    totalRevenue: 0,
    socialReach: 0,
    monthlyGrowth: { tracks: 0, distributions: 0, revenue: 0, socialReach: 0 },
  };

  const projects = ((projectsData as any)?.data || []).slice(0, 6);

  const metrics: MetricData[] = useMemo(() => [
    {
      title: 'Total Tracks',
      value: stats.totalTracks?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.tracks ? `+${stats.monthlyGrowth.tracks}%` : undefined,
      icon: Music,
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    },
    {
      title: 'Distributions',
      value: stats.activeDistributions?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.distributions ? `+${stats.monthlyGrowth.distributions}%` : undefined,
      icon: Radio,
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    },
    {
      title: 'Revenue',
      value: `$${stats.totalRevenue?.toLocaleString() || '0'}`,
      change: stats.monthlyGrowth?.revenue ? `+${stats.monthlyGrowth.revenue}%` : undefined,
      icon: DollarSign,
      color: 'bg-green-500',
      bgColor: 'bg-green-50 dark:bg-green-950/20',
    },
    {
      title: 'Social Reach',
      value: stats.socialReach?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.socialReach ? `+${stats.monthlyGrowth.socialReach}%` : undefined,
      icon: Users,
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    },
  ], [stats]);

  const handleDragStart = useCallback((id: string) => {
    setDraggingWidgetId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingWidgetId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingWidgetId || draggingWidgetId === targetId) return;

    setWidgets((prev) => {
      const dragIndex = prev.findIndex((w) => w.id === draggingWidgetId);
      const targetIndex = prev.findIndex((w) => w.id === targetId);
      if (dragIndex === -1 || targetIndex === -1) return prev;

      const newWidgets = [...prev];
      const [removed] = newWidgets.splice(dragIndex, 1);
      newWidgets.splice(targetIndex, 0, removed);
      return newWidgets;
    });
  }, [draggingWidgetId]);

  const handleNavigate = useCallback((path: string) => {
    setLocation(path);
  }, [setLocation]);

  const renderWidget = (widget: Widget) => {
    const isDragging = draggingWidgetId === widget.id;

    switch (widget.type) {
      case 'quickActions':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div onDragOver={(e) => handleDragOver(e, widget.id)}>
              <QuickActionPanel onNavigate={handleNavigate} />
            </div>
          </DraggableWidget>
        );

      case 'stats':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Card onDragOver={(e) => handleDragOver(e, widget.id)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-24 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {metrics.map((metric) => (
                      <MetricCard key={metric.title} metric={metric} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </DraggableWidget>
        );

      case 'projects':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Card onDragOver={(e) => handleDragOver(e, widget.id)}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent Projects</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleNavigate('/projects')}
                    className="text-xs"
                  >
                    View All
                    <ChevronRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {projects.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <Music className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No projects yet</p>
                    </div>
                  ) : (
                    projects.slice(0, 4).map((project: any) => (
                      <div
                        key={project.id}
                        onClick={() => {
                          triggerHapticFeedback('light');
                          handleNavigate(`/studio/${project.id}`);
                        }}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer touch-manipulation active:scale-[0.98]"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <Play className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{project.title}</p>
                          <p className="text-xs text-muted-foreground">{project.genre || 'No genre'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </DraggableWidget>
        );

      case 'aiInsights':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Card
              className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800"
              onDragOver={(e) => handleDragOver(e, widget.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <CardTitle className="text-base">AI Insights</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-white/50 dark:bg-black/20">
                    <p className="text-sm font-medium mb-1">Career Tip</p>
                    <p className="text-xs text-muted-foreground">
                      Your engagement peaks on Fridays. Consider releasing new content then for maximum impact!
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/50 dark:bg-black/20">
                    <p className="text-sm font-medium mb-1">Trending Sound</p>
                    <p className="text-xs text-muted-foreground">
                      Lo-fi beats are trending in your genre. Try incorporating them into your next track.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </DraggableWidget>
        );

      case 'goals':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Card onDragOver={(e) => handleDragOver(e, widget.id)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Goals Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Monthly Streams</span>
                      <span className="text-muted-foreground">750K / 1M</span>
                    </div>
                    <Progress value={75} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>New Followers</span>
                      <span className="text-muted-foreground">2.3K / 5K</span>
                    </div>
                    <Progress value={46} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Revenue Target</span>
                      <span className="text-muted-foreground">$850 / $1,000</span>
                    </div>
                    <Progress value={85} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </DraggableWidget>
        );

      case 'chart':
        return (
          <DraggableWidget
            key={widget.id}
            widget={widget}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <Card onDragOver={(e) => handleDragOver(e, widget.id)}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-32 flex items-end justify-around gap-2">
                  {[65, 45, 80, 55, 90, 70, 85].map((height, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/20 rounded-t-sm transition-all hover:bg-primary/40"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </CardContent>
            </Card>
          </DraggableWidget>
        );

      default:
        return null;
    }
  };

  const gridClass = orientation === 'landscape' ? 'grid-cols-3' : 'grid-cols-2';

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">
            Welcome back, {user?.username || 'Artist'}!
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's your music career overview
          </p>
        </div>
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Sparkles className="w-3 h-3 mr-1" />
          AI Active
        </Badge>
      </div>

      <div className={cn('grid gap-4', gridClass)}>
        {widgets.map(renderWidget)}
      </div>
    </div>
  );
}
