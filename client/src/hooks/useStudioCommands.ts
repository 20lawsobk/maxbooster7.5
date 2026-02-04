import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStudioStore } from '@/stores/studioStore';
import { 
  commandManager, 
  type Command,
  type StudioSnapshot 
} from '@/lib/studio/commands';
import {
  AddTrackCommand,
  RemoveTrackCommand,
  UpdateTrackCommand,
  DuplicateTrackCommand,
  ReorderTracksCommand,
  SetTrackVolumeCommand,
  SetTrackPanCommand,
  ToggleTrackMuteCommand,
  ToggleTrackSoloCommand,
} from '@/lib/studio/commands/trackCommands';
import {
  AddAudioClipCommand,
  RemoveAudioClipCommand,
  UpdateAudioClipCommand,
  MoveClipCommand,
  SetClipGainCommand,
  SetClipFadesCommand,
  SplitClipCommand,
  TrimClipCommand,
} from '@/lib/studio/commands/clipCommands';
import {
  AddAutomationLaneCommand,
  RemoveAutomationLaneCommand,
  AddAutomationPointCommand,
  RemoveAutomationPointCommand,
  UpdateAutomationPointCommand,
  SetAutomationModeCommand,
  WriteAutomationCommand,
} from '@/lib/studio/commands/automationCommands';
import { timelineEngine } from '@/lib/studio/timeline/TimelineEngine';
import { transportAuthority } from '@/lib/studio/transport/TransportAuthority';

