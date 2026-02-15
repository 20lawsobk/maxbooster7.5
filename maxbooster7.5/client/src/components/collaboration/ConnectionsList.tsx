import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X, Users, UserPlus, Clock, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function ConnectionsList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ['/api/collaborations/connections'],
    queryFn: async () => {
      const res = await fetch('/api/collaborations/connections', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  const { data: pendingRequests, isLoading: pendingLoading } = useQuery({
    queryKey: ['/api/collaborations/connections/pending'],
    queryFn: async () => {
      const res = await fetch('/api/collaborations/connections/pending', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch pending requests');
      return res.json();
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await apiRequest('POST', `/api/collaborations/accept/${connectionId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Connection Accepted' });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/connections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/connections/pending'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to accept connection',
        variant: 'destructive',
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await apiRequest('POST', `/api/collaborations/decline/${connectionId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Connection Declined' });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/connections/pending'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to decline connection',
        variant: 'destructive',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await apiRequest('DELETE', `/api/collaborations/connections/${connectionId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Connection Removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/collaborations/connections'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove connection',
        variant: 'destructive',
      });
    },
  });

  const getDisplayName = (user: any) => {
    return (
      user?.username ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      'Anonymous Artist'
    );
  };

  const getInitials = (user: any) => {
    const name = getDisplayName(user);
    return name
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderConnectionCard = (connection: any, showActions: boolean = false) => {
    const user = connection.connectedUser || connection.requester;
    const displayName = getDisplayName(user);
    const initials = getInitials(user);

    return (
      <div
        key={connection.id}
        className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user?.avatarUrl || undefined} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{displayName}</p>
            {user?.bio && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {user.bio}
              </p>
            )}
            {connection.message && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                "{connection.message}"
              </p>
            )}
          </div>
        </div>

        {showActions ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => acceptMutation.mutate(connection.id)}
              disabled={acceptMutation.isPending}
            >
              <Check className="h-4 w-4 mr-1" />
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => declineMutation.mutate(connection.id)}
              disabled={declineMutation.isPending}
            >
              <X className="h-4 w-4 mr-1" />
              Decline
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => removeMutation.mutate(connection.id)}
            disabled={removeMutation.isPending}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  const renderSkeletons = () => (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Your Connections
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="connections">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="connections" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Connections
              {connections?.length > 0 && (
                <Badge variant="secondary">{connections.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending
              {pendingRequests?.length > 0 && (
                <Badge variant="destructive">{pendingRequests.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="connections" className="mt-4">
            {connectionsLoading ? (
              renderSkeletons()
            ) : connections?.length > 0 ? (
              <div className="space-y-3">
                {connections.map((conn: any) => renderConnectionCard(conn, false))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <UserPlus className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No connections yet</p>
                <p className="text-sm">Start connecting with other artists!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending" className="mt-4">
            {pendingLoading ? (
              renderSkeletons()
            ) : pendingRequests?.length > 0 ? (
              <div className="space-y-3">
                {pendingRequests.map((req: any) => renderConnectionCard(req, true))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No pending requests</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default ConnectionsList;
