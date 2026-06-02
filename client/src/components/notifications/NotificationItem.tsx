import { memo } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Users,
  DollarSign,
  Music2,
  Heart,
  Megaphone,
  Shield,
  AlertTriangle,
  Gift,
  TrendingUp,
  Check,
  Trash2,
  ExternalLink,
  MessageSquare,
  ShoppingBag,
  Mail,
  Phone,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { UnreadIndicator } from "./NotificationBadge";
import type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationCategory,
} from "./types";
import { priorityConfig, typeToCategory } from "./types";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (url: string) => void;
  compact?: boolean;
}

const notificationConfig: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  collaboration_invite: {
    icon: Users,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  collaboration_accepted: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  collaboration_declined: {
    icon: AlertCircle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  collaboration_comment: {
    icon: MessageSquare,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  collaboration_mention: {
    icon: Users,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  payment_received: {
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  payout_completed: {
    icon: DollarSign,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  payout_failed: {
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  royalty_statement_ready: {
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  release_milestone: {
    icon: TrendingUp,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  release_live: {
    icon: Music2,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  release_rejected: {
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  release_submitted: {
    icon: Music2,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  release_processing: {
    icon: Clock,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  platform_update: {
    icon: Info,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  social_like: {
    icon: Heart,
    color: "text-pink-600",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
  },
  social_comment: {
    icon: MessageSquare,
    color: "text-orange-600",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  social_share: {
    icon: ExternalLink,
    color: "text-cyan-600",
    bgColor: "bg-cyan-100 dark:bg-cyan-900/30",
  },
  social_follow: {
    icon: Users,
    color: "text-indigo-600",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
  },
  social_post_scheduled: {
    icon: Clock,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  social_post_published: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  social_engagement_alert: {
    icon: TrendingUp,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  marketplace_purchase: {
    icon: ShoppingBag,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  marketplace_sale: {
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  marketplace_review: {
    icon: MessageSquare,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  marketplace_offer: {
    icon: ShoppingBag,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  system_announcement: {
    icon: Megaphone,
    color: "text-blue-600",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  system_maintenance: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  system_update: {
    icon: Bell,
    color: "text-gray-600",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
  security_new_login: {
    icon: Shield,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  security_password_changed: {
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  security_2fa_enabled: {
    icon: Shield,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  security_2fa_disabled: {
    icon: Shield,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  security_suspicious_activity: {
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-100 dark:bg-red-900/30",
  },
  account_verified: {
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  account_warning: {
    icon: AlertTriangle,
    color: "text-amber-600",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  promotion: {
    icon: Gift,
    color: "text-purple-600",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  default: {
    icon: Bell,
    color: "text-gray-600",
    bgColor: "bg-gray-100 dark:bg-gray-900/30",
  },
};

const priorityBorderColors: Record<NotificationPriority, string> = {
  low: "",
  normal: "",
  high: "border-l-4 border-l-orange-500",
  urgent: "border-l-4 border-l-red-500",
};

export const NotificationItem = memo(function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onNavigate,
  compact = false,
}: NotificationItemProps) {
  const [, navigate] = useLocation();
  const config =
    notificationConfig[notification.type as NotificationType] ||
    notificationConfig.default;
  const Icon = config.icon;
  const priority = notification.priority || "normal";

  const handleClick = () => {
    if (!notification.isRead) {
      onMarkAsRead(notification.id);
    }
    if (notification.actionUrl?.startsWith("http")) {
      window.open(notification.actionUrl, "_blank");
      return;
    }
    const detailUrl = `/notifications/${notification.id}`;
    onNavigate(detailUrl);
    navigate(detailUrl);
  };

  const handleMarkAsRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkAsRead(notification.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "p-4 cursor-pointer hover:bg-muted/50 transition-colors group",
        !notification.isRead && "bg-primary/5",
        notification.actionUrl && "cursor-pointer",
        priorityBorderColors[priority],
      )}
      data-testid={`notification-item-${notification.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-2 rounded-full shrink-0", config.bgColor)}>
          <Icon className={cn("h-4 w-4", config.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-medium truncate",
                    !notification.isRead && "font-semibold",
                  )}
                >
                  {notification.title}
                </p>
                {priority === "urgent" && (
                  <Badge
                    variant="destructive"
                    className="text-[10px] px-1 py-0 h-4"
                  >
                    Urgent
                  </Badge>
                )}
                {priority === "high" && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1 py-0 h-4 border-orange-500 text-orange-500"
                  >
                    High
                  </Badge>
                )}
              </div>

              {!compact && notification.message && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {notification.message}
                </p>
              )}

              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-muted-foreground/60">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                  })}
                </p>
                {notification.actionLabel && (
                  <>
                    <span className="text-muted-foreground/40">•</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClick();
                      }}
                    >
                      {notification.actionLabel}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {!notification.isRead && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleMarkAsRead}
                  aria-label="Mark as read"
                  data-testid={`mark-read-${notification.id}`}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
                aria-label="Delete notification"
                data-testid={`delete-notification-${notification.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <UnreadIndicator unread={!notification.isRead} priority={priority} />
      </div>
    </div>
  );
});
