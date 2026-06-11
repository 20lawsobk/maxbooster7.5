import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  dawCore,
  DAWCoreState,
  DAWTrack,
  EditMode,
  AutomationMode,
  Chord,
  MixSuggestion,
  ArrangementSuggestion,
  MIDINote,
  TimePosition,
} from "@/lib/daw";

export interface UseDAWCoreReturn {
  isInitialized: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  isLooping: boolean;
  position: TimePosition;
  tempo: number;

  tracks: DAWTrack[];
  selectedTrackIds: string[];
  focusedTrackId: string | null;

  editMode: EditMode;
  automationMode: AutomationMode;
  snapEnabled: boolean;
  gridDivision: number;
  zoom: number;

  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;

  currentKey: string;
  currentMode: "major" | "minor";
  suggestions: MixSuggestion[];
  arrangementSections: ArrangementSuggestion[];

  initialize: () => Promise<void>;

  play: () => void;
  pause: () => void;
  stop: () => void;
  record: () => void;
  toggleLoop: () => void;
  setPosition: (beats: number) => void;
  setTempo: (tempo: number) => void;
  setLoop: (enabled: boolean, startBeat?: number, endBeat?: number) => void;

  addTrack: (type: DAWTrack["type"], name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<DAWTrack>) => void;
  duplicateTrack: (trackId: string) => string | null;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;

  selectTracks: (trackIds: string[]) => void;

  addPlugin: (
    trackId: string,
    pluginId: string,
    pluginName: string,
  ) => string | null;
  removePlugin: (trackId: string, instanceId: string) => void;

  createSend: (
    sourceTrackId: string,
    targetTrackId: string,
    gain?: number,
    preFader?: boolean,
  ) => string | null;
  createBus: (name: string) => string;

  setEditMode: (mode: EditMode) => void;
  setAutomationMode: (mode: AutomationMode) => void;
  setSnap: (enabled: boolean) => void;
  setGridDivision: (division: number) => void;
  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;

  undo: () => void;
  redo: () => void;

  newProject: (name?: string) => void;
  saveProject: () => void;
  loadProject: (data: string) => void;
  saveToBackend: (
    projectId?: string,
  ) => Promise<{ success: boolean; projectId: string }>;
  loadFromBackend: (projectId: string) => Promise<boolean>;
  listBackendProjects: () => Promise<
    Array<{ id: string; name: string; updatedAt: string }>
  >;

  suggestChords: () => Chord[];
  analyzeMix: () => MixSuggestion[];
  suggestArrangement: () => void;
  suggestMelody: (
    key: string,
    mode: "major" | "minor",
    bars?: number,
  ) => MIDINote[];
  suggestDrums: (
    bars?: number,
    style?: "basic" | "funk" | "electronic",
  ) => MIDINote[];
  detectKey: (notes: MIDINote[]) => {
    key: string;
    mode: "major" | "minor";
    confidence: number;
  };
}

