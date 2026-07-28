import { useCallback, useEffect, useMemo } from "react";
import { useStudioStore as useNewStore } from "./studioStore";
import { useStudioStore as useLegacyStore } from "@/lib/studioStore";
import type { Track, AudioClip, MidiClip, PluginInstance, ViewState, TrackType } from "./studioStore";

export interface UnifiedTrack {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  frozen: boolean;
  height: number;
  collapsed: boolean;
  outputTarget: string;
  plugins: PluginInstance[];
  audioClips: AudioClip[];
  midiClips: MidiClip[];
  meterLevel: { left: number; right: number };
}

export interface UnifiedTransport {
  isPlaying: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isLooping: boolean;
  position: number;
  loopStart: number;
  loopEnd: number;
  tempo: number;
  timeSignature: string;
  metronomeEnabled: boolean;
}

export interface UnifiedStoreState {
  tracks: UnifiedTrack[];
  masterTrack: UnifiedTrack;
  transport: UnifiedTransport;
  view: ViewState;
  project: {
    id: string;
    name: string;
    isDirty: boolean;
    sampleRate: number;
    bitDepth: number;
  };

  play: () => void;
  pause: () => void;
  stop: () => void;
  record: () => void;
  toggleLoop: () => void;
  setPosition: (position: number) => void;
  setTempo: (tempo: number) => void;

