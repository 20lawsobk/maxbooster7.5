import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { InsertStudioTrack, InsertAudioClip } from '@shared/schema';
import AudioEngine from '@/lib/audioEngine';
import { useStudioStore } from '@/lib/studioStore';
import { logger } from '@/lib/logger';

export interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  trackNumber: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  recordEnabled: boolean;
  inputMonitoring: boolean;
  color: string;
  height: number;
  collapsed: boolean;
  outputBus: string;
  groupId?: string;
}

export interface AudioClipData {
  id: string;
  name: string;
  filePath?: string;
  audioUrl?: string;
  startTime: number;
  duration: number;
  offset?: number;
  gain?: number;
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  tempo: number;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  clickEnabled: boolean;
}

export interface StudioControllerOptions {
  projectId: string | null;
  onError?: (error: Error) => void;
}

/**
 * TODO: Add function documentation
 */
export function useStudioController({ projectId, onError }: StudioControllerOptions) {
  const queryClient = useQueryClient();

  // Audio Engine instance (singleton)
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const [audioEngineInitialized, setAudioEngineInitialized] = useState(false);

  // Use Zustand store for transport state (single source of truth)
  const {
    currentTime,
    isPlaying,
    isRecording,
    tempo,
    loopEnabled,
    loopStart,
    loopEnd,
    metronomeEnabled,
    setCurrentTime: setStoreCurrentTime,
    setIsPlaying: setStoreIsPlaying,
    setIsRecording: setStoreIsRecording,
    setTempo: setStoreTempo,
  } = useStudioStore();

  // Track state
  const [tracks, setTracks] = useState<StudioTrack[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Clips state (trackId -> AudioClipData[])
  const [trackClips, setTrackClips] = useState<Map<string, AudioClipData[]>>(new Map());

  // RAF for time updates
  const animationFrameRef = useRef<number>();

  // Transport state getter for compatibility
  const transport: TransportState = {
    isPlaying,
    isRecording,
    currentTime,
    tempo,
    loopEnabled,
    loopStart,
    loopEnd,
    clickEnabled: metronomeEnabled,
  };

  // Initialize AudioEngine on mount (with mobile-safe guards)
  useEffect(() => {
    try {
      // Check if Web Audio API is supported before creating instance
      if (!AudioEngine.isSupported()) {
        logger.warn('Web Audio API not supported in this browser');
        if (onError) {
          onError(new Error('Web Audio API is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.'));
        }
        return;
      }
      audioEngineRef.current = AudioEngine.getInstance();
    } catch (error) {
      logger.error('Failed to get AudioEngine instance:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error('Failed to initialize audio engine'));
      }
    }
    return () => {
      // Cleanup on unmount - stop playback if active
      try {
        if (audioEngineRef.current) {
          audioEngineRef.current.stop();
        }
      } catch (cleanupError) {
        logger.warn('Error during AudioEngine cleanup:', cleanupError);
      }
    };
  }, [onError]);

  // Update transport current time from audio engine
  useEffect(() => {
    if (isPlaying && audioEngineRef.current) {
      const updateTime = () => {
        const engineTime = audioEngineRef.current?.getCurrentTime() || 0;
        setStoreCurrentTime(engineTime);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      };
      animationFrameRef.current = requestAnimationFrame(updateTime);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, setStoreCurrentTime]);

  // Create track mutation
  const createTrackMutation = useMutation({
    mutationFn: async (trackData: Partial<InsertStudioTrack>) => {
      return await apiRequest('POST', `/api/studio/tracks`, trackData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
    },
  });

  // Update track mutation
  const updateTrackMutation = useMutation({
    mutationFn: async ({
      trackId,
      updates,
    }: {
      trackId: string;
      updates: Partial<StudioTrack>;
    }) => {
      return await apiRequest('PATCH', `/api/studio/tracks/${trackId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
    },
  });

  // Delete track mutation
  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      return await apiRequest('DELETE', `/api/studio/tracks/${trackId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
    },
  });

  // Update clip mutation
  const updateClipMutation = useMutation({
    mutationFn: async ({
      clipId,
      updates,
    }: {
      clipId: string;
      updates: Partial<InsertAudioClip>;
    }) => {
      return await apiRequest('PATCH', `/api/studio/clips/${clipId}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
    },
  });

  // Delete clip mutation
  const deleteClipMutation = useMutation({
    mutationFn: async (clipId: string) => {
      return await apiRequest('DELETE', `/api/studio/clips/${clipId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
    },
  });

  // ========== TRANSPORT CONTROLS ==========

  const play = useCallback(async () => {
    try {
      if (!audioEngineRef.current) {
        throw new Error('Audio engine not initialized');
      }

      // Initialize and unlock AudioEngine (BeatStars-style: works on user gesture)
      const isReady = await audioEngineRef.current.ensureReady();
      if (!isReady) {
        // Still not ready, but we can continue - it might unlock mid-playback
        logger.warn('Audio engine not fully ready, attempting playback anyway');
      }
      setAudioEngineInitialized(true);

      // Clear orphaned tracks from previous sessions
      const currentTrackIds = new Set(tracks.map((t) => t.id));
      const engineTrackIds = audioEngineRef.current.getAllTrackIds();
      engineTrackIds.forEach((trackId) => {
        if (!currentTrackIds.has(trackId)) {
          audioEngineRef.current!.removeTrack(trackId);
        }
      });

      // Preload all tracks and clips into AudioEngine
      for (const track of tracks) {
        if (track.trackType === 'audio') {
          const clips = trackClips.get(track.id) || [];

          // Create track in AudioEngine if not exists
          if (!audioEngineRef.current.hasTrack(track.id)) {
            audioEngineRef.current.createTrack({
              id: track.id,
              name: track.name,
              gain: track.volume,
              pan: track.pan,
              isMuted: track.mute,
              isSolo: track.solo,
              bus: track.outputBus || 'master',
            });
          } else {
            // Update existing track parameters to match current state
            audioEngineRef.current.updateTrackGain(track.id, track.volume);
            audioEngineRef.current.updateTrackPan(track.id, track.pan);
            audioEngineRef.current.setTrackMute(track.id, track.mute);
            audioEngineRef.current.setTrackSolo(track.id, track.solo);
          }

          // Load clips for this track to ensure synchronization
          if (clips.length > 0) {
            await audioEngineRef.current.loadTrack(
              track.id,
              clips.map((clip) => ({
                id: clip.id,
                url: clip.audioUrl || clip.filePath || '',
                startTime: clip.startTime,
                duration: clip.duration,
                offset: clip.offset || 0,
              }))
            );
          }
        }
      }

      // Start playback
      await audioEngineRef.current.play(currentTime);
      setStoreIsPlaying(true);
    } catch (error: unknown) {
      logger.error('Failed to play:', error);
      if (onError) onError(error as Error);
    }
  }, [audioEngineInitialized, tracks, trackClips, currentTime, setStoreIsPlaying, onError]);

  const pause = useCallback(() => {
    try {
      if (!audioEngineRef.current) return;

      audioEngineRef.current.pause();
      const engineTime = audioEngineRef.current.getCurrentTime();
      setStoreCurrentTime(engineTime);
      setStoreIsPlaying(false);
    } catch (error: unknown) {
      logger.error('Failed to pause:', error);
      if (onError) onError(error as Error);
    }
  }, [setStoreCurrentTime, setStoreIsPlaying, onError]);

  const stop = useCallback(() => {
    try {
      if (!audioEngineRef.current) return;

      audioEngineRef.current.stop();
      setStoreCurrentTime(0);
      setStoreIsPlaying(false);
      setStoreIsRecording(false);
    } catch (error: unknown) {
      logger.error('Failed to stop:', error);
      if (onError) onError(error as Error);
    }
  }, [setStoreCurrentTime, setStoreIsPlaying, setStoreIsRecording, onError]);

  const seek = useCallback(
    async (time: number) => {
      try {
        if (!audioEngineRef.current) return;

        await audioEngineRef.current.seek(time);
        setStoreCurrentTime(time);
      } catch (error: unknown) {
        logger.error('Failed to seek:', error);
        if (onError) onError(error as Error);
      }
    },
    [setStoreCurrentTime, onError]
  );

  const toggleLoop = useCallback(() => {
    // This is handled by Zustand store directly
  }, []);

  const toggleClick = useCallback(() => {
    // This is handled by Zustand store directly
  }, []);

  const setTempo = useCallback(
    (newTempo: number) => {
      setStoreTempo(newTempo);

      // Persist tempo changes to backend if projectId exists
      if (projectId) {
        apiRequest('PATCH', `/api/studio/projects/${projectId}`, { tempo: newTempo }).catch(
          (error) => {
            logger.error('Failed to persist tempo:', error);
            if (onError) onError(error as Error);
          }
        );
      }
    },
    [projectId, setStoreTempo, onError]
  );

  const startRecording = useCallback(async () => {
    setStoreIsRecording(true);
    if (!isPlaying) {
      await play();
    }
  }, [isPlaying, play, setStoreIsRecording]);

  const stopRecording = useCallback(() => {
    setStoreIsRecording(false);
  }, [setStoreIsRecording]);

  // ========== TRACK MANAGEMENT ==========

  const loadTracks = useCallback(
    async (tracksData: StudioTrack[]) => {
      setTracks(tracksData);

      const clipsMap = new Map<string, AudioClipData[]>();

      // Initialize audio engine if needed
      if (!audioEngineRef.current) {
        audioEngineRef.current = AudioEngine.getInstance();
      }

      // Load audio clip data for tracks (defer audio engine track creation until play)
      for (const track of tracksData) {
        if (track.trackType === 'audio') {
          try {
            // Fetch clips for this track from API
            const response = await fetch(`/api/studio/tracks/${track.id}/audio-clips`);
            if (!response.ok) {
              continue;
            }

            const clips: AudioClipData[] = await response.json();
            clipsMap.set(track.id, clips || []);
          } catch (error: unknown) {
            logger.error(`Failed to load clips for track ${track.id}:`, error);
            if (onError) onError(error as Error);
          }
        }
      }

      setTrackClips(clipsMap);
    },
    [onError]
  );

  const createTrack = useCallback(
    async (trackData: Partial<InsertStudioTrack>) => {
      try {
        const result = await createTrackMutation.mutateAsync({
          ...trackData,
          projectId: projectId || undefined,
        });
        return result;
      } catch (error: unknown) {
        logger.error('Failed to create track:', error);
        if (onError) onError(error as Error);
        throw error;
      }
    },
    [createTrackMutation, projectId, onError]
  );

  const updateTrack = useCallback(
    async (trackId: string, updates: Partial<StudioTrack>) => {
      try {
        // Optimistic update in local state
        setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)));

        // Update in audio engine if relevant
        if (audioEngineRef.current) {
          if (updates.volume !== undefined) {
            audioEngineRef.current.updateTrackGain(trackId, updates.volume);
          }
          if (updates.pan !== undefined) {
            audioEngineRef.current.updateTrackPan(trackId, updates.pan);
          }
          if (updates.mute !== undefined) {
            audioEngineRef.current.setTrackMute(trackId, updates.mute);
          }
          if (updates.solo !== undefined) {
            audioEngineRef.current.setTrackSolo(trackId, updates.solo);
          }
        }

        // Persist to backend
        await updateTrackMutation.mutateAsync({ trackId, updates });
      } catch (error: unknown) {
        logger.error('Failed to update track:', error);
        if (onError) onError(error as Error);
        throw error;
      }
    },
    [updateTrackMutation, onError]
  );

  const deleteTrack = useCallback(
    async (trackId: string) => {
      try {
        // Remove from audio engine
        if (audioEngineRef.current) {
          audioEngineRef.current.removeTrack(trackId);
        }

        // Remove from local state
        setTracks((prev) => prev.filter((t) => t.id !== trackId));
        setTrackClips((prev) => {
          const newMap = new Map(prev);
          newMap.delete(trackId);
          return newMap;
        });

        // Persist to backend
        await deleteTrackMutation.mutateAsync(trackId);
      } catch (error: unknown) {
        logger.error('Failed to delete track:', error);
        if (onError) onError(error as Error);
        throw error;
      }
    },
    [deleteTrackMutation, onError]
  );

  // ========== MIXER CONTROLS ==========

  const setTrackVolume = useCallback(
    async (trackId: string, volume: number) => {
      await updateTrack(trackId, { volume });
    },
    [updateTrack]
  );

  const setTrackPan = useCallback(
    async (trackId: string, pan: number) => {
      await updateTrack(trackId, { pan });
    },
    [updateTrack]
  );

  const toggleMute = useCallback(
    async (trackId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        await updateTrack(trackId, { mute: !track.mute });
      }
    },
    [tracks, updateTrack]
  );

  const toggleSolo = useCallback(
    async (trackId: string) => {
      const track = tracks.find((t) => t.id === trackId);
      if (track) {
        await updateTrack(trackId, { solo: !track.solo });
      }
    },
    [tracks, updateTrack]
  );

  const setMasterVolume = useCallback((volume: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setMasterVolume(volume);
    }
  }, []);

  // ========== CLIP MANAGEMENT ==========

  const updateClipInMap = useCallback(
    (trackId: string, clipId: string, updates: Partial<AudioClipData>) => {
      setTrackClips((prev) => {
        const newMap = new Map(prev);
        const clips = newMap.get(trackId) || [];
        const updatedClips = clips.map((clip) =>
          clip.id === clipId ? { ...clip, ...updates } : clip
        );
        newMap.set(trackId, updatedClips);

        // Sync to audio engine
        if (audioEngineRef.current) {
          audioEngineRef.current.addClipsToTrack(
            trackId,
            updatedClips.map((clip) => ({
              id: clip.id,
              url: clip.filePath,
              startTime: clip.startTime,
              duration: clip.duration,
              offset: clip.offset,
            }))
          );
        }

        return newMap;
      });
    },
    []
  );

  const addClipToMap = useCallback((trackId: string, clip: AudioClipData) => {
    setTrackClips((prev) => {
      const newMap = new Map(prev);
      const clips = newMap.get(trackId) || [];
      const updatedClips = [...clips, clip];
      newMap.set(trackId, updatedClips);

      // Sync to audio engine
      if (audioEngineRef.current) {
        audioEngineRef.current.addClipsToTrack(
          trackId,
          updatedClips.map((c) => ({
            id: c.id,
            url: c.filePath,
            startTime: c.startTime,
            duration: c.duration,
            offset: c.offset,
          }))
        );
      }

      return newMap;
    });
  }, []);

  const removeClipFromMap = useCallback((trackId: string, clipId: string) => {
    setTrackClips((prev) => {
      const newMap = new Map(prev);
      const clips = newMap.get(trackId) || [];
      const updatedClips = clips.filter((clip) => clip.id !== clipId);
      newMap.set(trackId, updatedClips);

      // Sync to audio engine
      if (audioEngineRef.current) {
        audioEngineRef.current.addClipsToTrack(
          trackId,
          updatedClips.map((clip) => ({
            id: clip.id,
            url: clip.filePath,
            startTime: clip.startTime,
            duration: clip.duration,
            offset: clip.offset,
          }))
        );
      }

      return newMap;
    });
  }, []);

  const updateClip = useCallback(
    async (clipId: string, updates: Partial<InsertAudioClip>) => {
      try {
        await updateClipMutation.mutateAsync({ clipId, updates });

        // Update audio engine schedule by reloading clips if track is found
        if (audioEngineRef.current && updates.startTime !== undefined) {
          // Find which track contains this clip
          for (const [trackId, clips] of trackClips.entries()) {
            const clipIndex = clips.findIndex((c) => c.id === clipId);
            if (clipIndex !== -1) {
              // Update the clip in the map
              const updatedClips = [...clips];
              updatedClips[clipIndex] = { ...updatedClips[clipIndex], ...updates };

              // Sync to audio engine
              audioEngineRef.current.addClipsToTrack(
                trackId,
                updatedClips.map((clip) => ({
                  id: clip.id,
                  url: clip.filePath,
                  startTime: clip.startTime,
                  duration: clip.duration,
                  offset: clip.offset,
                }))
              );

              // Update local state
              setTrackClips((prev) => {
                const newMap = new Map(prev);
                newMap.set(trackId, updatedClips);
                return newMap;
              });
              break;
            }
          }
        }
      } catch (error: unknown) {
        logger.error('Failed to update clip:', error);
        if (onError) onError(error as Error);
        throw error;
      }
    },
    [updateClipMutation, trackClips, onError]
  );

  // Calculate project duration from clips reactively
  const projectDuration = useMemo(() => {
    let maxDuration = 0;
    for (const clips of trackClips.values()) {
      for (const clip of clips) {
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd > maxDuration) {
          maxDuration = clipEnd;
        }
      }
    }
    // Return at least 60 seconds for empty projects
    return Math.max(maxDuration, 60);
  }, [trackClips]);

  // Get AudioContext from engine
  const getAudioContext = useCallback(() => {
    return audioEngineRef.current?.getContext() || null;
  }, []);

  return {
    // Transport
    transport,
    play,
    pause,
    stop,
    seek,
    toggleLoop,
    toggleClick,
    setTempo,
    startRecording,
    stopRecording,

    // Tracks
    tracks,
    loadTracks,
    createTrack,
    updateTrack,
    deleteTrack,
    selectedTrackId,
    setSelectedTrackId,

    // Mixer
    setTrackVolume,
    setTrackPan,
    toggleMute,
    toggleSolo,
    setMasterVolume,

    // Clips
    trackClips,
    updateClip,
    updateClipInMap,
    addClipToMap,
    removeClipFromMap,

    // Audio Engine access
    projectDuration,
    getAudioContext,

    // Loading states
    isCreatingTrack: createTrackMutation.isPending,
    isUpdatingTrack: updateTrackMutation.isPending,
    isDeletingTrack: deleteTrackMutation.isPending,
  };
}