export function useDAWCore(): UseDAWCoreReturn {
  const [state, setState] = useState<DAWCoreState>(dawCore?.getState());
  const [transportState, setTransportState] = useState(
    dawCore?.transport.getState(),
  );
  const [position, setPosition] = useState<TimePosition>(
    dawCore?.transport.getCurrentPosition(),
  );
  const [historyState, setHistoryState] = useState(dawCore?.history.getState());
  const [projectState, setProjectState] = useState(dawCore?.project.getState());
  const [intelligenceState, setIntelligenceState] = useState(
    dawCore?.intelligence.getState(),
  );

  const _animationFrameRef = useRef<number>();

  useEffect(() => {
    const _unsubCore = dawCore?.subscribe(() => {
      setState(dawCore?.getState());
    });

    const _unsubTransport = dawCore?.transport.on("*", () => {
      setTransportState(dawCore?.transport.getState());
    });

    const _unsubHistory = dawCore?.history.subscribe(() => {
      setHistoryState(dawCore?.history.getState());
    });

    const _unsubProject = dawCore?.project.subscribe(() => {
      setProjectState(dawCore?.project.getState());
    });

    const _unsubIntelligence = dawCore?.intelligence.subscribe(() => {
      setIntelligenceState(dawCore?.intelligence.getState());
    });

    return () => {
      unsubCore();
      unsubTransport();
      unsubHistory();
      unsubProject();
      unsubIntelligence();
    };
  }, []);

  useEffect(() => {
    const _updatePosition = () => {
      if (transportState?.isPlaying) {
        setPosition(dawCore?.transport.getCurrentPosition());
        animationFrameRef?.current = requestAnimationFrame(updatePosition);
      }
    };

    if (transportState?.isPlaying) {
      animationFrameRef?.current = requestAnimationFrame(updatePosition);
    }

    return () => {
      if (animationFrameRef?.current) {
        cancelAnimationFrame(animationFrameRef?.current);
      }
    };
  }, [transportState?.isPlaying]);

  const _initialize = useCallback(async () => {
    await dawCore?.initialize();
  }, []);

  const _play = useCallback(() => dawCore?.play(), []);
  const _pause = useCallback(() => dawCore?.pause(), []);
  const _stop = useCallback(() => dawCore?.stop(), []);
  const _record = useCallback(() => dawCore?.record(), []);

  const _toggleLoop = useCallback(() => {
    dawCore?.setLoop(!transportState?.isLooping);
  }, [transportState?.isLooping]);

  const _setPositionFn = useCallback((beats: number) => {
    dawCore?.setPosition(beats);
    setPosition(dawCore?.transport.getCurrentPosition());
  }, []);

  const _setTempoFn = useCallback(
    (tempo: number) => dawCore?.setTempo(tempo),
    [],
  );

  const _setLoopFn = useCallback(
    (enabled: boolean, startBeat?: number, endBeat?: number) => {
      dawCore?.setLoop(enabled, startBeat, endBeat);
    },
    [],
  );

  const _addTrack = useCallback((type: DAWTrack["type"], name?: string) => {
    return dawCore?.addTrack(type, name);
  }, []);

  const _removeTrack = useCallback((trackId: string) => {
    dawCore?.removeTrack(trackId);
  }, []);

  const _updateTrack = useCallback(
    (trackId: string, updates: Partial<DAWTrack>) => {
      dawCore?.updateTrack(trackId, updates);
    },
    [],
  );

  const _duplicateTrack = useCallback((trackId: string) => {
    return dawCore?.duplicateTrack(trackId);
  }, []);

  const _reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    dawCore?.reorderTracks(fromIndex, toIndex);
  }, []);

  const _setTrackVolume = useCallback((trackId: string, volume: number) => {
    dawCore?.setTrackVolume(trackId, volume);
  }, []);

  const _setTrackPan = useCallback((trackId: string, pan: number) => {
    dawCore?.setTrackPan(trackId, pan);
  }, []);

  const _toggleTrackMute = useCallback((trackId: string) => {
    dawCore?.toggleTrackMute(trackId);
  }, []);

  const _toggleTrackSolo = useCallback((trackId: string) => {
    dawCore?.toggleTrackSolo(trackId);
  }, []);

  const _toggleTrackArm = useCallback((trackId: string) => {
    dawCore?.toggleTrackArm(trackId);
  }, []);

  const _selectTracks = useCallback((trackIds: string[]) => {
    dawCore?.selectTracks(trackIds);
  }, []);

  const _addPlugin = useCallback(
    (trackId: string, pluginId: string, pluginName: string) => {
      return dawCore?.addPlugin(trackId, pluginId, pluginName);
    },
    [],
  );

  const _removePlugin = useCallback((trackId: string, instanceId: string) => {
    dawCore?.removePlugin(trackId, instanceId);
  }, []);

  const _createSend = useCallback(
    (
      sourceTrackId: string,
      targetTrackId: string,
      gain?: number,
      preFader?: boolean,
    ) => {
      return dawCore?.createSend(sourceTrackId, targetTrackId, gain, preFader);
    },
    [],
  );

  const _createBus = useCallback((name: string) => {
    return dawCore?.createBus(name);
  }, []);

  const _setEditMode = useCallback((mode: EditMode) => {
    dawCore?.setEditMode(mode);
  }, []);

  const _setAutomationMode = useCallback((mode: AutomationMode) => {
    dawCore?.setAutomationMode(mode);
  }, []);

  const _setSnap = useCallback((enabled: boolean) => {
    dawCore?.setSnap(enabled);
  }, []);

  const _setGridDivision = useCallback((division: number) => {
    dawCore?.setGridDivision(division);
  }, []);

  const _setZoom = useCallback((zoom: number) => {
    dawCore?.setZoom(zoom);
  }, []);

  const _setScroll = useCallback((x: number, y: number) => {
    dawCore?.setScroll(x, y);
  }, []);

  const _undo = useCallback(() => dawCore?.undo(), []);
  const _redo = useCallback(() => dawCore?.redo(), []);

  const _newProject = useCallback((name?: string) => {
    dawCore?.newProject(name);
  }, []);

  const _saveProject = useCallback(() => {
    dawCore?.saveProject();
  }, []);

  const _loadProject = useCallback((data: string) => {
    dawCore?.loadProject(data);
  }, []);

  const _saveToBackend = useCallback(async (projectId?: string) => {
    return dawCore?.project.saveToBackend(projectId);
  }, []);

  const _loadFromBackend = useCallback(async (projectId: string) => {
    return dawCore?.project.loadFromBackend(projectId);
  }, []);

  const _listBackendProjects = useCallback(async () => {
    return dawCore?.project.listBackendProjects();
  }, []);

  const _suggestChords = useCallback(() => {
    return dawCore?.suggestChords();
  }, []);

  const _analyzeMix = useCallback(() => {
    return dawCore?.analyzeMix();
  }, []);

  const _suggestArrangement = useCallback(() => {
    dawCore?.suggestArrangement();
  }, []);

  const _suggestMelody = useCallback(
    (key: string, mode: "major" | "minor", bars: number = 4) => {
      return dawCore?.intelligence.suggestMelody(key, mode, bars);
    },
    [],
  );

  const _suggestDrums = useCallback(
    (bars: number = 4, style: "basic" | "funk" | "electronic" = "basic") => {
      return dawCore?.intelligence.suggestDrumPattern(bars, style);
    },
    [],
  );

  const _detectKey = useCallback((notes: MIDINote[]) => {
    return dawCore?.intelligence.detectKey(notes);
  }, []);

  return useMemo(
    () => ({
      isInitialized: state?.isInitialized,
      isPlaying: transportState?.isPlaying,
      isRecording: transportState?.isRecording,
      isLooping: transportState?.isLooping,
      position,
      tempo: transportState?.tempoMap[0]?.tempo ?? 120,

      tracks: state?.tracks,
      selectedTrackIds: state?.selectedTrackIds,
      focusedTrackId: state?.focusedTrackId,

      editMode: state?.editMode,
      automationMode: state?.automationMode,
      snapEnabled: state?.snapEnabled,
      gridDivision: state?.gridDivision,
      zoom: state?.zoom,

      canUndo: historyState?.canUndo,
      canRedo: historyState?.canRedo,
      isDirty: projectState?.isDirty,

      currentKey: intelligenceState?.currentKey,
      currentMode: intelligenceState?.currentMode,
      suggestions: intelligenceState?.suggestions,
      arrangementSections: intelligenceState?.arrangementSections,

      initialize,
      play,
      pause,
      stop,
      record,
      toggleLoop,
      setPosition: setPositionFn,
      setTempo: setTempoFn,
      setLoop: setLoopFn,

      addTrack,
      removeTrack,
      updateTrack,
      duplicateTrack,
      reorderTracks,

      setTrackVolume,
      setTrackPan,
      toggleTrackMute,
      toggleTrackSolo,
      toggleTrackArm,

      selectTracks,

      addPlugin,
      removePlugin,

      createSend,
      createBus,

      setEditMode,
      setAutomationMode,
      setSnap,
      setGridDivision,
      setZoom,
      setScroll,

      undo,
      redo,

      newProject,
      saveProject,
      loadProject,
      saveToBackend,
      loadFromBackend,
      listBackendProjects,

      suggestChords,
      analyzeMix,
      suggestArrangement,
      suggestMelody,
      suggestDrums,
      detectKey,
    }),
    [
      state,
      transportState,
      position,
      historyState,
      projectState,
      intelligenceState,
      initialize,
      play,
      pause,
      stop,
      record,
      toggleLoop,
      setPositionFn,
      setTempoFn,
      setLoopFn,
      addTrack,
      removeTrack,
      updateTrack,
      duplicateTrack,
      reorderTracks,
      setTrackVolume,
      setTrackPan,
      toggleTrackMute,
      toggleTrackSolo,
      toggleTrackArm,
      selectTracks,
      addPlugin,
      removePlugin,
      createSend,
      createBus,
      setEditMode,
      setAutomationMode,
      setSnap,
      setGridDivision,
      setZoom,
      setScroll,
      undo,
      redo,
      newProject,
      saveProject,
      loadProject,
      saveToBackend,
      loadFromBackend,
      listBackendProjects,
      suggestChords,
      analyzeMix,
      suggestArrangement,
      suggestMelody,
      suggestDrums,
      detectKey,
    ],
  );
}
