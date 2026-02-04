import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  TimePosition
} from '@/lib/daw';

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
  currentMode: 'major' | 'minor';
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
  
  addTrack: (type: DAWTrack['type'], name?: string) => string;
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
  
  addPlugin: (trackId: string, pluginId: string, pluginName: string) => string | null;
  removePlugin: (trackId: string, instanceId: string) => void;
  
  createSend: (sourceTrackId: string, targetTrackId: string, gain?: number, preFader?: boolean) => string | null;
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
  
  suggestChords: () => Chord[];
  analyzeMix: () => MixSuggestion[];
  suggestArrangement: () => void;
  suggestMelody: (key: string, mode: 'major' | 'minor', bars?: number) => MIDINote[];
  suggestDrums: (bars?: number, style?: 'basic' | 'funk' | 'electronic') => MIDINote[];
  detectKey: (notes: MIDINote[]) => { key: string; mode: 'major' | 'minor'; confidence: number };
}

export function useDAWCore(): UseDAWCoreReturn {
  const [state, setState] = useState<DAWCoreState>(dawCore.getState());
  const [transportState, setTransportState] = useState(dawCore.transport.getState());
  const [position, setPosition] = useState<TimePosition>(dawCore.transport.getCurrentPosition());
  const [historyState, setHistoryState] = useState(dawCore.history.getState());
  const [projectState, setProjectState] = useState(dawCore.project.getState());
  const [intelligenceState, setIntelligenceState] = useState(dawCore.intelligence.getState());

  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const unsubCore = dawCore.subscribe(() => {
      setState(dawCore.getState());
    });

    const unsubTransport = dawCore.transport.on('*', () => {
      setTransportState(dawCore.transport.getState());
    });

    const unsubHistory = dawCore.history.subscribe(() => {
      setHistoryState(dawCore.history.getState());
    });

    const unsubProject = dawCore.project.subscribe(() => {
      setProjectState(dawCore.project.getState());
    });

    const unsubIntelligence = dawCore.intelligence.subscribe(() => {
      setIntelligenceState(dawCore.intelligence.getState());
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
    const updatePosition = () => {
      if (transportState.isPlaying) {
        setPosition(dawCore.transport.getCurrentPosition());
        animationFrameRef.current = requestAnimationFrame(updatePosition);
      }
    };

    if (transportState.isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updatePosition);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [transportState.isPlaying]);

  const initialize = useCallback(async () => {
    await dawCore.initialize();
  }, []);

  const play = useCallback(() => dawCore.play(), []);
  const pause = useCallback(() => dawCore.pause(), []);
  const stop = useCallback(() => dawCore.stop(), []);
  const record = useCallback(() => dawCore.record(), []);
  
  const toggleLoop = useCallback(() => {
    dawCore.setLoop(!transportState.isLooping);
  }, [transportState.isLooping]);

  const setPositionFn = useCallback((beats: number) => {
    dawCore.setPosition(beats);
    setPosition(dawCore.transport.getCurrentPosition());
  }, []);

  const setTempoFn = useCallback((tempo: number) => dawCore.setTempo(tempo), []);
  
  const setLoopFn = useCallback((enabled: boolean, startBeat?: number, endBeat?: number) => {
    dawCore.setLoop(enabled, startBeat, endBeat);
  }, []);

  const addTrack = useCallback((type: DAWTrack['type'], name?: string) => {
    return dawCore.addTrack(type, name);
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    dawCore.removeTrack(trackId);
  }, []);

  const updateTrack = useCallback((trackId: string, updates: Partial<DAWTrack>) => {
    dawCore.updateTrack(trackId, updates);
  }, []);

  const duplicateTrack = useCallback((trackId: string) => {
    return dawCore.duplicateTrack(trackId);
  }, []);

  const reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    dawCore.reorderTracks(fromIndex, toIndex);
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    dawCore.setTrackVolume(trackId, volume);
  }, []);

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    dawCore.setTrackPan(trackId, pan);
  }, []);

  const toggleTrackMute = useCallback((trackId: string) => {
    dawCore.toggleTrackMute(trackId);
  }, []);

  const toggleTrackSolo = useCallback((trackId: string) => {
    dawCore.toggleTrackSolo(trackId);
  }, []);

  const toggleTrackArm = useCallback((trackId: string) => {
    dawCore.toggleTrackArm(trackId);
  }, []);

  const selectTracks = useCallback((trackIds: string[]) => {
    dawCore.selectTracks(trackIds);
  }, []);

  const addPlugin = useCallback((trackId: string, pluginId: string, pluginName: string) => {
    return dawCore.addPlugin(trackId, pluginId, pluginName);
  }, []);

  const removePlugin = useCallback((trackId: string, instanceId: string) => {
    dawCore.removePlugin(trackId, instanceId);
  }, []);

  const createSend = useCallback((sourceTrackId: string, targetTrackId: string, gain?: number, preFader?: boolean) => {
    return dawCore.createSend(sourceTrackId, targetTrackId, gain, preFader);
  }, []);

  const createBus = useCallback((name: string) => {
    return dawCore.createBus(name);
  }, []);

  const setEditMode = useCallback((mode: EditMode) => {
    dawCore.setEditMode(mode);
  }, []);

  const setAutomationMode = useCallback((mode: AutomationMode) => {
    dawCore.setAutomationMode(mode);
  }, []);

  const setSnap = useCallback((enabled: boolean) => {
    dawCore.setSnap(enabled);
  }, []);

  const setGridDivision = useCallback((division: number) => {
    dawCore.setGridDivision(division);
  }, []);

  const setZoom = useCallback((zoom: number) => {
    dawCore.setZoom(zoom);
  }, []);

  const setScroll = useCallback((x: number, y: number) => {
    dawCore.setScroll(x, y);
  }, []);

  const undo = useCallback(() => dawCore.undo(), []);
  const redo = useCallback(() => dawCore.redo(), []);

  const newProject = useCallback((name?: string) => {
    dawCore.newProject(name);
  }, []);

  const saveProject = useCallback(() => {
    dawCore.saveProject();
  }, []);

  const loadProject = useCallback((data: string) => {
    dawCore.loadProject(data);
  }, []);

  const suggestChords = useCallback(() => {
    return dawCore.suggestChords();
  }, []);

  const analyzeMix = useCallback(() => {
    return dawCore.analyzeMix();
  }, []);

  const suggestArrangement = useCallback(() => {
    dawCore.suggestArrangement();
  }, []);

  const suggestMelody = useCallback((key: string, mode: 'major' | 'minor', bars: number = 4) => {
    return dawCore.intelligence.suggestMelody(key, mode, bars);
  }, []);

  const suggestDrums = useCallback((bars: number = 4, style: 'basic' | 'funk' | 'electronic' = 'basic') => {
    return dawCore.intelligence.suggestDrumPattern(bars, style);
  }, []);

  const detectKey = useCallback((notes: MIDINote[]) => {
    return dawCore.intelligence.detectKey(notes);
  }, []);

  return useMemo(() => ({
    isInitialized: state.isInitialized,
    isPlaying: transportState.isPlaying,
    isRecording: transportState.isRecording,
    isLooping: transportState.isLooping,
    position,
    tempo: transportState.tempoMap[0]?.tempo ?? 120,

    tracks: state.tracks,
    selectedTrackIds: state.selectedTrackIds,
    focusedTrackId: state.focusedTrackId,

    editMode: state.editMode,
    automationMode: state.automationMode,
    snapEnabled: state.snapEnabled,
    gridDivision: state.gridDivision,
    zoom: state.zoom,

    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    isDirty: projectState.isDirty,

    currentKey: intelligenceState.currentKey,
    currentMode: intelligenceState.currentMode,
    suggestions: intelligenceState.suggestions,
    arrangementSections: intelligenceState.arrangementSections,

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

    suggestChords,
    analyzeMix,
    suggestArrangement,
    suggestMelody,
    suggestDrums,
    detectKey,
  }), [
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
    suggestChords,
    analyzeMix,
    suggestArrangement,
    suggestMelody,
    suggestDrums,
    detectKey,
  ]);
}