export function useStudioCommands() {
  const store = useStudioStore();
  const [canUndo, setCanUndo] = useState(commandManager.canUndo);
  const [canRedo, setCanRedo] = useState(commandManager.canRedo);
  const [undoDescription, setUndoDescription] = useState(commandManager.undoDescription);
  const [redoDescription, setRedoDescription] = useState(commandManager.redoDescription);
  
  useEffect(() => {
    return commandManager.subscribe(() => {
      setCanUndo(commandManager.canUndo);
      setCanRedo(commandManager.canRedo);
      setUndoDescription(commandManager.undoDescription);
      setRedoDescription(commandManager.redoDescription);
    });
  }, []);
  
  const getSnapshot = useCallback((): StudioSnapshot => ({
    tracks: store.tracks,
    transport: store.transport,
    project: store.project,
    view: store.view,
    mixer: store.mixer,
    masterTrack: store.masterTrack,
  }), [store]);
  
  const deepClone = <T>(obj: T): T => {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(obj);
      } catch {
        return JSON.parse(JSON.stringify(obj));
      }
    }
    return JSON.parse(JSON.stringify(obj));
  };
  
  const executeCommand = useCallback((command: Command) => {
    commandManager.execute(command, (cmd) => {
      const state = useStudioStore.getState();
      const snapshot = {
        tracks: deepClone(state.tracks),
        transport: deepClone(state.transport),
        project: deepClone(state.project),
        view: deepClone(state.view),
        mixer: deepClone(state.mixer),
        masterTrack: deepClone(state.masterTrack),
      };
      cmd.execute(snapshot as any);
      useStudioStore.setState({
        tracks: snapshot.tracks as any,
        transport: snapshot.transport as any,
        project: snapshot.project as any,
      });
    });
  }, []);
  
  const undo = useCallback(() => {
    commandManager.undo((cmd) => {
      const state = useStudioStore.getState();
      const snapshot = {
        tracks: deepClone(state.tracks),
        transport: deepClone(state.transport),
        project: deepClone(state.project),
        view: deepClone(state.view),
        mixer: deepClone(state.mixer),
        masterTrack: deepClone(state.masterTrack),
      };
      cmd.undo(snapshot as any);
      useStudioStore.setState({
        tracks: snapshot.tracks as any,
        transport: snapshot.transport as any,
        project: snapshot.project as any,
      });
    });
  }, []);
  
  const redo = useCallback(() => {
    commandManager.redo((cmd) => {
      const state = useStudioStore.getState();
      const snapshot = {
        tracks: deepClone(state.tracks),
        transport: deepClone(state.transport),
        project: deepClone(state.project),
        view: deepClone(state.view),
        mixer: deepClone(state.mixer),
        masterTrack: deepClone(state.masterTrack),
      };
      cmd.execute(snapshot as any);
      useStudioStore.setState({
        tracks: snapshot.tracks as any,
        transport: snapshot.transport as any,
        project: snapshot.project as any,
      });
    });
  }, []);
  
  const startBatch = useCallback((batchId?: string) => {
    return commandManager.startBatch(batchId);
  }, []);
  
  const endBatch = useCallback(() => {
    commandManager.endBatch();
  }, []);
  
  const addTrack = useCallback((type: string, name?: string) => {
    const cmd = new AddTrackCommand(type, name);
    executeCommand(cmd);
    return cmd.createdTrackId;
  }, [executeCommand]);
  
  const removeTrack = useCallback((trackId: string) => {
    executeCommand(new RemoveTrackCommand(trackId));
  }, [executeCommand]);
  
  const updateTrack = useCallback((trackId: string, updates: Record<string, any>, description?: string) => {
    executeCommand(new UpdateTrackCommand(trackId, updates, description));
  }, [executeCommand]);
  
  const duplicateTrack = useCallback((trackId: string) => {
    const cmd = new DuplicateTrackCommand(trackId);
    executeCommand(cmd);
    return cmd.createdTrackId;
  }, [executeCommand]);
  
  const reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    executeCommand(new ReorderTracksCommand(fromIndex, toIndex));
  }, [executeCommand]);
  
  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    executeCommand(new SetTrackVolumeCommand(trackId, volume));
  }, [executeCommand]);
  
  const setTrackPan = useCallback((trackId: string, pan: number) => {
    executeCommand(new SetTrackPanCommand(trackId, pan));
  }, [executeCommand]);
  
  const toggleTrackMute = useCallback((trackId: string) => {
    executeCommand(new ToggleTrackMuteCommand(trackId));
  }, [executeCommand]);
  
  const toggleTrackSolo = useCallback((trackId: string) => {
    executeCommand(new ToggleTrackSoloCommand(trackId));
  }, [executeCommand]);
  
  const addAudioClip = useCallback((trackId: string, clipData: any) => {
    const cmd = new AddAudioClipCommand(trackId, clipData);
    executeCommand(cmd);
    return cmd.createdClipId;
  }, [executeCommand]);
  
  const removeAudioClip = useCallback((trackId: string, clipId: string) => {
    executeCommand(new RemoveAudioClipCommand(trackId, clipId));
  }, [executeCommand]);
  
  const updateAudioClip = useCallback((trackId: string, clipId: string, updates: Record<string, any>, description?: string) => {
    executeCommand(new UpdateAudioClipCommand(trackId, clipId, updates, description));
  }, [executeCommand]);
  
  const moveClip = useCallback((fromTrackId: string, toTrackId: string, clipId: string, newStartTime: number) => {
    executeCommand(new MoveClipCommand(fromTrackId, toTrackId, clipId, newStartTime));
  }, [executeCommand]);
  
  const setClipGain = useCallback((trackId: string, clipId: string, gain: number) => {
    executeCommand(new SetClipGainCommand(trackId, clipId, gain));
  }, [executeCommand]);
  
  const setClipFades = useCallback((
    trackId: string, 
    clipId: string, 
    fadeIn: number, 
    fadeOut: number,
    fadeInCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve',
    fadeOutCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve'
  ) => {
    executeCommand(new SetClipFadesCommand(trackId, clipId, fadeIn, fadeOut, fadeInCurve, fadeOutCurve));
  }, [executeCommand]);
  
  const splitClip = useCallback((trackId: string, clipId: string, splitTime: number) => {
    const cmd = new SplitClipCommand(trackId, clipId, splitTime);
    executeCommand(cmd);
    return cmd.createdClipId;
  }, [executeCommand]);
  
  const trimClip = useCallback((trackId: string, clipId: string, edge: 'start' | 'end', newValue: number) => {
    executeCommand(new TrimClipCommand(trackId, clipId, edge, newValue));
  }, [executeCommand]);
  
  const addAutomationLane = useCallback((
    trackId: string, 
    parameterId: string, 
    parameterName: string,
    defaultValue?: number,
    minValue?: number,
    maxValue?: number
  ) => {
    const cmd = new AddAutomationLaneCommand(trackId, parameterId, parameterName, defaultValue, minValue, maxValue);
    executeCommand(cmd);
    return cmd.createdLaneId;
  }, [executeCommand]);
  
  const removeAutomationLane = useCallback((trackId: string, laneId: string) => {
    executeCommand(new RemoveAutomationLaneCommand(trackId, laneId));
  }, [executeCommand]);
  
  const addAutomationPoint = useCallback((
    trackId: string, 
    laneId: string, 
    time: number, 
    value: number, 
    curve: 'linear' | 'exponential' | 'logarithmic' | 'step' = 'linear'
  ) => {
    executeCommand(new AddAutomationPointCommand(trackId, laneId, { time, value, curve }));
  }, [executeCommand]);
  
  const removeAutomationPoint = useCallback((trackId: string, laneId: string, pointIndex: number) => {
    executeCommand(new RemoveAutomationPointCommand(trackId, laneId, pointIndex));
  }, [executeCommand]);
  
  const updateAutomationPoint = useCallback((
    trackId: string, 
    laneId: string, 
    pointIndex: number, 
    updates: { time?: number; value?: number; curve?: 'linear' | 'exponential' | 'logarithmic' | 'step' }
  ) => {
    executeCommand(new UpdateAutomationPointCommand(trackId, laneId, pointIndex, updates));
  }, [executeCommand]);
  
  const setAutomationMode = useCallback((
    trackId: string, 
    laneId: string, 
    mode: 'read' | 'write' | 'touch' | 'latch' | 'off'
  ) => {
    executeCommand(new SetAutomationModeCommand(trackId, laneId, mode));
  }, [executeCommand]);
  
  const writeAutomation = useCallback((
    trackId: string, 
    laneId: string, 
    points: { time: number; value: number; curve?: 'linear' | 'exponential' | 'logarithmic' | 'step' }[],
    replaceRange?: { start: number; end: number }
  ) => {
    const normalizedPoints = points.map(p => ({ ...p, curve: p.curve || 'linear' as const }));
    executeCommand(new WriteAutomationCommand(trackId, laneId, normalizedPoints, replaceRange));
  }, [executeCommand]);
  
  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    undo,
    redo,
    startBatch,
    endBatch,
    
    addTrack,
    removeTrack,
    updateTrack,
    duplicateTrack,
    reorderTracks,
    setTrackVolume,
    setTrackPan,
    toggleTrackMute,
    toggleTrackSolo,
    
    addAudioClip,
    removeAudioClip,
    updateAudioClip,
    moveClip,
    setClipGain,
    setClipFades,
    splitClip,
    trimClip,
    
    addAutomationLane,
    removeAutomationLane,
    addAutomationPoint,
    removeAutomationPoint,
    updateAutomationPoint,
    setAutomationMode,
    writeAutomation,
    
    timeline: timelineEngine,
    transport: transportAuthority,
    commandManager,
  };
}

export type StudioCommands = ReturnType<typeof useStudioCommands>;
