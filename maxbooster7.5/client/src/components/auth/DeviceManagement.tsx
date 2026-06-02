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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
  Smartphone,
  Monitor,
  Tablet,
  Globe,
  Clock,
  Shield,
  ShieldCheck,
  ShieldOff,
  LogOut,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Trash2,
} from "lucide-react";

export type DeviceOutcome =
  | "device_trusted"
  | "device_untrusted"
  | "remote_session_terminated"
  | "all_other_sessions_logged_out"
  | "device_list_updated";

interface DeviceSession {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location: string;
  lastActivity: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  trusted: boolean;
}

interface SessionsResponse {
  sessions: DeviceSession[];
  totalCount: number;
  currentSessionId: string;
}

function getDeviceIcon(device: string) {
  const deviceLower = device.toLowerCase();
  if (
    deviceLower.includes("iphone") ||
    deviceLower.includes("android") ||
    deviceLower.includes("mobile")
  ) {
    return Smartphone;
  }
  if (deviceLower.includes("ipad") || deviceLower.includes("tablet")) {
    return Tablet;
  }
  return Monitor;
}

export function DeviceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [terminateSessionId, setTerminateSessionId] = useState<string | null>(
    null,
  );
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);

  const { data: sessionsData, isLoading } = useQuery<SessionsResponse>({
    queryKey: ["/api/auth/sessions"],
  });

  const terminateSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/auth/sessions/${sessionId}`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Session Terminated",
          description: "The device has been logged out.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      }
    },
    onError: () => {
      toast({
        title: "Failed to Terminate Session",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/auth/sessions/other");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "All Other Sessions Logged Out",
          description: `${data.terminatedCount} session(s) have been terminated.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
        setLogoutAllOpen(false);
      }
    },
    onError: () => {
      toast({
        title: "Failed to Logout Sessions",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const trustDeviceMutation = useMutation({
    mutationFn: async ({
      deviceId,
      trusted,
    }: {
      deviceId: string;
      trusted: boolean;
    }) => {
      const response = await apiRequest("POST", "/api/auth/devices/trust", {
        deviceId,
        trusted,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: data.trusted ? "Device Trusted" : "Device Untrusted",
          description: data.trusted
            ? "This device is now marked as trusted."
            : "This device is no longer marked as trusted.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/sessions"] });
      }
    },
    onError: () => {
      toast({
        title: "Failed to Update Device",
        description: "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleTerminateSession = () => {
    if (terminateSessionId) {
      terminateSessionMutation.mutate(terminateSessionId);
      setTerminateSessionId(null);
    }
  };

  const formatRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const sessions = sessionsData?.sessions || [];
  const currentSession = sessions.find((s) => s.current);
  const otherSessions = sessions.filter((s) => !s.current);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Active Devices
              </CardTitle>
              <CardDescription>
                Manage devices that are signed in to your account
              </CardDescription>
            </div>
            {otherSessions.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLogoutAllOpen(true)}
                className="text-red-500 hover:text-red-600"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log Out All Other Devices
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentSession && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Current Device
              </h4>
              <DeviceCard
                session={currentSession}
                onTrustToggle={(trusted) =>
                  trustDeviceMutation.mutate({
                    deviceId: currentSession.id,
                    trusted,
                  })
                }
                formatRelativeTime={formatRelativeTime}
              />
            </div>
          )}

          {otherSessions.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Other Devices ({otherSessions.length})
                </h4>
                <div className="space-y-3">
                  {otherSessions.map((session) => (
                    <DeviceCard
                      key={session.id}
                      session={session}
                      onTerminate={() => setTerminateSessionId(session.id)}
                      onTrustToggle={(trusted) =>
                        trustDeviceMutation.mutate({
                          deviceId: session.id,
                          trusted,
                        })
                      }
                      formatRelativeTime={formatRelativeTime}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {sessions.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Monitor className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No active sessions found.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!terminateSessionId}
        onOpenChange={() => setTerminateSessionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate Session?</AlertDialogTitle>
            <AlertDialogDescription>
              This will log out the device immediately. They will need to sign
              in again to access the account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTerminateSession}
              className="bg-red-500 hover:bg-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Terminate Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={logoutAllOpen} onOpenChange={setLogoutAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Log Out All Other Devices?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will log out {otherSessions.length} device(s) immediately.
              You will remain logged in on this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => logoutAllMutation.mutate()}
              className="bg-red-500 hover:bg-red-600"
              disabled={logoutAllMutation.isPending}
            >
              {logoutAllMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Log Out All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface DeviceCardProps {
  session: DeviceSession;
  onTerminate?: () => void;
  onTrustToggle?: (trusted: boolean) => void;
  formatRelativeTime: (date: string) => string;
}

function DeviceCard({
  session,
  onTerminate,
  onTrustToggle,
  formatRelativeTime,
}: DeviceCardProps) {
  const DeviceIcon = getDeviceIcon(session.device);

  return (
    <div
      className={`flex items-center justify-between p-4 rounded-lg border ${session.current ? "bg-primary/5 border-primary/20" : "bg-card"}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`p-2 rounded-full ${session.current ? "bg-primary/10" : "bg-muted"}`}
        >
          <DeviceIcon
            className={`h-5 w-5 ${session.current ? "text-primary" : "text-muted-foreground"}`}
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{session.device}</span>
            {session.current && (
              <Badge
                variant="outline"
                className="text-xs border-primary text-primary"
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                This device
              </Badge>
            )}
            {session.trusted && (
              <Badge variant="secondary" className="text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" />
                Trusted
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
            <span>
              {session.browser} on {session.os}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(session.lastActivity)}
            </span>
            {session.ipAddress && session.ipAddress !== "Unknown" && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {session.ipAddress}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onTrustToggle && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Trust</span>
            <Switch checked={session.trusted} onCheckedChange={onTrustToggle} />
          </div>
        )}
        {onTerminate && !session.current && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTerminate}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default DeviceManagement;
