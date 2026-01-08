import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Crown, Calendar, Clock, Mail } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserOverviewPanelProps {
  user: {
    id: string;
    username: string;
    email: string;
    avatarUrl?: string;
    subscriptionTier?: string | null;
    createdAt?: string | Date;
    lastLogin?: string | Date;
  };
}

/**
 * TODO: Add function documentation
 */
export function UserOverviewPanel({ user }: UserOverviewPanelProps) {
  const getSubscriptionBadge = (plan?: string | null) => {
    // Handle null, undefined, empty string, or trial as Free tier
    if (!plan || plan === '' || plan === 'trial') {
      return {
        label: 'Free',
        variant: 'secondary' as const,
        icon: null,
      };
    }

    // Core plan
    if (plan === 'core') {
      return {
        label: 'Core',
        variant: 'default' as const,
        icon: <Crown className="w-3 h-3" />,
      };
    }

    // Pro plan
    if (plan === 'pro') {
      return {
        label: 'Pro',
        variant: 'default' as const,
        icon: <Crown className="w-3 h-3" />,
      };
    }

    // Lifetime plan
    if (plan === 'lifetime') {
      return {
        label: 'Lifetime',
        variant: 'default' as const,
        icon: <Crown className="w-3 h-3" />,
      };
    }

    // Fallback for any other plan types
    return {
      label: plan.charAt(0).toUpperCase() + plan.slice(1),
      variant: 'default' as const,
      icon: <Crown className="w-3 h-3" />,
    };
  };

  const badge = getSubscriptionBadge(user.subscriptionTier ?? null);

  // Get user initials for avatar fallback
  const getInitials = (username: string | null | undefined) => {
    if (!username) return 'U';
    return username
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'U';
  };

  const formatDate = (date?: string | Date) => {
    if (!date) return 'N/A';
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch (error: unknown) {
      return 'N/A';
    }
  };

  return (
    <Card
      className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-white to-blue-50 dark:from-gray-900 dark:to-blue-950"
      data-testid="user-overview-panel"
    >
      <CardContent className="p-6">
        <div className="flex items-center space-x-4">
          {/* Avatar */}
          <Avatar className="w-16 h-16 border-2 border-blue-600" data-testid="user-avatar">
            <AvatarImage src={user.avatarUrl} alt={user.username} />
            <AvatarFallback className="bg-blue-600 text-white text-lg font-bold">
              {getInitials(user.username)}
            </AvatarFallback>
          </Avatar>

          {/* User Info */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center space-x-2">
              <h3
                className="text-xl font-bold text-gray-900 dark:text-white"
                data-testid="user-name"
              >
                {user.username}
              </h3>
              <Badge
                variant={badge.variant}
                className="flex items-center space-x-1"
                data-testid="subscription-badge"
              >
                {badge.icon}
                <span>{badge.label}</span>
              </Badge>
            </div>

            <div className="flex items-center space-x-1 text-sm text-muted-foreground">
              <Mail className="w-3 h-3" />
              <span data-testid="user-email">{user.email}</span>
            </div>

            <div className="flex items-center space-x-4 text-xs text-muted-foreground">
              <div className="flex items-center space-x-1" data-testid="member-since">
                <Calendar className="w-3 h-3" />
                <span>Member {formatDate(user.createdAt)}</span>
              </div>
              {user.lastLogin && (
                <div className="flex items-center space-x-1" data-testid="last-login">
                  <Clock className="w-3 h-3" />
                  <span>Active {formatDate(user.lastLogin)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
