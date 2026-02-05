import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Send,
  Loader2,
  Wifi,
  WifiOff,
  Shield,
  Key,
  ExternalLink,
  Copy,
  Share2,
  Calendar,
  Zap,
  Timer,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export type OutcomeStatus = 
  | 'idle'
  | 'loading'
  | 'success'
  | 'error'
  | 'warning'
  | 'pending'
  | 'rate_limited'
  | 'auth_required'
  | 'partial';

export type OutcomeCategory = 
  | 'oauth'
  | 'post'
  | 'content'
  | 'analytics'
  | 'inbox'
  | 'media';

export interface OutcomeDetails {
  status: OutcomeStatus;
  category: OutcomeCategory;
  title: string;
  message: string;
  platformId?: string;
  errorCode?: string;
  retryable?: boolean;
  retryAfter?: number;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  metadata?: Record<string, any>;
}

interface SocialOutcomeHandlerProps {
  outcome: OutcomeDetails | null;
  onDismiss?: () => void;
  showInline?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
}

const STATUS_CONFIG = {
  idle: { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
  loading: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  success: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  warning: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  pending: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  rate_limited: { icon: Timer, color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  auth_required: { icon: Key, color: 'text-purple-500', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  partial: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
};

export function SocialOutcomeHandler({
  outcome,
  onDismiss,
  showInline = false,
  autoHide = false,
  autoHideDelay = 5000,
}: SocialOutcomeHandlerProps) {
  const [isVisible, setIsVisible] = useState(!!outcome);
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (outcome) {
      setIsVisible(true);
      if (autoHide && outcome.status === 'success') {
        const timer = setTimeout(() => {
          setIsVisible(false);
          onDismiss?.();
        }, autoHideDelay);
        return () => clearTimeout(timer);
      }
    }
  }, [outcome, autoHide, autoHideDelay, onDismiss]);

  useEffect(() => {
    if (outcome?.retryAfter) {
      setCountdown(outcome.retryAfter);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [outcome?.retryAfter]);

  if (!outcome || !isVisible) return null;

  const config = STATUS_CONFIG[outcome.status];
  const StatusIcon = config.icon;

  if (showInline) {
    return (
      <Alert className={`${config.bg} border-0`}>
        <StatusIcon className={`h-4 w-4 ${config.color} ${outcome.status === 'loading' ? 'animate-spin' : ''}`} />
        <AlertTitle className="font-medium">{outcome.title}</AlertTitle>
        <AlertDescription className="text-sm text-muted-foreground">
          {outcome.message}
          {countdown !== null && (
            <span className="ml-2 font-mono text-xs">
              Retry in {countdown}s
            </span>
          )}
        </AlertDescription>
        <div className="flex gap-2 mt-3">
          {outcome.actionLabel && outcome.onAction && (
            <Button size="sm" onClick={outcome.onAction} disabled={countdown !== null}>
              {outcome.actionLabel}
            </Button>
          )}
          {outcome.secondaryActionLabel && outcome.onSecondaryAction && (
            <Button size="sm" variant="outline" onClick={outcome.onSecondaryAction}>
              {outcome.secondaryActionLabel}
            </Button>
          )}
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={() => {
              setIsVisible(false);
              onDismiss();
            }}>
              Dismiss
            </Button>
          )}
        </div>
      </Alert>
    );
  }

  return (
    <Card className={`${config.bg} border-0 shadow-lg`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
            <StatusIcon className={`w-5 h-5 ${config.color} ${outcome.status === 'loading' ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{outcome.title}</h4>
            <p className="text-sm text-muted-foreground">{outcome.message}</p>
            {outcome.errorCode && (
              <Badge variant="outline" className="mt-2 text-xs font-mono">
                Error: {outcome.errorCode}
              </Badge>
            )}
            {countdown !== null && (
              <div className="mt-2">
                <Progress value={(countdown / (outcome.retryAfter || 60)) * 100} className="h-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Retry available in {countdown} seconds
                </p>
              </div>
            )}
            <div className="flex gap-2 mt-3">
              {outcome.actionLabel && outcome.onAction && (
                <Button size="sm" onClick={outcome.onAction} disabled={countdown !== null}>
                  {outcome.actionLabel}
                </Button>
              )}
              {outcome.secondaryActionLabel && outcome.onSecondaryAction && (
                <Button size="sm" variant="outline" onClick={outcome.onSecondaryAction}>
                  {outcome.secondaryActionLabel}
                </Button>
              )}
            </div>
          </div>
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => {
                setIsVisible(false);
                onDismiss();
              }}
            >
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function useOutcomeHandler() {
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<OutcomeDetails | null>(null);

  const showOutcome = useCallback((details: OutcomeDetails) => {
    setOutcome(details);
    
    if (details.status === 'success') {
      toast({
        title: details.title,
        description: details.message,
      });
    } else if (details.status === 'error') {
      toast({
        title: details.title,
        description: details.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const clearOutcome = useCallback(() => {
    setOutcome(null);
  }, []);

  const handleOAuthSuccess = useCallback((platform: string, username?: string) => {
    showOutcome({
      status: 'success',
      category: 'oauth',
      title: 'Platform Connected',
      message: `Successfully connected to ${platform}${username ? ` as @${username}` : ''}. You can now post and view analytics.`,
      platformId: platform,
      metadata: { username },
    });
  }, [showOutcome]);

  const handleOAuthDenied = useCallback((platform: string) => {
    showOutcome({
      status: 'warning',
      category: 'oauth',
      title: 'Connection Cancelled',
      message: `You cancelled the connection to ${platform}. Click below to try again when ready.`,
      platformId: platform,
      retryable: true,
      actionLabel: 'Try Again',
    });
  }, [showOutcome]);

  const handleOAuthExpired = useCallback((platform: string, onReauth: () => void) => {
    showOutcome({
      status: 'auth_required',
      category: 'oauth',
      title: 'Session Expired',
      message: `Your ${platform} connection has expired. Please reconnect to continue posting.`,
      platformId: platform,
      retryable: true,
      actionLabel: 'Reconnect',
      onAction: onReauth,
    });
  }, [showOutcome]);

  const handlePlatformUnavailable = useCallback((platform: string, retryAfter?: number) => {
    showOutcome({
      status: 'error',
      category: 'oauth',
      title: 'Platform Unavailable',
      message: `${platform} is temporarily unavailable. Please try again later.`,
      platformId: platform,
      retryable: true,
      retryAfter: retryAfter || 60,
      actionLabel: 'Retry',
    });
  }, [showOutcome]);

  const handlePostScheduled = useCallback((scheduledTime: string, platforms: string[]) => {
    showOutcome({
      status: 'success',
      category: 'post',
      title: 'Post Scheduled',
      message: `Your post will be published to ${platforms.join(', ')} on ${scheduledTime}.`,
      metadata: { scheduledTime, platforms },
      actionLabel: 'View Calendar',
    });
  }, [showOutcome]);

  const handlePostPublished = useCallback((platforms: string[], postUrls?: Record<string, string>) => {
    showOutcome({
      status: 'success',
      category: 'post',
      title: 'Post Published!',
      message: `Successfully published to ${platforms.join(', ')}.`,
      metadata: { platforms, postUrls },
      actionLabel: postUrls ? 'View Posts' : undefined,
    });
  }, [showOutcome]);

  const handlePostFailed = useCallback((platform: string, errorMessage: string, errorCode?: string) => {
    showOutcome({
      status: 'error',
      category: 'post',
      title: 'Post Failed',
      message: `Failed to post to ${platform}: ${errorMessage}`,
      platformId: platform,
      errorCode,
      retryable: true,
      actionLabel: 'Retry',
    });
  }, [showOutcome]);

  const handleMediaUploadFailed = useCallback((reason: string, maxSize?: string, supportedFormats?: string[]) => {
    let message = `Media upload failed: ${reason}`;
    if (maxSize) message += ` Maximum file size: ${maxSize}.`;
    if (supportedFormats) message += ` Supported formats: ${supportedFormats.join(', ')}.`;
    
    showOutcome({
      status: 'error',
      category: 'media',
      title: 'Upload Failed',
      message,
      retryable: true,
      actionLabel: 'Try Different File',
    });
  }, [showOutcome]);

  const handleRateLimited = useCallback((platform: string, retryAfter: number) => {
    showOutcome({
      status: 'rate_limited',
      category: 'post',
      title: 'Rate Limit Reached',
      message: `You've reached the posting limit for ${platform}. Please wait before posting again.`,
      platformId: platform,
      retryAfter,
      retryable: true,
      actionLabel: 'Retry',
    });
  }, [showOutcome]);

  const handleContentGenerated = useCallback((variationsCount: number, hasHashtags: boolean, optimalTime?: string) => {
    let message = `Generated ${variationsCount} content variation${variationsCount > 1 ? 's' : ''}.`;
    if (hasHashtags) message += ' Hashtag suggestions included.';
    if (optimalTime) message += ` Best posting time: ${optimalTime}.`;
    
    showOutcome({
      status: 'success',
      category: 'content',
      title: 'Content Generated',
      message,
      metadata: { variationsCount, hasHashtags, optimalTime },
    });
  }, [showOutcome]);

  const handleContentGenerationFailed = useCallback((reason: string, onUseFallback?: () => void) => {
    showOutcome({
      status: 'error',
      category: 'content',
      title: 'Generation Failed',
      message: reason,
      retryable: true,
      actionLabel: 'Retry',
      secondaryActionLabel: onUseFallback ? 'Use Template' : undefined,
      onSecondaryAction: onUseFallback,
    });
  }, [showOutcome]);

  const handleAnalyticsLoaded = useCallback((metricsCount: number, period: string) => {
    showOutcome({
      status: 'success',
      category: 'analytics',
      title: 'Analytics Updated',
      message: `Loaded ${metricsCount} metrics for ${period}.`,
      metadata: { metricsCount, period },
    });
  }, [showOutcome]);

  const handleNoAnalyticsData = useCallback((platform: string) => {
    showOutcome({
      status: 'warning',
      category: 'analytics',
      title: 'No Data Available',
      message: `No analytics data available for ${platform} yet. Data will appear after you start posting.`,
      platformId: platform,
    });
  }, [showOutcome]);

  const handleReplySent = useCallback((platform: string, author: string) => {
    showOutcome({
      status: 'success',
      category: 'inbox',
      title: 'Reply Sent',
      message: `Your reply to @${author} on ${platform} has been sent.`,
      metadata: { platform, author },
    });
  }, [showOutcome]);

  const handleMessageAssigned = useCallback((assigneeName: string) => {
    showOutcome({
      status: 'success',
      category: 'inbox',
      title: 'Message Assigned',
      message: `Message has been assigned to ${assigneeName}.`,
      metadata: { assigneeName },
    });
  }, [showOutcome]);

  return {
    outcome,
    showOutcome,
    clearOutcome,
    handleOAuthSuccess,
    handleOAuthDenied,
    handleOAuthExpired,
    handlePlatformUnavailable,
    handlePostScheduled,
    handlePostPublished,
    handlePostFailed,
    handleMediaUploadFailed,
    handleRateLimited,
    handleContentGenerated,
    handleContentGenerationFailed,
    handleAnalyticsLoaded,
    handleNoAnalyticsData,
    handleReplySent,
    handleMessageAssigned,
  };
}

export default SocialOutcomeHandler;
