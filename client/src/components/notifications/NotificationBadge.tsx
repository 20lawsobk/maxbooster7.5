import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
  count: number;
  maxCount?: number;
  variant?: "default" | "urgent" | "subtle";
  size?: "sm" | "md" | "lg";
  showZero?: boolean;
  pulse?: boolean;
  className?: string;
}

export const NotificationBadge = memo(function NotificationBadge({
  count,
  maxCount = 99,
  variant = "default",
  size = "md",
  showZero = false,
  pulse = false,
  className,
}: NotificationBadgeProps) {
  if (count === 0 && !showZero) {
    return null;
  }

  const displayCount = count > maxCount ? `${maxCount}+` : count;

  const sizeClasses = {
    sm: "h-4 min-w-4 text-[10px] px-1",
    md: "h-5 min-w-5 text-xs px-1.5",
    lg: "h-6 min-w-6 text-sm px-2",
  };

  const variantClasses = {
    default: "bg-destructive text-destructive-foreground",
    urgent: "bg-red-600 text-white animate-pulse",
    subtle: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="destructive"
      className={cn(
        "rounded-full p-0 flex items-center justify-center font-medium",
        sizeClasses[size],
        variantClasses[variant],
        pulse && "animate-pulse",
        className,
      )}
      data-testid="notification-badge"
    >
      {displayCount}
    </Badge>
  );
});

interface NotificationDotProps {
  visible?: boolean;
  variant?: "default" | "success" | "warning" | "error";
  pulse?: boolean;
  className?: string;
}

export const NotificationDot = memo(function NotificationDot({
  visible = true,
  variant = "default",
  pulse = false,
  className,
}: NotificationDotProps) {
  if (!visible) return null;

  const variantClasses = {
    default: "bg-primary",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
  };

  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        variantClasses[variant],
        pulse && "animate-pulse",
        className,
      )}
      data-testid="notification-dot"
    />
  );
});

interface UnreadIndicatorProps {
  unread: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
}

export const UnreadIndicator = memo(function UnreadIndicator({
  unread,
  priority = "normal",
}: UnreadIndicatorProps) {
  if (!unread) return null;

  const priorityColors = {
    low: "bg-gray-400",
    normal: "bg-primary",
    high: "bg-orange-500",
    urgent: "bg-red-500 animate-pulse",
  };

  return (
    <span
      className={cn("w-2 h-2 rounded-full shrink-0", priorityColors[priority])}
      aria-label={`Unread notification, ${priority} priority`}
      data-testid="unread-indicator"
    />
  );
});
