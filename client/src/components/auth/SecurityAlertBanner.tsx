import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  ShieldAlert,
  AlertTriangle,
  Shield,
  MapPin,
  Smartphone,
  Lock,
  Key,
  Bell,
  X,
  ChevronRight,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react";

export type SecurityAlertType =
  | "suspicious_login_attempt"
  | "login_from_new_location"
  | "login_from_new_device"
  | "failed_login_attempts"
  | "password_change_required"
  | "account_locked"
  | "account_unlocked"
  | "session_hijack_detected"
  | "concurrent_session_detected"
  | "max_sessions_exceeded";

interface SecurityAlert {
  id: string;
  type: SecurityAlertType;
  title: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  timestamp: string;
  resolved: boolean;
  action: string | null;
  actionLabel: string | null;
  metadata: Record<string, any>;
}

interface SecurityAlertsResponse {
  alerts: SecurityAlert[];
  summary: {
    total: number;
    unresolved: number;
    critical: number;
    requiresAction: number;
  };
}

interface SecurityAlertBannerProps {
  onViewSessions?: () => void;
  onChangePassword?: () => void;
  onManageDevices?: () => void;
  maxVisibleAlerts?: number;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: ShieldAlert,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950",
    borderColor: "border-red-200 dark:border-red-900",
  },
  high: {
    icon: AlertTriangle,
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950",
    borderColor: "border-orange-200 dark:border-orange-900",
  },
  medium: {
    icon: Shield,
    color: "text-yellow-500",
    bgColor: "bg-yellow-50 dark:bg-yellow-950",
    borderColor: "border-yellow-200 dark:border-yellow-900",
  },
  low: {
    icon: Bell,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    borderColor: "border-blue-200 dark:border-blue-900",
  },
};

const ALERT_ICONS: Record<SecurityAlertType, any> = {
  suspicious_login_attempt: ShieldAlert,
  login_from_new_location: MapPin,
  login_from_new_device: Smartphone,
  failed_login_attempts: Lock,
  password_change_required: Key,
  account_locked: Lock,
  account_unlocked: CheckCircle,
  session_hijack_detected: ShieldAlert,
  concurrent_session_detected: Smartphone,
  max_sessions_exceeded: AlertTriangle,
};

export function SecurityAlertBanner({
  onViewSessions,
  onChangePassword,
  onManageDevices,
  maxVisibleAlerts = 1,
}: SecurityAlertBannerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: alertsData } = useQuery<SecurityAlertsResponse>({
    queryKey: ["/api/auth/security-alerts"],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await apiRequest(
        "POST",
        `/api/auth/security-alerts/${alertId}/dismiss`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/auth/security-alerts"],
      });
    },
  });

  const handleAction = (alert: SecurityAlert) => {
    switch (alert.action) {
      case "review_sessions":
      case "manage_sessions":
        onViewSessions?.();
        break;
      case "change_password":
        onChangePassword?.();
        break;
      case "manage_devices":
        onManageDevices?.();
        break;
      case "logout_all":
        onViewSessions?.();
        break;
      default:
        toast({
          title: "Action Not Available",
          description: "This action is not currently available.",
        });
    }
    setSheetOpen(false);
  };

  const handleDismiss = (alertId: string) => {
    setDismissedIds((prev) => new Set([...prev, alertId]));
    dismissAlertMutation.mutate(alertId);
  };

  if (!user || !alertsData) return null;

  const unresolvedAlerts = alertsData.alerts.filter(
    (a) => !a.resolved && !dismissedIds.has(a.id),
  );
  const visibleAlerts = unresolvedAlerts.slice(0, maxVisibleAlerts);
  Math.max(0, unresolvedAlerts.length - maxVisibleAlerts);

  if (unresolvedAlerts.length === 0) return null;

  const mostSevere = unresolvedAlerts.reduce((prev, curr) => {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return severityOrder[curr.severity] < severityOrder[prev.severity]
      ? curr
      : prev;
  }, unresolvedAlerts[0]);

  const severityConfig = SEVERITY_CONFIG[mostSevere.severity];
  const SeverityIcon = severityConfig.icon;

  return (
    <>
      <div className="w-full">
        <Alert
          className={`${severityConfig.bgColor} ${severityConfig.borderColor} border`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SeverityIcon className={`h-5 w-5 ${severityConfig.color}`} />
              <div>
                <AlertTitle className="text-sm font-medium">
                  {unresolvedAlerts.length === 1
                    ? mostSevere.title
                    : `${unresolvedAlerts.length} Security Alerts`}
                </AlertTitle>
                <AlertDescription className="text-sm">
                  {unresolvedAlerts.length === 1
                    ? mostSevere.message
                    : `You have ${alertsData.summary.critical} critical and ${alertsData.summary.requiresAction} actionable alerts.`}
                </AlertDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {alertsData.summary.critical > 0 && (
                <Badge variant="destructive">
                  {alertsData.summary.critical} Critical
                </Badge>
              )}
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    View All
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Security Alerts
                    </SheetTitle>
                    <SheetDescription>
                      Review and manage security alerts for your account
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="h-[calc(100vh-150px)] mt-6 pr-4">
                    <div className="space-y-4">
                      {alertsData.alerts.map((alert) => (
                        <SecurityAlertCard
                          key={alert.id}
                          alert={alert}
                          onAction={() => handleAction(alert)}
                          onDismiss={() => handleDismiss(alert.id)}
                          isDismissed={dismissedIds.has(alert.id)}
                        />
                      ))}
                      {alertsData.alerts.length === 0 && (
                        <div className="text-center py-12 text-muted-foreground">
                          <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No security alerts</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
              {visibleAlerts.length === 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => handleDismiss(mostSevere.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </Alert>
      </div>
    </>
  );
}

interface SecurityAlertCardProps {
  alert: SecurityAlert;
  onAction: () => void;
  onDismiss: () => void;
  isDismissed: boolean;
}

function SecurityAlertCard({
  alert,
  onAction,
  onDismiss,
  isDismissed,
}: SecurityAlertCardProps) {
  const severityConfig = SEVERITY_CONFIG[alert.severity];
  const AlertIcon = ALERT_ICONS[alert.type] || Shield;

  if (isDismissed || alert.resolved) {
    return null;
  }

  return (
    <Card className={`${severityConfig.bgColor} ${severityConfig.borderColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <AlertIcon className={`h-5 w-5 ${severityConfig.color}`} />
            <CardTitle className="text-base">{alert.title}</CardTitle>
          </div>
          <Badge variant="outline" className={severityConfig.color}>
            {alert.severity}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {new Date(alert.timestamp).toLocaleString()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{alert.message}</p>

        {alert.metadata && Object.keys(alert.metadata).length > 0 && (
          <div className="text-xs text-muted-foreground space-y-1">
            {alert.metadata.ip && <p>IP Address: {alert.metadata.ip}</p>}
            {alert.metadata.location && (
              <p>Location: {alert.metadata.location}</p>
            )}
            {alert.metadata.device && <p>Device: {alert.metadata.device}</p>}
          </div>
        )}

        <Separator />

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            className="text-muted-foreground"
          >
            Dismiss
          </Button>
          {alert.action && alert.actionLabel && (
            <Button size="sm" onClick={onAction} className="gap-1">
              {alert.actionLabel}
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SecurityAlertBanner;
