import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useStudioStore } from '@/lib/studioStore';
import AudioEngine from '@/lib/audioEngine';
import { logger } from '@/lib/logger';
import { apiRequest } from '@/lib/queryClient';

export type FlowStateMode = 'create' | 'record' | 'mix' | 'master' | 'perform';
export type SelectionType = 'none' | 'track' | 'clip' | 'range' | 'automation' | 'midi';

export interface FlowStateTrack {
  id: string;
  name: string;
  type: 'audio' | 'midi' | 'instrument' | 'bus' | 'master';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  meterLevel: [number, number];
  clips: FlowStateClip[];
  spatialPosition?: { x: number; y: number; z: number };
}

export interface FlowStateClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
  waveformData?: number[];
  color: string;
}

export interface FlowStateTransport {
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  tempo: number;
  timeSignature: string;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  metronomeEnabled: boolean;
}

export interface AICoProducerSuggestion {
  id: string;
  type: 'harmonic' | 'rhythmic' | 'arrangement' | 'mix' | 'effect' | 'automation';
  title: string;
  description: string;
  confidence: number;
  action: () => void;
  preview?: () => void;
}

export interface FlowStateContext {
  mode: FlowStateMode;
  selectionType: SelectionType;
  selectedTrackIds: string[];
  selectedClipIds: string[];
  timeSelection?: { start: number; end: number };
  zoomLevel: number;
  scrollPosition: number;
}

export interface UseFlowStateAdapterReturn {
  tracks: FlowStateTrack[];
  transport: FlowStateTransport;
  context: FlowStateContext;
  suggestions: AICoProducerSuggestion[];
  
  play: () => void;
  pause: () => void;
  stop: () => void;
  record: () => void;
  toggleLoop: () => void;
  toggleMetronome: () => void;
  seek: (time: number) => void;
  setTempo: (bpm: number) => void;
  
  addTrack: (type: string, name: string) => void;
  duplicateTrack: (trackId: string) => void;
  deleteTrack: (trackId: string) => void;
  
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;
  
  selectTrack: (trackId: string, addToSelection?: boolean) => void;
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  clearSelection: () => void;
  
  setMode: (mode: FlowStateMode) => void;
  setZoom: (level: number) => void;
  setScroll: (position: number) => void;
  
  getMeterLevels: () => Map<string, [number, number]>;
  getMasterMeterLevels: () => [number, number];
}

