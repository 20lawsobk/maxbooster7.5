import { useState, useRef, useCallback, useEffect } from 'react';
import AudioEngine from '@/lib/audioEngine';
import type { TrackConfig, AudioClip } from '@/lib/audioEngine';
import { logger } from '@/lib/logger';

export interface Track {
  id: string;
  name: string;
  url: string;
  duration: number;
  waveformData?: {
    low: number[];
    medium: number[];
    high: number[];
  };
  gain: number;
  pan: number;
  isMuted: boolean;
  isSolo: boolean;
  effects?: AudioEffect[];
}

export interface AudioEffect {
  id: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'filter';
  enabled: boolean;
  bypass: boolean;
  parameters: Record<string, any>;
  preset?: string;
  wetDryMix?: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  tracks: Track[];
  masterVolume: number;
  bpm: number;
  timeSignature: [number, number];
}

export interface AudioPlayerOptions {
  autoplay?: boolean;
  loop?: boolean;
  preload?: boolean;
  onError?: (error: Error) => void;
}

/**
 * TODO: Add function documentation
 */
export function useAudioPlayer(options: AudioPlayerOptions = {}) {
  const engineRef = useRef<AudioEngine>(AudioEngine.getInstance());
  const [state, setState] = useState<PlaybackState>({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    playbackRate: 1.0,
    volume: 1.0,
    tracks: [],
    masterVolume: 0.8,
    bpm: 120,
    timeSignature: [4, 4],
  });

  const animationFrameRef = useRef<number>();
  const initializeRef = useRef<Promise<void> | null>(null);

  // Initialize AudioEngine on mount
  useEffect(() => {
    const initEngine = async () => {
      try {
        await engineRef.current.initialize();
      } catch (error: unknown) {
        logger.error('Failed to initialize AudioEngine:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    };

    if (!initializeRef.current) {
      initializeRef.current = initEngine();
    }

    return () => {
      // Cleanup on unmount
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Note: We don't dispose the engine here as it's a singleton
      // and may be used by other components
    };
  }, [options.onError]);

  // Update current time while playing
  const updateCurrentTime = useCallback(() => {
    if (state.isPlaying) {
      const currentTime = engineRef.current.getCurrentTime();
      setState((prev) => ({ ...prev, currentTime }));

      if (currentTime >= state.duration && state.duration > 0) {
        // Playback finished
        setState((prev) => ({ ...prev, isPlaying: false, isPaused: false }));
      } else {
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      }
    }
  }, [state.isPlaying, state.duration]);

  const loadTrack = useCallback(
    async (track: Track) => {
      setState((prev) => ({ ...prev, isLoading: true }));

      try {
        // Ensure engine is initialized
        await initializeRef.current;

        // Convert track to AudioClip format
        const clip: AudioClip = {
          id: track.id,
          url: track.url,
          startTime: 0,
          duration: track.duration || 0,
          offset: 0,
        };

        // Load buffer and get waveform data
        const buffer = await engineRef.current.loadBuffer(track.id, track.url);
        const waveformData = engineRef.current.getWaveformData(track.id);

        // Update track with duration and waveform
        const updatedTrack = {
          ...track,
          duration: buffer.duration,
          waveformData: waveformData || undefined,
        };

        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => (t.id === track.id ? updatedTrack : t)),
          duration: Math.max(prev.duration, buffer.duration),
          isLoading: false,
        }));
      } catch (error: unknown) {
        logger.error('Error loading track:', error);
        setState((prev) => ({ ...prev, isLoading: false }));
        if (options.onError) {
          options.onError(error as Error);
        }
        throw error;
      }
    },
    [options.onError]
  );

  const addTrack = useCallback(
    async (track: Track) => {
      setState((prev) => ({ ...prev, tracks: [...prev.tracks, track] }));

      try {
        // Ensure engine is initialized
        await initializeRef.current;

        // Create track in engine
        const trackConfig: TrackConfig = {
          id: track.id,
          name: track.name,
          gain: track.gain,
          pan: track.pan,
          isMuted: track.isMuted,
          isSolo: track.isSolo,
          bus: 'master',
          clips: [
            {
              id: track.id,
              url: track.url,
              startTime: 0,
              duration: track.duration || 0,
              offset: 0,
            },
          ],
        };

        engineRef.current.createTrack(trackConfig);

        // Load the track buffer
        await loadTrack(track);
      } catch (error: unknown) {
        logger.error('Error adding track:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
        throw error;
      }
    },
    [loadTrack, options.onError]
  );

  const removeTrack = useCallback(
    (trackId: string) => {
      try {
        engineRef.current.removeTrack(trackId);
        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.filter((t) => t.id !== trackId),
        }));
      } catch (error: unknown) {
        logger.error('Error removing track:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [options.onError]
  );

  const play = useCallback(
    async (startTime: number = 0) => {
      try {
        await initializeRef.current;
        await engineRef.current.play(startTime);

        setState((prev) => ({
          ...prev,
          isPlaying: true,
          isPaused: false,
          currentTime: startTime,
        }));

        // Start time updates
        animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
      } catch (error: unknown) {
        logger.error('Error starting playback:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
        throw error;
      }
    },
    [updateCurrentTime, options.onError]
  );

  const pause = useCallback(() => {
    try {
      engineRef.current.pause();

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isPaused: true,
        currentTime: engineRef.current.getCurrentTime(),
      }));
    } catch (error: unknown) {
      logger.error('Error pausing playback:', error);
      if (options.onError) {
        options.onError(error as Error);
      }
    }
  }, [options.onError]);

  const stop = useCallback(() => {
    try {
      engineRef.current.stop();

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isPaused: false,
        currentTime: 0,
      }));
    } catch (error: unknown) {
      logger.error('Error stopping playback:', error);
      if (options.onError) {
        options.onError(error as Error);
      }
    }
  }, [options.onError]);

  const seek = useCallback(
    async (time: number) => {
      const wasPlaying = state.isPlaying;

      if (wasPlaying) {
        pause();
      }

      setState((prev) => ({ ...prev, currentTime: time }));

      if (wasPlaying) {
        await play(time);
      }
    },
    [state.isPlaying, pause, play]
  );

  const updateTrackGain = useCallback(
    (trackId: string, gain: number) => {
      try {
        engineRef.current.updateTrackGain(trackId, gain);
        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, gain } : t)),
        }));
      } catch (error: unknown) {
        logger.error('Error updating track gain:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [options.onError]
  );

  const updateTrackPan = useCallback(
    (trackId: string, pan: number) => {
      try {
        engineRef.current.updateTrackPan(trackId, pan);
        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, pan } : t)),
        }));
      } catch (error: unknown) {
        logger.error('Error updating track pan:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [options.onError]
  );

  const muteTrack = useCallback(
    (trackId: string) => {
      const track = state.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const newMuteState = !track.isMuted;

      try {
        engineRef.current.updateTrackMute(trackId, newMuteState);
        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, isMuted: newMuteState } : t)),
        }));
      } catch (error: unknown) {
        logger.error('Error muting track:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [state.tracks, options.onError]
  );

  const soloTrack = useCallback(
    (trackId: string) => {
      const track = state.tracks.find((t) => t.id === trackId);
      if (!track) return;

      const newSoloState = !track.isSolo;

      try {
        engineRef.current.updateTrackSolo(trackId, newSoloState);
        setState((prev) => ({
          ...prev,
          tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, isSolo: newSoloState } : t)),
        }));
      } catch (error: unknown) {
        logger.error('Error soloing track:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [state.tracks, options.onError]
  );

  const setMasterVolume = useCallback(
    (volume: number) => {
      try {
        engineRef.current.setMasterVolume(volume);
        setState((prev) => ({ ...prev, masterVolume: volume }));
      } catch (error: unknown) {
        logger.error('Error setting master volume:', error);
        if (options.onError) {
          options.onError(error as Error);
        }
      }
    },
    [options.onError]
  );

  const setPlaybackRate = useCallback((rate: number) => {
    setState((prev) => ({ ...prev, playbackRate: rate }));
  }, []);

  const getTrackPeakLevel = useCallback((trackId: string): { peak: number; rms: number } => {
    try {
      return engineRef.current.getTrackPeakLevel(trackId);
    } catch (error: unknown) {
      return { peak: -60, rms: -60 };
    }
  }, []);

  const getMasterPeakLevel = useCallback((): { peak: number; rms: number } => {
    try {
      return engineRef.current.getMasterPeakLevel();
    } catch (error: unknown) {
      return { peak: -60, rms: -60 };
    }
  }, []);

  const getAudioContext = useCallback(() => engineRef.current.getContext(), []);

  // CPU usage monitoring using AudioContext load estimation
  const getCPUUsage = useCallback((): number => {
    const context = engineRef.current.getContext();
    if (!context) return 0;

    try {
      // Use AudioContext's baseLatency and outputLatency for CPU estimation
      // Higher latency typically indicates higher CPU load
      const baseLatency = (context as any).baseLatency || 0;
      const outputLatency = (context as any).outputLatency || 0;
      const totalLatency = baseLatency + outputLatency;
      
      // Estimate CPU usage based on latency and active track count
      const activeTrackCount = state.tracks.filter(t => !t.isMuted).length;
      const baseUsage = Math.min(totalLatency * 1000, 30); // Latency contribution
      const trackUsage = activeTrackCount * 5; // ~5% per active track
      
      return Math.min(baseUsage + trackUsage, 100);
    } catch {
      return 0;
    }
  }, [state.tracks]);

  // Get audio context state
  const isSupported = !!window.AudioContext || !!(window as any).webkitAudioContext;

  return {
    ...state,
    isSupported,
    context: getAudioContext(),
    addTrack,
    removeTrack,
    loadTrack,
    play,
    pause,
    stop,
    seek,
    updateTrackGain,
    updateTrackPan,
    muteTrack,
    soloTrack,
    setMasterVolume,
    setPlaybackRate,
    getTrackPeakLevel,
    getMasterPeakLevel,
    getAudioContext,
    getCPUUsage,
  };
}

// Helper function for exporting - uses performance API when available
export function getCPUUsage(): number {
  try {
    // Use Performance API to estimate CPU load
    const entries = performance.getEntriesByType('resource');
    const recentEntries = entries.slice(-10);
    
    if (recentEntries.length === 0) return 0;
    
    // Calculate average processing time as CPU indicator
    const avgDuration = recentEntries.reduce((sum, e) => sum + e.duration, 0) / recentEntries.length;
    return Math.min(avgDuration / 10, 100); // Normalize to 0-100%
  } catch {
    return 0;
  }
}
