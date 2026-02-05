import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiRequest } from '@/lib/queryClient';
import {
  MoreVertical,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  RefreshCw,
  Pin,
  PinOff,
  Sparkles,
  TrendingUp,
  Clock,
  ArrowUp,
  ArrowDown,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type WidgetSize = 'small' | 'medium' | 'large';

export interface SmartWidgetConfig {
  id: string;
  title: string;
  size: WidgetSize;
  position: number;
  visible: boolean;
  pinned: boolean;
  lastViewed?: Date;
  viewCount: number;
  avgViewDuration: number;
  category: string;
  refreshable?: boolean;
  adaptiveContent?: boolean;
}

export interface SmartWidgetProps {
  config: SmartWidgetConfig;
  children: React.ReactNode;
  onSizeChange?: (size: WidgetSize) => void;
  onVisibilityChange?: (visible: boolean) => void;
  onPinChange?: (pinned: boolean) => void;
  onRefresh?: () => void;
  showControls?: boolean;
  draggable?: boolean;
  loading?: boolean;
  className?: string;
  aiEnhanced?: boolean;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  headerActions?: React.ReactNode;
}

const sizeStyles: Record<WidgetSize, string> = {
  small: 'col-span-1',
  medium: 'col-span-2',
  large: 'col-span-3',
};

const containerStyles: Record<WidgetSize, string> = {
  small: '',
  medium: '',
  large: 'lg:col-span-2',
};

export function SmartWidget({
  config,
  children,
  onSizeChange,
  onVisibilityChange,
  onPinChange,
  onRefresh,
  showControls = true,
  draggable = true,
  loading = false,
  className,
  aiEnhanced = false,
  trend,
  trendValue,
  headerActions,
}: SmartWidgetProps) {
  const queryClient = useQueryClient();
  const viewStartRef = useRef<Date | null>(null);
  const intersectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const trackViewMutation = useMutation({
    mutationFn: async (duration: number) => {
      const response = await apiRequest('POST', '/api/personalization/track-widget-view', {
        widgetId: config.id,
        duration,
      });
      return response.json();
    },
  });

  const updateWidgetMutation = useMutation({
    mutationFn: async (updates: Partial<SmartWidgetConfig>) => {
      const response = await apiRequest('PUT', `/api/personalization/widget/${config.id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/personalization/dashboard-layout'] });
    },
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          viewStartRef.current = new Date();
        } else if (viewStartRef.current) {
          const duration = Date.now() - viewStartRef.current.getTime();
          if (duration > 1000) {
            trackViewMutation.mutate(duration);
          }
          viewStartRef.current = null;
          setIsVisible(false);
        }
      },
      { threshold: 0.5 }
    );

    if (intersectionRef.current) {
      observer.observe(intersectionRef.current);
    }

    return () => {
      observer.disconnect();
      if (viewStartRef.current) {
        const duration = Date.now() - viewStartRef.current.getTime();
        if (duration > 1000) {
          trackViewMutation.mutate(duration);
        }
      }
    };
  }, [config.id]);

  const handleSizeChange = useCallback((newSize: WidgetSize) => {
    updateWidgetMutation.mutate({ size: newSize });
    onSizeChange?.(newSize);
  }, [updateWidgetMutation, onSizeChange]);

  const handleVisibilityChange = useCallback(() => {
    const newVisible = !config.visible;
    updateWidgetMutation.mutate({ visible: newVisible });
    onVisibilityChange?.(newVisible);
  }, [config.visible, updateWidgetMutation, onVisibilityChange]);

  const handlePinChange = useCallback(() => {
    const newPinned = !config.pinned;
    updateWidgetMutation.mutate({ pinned: newPinned });
    onPinChange?.(newPinned);
  }, [config.pinned, updateWidgetMutation, onPinChange]);

  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : null;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : '';

  if (!config.visible) {
    return null;
  }

  return (
    <div
      ref={intersectionRef}
      className={cn(
        sizeStyles[config.size],
        containerStyles[config.size],
        'transition-all duration-200',
        className
      )}
    >
      <Card className={cn(
        'h-full',
        config.pinned && 'ring-2 ring-primary/20',
        aiEnhanced && 'border-purple-200 dark:border-purple-800'
      )}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {draggable && (
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-move flex-shrink-0" />
              )}
              <CardTitle className="text-sm truncate">{config.title}</CardTitle>
              {aiEnhanced && (
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI
                </Badge>
              )}
              {config.pinned && (
                <Pin className="h-3 w-3 text-primary flex-shrink-0" />
              )}
            </div>

            <div className="flex items-center gap-2">
              {trend && TrendIcon && (
                <div className={cn("flex items-center text-xs", trendColor)}>
                  <TrendIcon className="h-3 w-3 mr-1" />
                  {trendValue}
                </div>
              )}
              
              {headerActions}

              {showControls && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => handleSizeChange('small')}>
                      <Minimize2 className="h-4 w-4 mr-2" />
                      Small Size
                      {config.size === 'small' && <Badge className="ml-auto">Active</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSizeChange('medium')}>
                      <Maximize2 className="h-4 w-4 mr-2" />
                      Medium Size
                      {config.size === 'medium' && <Badge className="ml-auto">Active</Badge>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSizeChange('large')}>
                      <Maximize2 className="h-4 w-4 mr-2" />
                      Large Size
                      {config.size === 'large' && <Badge className="ml-auto">Active</Badge>}
                    </DropdownMenuItem>
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handlePinChange}>
                      {config.pinned ? (
                        <>
                          <PinOff className="h-4 w-4 mr-2" />
                          Unpin Widget
                        </>
                      ) : (
                        <>
                          <Pin className="h-4 w-4 mr-2" />
                          Pin Widget
                        </>
                      )}
                    </DropdownMenuItem>
                    
                    {config.refreshable && onRefresh && (
                      <DropdownMenuItem onClick={onRefresh}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Data
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={handleVisibilityChange}>
                      <EyeOff className="h-4 w-4 mr-2" />
                      Hide Widget
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          
          {config.avgViewDuration > 0 && showControls && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
              <Clock className="h-3 w-3" />
              {config.viewCount} views • Avg {Math.round(config.avgViewDuration / 1000)}s
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            children
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function SmartWidgetSkeleton({ size = 'medium' }: { size?: WidgetSize }) {
  return (
    <div className={cn(sizeStyles[size], containerStyles[size])}>
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-8 rounded" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export interface SmartWidgetGridProps {
  widgets: SmartWidgetConfig[];
  renderWidget: (config: SmartWidgetConfig) => React.ReactNode;
  columns?: number;
  gap?: number;
}

export function SmartWidgetGrid({
  widgets,
  renderWidget,
  columns = 3,
  gap = 4,
}: SmartWidgetGridProps) {
  const sortedWidgets = [...widgets]
    .filter(w => w.visible)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.position - b.position;
    });

  return (
    <div 
      className={cn(
        'grid',
        `grid-cols-1 md:grid-cols-2 lg:grid-cols-${columns}`,
        `gap-${gap}`
      )}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: `${gap * 4}px`,
      }}
    >
      {sortedWidgets.map((widget) => (
        <React.Fragment key={widget.id}>
          {renderWidget(widget)}
        </React.Fragment>
      ))}
    </div>
  );
}

export default SmartWidget;
