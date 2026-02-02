import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudioStore } from '@/stores/studioStore';

const SYNC_DEBOUNCE_MS = 2000;
const PROJECT_QUERY_KEYS = [
  '/api/projects',
  '/api/studio/projects',
  '/api/studio/start-hub/summary',
];

export function useProjectSync(projectId: string | null) {
  const queryClient = useQueryClient();
  const store = useStudioStore();
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  const invalidateProjectQueries = useCallback(() => {
    PROJECT_QUERY_KEYS.forEach(key => {
      queryClient.invalidateQueries({ queryKey: [key] });
    });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: [`/api/studio/projects/${projectId}`] });
    }
  }, [queryClient, projectId]);

  const syncToBackend = useCallback(async () => {
    if (!projectId) return;

    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_DEBOUNCE_MS) return;
    lastSyncRef.current = now;

    try {
      const state = store.getState();
      const projectData = {
        tracks: state.tracks.map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          volume: t.volume,
          pan: t.pan,
          muted: t.muted,
          solo: t.solo,
        })),
        transport: {
          tempo: state.transport.tempo,
          timeSignature: state.transport.timeSignature,
        },
      };

      await fetch(`/api/studio/projects/${projectId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      invalidateProjectQueries();
    } catch (error) {
      console.error('[ProjectSync] Failed to sync:', error);
    }
  }, [projectId, store, invalidateProjectQueries]);

  const debouncedSync = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(syncToBackend, SYNC_DEBOUNCE_MS);
  }, [syncToBackend]);

  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = useStudioStore.subscribe(
      (state) => ({
        tracks: state.tracks,
        transport: state.transport,
      }),
      () => {
        debouncedSync();
      },
      { equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
    );

    return () => {
      unsubscribe();
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [projectId, debouncedSync]);

  const forceSave = useCallback(async () => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    await syncToBackend();
  }, [syncToBackend]);

  const refreshFromBackend = useCallback(async () => {
    if (!projectId) return;

    try {
      const response = await fetch(`/api/studio/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.project) {
          store.setProject({
            id: data.project.id,
            name: data.project.title || 'Untitled',
          });
        }
      }
    } catch (error) {
      console.error('[ProjectSync] Failed to refresh:', error);
    }
  }, [projectId, store]);

  return {
    forceSave,
    refreshFromBackend,
    invalidateProjectQueries,
  };
}