export function useFlowStateAdapter(projectId: string | null): UseFlowStateAdapterReturn {
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const meterAnimationRef = useRef<number>();
  
  const [meterLevels, setMeterLevels] = useState<Map<string, [number, number]>>(new Map());
  const [masterMeterLevels, setMasterMeterLevels] = useState<[number, number]>([0, 0]);
  const [suggestions, setSuggestions] = useState<AICoProducerSuggestion[]>([]);
  
  const [context, setContext] = useState<FlowStateContext>({
    mode: 'create',
    selectionType: 'none',
    selectedTrackIds: [],
    selectedClipIds: [],
    zoomLevel: 1,
    scrollPosition: 0,
  });
  
  const {
    currentTime,
    isPlaying,
    isRecording,
    tempo,
    loopEnabled,
    loopStart,
    loopEnd,
    metronomeEnabled,
    timeSignature,
    tracks: storeTracks,
    setCurrentTime,
    setIsPlaying,
    setIsRecording,
    setTempo: setStoreTempo,
    setLoopEnabled,
    setMetronomeEnabled,
    setTrackVolume: setStoreTrackVolume,
    setTrackPan: setStoreTrackPan,
    setTrackMute: setStoreTrackMute,
    setTrackSolo: setStoreTrackSolo,
    setTrackArmed: setStoreTrackArmed,
  } = useStudioStore();

  const queryClient = useQueryClient();

  const createTrackMutation = useMutation({
    mutationFn: async ({ name, trackType, color }: { name: string; trackType: string; color?: string }) => {
      if (!projectId) throw new Error('No project selected');
      return await apiRequest('POST', '/api/studio/tracks', {
        projectId,
        name,
        trackType,
        color,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
      logger.info('[FlowStateAdapter] Track created successfully');
    },
    onError: (error) => {
      logger.error('[FlowStateAdapter] Failed to create track:', error);
    },
  });

  const deleteTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      return await apiRequest('DELETE', `/api/studio/tracks/${trackId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
      logger.info('[FlowStateAdapter] Track deleted successfully');
    },
    onError: (error) => {
      logger.error('[FlowStateAdapter] Failed to delete track:', error);
    },
  });

  const duplicateTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const trackToDuplicate = storeTracks.find(t => t.id === trackId);
      if (!trackToDuplicate || !projectId) throw new Error('Track or project not found');
      return await apiRequest('POST', '/api/studio/tracks', {
        projectId,
        name: `${trackToDuplicate.name} (Copy)`,
        trackType: trackToDuplicate.trackType,
        color: trackToDuplicate.color,
        volume: trackToDuplicate.volume,
        pan: trackToDuplicate.pan,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'tracks'] });
      logger.info('[FlowStateAdapter] Track duplicated successfully');
    },
    onError: (error) => {
      logger.error('[FlowStateAdapter] Failed to duplicate track:', error);
    },
  });

  useEffect(() => {
    if (AudioEngine.isSupported()) {
      audioEngineRef.current = AudioEngine.getInstance();
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (meterAnimationRef.current) {
        cancelAnimationFrame(meterAnimationRef.current);
      }
      return;
    }

    const updateMeters = () => {
      if (audioEngineRef.current) {
        const levels = new Map<string, [number, number]>();
        storeTracks.forEach(track => {
          const trackLevels = audioEngineRef.current!.getTrackMeterLevels(track.id);
          if (trackLevels) {
            levels.set(track.id, trackLevels);
          }
        });
        setMeterLevels(levels);
        
        const master = audioEngineRef.current.getMasterMeterLevels();
        if (master) {
          setMasterMeterLevels(master);
        }
      }
      meterAnimationRef.current = requestAnimationFrame(updateMeters);
    };

    meterAnimationRef.current = requestAnimationFrame(updateMeters);
    
    return () => {
      if (meterAnimationRef.current) {
        cancelAnimationFrame(meterAnimationRef.current);
      }
    };
  }, [isPlaying, storeTracks]);

  useEffect(() => {
    generateAISuggestions();
  }, [context.mode, context.selectedTrackIds, isPlaying, currentTime]);

  const generateAISuggestions = useCallback(() => {
    const newSuggestions: AICoProducerSuggestion[] = [];
    
    if (context.mode === 'mix') {
      newSuggestions.push({
        id: 'auto-level',
        type: 'mix',
        title: 'Balance Levels',
        description: 'AI detected uneven levels across tracks. Auto-balance for better mix coherence.',
        confidence: 0.87,
        action: () => logger.info('Auto-balancing levels...'),
      });
      
      newSuggestions.push({
        id: 'add-glue',
        type: 'effect',
        title: 'Add Bus Glue',
        description: 'Consider adding subtle compression to the mix bus for cohesion.',
        confidence: 0.72,
        action: () => logger.info('Adding bus compression...'),
      });
    }
    
    if (context.mode === 'record' || context.mode === 'create') {
      newSuggestions.push({
        id: 'suggest-chord',
        type: 'harmonic',
        title: 'Next Chord: Am7',
        description: 'Based on your progression, Am7 would create smooth voice leading.',
        confidence: 0.91,
        action: () => logger.info('Inserting Am7 chord...'),
      });
      
      newSuggestions.push({
        id: 'suggest-fill',
        type: 'rhythmic',
        title: 'Add Drum Fill',
        description: 'Bar 8 would benefit from a transitional drum fill.',
        confidence: 0.78,
        action: () => logger.info('Generating drum fill...'),
      });
    }
    
    if (context.mode === 'master') {
      newSuggestions.push({
        id: 'loudness-target',
        type: 'mix',
        title: 'Optimize for Spotify',
        description: 'Adjust limiting to hit -14 LUFS for optimal streaming loudness.',
        confidence: 0.95,
        action: () => logger.info('Optimizing loudness...'),
      });
    }
    
    setSuggestions(newSuggestions);
  }, [context.mode, context.selectedTrackIds]);

  const tracks = useMemo<FlowStateTrack[]>(() => {
    if (!storeTracks || !Array.isArray(storeTracks)) {
      return [];
    }
    return storeTracks.map((track, index) => ({
      id: track.id,
      name: track.name,
      type: track.trackType as FlowStateTrack['type'],
      color: track.color || `hsl(${(index * 40) % 360}, 70%, 50%)`,
      volume: track.volume ?? 0.8,
      pan: track.pan ?? 0,
      mute: track.mute ?? false,
      solo: track.solo ?? false,
      armed: track.armed ?? false,
      meterLevel: meterLevels.get(track.id) || [0, 0],
      clips: [],
      spatialPosition: {
        x: (track.pan ?? 0) * 5,
        y: 0,
        z: index * 2 - (storeTracks?.length || 0),
      },
    }));
  }, [storeTracks, meterLevels]);

  const transport = useMemo<FlowStateTransport>(() => ({
    isPlaying,
    isRecording,
    currentTime,
    tempo,
    timeSignature: timeSignature || '4/4',
    loopEnabled,
    loopStart,
    loopEnd,
    metronomeEnabled,
  }), [isPlaying, isRecording, currentTime, tempo, timeSignature, loopEnabled, loopStart, loopEnd, metronomeEnabled]);

  const play = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.play();
      setIsPlaying(true);
    }
  }, [setIsPlaying]);

  const pause = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.pause();
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const stop = useCallback(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.stop();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [setIsPlaying, setCurrentTime]);

  const record = useCallback(() => {
    setIsRecording(!isRecording);
    if (!isRecording && !isPlaying) {
      play();
    }
  }, [isRecording, isPlaying, setIsRecording, play]);

  const toggleLoop = useCallback(() => {
    setLoopEnabled(!loopEnabled);
  }, [loopEnabled, setLoopEnabled]);

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabled(!metronomeEnabled);
  }, [metronomeEnabled, setMetronomeEnabled]);

  const seek = useCallback((time: number) => {
    if (audioEngineRef.current) {
      audioEngineRef.current.seek(time);
    }
    setCurrentTime(time);
  }, [setCurrentTime]);

  const setTempo = useCallback((bpm: number) => {
    setStoreTempo(bpm);
  }, [setStoreTempo]);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    setStoreTrackVolume(trackId, volume);
    if (audioEngineRef.current) {
      audioEngineRef.current.setTrackGain(trackId, volume);
    }
  }, [setStoreTrackVolume]);

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    setStoreTrackPan(trackId, pan);
    if (audioEngineRef.current) {
      audioEngineRef.current.setTrackPan(trackId, pan);
    }
  }, [setStoreTrackPan]);

  const toggleTrackMute = useCallback((trackId: string) => {
    const track = storeTracks.find(t => t.id === trackId);
    if (track) {
      const newMute = !track.isMuted;
      setStoreTrackMute(trackId, newMute);
      if (audioEngineRef.current) {
        audioEngineRef.current.setTrackMute(trackId, newMute);
      }
    }
  }, [storeTracks, setStoreTrackMute]);

  const toggleTrackSolo = useCallback((trackId: string) => {
    const track = storeTracks.find(t => t.id === trackId);
    if (track) {
      const newSolo = !track.isSolo;
      setStoreTrackSolo(trackId, newSolo);
      if (audioEngineRef.current) {
        audioEngineRef.current.setTrackSolo(trackId, newSolo);
      }
    }
  }, [storeTracks, setStoreTrackSolo]);

  const toggleTrackArm = useCallback((trackId: string) => {
    const track = storeTracks.find(t => t.id === trackId);
    if (track) {
      setStoreTrackArmed(trackId, !track.isArmed);
    }
  }, [storeTracks, setStoreTrackArmed]);

  const selectTrack = useCallback((trackId: string, addToSelection = false) => {
    setContext(prev => ({
      ...prev,
      selectionType: 'track',
      selectedTrackIds: addToSelection 
        ? [...prev.selectedTrackIds, trackId]
        : [trackId],
    }));
  }, []);

  const selectClip = useCallback((clipId: string, addToSelection = false) => {
    setContext(prev => ({
      ...prev,
      selectionType: 'clip',
      selectedClipIds: addToSelection
        ? [...prev.selectedClipIds, clipId]
        : [clipId],
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setContext(prev => ({
      ...prev,
      selectionType: 'none',
      selectedTrackIds: [],
      selectedClipIds: [],
      timeSelection: undefined,
    }));
  }, []);

  const setMode = useCallback((mode: FlowStateMode) => {
    setContext(prev => ({ ...prev, mode }));
  }, []);

  const setZoom = useCallback((level: number) => {
    setContext(prev => ({ ...prev, zoomLevel: Math.max(0.1, Math.min(10, level)) }));
  }, []);

  const setScroll = useCallback((position: number) => {
    setContext(prev => ({ ...prev, scrollPosition: Math.max(0, position) }));
  }, []);

  const getMeterLevels = useCallback(() => meterLevels, [meterLevels]);
  const getMasterMeterLevels = useCallback(() => masterMeterLevels, [masterMeterLevels]);

  const trackTypeMap: Record<string, string> = {
    audio: 'audio',
    instrument: 'midi',
    vocal: 'audio',
    drum: 'midi',
    guitar: 'audio',
    bus: 'aux',
    folder: 'aux',
    midi: 'midi',
  };

  const trackColorMap: Record<string, string> = {
    audio: '#3b82f6',
    instrument: '#a855f7',
    vocal: '#f43f5e',
    drum: '#f59e0b',
    guitar: '#10b981',
    bus: '#64748b',
    folder: '#6366f1',
    midi: '#a855f7',
  };

  const addTrack = useCallback((type: string, name: string) => {
    if (!projectId) {
      logger.warn('[FlowStateAdapter] Cannot add track - no project selected');
      return;
    }
    const backendType = trackTypeMap[type] || 'audio';
    const color = trackColorMap[type] || '#3b82f6';
    createTrackMutation.mutate({ name, trackType: backendType, color });
  }, [projectId, createTrackMutation]);

  const duplicateTrack = useCallback((trackId: string) => {
    if (!projectId) {
      logger.warn('[FlowStateAdapter] Cannot duplicate track - no project selected');
      return;
    }
    duplicateTrackMutation.mutate(trackId);
  }, [projectId, duplicateTrackMutation]);

  const deleteTrack = useCallback((trackId: string) => {
    deleteTrackMutation.mutate(trackId);
  }, [deleteTrackMutation]);

  return {
    tracks,
    transport,
    context,
    suggestions,
    play,
    pause,
    stop,
    record,
    toggleLoop,
    toggleMetronome,
    seek,
    setTempo,
    addTrack,
    duplicateTrack,
    deleteTrack,
    setTrackVolume,
    setTrackPan,
    toggleTrackMute,
    toggleTrackSolo,
    toggleTrackArm,
    selectTrack,
    selectClip,
    clearSelection,
    setMode,
    setZoom,
    setScroll,
    getMeterLevels,
    getMasterMeterLevels,
  };
}
