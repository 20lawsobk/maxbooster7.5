import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  RefreshCw,
  ExternalLink,
  Zap,
  Banknote,
  ArrowRight,
} from "lucide-react";

export interface PayoutHistoryItem {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed";
  type: "standard" | "instant";
  requestedAt: Date;
  completedAt?: Date;
  transactionId?: string;
  failureReason?: string;
  fee?: number;
  netAmount?: number;
  estimatedArrival?: Date;
}

interface PayoutHistoryTimelineProps {
  payouts: PayoutHistoryItem[];
  isLoading?: boolean;
  onRetry?: (payoutId: string) => void;
  onViewDetails?: (payoutId: string) => void;
  showInstantPayoutInfo?: boolean;
  instantPayoutFeePercentage?: number;
}

export function PayoutHistoryTimeline({
  payouts,
  isLoading = false,
  onRetry,
  onViewDetails,
  showInstantPayoutInfo = true,
  instantPayoutFeePercentage = 1.5,
}: PayoutHistoryTimelineProps) {
  const groupedPayouts = useMemo(() => {
    const groups: Record<string, PayoutHistoryItem[]> = {};

    payouts.forEach((payout) => {
      const date = new Date(payout.requestedAt);
      const monthYear = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      if (!groups[monthYear]) {
        groups[monthYear] = [];
      }
      groups[monthYear].push(payout);
    });

    return Object.entries(groups).sort((a, b) => {
      const dateA = new Date(a[1][0].requestedAt);
      const dateB = new Date(b[1][0].requestedAt);
      return dateB.getTime() - dateA.getTime();
    });
  }, [payouts]);

  const totalPaid = useMemo(() => {
    return payouts
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (p.netAmount || p.amount), 0);
  }, [payouts]);

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusIcon = (status: string, type: string) => {
    const iconClass = "w-5 h-5";
    switch (status) {
      case "completed":
        return <CheckCircle className={`${iconClass} text-green-500`} />;
      case "processing":
        return (
          <RefreshCw className={`${iconClass} text-blue-500 animate-spin`} />
        );
      case "pending":
        return <Clock className={`${iconClass} text-amber-500`} />;
      case "failed":
        return <XCircle className={`${iconClass} text-red-500`} />;
      default:
        return <DollarSign className={`${iconClass} text-muted-foreground`} />;
    }
  };

  const getStatusBadge = (status: string, type: string) => {
    const badges: Record<
      string,
      { className: string; icon: React.ReactNode; label: string }
    > = {
      completed: {
        className: "bg-green-500/20 text-green-500",
        icon: <CheckCircle className="w-3 h-3" />,
        label: "Completed",
      },
      processing: {
        className: "bg-blue-500/20 text-blue-500",
        icon: <RefreshCw className="w-3 h-3" />,
        label: "Processing",
      },
      pending: {
        className: "bg-amber-500/20 text-amber-500",
        icon: <Clock className="w-3 h-3" />,
        label: "Pending",
      },
      failed: {
        className: "bg-red-500/20 text-red-500",
        icon: <XCircle className="w-3 h-3" />,
        label: "Failed",
      },
    };

    const config = badges[status] || badges.pending;

    return (
      <div className="flex items-center gap-2">
        <Badge className={`${config.className} flex items-center gap-1`}>
          {config.icon}
          {config.label}
        </Badge>
        {type === "instant" && (
          <Badge className="bg-purple-500/20 text-purple-500 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Instant
          </Badge>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className="glassmorphism" data-testid="payout-timeline-loading">
        <CardContent className="flex items-center justify-center h-48">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (payouts.length === 0) {
    return (
      <Card className="glassmorphism" data-testid="payout-timeline-empty">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Payout History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <DollarSign className="w-12 h-12 mb-4 opacity-50" />
            <p>No payouts yet</p>
            <p className="text-sm">Your payout history will appear here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glassmorphism" data-testid="payout-timeline">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Payout History
          </CardTitle>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-lg font-semibold text-green-500">
              {formatCurrency(totalPaid, "USD")}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {showInstantPayoutInfo && (
          <div
            className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20"
            data-testid="instant-payout-info"
          >
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium text-purple-500">
                  Instant Payouts Available
                </p>
                <p className="text-sm text-muted-foreground">
                  Get your earnings immediately for a{" "}
                  {instantPayoutFeePercentage}% fee. Standard payouts (free)
                  arrive in 3-5 business days.
                </p>
              </div>
            </div>
          </div>
        )}

        {groupedPayouts.map(([monthYear, monthPayouts]) => (
          <div key={monthYear} data-testid={`payout-group-${monthYear}`}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-4">
              {monthYear}
            </h3>
            <div className="space-y-4">
              {monthPayouts.map((payout, index) => (
                <div
                  key={payout.id}
                  className="relative pl-8"
                  data-testid={`payout-item-${payout.id}`}
                >
                  <div className="absolute left-0 top-2">
                    {getStatusIcon(payout.status, payout.type)}
                  </div>
                  {index < monthPayouts.length - 1 && (
                    <div className="absolute left-[9px] top-8 bottom-0 w-0.5 bg-border" />
                  )}

                  <div className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(payout.status, payout.type)}
                        </div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(payout.amount, payout.currency)}
                        </p>
                        {payout.fee !== undefined && payout.fee > 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                            <span>
                              Fee: {formatCurrency(payout.fee, payout.currency)}
                            </span>
                            <ArrowRight className="w-3 h-3" />
                            <span className="font-medium text-foreground">
                              Net:{" "}
                              {formatCurrency(
                                payout.netAmount || payout.amount - payout.fee,
                                payout.currency,
                              )}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="text-right text-sm">
                        <p className="text-muted-foreground">
                          {formatDate(payout.requestedAt)}
                        </p>
                        {payout.estimatedArrival &&
                          payout.status !== "completed" && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Est. arrival:{" "}
                              {formatDate(payout.estimatedArrival)}
                            </p>
                          )}
                      </div>
                    </div>

                    {payout.status === "completed" && payout.transactionId && (
                      <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">
                          Transaction ID:
                        </span>
                        <code className="px-2 py-0.5 bg-muted rounded text-xs">
                          {payout.transactionId}
                        </code>
                        {onViewDetails && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewDetails(payout.id)}
                            className="ml-auto"
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Details
                          </Button>
                        )}
                      </div>
                    )}

                    {payout.status === "failed" && (
                      <div className="mt-3 pt-3 border-t">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-red-500 font-medium">
                              {payout.failureReason || "Transfer failed"}
                            </p>
                            {onRetry && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onRetry(payout.id)}
                                className="mt-2"
                              >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                Retry Payout
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