  addTrack: (type: TrackType, name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  duplicateTrack: (trackId: string) => string;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  addAudioClip: (trackId: string, clip: Omit<AudioClip, "id">) => string;
  updateAudioClip: (
    trackId: string,
    clipId: string,
    updates: Partial<AudioClip>,
  ) => void;
  removeAudioClip: (trackId: string, clipId: string) => void;

  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;
  setTrackMeterLevel: (trackId: string, left: number, right: number) => void;

  addPlugin: (trackId: string, plugin: Omit<PluginInstance, "id">) => string;
  removePlugin: (trackId: string, pluginId: string) => void;
  togglePluginBypass: (trackId: string, pluginId: string) => void;

  selectTracks: (trackIds: string[]) => void;
  selectClips: (clipIds: string[]) => void;
  clearSelection: () => void;

  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;

  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUnifiedStore(): UnifiedStoreState {
  const newStore = useNewStore();
  const legacyStore = useLegacyStore();

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => ({
        isPlaying: state.transport.isPlaying,
        position: state.transport.position,
      }),
      ({ isPlaying, position }) => {
        if (legacyStore?.isPlaying !== isPlaying) {
          legacyStore?.setIsPlaying(isPlaying);
        }
        if (Math.abs(legacyStore?.currentTime - position) > 0.1) {
          legacyStore?.setCurrentTime(position);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => state?.transport.tempo,
      (tempo) => {
        if (legacyStore?.tempo !== tempo) {
          legacyStore?.setTempo(tempo);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => state?.transport.isLooping,
      (isLooping) => {
        if (legacyStore?.loopEnabled !== isLooping) {
          legacyStore?.setLoopEnabled(isLooping);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => ({
        loopStart: state.transport.loopStart,
        loopEnd: state.transport.loopEnd,
      }),
      ({ loopStart, loopEnd }) => {
        if (
          legacyStore?.loopStart !== loopStart ||
          legacyStore?.loopEnd !== loopEnd
        ) {
          legacyStore?.setLoopRegion?.(loopStart, loopEnd);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => state?.transport.metronomeEnabled,
      (metronomeEnabled) => {
        if (legacyStore?.metronomeOn !== metronomeEnabled) {
          legacyStore?.setMetronome?.(metronomeEnabled);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  useEffect(() => {
    const unsubscribe = useNewStore?.subscribe(
      (state) => state?.selection?.trackIds ?? [],
      (selectedTrackIds) => {
        if (
          legacyStore?.selectedTrackIds?.join(",") !== selectedTrackIds?.join(",")
        ) {
          legacyStore?.setSelectedTracks?.(selectedTrackIds);
        }
      },
    );
    return unsubscribe;
  }, [legacyStore]);

  const tracks = useMemo<UnifiedTrack[]>(() => {
    return newStore?.tracks.map((track) => ({
      ...track,
      muted: track.muted,
    }));
  }, [newStore?.tracks]);

  const masterTrack = useMemo<UnifiedTrack>(
    () => ({
      ...newStore?.masterTrack,
    }),
    [newStore?.masterTrack],
  );

  const transport = useMemo<UnifiedTransport>(
    () => ({
      isPlaying: newStore.transport.isPlaying,
      isRecording: newStore.transport.isRecording,
      isPaused: newStore.transport.isPaused,
      isLooping: newStore.transport.isLooping,
      position: newStore.transport.position,
      loopStart: newStore.transport.loopStart,
      loopEnd: newStore.transport.loopEnd,
      tempo: newStore.transport.tempo,
      timeSignature: `${newStore?.transport.timeSignatureNumerator}/${newStore?.transport.timeSignatureDenominator}`,
      metronomeEnabled: newStore.transport.metronomeEnabled,
    }),
    [
      newStore?.transport.isPlaying,
      newStore?.transport.isRecording,
      newStore?.transport.isPaused,
      newStore?.transport.isLooping,
      newStore?.transport.position,
      newStore?.transport.loopStart,
      newStore?.transport.loopEnd,
      newStore?.transport.tempo,
      newStore?.transport.timeSignatureNumerator,
      newStore?.transport.timeSignatureDenominator,
      newStore?.transport.metronomeEnabled,
    ],
  );

  const view = useMemo(() => newStore?.view, [newStore?.view]);

  const project = useMemo(
    () => ({
      id: newStore.project.id,
      name: newStore.project.name,
      isDirty: newStore.project.isDirty,
      sampleRate: newStore.project.sampleRate,
      bitDepth: newStore.project.bitDepth,
    }),
    [newStore?.project],
  );

  const play = useCallback(() => {
    newStore?.play();
  }, [newStore]);

  const pause = useCallback(() => {
    newStore?.pause();
  }, [newStore]);

  const stop = useCallback(() => {
    newStore?.stop();
    legacyStore?.setIsPlaying(false);
    legacyStore?.setCurrentTime(0);
  }, [newStore, legacyStore]);

  const record = useCallback(() => {
    newStore?.record();
  }, [newStore]);

  const toggleLoop = useCallback(() => {
    newStore?.toggleLoop();
  }, [newStore]);

  const setPosition = useCallback(
    (position: number) => {
      newStore?.setPosition(position);
    },
    [newStore],
  );

  const setTempo = useCallback(
    (tempo: number) => {
      newStore?.setTempo(tempo);
    },
    [newStore],
  );

  const canUndo = newStore?.historyIndex > 0;
  const canRedo = newStore?.historyIndex < newStore?.history.length - 1;

  return {
    tracks,
    masterTrack,
    transport,
    view,
    project,

    play,
    pause,
    stop,
    record,
    toggleLoop,
    setPosition,
    setTempo,

    addTrack: newStore.addTrack,
    removeTrack: newStore.removeTrack,
    updateTrack: newStore.updateTrack,
    duplicateTrack: newStore.duplicateTrack,
    reorderTracks: newStore.reorderTracks,

    addAudioClip: newStore.addAudioClip,
    updateAudioClip: newStore.updateAudioClip,
    removeAudioClip: newStore.removeAudioClip,

    setTrackVolume: newStore.setTrackVolume,
    setTrackPan: newStore.setTrackPan,
    toggleTrackMute: newStore.toggleTrackMute,
    toggleTrackSolo: newStore.toggleTrackSolo,
    toggleTrackArm: newStore.toggleTrackArm,
    setTrackMeterLevel: newStore.setTrackMeterLevel,

    addPlugin: newStore.addPlugin,
    removePlugin: newStore.removePlugin,
    togglePluginBypass: newStore.togglePluginBypass,

    selectTracks: newStore.selectTracks,
    selectClips: newStore.selectClips,
    clearSelection: newStore.clearSelection,

    setZoom: newStore.setZoom,
    setScroll: newStore.setScroll,

    undo: newStore.undo,
    redo: newStore.redo,
    canUndo,
    canRedo,
  };
}

export function useLegacyStoreSync() {
  const legacyStore = useLegacyStore();
  const newStore = useNewStore();

  useEffect(() => {
    if (legacyStore?.tracks && Array.isArray(legacyStore?.tracks)) {
      legacyStore?.tracks.forEach((legacyTrack) => {
        const existingTrack = newStore?.tracks.find(
          (t) => t?.id === legacyTrack?.id,
        );
        if (!existingTrack) {
          const trackType = (legacyTrack?.trackType || "audio") as TrackType;
          newStore?.addTrack(trackType, legacyTrack?.name);
        }
      });
    }
  }, [legacyStore?.tracks, newStore]);

  useEffect(() => {
    if (legacyStore?.isPlaying !== newStore?.transport.isPlaying) {
      if (legacyStore?.isPlaying) {
        newStore?.play();
      } else {
        newStore?.pause();
      }
    }
  }, [legacyStore?.isPlaying, newStore]);

  useEffect(() => {
    if (Math.abs(legacyStore?.currentTime - newStore?.transport.position) > 0.1) {
      newStore?.setPosition(legacyStore?.currentTime);
    }
  }, [legacyStore?.currentTime, newStore]);

  useEffect(() => {
    if (legacyStore?.tempo !== newStore?.transport.tempo) {
      newStore?.setTempo(legacyStore?.tempo);
    }
  }, [legacyStore?.tempo, newStore]);

  useEffect(() => {
    if (legacyStore?.loopEnabled !== newStore?.transport.isLooping) {
      newStore?.toggleLoop();
    }
  }, [legacyStore?.loopEnabled, newStore]);
}

export { useNewStore as usePerformanceStore };
