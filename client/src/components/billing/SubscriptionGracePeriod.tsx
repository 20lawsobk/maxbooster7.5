import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  RefreshCw,
  X,
  Loader2,
} from "lucide-react";

interface GracePeriodStatus {
  inGracePeriod: boolean;
  gracePeriodActive: boolean;
  gracePeriodEndsAt: string | null;
  gracePeriodDaysRemaining: number;
  gracePeriodExpired: boolean;
  subscriptionStatus: string;
  tier: string;
  payment: {
    failedAt: string | null;
    retryAttempts: number;
    maxRetryAttempts: number;
    nextRetryAt: string | null;
    retriesExhausted: boolean;
  };
  actions: {
    canRetryPayment: boolean;
    canUpdatePaymentMethod: boolean;
    canContactSupport: boolean;
    urgencyLevel: "critical" | "high" | "medium";
  } | null;
}

interface SubscriptionGracePeriodProps {
  onRetryPayment?: () => void;
  onUpdatePaymentMethod?: () => void;
  onDismiss?: () => void;
  variant?: "banner" | "card" | "inline";
}

export default function SubscriptionGracePeriod({
  onRetryPayment,
  onUpdatePaymentMethod,
  onDismiss,
  variant = "banner",
}: SubscriptionGracePeriodProps) {
  const [dismissed, setDismissed] = useState(false);

  const { data: gracePeriod, isLoading } = useQuery<GracePeriodStatus>({
    queryKey: ["/api/billing/grace-period-status"],
    refetchInterval: 60000,
  });

  useEffect(() => {
    setDismissed(false);
  }, [gracePeriod?.gracePeriodDaysRemaining]);

  if (isLoading || !gracePeriod || !gracePeriod.inGracePeriod || dismissed) {
    return null;
  }

  const { gracePeriodDaysRemaining, gracePeriodEndsAt, payment, actions } =
    gracePeriod;
  const totalGraceDays = 7;
  const progressPercent =
    ((totalGraceDays - gracePeriodDaysRemaining) / totalGraceDays) * 100;

  const getUrgencyStyles = () => {
    switch (actions?.urgencyLevel) {
      case "critical":
        return {
          bg: "bg-red-50 dark:bg-red-950/30",
          border: "border-red-500",
          text: "text-red-700 dark:text-red-400",
          icon: "text-red-600",
          badge: "destructive" as const,
        };
      case "high":
        return {
          bg: "bg-orange-50 dark:bg-orange-950/30",
          border: "border-orange-500",
          text: "text-orange-700 dark:text-orange-400",
          icon: "text-orange-600",
          badge: "secondary" as const,
        };
      default:
        return {
          bg: "bg-yellow-50 dark:bg-yellow-950/30",
          border: "border-yellow-500",
          text: "text-yellow-700 dark:text-yellow-400",
          icon: "text-yellow-600",
          badge: "outline" as const,
        };
    }
  };

  const styles = getUrgencyStyles();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  if (variant === "inline") {
    return (
      <div
        className={`flex items-center gap-2 p-2 rounded-md ${styles.bg} ${styles.text}`}
      >
        <AlertTriangle className={`h-4 w-4 ${styles.icon}`} />
        <span className="text-sm font-medium">
          {gracePeriodDaysRemaining === 0
            ? "Grace period ends today!"
            : gracePeriodDaysRemaining === 1
              ? "1 day remaining in grace period"
              : `${gracePeriodDaysRemaining} days remaining in grace period`}
        </span>
        {actions?.canRetryPayment && onRetryPayment && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2"
            onClick={onRetryPayment}
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    );
  }

  if (variant === "banner") {
    return (
      <div className={`${styles.bg} border-b ${styles.border} px-4 py-3`}>
        <div className="container mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <AlertTriangle className={`h-5 w-5 ${styles.icon}`} />
            <div>
              <p className={`font-medium ${styles.text}`}>
                Payment failed - Grace period active
              </p>
              <p className={`text-sm ${styles.text} opacity-80`}>
                {gracePeriodDaysRemaining === 0
                  ? "Your access ends today. Update payment to continue."
                  : `${gracePeriodDaysRemaining} day${gracePeriodDaysRemaining > 1 ? "s" : ""} remaining to update your payment method.`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {actions?.canRetryPayment && onRetryPayment && (
              <Button size="sm" variant="default" onClick={onRetryPayment}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry Payment
              </Button>
            )}
            {actions?.canUpdatePaymentMethod && onUpdatePaymentMethod && (
              <Button
                size="sm"
                variant="outline"
                onClick={onUpdatePaymentMethod}
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Update Card
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={`${styles.bg} ${styles.border} border-2`}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${styles.bg}`}>
              <AlertTriangle className={`h-5 w-5 ${styles.icon}`} />
            </div>
            <div>
              <h3 className={`font-semibold ${styles.text}`}>
                Grace Period Active
              </h3>
              <p className="text-sm text-muted-foreground">
                Your payment failed. Update your payment to maintain access.
              </p>
            </div>
          </div>
          <Badge variant={styles.badge}>
            {gracePeriodDaysRemaining === 0
              ? "Final Day"
              : `${gracePeriodDaysRemaining} days left`}
          </Badge>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Grace period progress
              </span>
              <span className={styles.text}>
                {gracePeriodEndsAt && `Ends ${formatDate(gracePeriodEndsAt)}`}
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {payment && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-muted-foreground" />
                <span>
                  Retry attempts: {payment.retryAttempts}/
                  {payment.maxRetryAttempts}
                </span>
              </div>
              {payment.nextRetryAt && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Next retry: {formatDate(payment.nextRetryAt)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {actions?.canRetryPayment && onRetryPayment && (
              <Button onClick={onRetryPayment} className="flex-1">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Payment
              </Button>
            )}
            {actions?.canUpdatePaymentMethod && onUpdatePaymentMethod && (
              <Button
                onClick={onUpdatePaymentMethod}
                variant="outline"
                className="flex-1"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Update Card
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
