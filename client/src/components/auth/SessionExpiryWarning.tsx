import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Clock, RefreshCw, LogOut, AlertTriangle } from 'lucide-react';

export type SessionOutcome =
  | 'session_valid'
  | 'session_extended'
  | 'session_expired'
  | 'session_invalidated'
  | 'auto_logout';

interface SessionStatus {
  valid: boolean;
  expiresAt: string | null;
  secondsRemaining: number | null;
  concurrentSessions: number;
  outcome: string;
}

interface SessionExpiryWarningProps {
  warningThresholdSeconds?: number;
  criticalThresholdSeconds?: number;
  onSessionExpired?: () => void;
  onSessionExtended?: (newExpiresAt: string) => void;
  autoLogoutOnExpiry?: boolean;
}

export function SessionExpiryWarning({
  warningThresholdSeconds = 300,
  criticalThresholdSeconds = 60,
  onSessionExpired,
  onSessionExtended,
  autoLogoutOnExpiry = true,
}: SessionExpiryWarningProps) {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const { data: sessionStatus, refetch } = useQuery<SessionStatus>({
    queryKey: ['/api/auth/session-status'],
    enabled: !!user,
    refetchInterval: 30000,
    retry: false,
  });

  const extendSessionMutation = useMutation({
    mutationFn: async (extendMinutes: number = 30) => {
      const response = await apiRequest('POST', '/api/auth/extend-session', { extendMinutes });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setShowWarning(false);
        setCountdown(null);
        onSessionExtended?.(data.expiresAt);
        toast({
          title: 'Session Extended',
          description: `Your session has been extended by ${data.extendedMinutes} minutes.`,
        });
        refetch();
      }
    },
    onError: () => {
      toast({
        title: 'Failed to Extend Session',
        description: 'Please try again or log in again.',
        variant: 'destructive',
      });
    },
  });

  const handleLogout = useCallback(async () => {
    setShowWarning(false);
    await logout();
    onSessionExpired?.();
  }, [logout, onSessionExpired]);

  const handleExtendSession = useCallback(() => {
    extendSessionMutation.mutate(30);
  }, [extendSessionMutation]);

  useEffect(() => {
    if (!sessionStatus || !user) return;

    const remaining = sessionStatus.secondsRemaining;
    if (remaining === null) return;

    if (remaining <= 0) {
      if (autoLogoutOnExpiry) {
        handleLogout();
      } else {
        onSessionExpired?.();
      }
      return;
    }

    if (remaining <= warningThresholdSeconds && !showWarning) {
      setShowWarning(true);
      setCountdown(remaining);
    }
  }, [sessionStatus, user, warningThresholdSeconds, autoLogoutOnExpiry, handleLogout, onSessionExpired, showWarning]);

  useEffect(() => {
    if (!showWarning || countdown === null) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          if (autoLogoutOnExpiry) {
            handleLogout();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showWarning, autoLogoutOnExpiry, handleLogout]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isCritical = countdown !== null && countdown <= criticalThresholdSeconds;
  const progressValue = countdown !== null 
    ? (countdown / warningThresholdSeconds) * 100 
    : 100;

  if (!user || !showWarning) return null;

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isCritical ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Clock className="h-5 w-5 text-orange-500" />
            )}
            Session Expiring Soon
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              Your session will expire in{' '}
              <span className={`font-bold ${isCritical ? 'text-red-500' : 'text-orange-500'}`}>
                {countdown !== null ? formatTime(countdown) : '---'}
              </span>
            </p>
            <Progress 
              value={progressValue} 
              className={`h-2 ${isCritical ? '[&>div]:bg-red-500' : '[&>div]:bg-orange-500'}`}
            />
            <p className="text-sm text-muted-foreground">
              Would you like to extend your session to continue working?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel asChild>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Log Out
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button 
              onClick={handleExtendSession} 
              disabled={extendSessionMutation.isPending}
              className="gap-2"
            >
              {extendSessionMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Extend Session
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default SessionExpiryWarning;
