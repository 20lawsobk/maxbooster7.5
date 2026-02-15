import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Check, Clock, MapPin, Music } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface CollaboratorCardProps {
  user: {
    id: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    bio?: string | null;
    location?: string | null;
  };
  matchScore?: number;
  matchReasons?: string[];
  showConnectButton?: boolean;
  onConnect?: () => void;
}

export function CollaboratorCard({
  user,
  matchScore,
  matchReasons = [],
  showConnectButton = true,
  onConnect,
}: CollaboratorCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connectionStatus } = useQuery({
    queryKey: ['/api/collaborations/connection-status', user.id],
    queryFn: async () => {
      const res = await fetch(`/api/collaborations/connection-status/${user.id}`, {
        credentials: 'include',
      });
      if (!res.ok) return { status: null, connectionId: null };
      return res.json();
    },
    enabled: showConnectButton,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/collaborations/connect', {
        userId: user.id,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Connection Request Sent',
        description: `Request sent to ${user.username || user.firstName || 'this artist'}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/connection-status', user.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/suggestions'] });
      onConnect?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send connection request',
        variant: 'destructive',
      });
    },
  });

  const displayName =
    user.username ||
    [user.firstName, user.lastName].filter(Boolean).join(' ') ||
    'Anonymous Artist';

  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const getConnectionButton = () => {
    if (!showConnectButton) return null;

    if (connectionStatus?.status === 'accepted') {
      return (
        <Button size="sm" variant="outline" disabled>
          <Check className="h-4 w-4 mr-1" />
          Connected
        </Button>
      );
    }

    if (connectionStatus?.status === 'pending') {
      return (
        <Button size="sm" variant="outline" disabled>
          <Clock className="h-4 w-4 mr-1" />
          Pending
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending}
      >
        <UserPlus className="h-4 w-4 mr-1" />
        {connectMutation.isPending ? 'Sending...' : 'Connect'}
      </Button>
    );
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold truncate">{displayName}</h3>
              {matchScore !== undefined && (
                <Badge variant="secondary" className="shrink-0">
                  {matchScore}% Match
                </Badge>
              )}
            </div>

            {user.bio && (
              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                {user.bio}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {user.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {user.location}
                </span>
              )}
            </div>

            {matchReasons.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {matchReasons.slice(0, 3).map((reason, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    <Music className="h-3 w-3 mr-1" />
                    {reason}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-3">{getConnectionButton()}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CollaboratorCard;
