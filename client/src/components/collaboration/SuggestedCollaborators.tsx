import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CollaboratorCard } from './CollaboratorCard';

interface SuggestedCollaboratorsProps {
  limit?: number;
}

export function SuggestedCollaborators({ limit = 6 }: SuggestedCollaboratorsProps) {
  const { data: suggestions, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['/api/collaborations/suggestions', limit],
    queryFn: async () => {
      const res = await fetch(`/api/collaborations/suggestions?limit=${limit}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const renderSkeletons = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Suggested Collaborators
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          renderSkeletons()
        ) : suggestions?.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((suggestion: any) => (
              <CollaboratorCard
                key={suggestion.user.id}
                user={suggestion.user}
                matchScore={suggestion.matchScore}
                matchReasons={suggestion.matchReasons}
                showConnectButton={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No suggestions available</p>
            <p className="text-sm">Complete your profile to get better matches!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default SuggestedCollaborators;
