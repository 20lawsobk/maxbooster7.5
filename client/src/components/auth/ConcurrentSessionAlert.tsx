import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Monitor,
  Users,
  AlertTriangle,
  X,
  LogOut,
  Shield,
  Loader2,
} from "lucide-react";

export type ConcurrentSessionOutcome =
  | "concurrent_session_detected"
  | "max_sessions_exceeded"
  | "sessions_managed"
  | "alert_dismissed";

interface SessionStatus {
  valid: boolean;
  expiresAt: string | null;
  secondsRemaining: number | null;
  concurrentSessions: number;
  outcome: string;
}

interface ConcurrentSessionAlertProps {
  maxSessions?: number;
  showWarningAt?: number;
  onManageSessions?: () => void;
  onLogoutOther?: () => Promise<void>;
  dismissible?: boolean;
  position?: "top" | "bottom" | "floating";
}

export function ConcurrentSessionAlert({
  maxSessions = 5,
  showWarningAt = 2,
  onManageSessions,
  onLogoutOther,
  dismissible = true,
  position = "top",
}: ConcurrentSessionAlertProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { data: sessionStatus, refetch } = useQuery<SessionStatus>({
    queryKey: ["/api/auth/session-status"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const sessionCount = sessionStatus?.concurrentSessions || 1;
  const isAtMax = sessionCount >= maxSessions;
  const showWarning = sessionCount >= showWarningAt && !dismissed;

  const handleLogoutOther = async () => {
    setIsLoggingOut(true);
    try {
      if (onLogoutOther) {
        await onLogoutOther();
      } else {
        const response = await apiRequest("DELETE", "/api/auth/sessions/other");
        const data = await response.json();
        if (data.success) {
          toast({
            title: "Sessions Logged Out",
            description: `${data.terminatedCount} other session(s) have been terminated.`,
          });
          refetch();
        }
      }
      setShowDetails(false);
    } catch (error) {
      toast({
        title: "Failed to Logout Sessions",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  useEffect(() => {
    if (sessionCount < showWarningAt) {
      setDismissed(false);
    }
  }, [sessionCount, showWarningAt]);

  if (!user || !showWarning) return null;

  const positionClasses = {
    top: "fixed top-0 left-0 right-0 z-50",
    bottom: "fixed bottom-0 left-0 right-0 z-50",
    floating: "fixed top-4 right-4 z-50 max-w-md",
  };

  return (
    <>
      <div className={positionClasses[position]}>
        <Alert
          variant={isAtMax ? "destructive" : "default"}
          className={`rounded-none border-x-0 ${position === "floating" ? "rounded-lg border shadow-lg" : ""} ${isAtMax ? "bg-red-50 dark:bg-red-950" : "bg-orange-50 dark:bg-orange-950"}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isAtMax ? (
                <AlertTriangle className="h-5 w-5 text-red-500" />
              ) : (
                <Users className="h-5 w-5 text-orange-500" />
              )}
              <div>
                <AlertTitle className="text-sm font-medium">
                  {isAtMax
                    ? "Maximum Sessions Reached"
                    : "Multiple Sessions Detected"}
                </AlertTitle>
                <AlertDescription className="text-sm">
                  {isAtMax ? (
                    <>
                      You have {sessionCount} active sessions. You&apos;ve
                      reached the maximum of {maxSessions}.
                    </>
                  ) : (
                    <>
                      Your account is currently logged in on {sessionCount}{" "}
                      devices.
                    </>
                  )}
                </AlertDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                <Monitor className="h-3 w-3 mr-1" />
                {sessionCount}/{maxSessions}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(true)}
              >
                Manage
              </Button>
              {dismissible && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Alert>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Concurrent Sessions
            </DialogTitle>
            <DialogDescription>
              You are currently logged in on {sessionCount} device(s).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div
              className={`p-4 rounded-lg ${isAtMax ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900" : "bg-muted"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">Active Sessions</span>
                <Badge variant={isAtMax ? "destructive" : "secondary"}>
                  {sessionCount} / {maxSessions}
                </Badge>
              </div>
              {isAtMax && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                  You&apos;ve reached the maximum number of concurrent sessions.
                  Log out other devices to continue.
                </p>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                For security, we recommend logging out of devices you&apos;re
                not actively using.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowDetails(false);
                onManageSessions?.();
              }}
            >
              <Monitor className="h-4 w-4 mr-2" />
              View All Devices
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogoutOther}
              disabled={isLoggingOut || sessionCount <= 1}
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Log Out Other Devices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function useConcurrentSessions() {
  const { user } = useAuth();

  const { data, refetch } = useQuery<SessionStatus>({
    queryKey: ["/api/auth/session-status"],
    enabled: !!user,
  });

  return {
    sessionCount: data.concurrentSessions || 1,
    isValid: data.valid ?? true,
    expiresAt: data.expiresAt,
    refetch,
  };
}

export default ConcurrentSessionAlert;
