import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useStudioStore, type Marker } from '@/lib/studioStore';
import { useToast } from '@/hooks/use-toast';

/**
 * TODO: Add function documentation
 */
export function useMarkers(projectId: string | null) {
  const { markers, addMarker, updateMarker, deleteMarker } = useStudioStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const markersQuery = useQuery({
    queryKey: ['markers', projectId],
    queryFn: async () => {
      if (!projectId) return { markers: [] };
      const response = await apiRequest('GET', `/api/studio/projects/${projectId}/markers`);
      const data = await response.json();
      return data;
    },
    enabled: !!projectId,
    staleTime: 30000, // 30 seconds
    onSuccess: (data) => {
      // Sync markers from API to Zustand store
      if (data.markers) {
        const currentMarkerIds = new Set(markers.map((m) => m.id));
        const apiMarkerIds = new Set(data.markers.map((m: unknown) => m.id));

        // Add or update markers from API
        data.markers.forEach((marker: unknown) => {
          if (!currentMarkerIds.has(marker.id)) {
            addMarker(marker);
          } else {
            const currentMarker = markers.find((m) => m.id === marker.id);
            if (currentMarker && JSON.stringify(currentMarker) !== JSON.stringify(marker)) {
              updateMarker(marker.id, marker);
            }
          }
        });
      }
    },
  });

  const createMarkerMutation = useMutation({
    mutationFn: async (marker: Omit<Marker, 'id'>) => {
      if (!projectId) throw new Error('No project selected');
      const response = await apiRequest(
        'POST',
        `/api/studio/projects/${projectId}/markers`,
        marker
      );
      return await response.json();
    },
    onMutate: async (newMarker) => {
      // Optimistic update: Add temporary marker to Zustand store
      const tempId = `temp-${Date.now()}`;
      const optimisticMarker: Marker = {
        id: tempId,
        ...newMarker,
      };
      addMarker(optimisticMarker);
      return { tempId };
    },
    onSuccess: (data, variables, context) => {
      // Replace temporary marker with real one from server
      if (context?.tempId) {
        deleteMarker(context.tempId);
      }
      addMarker(data);
      queryClient.invalidateQueries({ queryKey: ['markers', projectId] });
      toast({ title: 'Marker created' });
    },
    onError: (error: unknown, variables, context) => {
      // Rollback: Remove temporary marker
      if (context?.tempId) {
        deleteMarker(context.tempId);
      }
      toast({
        title: 'Failed to create marker',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMarkerMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Marker> }) => {
      const response = await apiRequest('PATCH', `/api/studio/markers/${id}`, updates);
      return await response.json();
    },
    onMutate: async ({ id, updates }) => {
      // Optimistic update: Update marker in Zustand store immediately
      const previousMarker = markers.find((m) => m.id === id);
      if (previousMarker) {
        updateMarker(id, updates);
      }
      return { previousMarker };
    },
    onSuccess: (data) => {
      // Update with server response
      updateMarker(data.id, data);
      queryClient.invalidateQueries({ queryKey: ['markers', projectId] });
    },
    onError: (error: unknown, { id }, context) => {
      // Rollback: Restore previous marker state
      if (context?.previousMarker) {
        updateMarker(id, context.previousMarker);
      }
      toast({
        title: 'Failed to update marker',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteMarkerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/studio/markers/${id}`);
      return id;
    },
    onMutate: async (id) => {
      // Optimistic update: Remove marker from Zustand store immediately
      const previousMarker = markers.find((m) => m.id === id);
      deleteMarker(id);
      return { previousMarker };
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['markers', projectId] });
      toast({ title: 'Marker deleted' });
    },
    onError: (error: unknown, id, context) => {
      // Rollback: Restore deleted marker
      if (context?.previousMarker) {
        addMarker(context.previousMarker);
      }
      toast({
        title: 'Failed to delete marker',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    markers: markersQuery.data?.markers || markers,
    isLoading: markersQuery.isLoading,
    error: markersQuery.error,
    createMarker: createMarkerMutation.mutate,
    updateMarker: updateMarkerMutation.mutate,
    deleteMarker: deleteMarkerMutation.mutate,
    isCreating: createMarkerMutation.isPending,
    isUpdating: updateMarkerMutation.isPending,
    isDeleting: deleteMarkerMutation.isPending,
  };
}
