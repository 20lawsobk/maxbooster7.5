import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import {
  Music,
  Upload,
  Globe,
  Share2,
  Megaphone,
  BarChart3,
  Sparkles,
  X,
  ArrowRight,
  Lightbulb,
  TrendingUp,
} from 'lucide-react';

const iconMap = {
  Music,
  Upload,
  Globe,
  Share2,
  Megaphone,
  BarChart3,
  Sparkles,
  TrendingUp,
};

interface NextActionRecommendation {
  action:
    | 'create_project'
    | 'add_tracks'
    | 'distribute'
    | 'promote_social'
    | 'launch_ads'
    | 'check_analytics';
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  reason: string;
  icon: keyof typeof iconMap;
  priority: 'high' | 'medium' | 'low';
}

/**
 * TODO: Add function documentation
 */
export function SmartNextActionWidget() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem('smartNextActionDismissed') === 'true';
  });

  // Check if user is authenticated first
  const { data: authUser } = useQuery({
    queryKey: ['/api/auth/me'],
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry auth check
  });

  const {
    data: recommendation,
    isLoading,
    error,
    refetch,
  } = useQuery<NextActionRecommendation>({
    queryKey: ['/api/dashboard/next-action'],
    enabled: !isDismissed && !!authUser, // Only fetch if not dismissed AND authenticated
    staleTime: 5 * 60 * 1000,
    retry: false, // No automatic retries - user can retry manually if needed
  });

  const trackImpressionMutation = useMutation({
    mutationFn: async (action: string) => {
      try {
        await apiRequest('POST', '/api/analytics/track-event', {
          eventType: 'smart_next_action_view',
          eventData: { action },
        });
      } catch (error: unknown) {
        logger.error('Failed to track impression:', error);
      }
    },
  });

  const trackClickMutation = useMutation({
    mutationFn: async (action: string) => {
      try {
        await apiRequest('POST', '/api/analytics/track-event', {
          eventType: 'smart_next_action_click',
          eventData: { action },
        });
      } catch (error: unknown) {
        logger.error('Failed to track click:', error);
      }
    },
  });

  useEffect(() => {
    if (recommendation && !isDismissed) {
      trackImpressionMutation.mutate(recommendation.action);
    }
  }, [recommendation?.action]);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('smartNextActionDismissed', 'true');
    toast({
      title: 'Widget Dismissed',
      description: 'You can clear browser data to show it again.',
    });
  };

  const handleCTAClick = () => {
    if (recommendation) {
      trackClickMutation.mutate(recommendation.action);
      setLocation(recommendation.ctaLink);
    }
  };

  // Don't render if dismissed or not authenticated
  if (isDismissed || !authUser) {
    return null;
  }

  // Show loading skeleton only when actively fetching
  if (isLoading && authUser) {
    return (
      <Card className="overflow-hidden border-2">
        <CardContent className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Silently return null on error or no data
  // This prevents any rendering issues or loops
  if (error || !recommendation) {
    // Log error for debugging but don't show to user
    if (error) {
      logger.debug('SmartNextActionWidget error:', error);
    }
    return null;
  }

  const Icon = iconMap[recommendation.icon] || Sparkles;
  const priorityColors = {
    high: {
      gradient: 'from-red-500 via-orange-500 to-yellow-500',
      bg: 'bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 dark:from-red-950/20 dark:via-orange-950/20 dark:to-yellow-950/20',
      border: 'border-red-200 dark:border-red-800',
      badge: 'bg-red-100 text-red-800 border-red-300',
      button: 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700',
    },
    medium: {
      gradient: 'from-blue-500 via-purple-500 to-pink-500',
      bg: 'bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20',
      border: 'border-blue-200 dark:border-blue-800',
      badge: 'bg-blue-100 text-blue-800 border-blue-300',
      button:
        'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700',
    },
    low: {
      gradient: 'from-green-500 via-emerald-500 to-teal-500',
      bg: 'bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-green-950/20 dark:via-emerald-950/20 dark:to-teal-950/20',
      border: 'border-green-200 dark:border-green-800',
      badge: 'bg-green-100 text-green-800 border-green-300',
      button:
        'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700',
    },
  };

  const colors = priorityColors[recommendation.priority];

  return (
    <Card
      className={`overflow-hidden border-2 ${colors.border} ${colors.bg} shadow-lg hover:shadow-xl transition-all duration-300`}
      role="region"
      aria-label="Smart next action recommendation"
    >
      <div className="absolute top-0 left-0 right-0 h-1.5">
        <div className={`h-full bg-gradient-to-r ${colors.gradient} animate-pulse`} />
      </div>

      <CardContent className="p-6 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full bg-gradient-to-r ${colors.gradient}`}>
                <Icon className="w-6 h-6 text-white" aria-hidden="true" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                    What's Next?
                  </h3>
                  <Badge
                    className={colors.badge}
                    aria-label={`Priority: ${recommendation.priority}`}
                  >
                    {recommendation.priority === 'high'
                      ? '⚡ High Priority'
                      : recommendation.priority === 'medium'
                        ? '📌 Recommended'
                        : '💡 Suggested'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Your personalized next step</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  {recommendation.title}
                </h4>
                <p className="text-gray-700 dark:text-gray-300">{recommendation.description}</p>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-white/60 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
                <Lightbulb
                  className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Why this matters:
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {recommendation.reason}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleCTAClick}
                className={`${colors.button} text-white font-semibold shadow-md hover:shadow-lg transition-all`}
                size="lg"
                aria-label={`${recommendation.ctaText} - Navigate to ${recommendation.ctaLink}`}
              >
                {recommendation.ctaText}
                <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-gray-900 dark:hover:text-white"
                aria-label="Dismiss this recommendation"
              >
                Don't show again
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-gray-900 dark:hover:text-white -mt-2 -mr-2"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
