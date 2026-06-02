import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Shield,
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  LogOut,
  MapPin,
} from "lucide-react";

interface LoginEvent {
  id: string;
  timestamp: string;
  ipAddress: string;
  location?: string;
  device: string;
  browser?: string;
  success: boolean;
  suspicious: boolean;
  reason?: string;
}

interface ActiveSession {
  id: string;
  device: string;
  location: string;
  time: string;
  current: boolean;
  ipAddress?: string;
  browser?: string;
}

function getDeviceIcon(device: string) {
  const deviceLower = device.toLowerCase();
  if (
    deviceLower.includes("mobile") ||
    deviceLower.includes("iphone") ||
    deviceLower.includes("android")
  ) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (deviceLower.includes("tablet") || deviceLower.includes("ipad")) {
    return <Tablet className="h-4 w-4" />;
  }
  return <Monitor className="h-4 w-4" />;
}

function parseUserAgent(userAgent: string): {
  device: string;
  browser: string;
} {
  let device = "Unknown Device";
  let browser = "Unknown Browser";

  if (userAgent.includes("iPhone")) device = "iPhone";
  else if (userAgent.includes("iPad")) device = "iPad";
  else if (userAgent.includes("Android")) device = "Android Device";
  else if (userAgent.includes("Windows")) device = "Windows PC";
  else if (userAgent.includes("Macintosh")) device = "Mac";
  else if (userAgent.includes("Linux")) device = "Linux PC";

  if (userAgent.includes("Chrome")) browser = "Chrome";
  else if (userAgent.includes("Firefox")) browser = "Firefox";
  else if (userAgent.includes("Safari")) browser = "Safari";
  else if (userAgent.includes("Edge")) browser = "Edge";

  return { device, browser };
}

export function LoginHistory() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [terminateAllOpen, setTerminateAllOpen] = useState(false);
  const [terminateSessionOpen, setTerminateSessionOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );

  const { data: loginHistory = [], isLoading: historyLoading } = useQuery<
    LoginEvent[]
  >({
    queryKey: ["/api/auth/login-history"],
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<
    ActiveSession[]
  >({
    queryKey: ["/api/auth/sessions"],
  });

  const terminateSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await apiRequest("POST", "/api/auth/sessions/terminate", { sessionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({
        title: "Session Terminated",
        description: "The device has been logged out successfully.",
      });
      setTerminateSessionOpen(false);
      setSelectedSessionId(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to terminate session. Please try again.",
        variant: "destructive",
      });
    },
  });

  const terminateAllSessionsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/sessions/terminate-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      toast({
        title: "All Sessions Terminated",
        description: "All other devices have been logged out.",
      });
      setTerminateAllOpen(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to terminate sessions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const suspiciousEvents = loginHistory.filter((event) => event.suspicious);
  const hasSuspiciousActivity = suspiciousEvents.length > 0;

  const openTerminateSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setTerminateSessionOpen(true);
  };

  return (
    <div className="space-y-6">
      {hasSuspiciousActivity && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Suspicious Activity Detected</AlertTitle>
          <AlertDescription>
            We detected {suspiciousEvents.length} suspicious login attempt
            {suspiciousEvents.length > 1 ? "s" : ""} on your account. Please
            review your login history and consider changing your password.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                Active Sessions
              </CardTitle>
              <CardDescription>
                Devices currently logged into your account
              </CardDescription>
            </div>
            {sessions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTerminateAllOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log out all other devices
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-4 bg-muted/20 rounded-lg animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="h-3 w-24 bg-muted rounded" />
                    </div>
                  </div>
                  <div className="h-8 w-20 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8">
              <Monitor className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No active sessions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const parsed = session.device.includes("Unknown")
                  ? { device: session.device, browser: "Unknown" }
                  : parseUserAgent(session.device);

                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      session.current
                        ? "bg-primary/5 border-primary/20"
                        : "bg-muted/10 border-muted/20 hover:bg-muted/20"
                    } transition-colors`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-full ${
                          session.current ? "bg-primary/10" : "bg-muted"
                        }`}
                      >
                        {getDeviceIcon(parsed.device)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{parsed.device}</p>
                          {session.current && (
                            <Badge variant="default" className="text-xs">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>{parsed.browser}</span>
                          {session.location &&
                            session.location !== "Unknown" && (
                              <>
                                <span>•</span>
                                <MapPin className="h-3 w-3" />
                                <span>{session.location}</span>
                              </>
                            )}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          <span>Last active: {session.time}</span>
                        </div>
                      </div>
                    </div>
                    {!session.current && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openTerminateSession(session.id)}
                        disabled={terminateSessionMutation.isPending}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {terminateSessionMutation.isPending &&
                        selectedSessionId === session.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Login History
          </CardTitle>
          <CardDescription>
            Recent login attempts on your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 border-b animate-pulse"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted" />
                    <div className="space-y-2">
                      <div className="h-4 w-40 bg-muted rounded" />
                      <div className="h-3 w-24 bg-muted rounded" />
                    </div>
                  </div>
                  <div className="h-6 w-16 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : loginHistory.length === 0 ? (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">
                No login history available
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Login attempts will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {loginHistory.slice(0, 10).map((event, index) => (
                <div
                  key={event.id || index}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    event.suspicious
                      ? "bg-destructive/10 border border-destructive/20"
                      : event.success
                        ? "hover:bg-muted/50"
                        : "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900"
                  } transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        event.suspicious
                          ? "bg-destructive/20"
                          : event.success
                            ? "bg-green-100 dark:bg-green-900/30"
                            : "bg-orange-100 dark:bg-orange-900/30"
                      }`}
                    >
                      {event.suspicious ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : event.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {event.success
                            ? "Successful login"
                            : "Failed login attempt"}
                        </p>
                        {event.suspicious && (
                          <Badge variant="destructive" className="text-xs">
                            Suspicious
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{event.device}</span>
                        {event.location && (
                          <>
                            <span>•</span>
                            <span>{event.location}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{event.ipAddress}</span>
                      </div>
                      {event.reason && (
                        <p className="text-xs text-destructive mt-1">
                          {event.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={terminateSessionOpen}
        onOpenChange={setTerminateSessionOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out this device?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately end the session on this device. The user
              will need to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                selectedSessionId &&
                terminateSessionMutation.mutate(selectedSessionId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {terminateSessionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Log out device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={terminateAllOpen} onOpenChange={setTerminateAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out all other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately end all sessions except your current one.
              All other devices will need to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => terminateAllSessionsMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {terminateAllSessionsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Log out all devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default LoginHistory;
