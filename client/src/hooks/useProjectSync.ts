import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStudioStore } from '@/stores/studioStore';
import type { TrackType, AudioClip } from '@/stores/studioStore';

const SYNC_DEBOUNCE_MS = 2000;
const PROJECT_QUERY_KEYS = [
  '/api/projects',
  '/api/studio/projects',
  '/api/studio/start-hub/summary',
];

interface BackendTrack {
  id: string;
  name: string;
  type: string;
  color?: string;
  volume?: number;
  pan?: number;
  muted?: boolean;
  solo?: boolean;
  order?: number;
}

interface BackendClip {
  id: string;
  trackId: string;
  name: string;
  filePath: string;
  startTime: number;
  duration: number;
  offset?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
}

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

      const response = await fetch(`/api/studio/projects/${projectId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });

      if (response.ok) {
        store.getState().markSaved();
      }
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

  const loadProjectData = useCallback(async () => {
    if (!projectId) return false;

    try {
      const [projectRes, tracksRes] = await Promise.all([
        fetch(`/api/studio/projects/${projectId}`),
        fetch(`/api/studio/projects/${projectId}/tracks`),
      ]);

      if (!projectRes.ok || !tracksRes.ok) {
        console.error('[ProjectSync] Failed to load project data');
        return false;
      }

      const projectData = await projectRes.json();
      const tracksData = await tracksRes.json();

      if (projectData) {
        store.setProject({
          id: projectId,
          name: projectData.title || projectData.project?.title || 'Untitled',
        });

        if (projectData.bpm || projectData.project?.bpm) {
          store.setTransport({
            tempo: projectData.bpm || projectData.project?.bpm || 120,
          });
        }
      }

      const backendTracks: BackendTrack[] = tracksData.tracks || tracksData || [];
      const backendClips: BackendClip[] = tracksData.clips || [];

      const state = store.getState();
      const existingTrackIds = new Set(state.tracks.map(t => t.id));

      // Helper to normalize audio URLs for playback
      const normalizeAudioUrl = (url: string): string => {
        if (!url) return url;
        // If it already starts with /api/, it's already normalized
        if (url.startsWith('/api/')) return url;
        // If it starts with http, it's an absolute URL
        if (url.startsWith('http')) return url;
        // Otherwise, prepend the marketplace audio endpoint
        const cleanPath = url.replace(/^\/+/, '');
        return `/api/marketplace/audio/${cleanPath}`;
      };

      for (const track of backendTracks) {
        if (!existingTrackIds.has(track.id)) {
          const trackType = (track.type || 'audio') as TrackType;
          const newTrackId = store.addTrack(trackType, track.name);
          
          const trackClips = backendClips.filter(c => c.trackId === track.id);
          for (const clip of trackClips) {
            const normalizedPath = normalizeAudioUrl(clip.filePath);
            store.addAudioClip(newTrackId, {
              name: clip.name || 'Audio Clip',
              filePath: normalizedPath,
              startTime: clip.startTime || 0,
              duration: clip.duration || 10,
              offset: clip.offset || 0,
              gain: clip.gain || 1,
              fadeIn: clip.fadeIn || 0,
              fadeOut: clip.fadeOut || 0,
              color: track.color || '#3b82f6',
              waveformData: [],
              isLooping: false,
              loopStart: 0,
              loopEnd: clip.duration || 10,
            });
          }

          if (track.volume !== undefined) store.setTrackVolume(newTrackId, track.volume);
          if (track.pan !== undefined) store.setTrackPan(newTrackId, track.pan);
          if (track.muted) store.toggleTrackMute(newTrackId);
          if (track.solo) store.toggleTrackSolo(newTrackId);
        }
      }

      console.log(`[ProjectSync] Loaded project ${projectId} with ${backendTracks.length} tracks`);
      return true;
    } catch (error) {
      console.error('[ProjectSync] Failed to load project data:', error);
      return false;
    }
  }, [projectId, store]);

  return {
    forceSave,
    refreshFromBackend,
    loadProjectData,
    invalidateProjectQueries,
  };
}
