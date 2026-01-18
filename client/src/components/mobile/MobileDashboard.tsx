import { useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { usePullToRefresh, triggerHapticFeedback } from '@/hooks/useTouchGestures';
import { cn } from '@/lib/utils';
import {
  Music,
  Upload,
  Radio,
  Plus,
  TrendingUp,
  DollarSign,
  Play,
  Users,
  ChevronDown,
  RefreshCw,
  Sparkles,
  BarChart3,
} from 'lucide-react';
import type { User } from '@shared/schema';

interface MobileDashboardProps {
  user: User;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

function MetricCard({ title, value, change, icon: Icon, color }: MetricCardProps) {
  return (
    <div className="flex-shrink-0 w-[140px] bg-card border rounded-xl p-3 snap-start">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', color)}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <p className="text-xs text-muted-foreground truncate">{title}</p>
      <p className="text-lg font-bold truncate">{value}</p>
      {change && (
        <p className={cn(
          'text-xs flex items-center gap-1',
          change.startsWith('+') ? 'text-green-500' : 'text-red-500'
        )}>
          <TrendingUp className="w-3 h-3" />
          {change}
        </p>
      )}
    </div>
  );
}

interface QuickActionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  color: string;
}

function QuickAction({ icon: Icon, label, onClick, color }: QuickActionProps) {
  const handleClick = () => {
    triggerHapticFeedback('light');
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex flex-col items-center gap-2 p-4 min-w-[80px] min-h-[80px] touch-manipulation active:scale-95 transition-transform"
    >
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', color)}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <span className="text-xs font-medium text-center">{label}</span>
    </button>
  );
}

interface MobileSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  action?: React.ReactNode;
}

function MobileSection({ title, children, defaultOpen = true, action }: MobileSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => {
    setIsOpen(!isOpen);
    triggerHapticFeedback('light');
  };

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between py-2 px-1 touch-manipulation active:opacity-70 transition-opacity"
      >
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </button>
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          isOpen ? 'max-h-[2000px] opacity-100 mt-2' : 'max-h-0 opacity-0'
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function MobileDashboard({ user }: MobileDashboardProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ['/api/dashboard/comprehensive'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['/api/projects'],
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = useCallback(async () => {
    triggerHapticFeedback('medium');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/comprehensive'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] }),
    ]);
  }, [queryClient]);

  const { isPulling, pullDistance, isRefreshing, progress } = usePullToRefresh(containerRef, {
    threshold: 80,
    onRefresh: handleRefresh,
  });

  const stats = (dashboardData as any)?.stats || {
    totalTracks: 0,
    activeDistributions: 0,
    totalRevenue: 0,
    socialReach: 0,
    monthlyGrowth: { tracks: 0, distributions: 0, revenue: 0, socialReach: 0 },
  };

  const projects = ((projectsData as any)?.data || []).slice(0, 5);

  const metrics: MetricCardProps[] = [
    {
      title: 'Total Tracks',
      value: stats.totalTracks?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.tracks ? `+${stats.monthlyGrowth.tracks}%` : undefined,
      icon: Music,
      color: 'bg-blue-500',
    },
    {
      title: 'Distributions',
      value: stats.activeDistributions?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.distributions ? `+${stats.monthlyGrowth.distributions}%` : undefined,
      icon: Radio,
      color: 'bg-purple-500',
    },
    {
      title: 'Revenue',
      value: `$${stats.totalRevenue?.toLocaleString() || '0'}`,
      change: stats.monthlyGrowth?.revenue ? `+${stats.monthlyGrowth.revenue}%` : undefined,
      icon: DollarSign,
      color: 'bg-green-500',
    },
    {
      title: 'Social Reach',
      value: stats.socialReach?.toLocaleString() || '0',
      change: stats.monthlyGrowth?.socialReach ? `+${stats.monthlyGrowth.socialReach}%` : undefined,
      icon: Users,
      color: 'bg-orange-500',
    },
  ];

  const quickActions: QuickActionProps[] = [
    {
      icon: Upload,
      label: 'Upload',
      onClick: () => setLocation('/studio'),
      color: 'bg-blue-500',
    },
    {
      icon: Plus,
      label: 'Create',
      onClick: () => setLocation('/projects'),
      color: 'bg-purple-500',
    },
    {
      icon: Radio,
      label: 'Distribute',
      onClick: () => setLocation('/distribution'),
      color: 'bg-green-500',
    },
    {
      icon: BarChart3,
      label: 'Analytics',
      onClick: () => setLocation('/analytics'),
      color: 'bg-orange-500',
    },
  ];

  return (
    <div
      ref={containerRef}
      className="min-h-full bg-background overflow-y-auto overscroll-contain"
    >
      {(isPulling || isRefreshing) && (
        <div
          className="flex items-center justify-center py-4 transition-all"
          style={{ height: pullDistance }}
        >
          <RefreshCw
            className={cn(
              'w-6 h-6 text-primary transition-transform',
              isRefreshing && 'animate-spin'
            )}
            style={{ transform: `rotate(${progress * 360}deg)` }}
          />
        </div>
      )}

      <div className="p-4 space-y-6">
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

        <div className="overflow-x-auto -mx-4 px-4 scrollbar-hide">
          <div className="flex gap-3 snap-x snap-mandatory">
            {isLoading
              ? Array(4)
                  .fill(0)
                  .map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-[140px]">
                      <Skeleton className="h-[100px] rounded-xl" />
                    </div>
                  ))
              : metrics.map((metric) => (
                  <MetricCard key={metric.title} {...metric} />
                ))}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex justify-around">
              {quickActions.map((action) => (
                <QuickAction key={action.label} {...action} />
              ))}
            </div>
          </CardContent>
        </Card>

        <MobileSection title="Recent Projects">
          <div className="space-y-2">
            {projects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No projects yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    setLocation('/projects');
                  }}
                >
                  Create Your First Project
                </Button>
              </div>
            ) : (
              projects.map((project: any) => (
                <div
                  key={project.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg touch-manipulation active:bg-muted"
                  onClick={() => {
                    triggerHapticFeedback('light');
                    setLocation(`/studio/${project.id}`);
                  }}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Play className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{project.title}</p>
                    <p className="text-xs text-muted-foreground">{project.genre || 'No genre'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))
            )}
          </div>
        </MobileSection>

        <MobileSection title="AI Insights" defaultOpen={false}>
          <Card className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-1">Career Tip</h4>
                  <p className="text-xs text-muted-foreground">
                    Your engagement peaks on Fridays. Consider releasing new content then for maximum impact!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </MobileSection>

        <MobileSection title="Goals Progress" defaultOpen={false}>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Monthly Streams</span>
                <span className="text-muted-foreground">750K / 1M</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>New Followers</span>
                <span className="text-muted-foreground">2.3K / 5K</span>
              </div>
              <Progress value={46} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Revenue Target</span>
                <span className="text-muted-foreground">$850 / $1,000</span>
              </div>
              <Progress value={85} className="h-2" />
            </div>
          </div>
        </MobileSection>
      </div>
    </div>
  );
}
