import { useEffect, useCallback, useMemo } from 'react';
import { useStudioCommands } from './useStudioCommands';
import { aiStudioService, type AIMixSuggestion, type AITrackSuggestion } from '@/lib/studio/ai/AIStudioService';
import { commandManager, type Command } from '@/lib/studio/commands';
import { useStudioStore } from '@/stores/studioStore';

export function useAIStudio() {
  const commands = useStudioCommands();
  const tracks = useStudioStore(state => state.tracks);
  const project = useStudioStore(state => state.project);
  
  useEffect(() => {
    const executeViaCommandManager = (cmd: Command) => {
      commandManager.execute(cmd, (command) => {
        const state = useStudioStore.getState();
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
        
        const snapshot = {
          tracks: deepClone(state.tracks),
          transport: deepClone(state.transport),
          project: deepClone(state.project),
          view: deepClone(state.view),
          mixer: deepClone(state.mixer),
          masterTrack: deepClone(state.masterTrack),
        };
        
        command.execute(snapshot as any);
        
        useStudioStore.setState({
          tracks: snapshot.tracks as any,
          transport: snapshot.transport as any,
          project: snapshot.project as any,
          view: snapshot.view as any,
          mixer: snapshot.mixer as any,
          masterTrack: snapshot.masterTrack as any,
        });
      });
    };
    
    aiStudioService.setCommandEmitter(executeViaCommandManager);
  }, []);
  
  const generateChords = useCallback((
    key: string,
    scale: string,
    progression: string[],
    startBar: number = 0,
    barsPerChord: number = 1
  ) => {
    const trackId = commands.addTrack('instrument', 'AI Chords');
    if (trackId) {
      aiStudioService.generateChordProgression(trackId, key, scale, progression, startBar, barsPerChord);
    }
    return trackId;
  }, [commands]);
  
  const generateMelody = useCallback((
    key: string,
    scale: string,
    startBar: number = 0,
    bars: number = 4,
    density: number = 0.5
  ) => {
    const trackId = commands.addTrack('instrument', 'AI Melody');
    if (trackId) {
      aiStudioService.generateMelody(trackId, key, scale, startBar, bars, density);
    }
    return trackId;
  }, [commands]);
  
  const generateDrums = useCallback((
    genre: string,
    startBar: number = 0,
    bars: number = 4
  ) => {
    const trackId = commands.addTrack('drums', 'AI Drums');
    if (trackId) {
      aiStudioService.generateDrumPattern(trackId, genre, startBar, bars);
    }
    return trackId;
  }, [commands]);
  
  const generateBass = useCallback((
    key: string,
    scale: string,
    chordProgression: string[],
    startBar: number = 0,
    barsPerChord: number = 1
  ) => {
    const trackId = commands.addTrack('instrument', 'AI Bass');
    if (trackId) {
      aiStudioService.generateBassline(trackId, key, scale, chordProgression, startBar, barsPerChord);
    }
    return trackId;
  }, [commands]);
  
  const generateFullArrangement = useCallback((
    key: string = 'C',
    scale: string = 'Minor',
    genre: string = 'hip_hop',
    bars: number = 16
  ) => {
    aiStudioService.startBatch('Generate full arrangement');
    
    const progression = scale === 'Major' 
      ? ['I', 'V', 'vi', 'IV'] 
      : ['i', 'VI', 'III', 'VII'];
    
    const chordsTrackId = commands.addTrack('instrument', 'AI Chords');
    const melodyTrackId = commands.addTrack('instrument', 'AI Melody');
    const drumsTrackId = commands.addTrack('drums', 'AI Drums');
    const bassTrackId = commands.addTrack('instrument', 'AI Bass');
    
    if (chordsTrackId) {
      aiStudioService.generateChordProgression(chordsTrackId, key, scale, progression, 0, bars / 4);
    }
    if (melodyTrackId) {
      aiStudioService.generateMelody(melodyTrackId, key, scale, 0, bars, 0.6);
    }
    if (drumsTrackId) {
      aiStudioService.generateDrumPattern(drumsTrackId, genre, 0, bars);
    }
    if (bassTrackId) {
      aiStudioService.generateBassline(bassTrackId, key, scale, progression, 0, bars / 4);
    }
    
    aiStudioService.endBatch();
  }, [commands]);
  
  const applyAIMix = useCallback((suggestions: AIMixSuggestion[]) => {
    aiStudioService.applyMixSuggestions(suggestions);
  }, []);
  
  const addGeneratedTrack = useCallback((suggestion: AITrackSuggestion) => {
    return aiStudioService.addGeneratedTrack(suggestion);
  }, []);
  
  return {
    generateChords,
    generateMelody,
    generateDrums,
    generateBass,
    generateFullArrangement,
    applyAIMix,
    addGeneratedTrack,
    
    tracks,
    project,
    commands,
  };
}
