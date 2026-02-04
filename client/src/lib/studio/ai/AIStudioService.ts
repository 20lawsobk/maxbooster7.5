import { commandManager, type Command } from '../commands';
import {
  AddTrackCommand,
  UpdateTrackCommand,
} from '../commands/trackCommands';
import {
  AddAudioClipCommand,
  UpdateAudioClipCommand,
} from '../commands/clipCommands';
import {
  AddMidiClipCommand,
  AddMidiNoteCommand,
} from '../commands/midiCommands';
import {
  AddAutomationLaneCommand,
  AddAutomationPointCommand,
} from '../commands/automationCommands';
import { midiEngine, type MidiNote } from '../midi/MidiEngine';

export interface AIGenerationResult {
  type: 'audio' | 'midi' | 'arrangement';
  trackId?: string;
  clipId?: string;
  success: boolean;
  error?: string;
}

export interface AITrackSuggestion {
  name: string;
  type: string;
  instrument?: string;
  notes?: { pitch: number; velocity: number; startTick: number; durationTicks: number }[];
  audioPath?: string;
  volume?: number;
  pan?: number;
}

export interface AIMixSuggestion {
  trackId: string;
  volume?: number;
  pan?: number;
  eq?: { frequency: number; gain: number; q: number }[];
  compression?: { threshold: number; ratio: number; attack: number; release: number };
  reverb?: { amount: number; decay: number };
}

export interface AIArrangementSuggestion {
  sections: { name: string; startBar: number; endBar: number }[];
  markers: { name: string; bar: number }[];
  tempo?: number;
}

export type AICommandEmitter = (command: Command) => void;

export class AIStudioService {
  private emitCommand: AICommandEmitter | null = null;
  private batchId: string | null = null;
  
  setCommandEmitter(emitter: AICommandEmitter): void {
    this.emitCommand = emitter;
  }
  
  private emit(command: Command): void {
    if (!this.emitCommand) {
      console.warn('AIStudioService: No command emitter set');
      return;
    }
    this.emitCommand(command);
  }
  
  startBatch(description: string): string {
    this.batchId = commandManager.startBatch(`ai-batch-${Date.now()}`);
    return this.batchId;
  }
  
  endBatch(): void {
    if (this.batchId) {
      commandManager.endBatch();
      this.batchId = null;
    }
  }
  
  get isBatching(): boolean {
    return this.batchId !== null;
  }
  
  addGeneratedTrack(suggestion: AITrackSuggestion): string | null {
    const cmd = new AddTrackCommand(suggestion.type, suggestion.name);
    this.emit(cmd);
    
    if (cmd.createdTrackId && suggestion.volume !== undefined) {
      this.emit(new UpdateTrackCommand(cmd.createdTrackId, { volume: suggestion.volume }, 'Set AI track volume'));
    }
    
    if (cmd.createdTrackId && suggestion.pan !== undefined) {
      this.emit(new UpdateTrackCommand(cmd.createdTrackId, { pan: suggestion.pan }, 'Set AI track pan'));
    }
    
    return cmd.createdTrackId;
  }
  
  addGeneratedMidiClip(
    trackId: string,
    name: string,
    startTick: number,
    durationTicks: number,
    notes: { pitch: number; velocity: number; startTick: number; durationTicks: number }[]
  ): string | null {
    const clipCmd = new AddMidiClipCommand(trackId, {
      name,
      startTick,
      durationTicks,
      notes: notes.map(n => ({
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        pitch: n.pitch,
        velocity: n.velocity,
        startTick: n.startTick,
        durationTicks: n.durationTicks,
        channel: 0,
        selected: false,
        muted: false,
      })),
    });
    
    this.emit(clipCmd);
    return clipCmd.createdClipId;
  }
  
  addGeneratedAudioClip(
    trackId: string,
    name: string,
    startTime: number,
    duration: number,
    audioPath: string
  ): string | null {
    const clipCmd = new AddAudioClipCommand(trackId, {
      name,
      startTime,
      duration,
      audioFilePath: audioPath,
      gain: 1,
      fadeIn: 0,
      fadeOut: 0,
    });
    
    this.emit(clipCmd);
    return clipCmd.createdClipId;
  }
  
  applyMixSuggestions(suggestions: AIMixSuggestion[]): void {
    this.startBatch('Apply AI mix suggestions');
    
    for (const suggestion of suggestions) {
      const updates: Record<string, any> = {};
      
      if (suggestion.volume !== undefined) {
        updates.volume = suggestion.volume;
      }
      if (suggestion.pan !== undefined) {
        updates.pan = suggestion.pan;
      }
      
      if (Object.keys(updates).length > 0) {
        this.emit(new UpdateTrackCommand(suggestion.trackId, updates, 'AI mix adjustment'));
      }
      
      if (suggestion.eq) {
        const laneCmd = new AddAutomationLaneCommand(
          suggestion.trackId,
          'eq',
          'EQ',
          0,
          -12,
          12
        );
        this.emit(laneCmd);
      }
    }
    
    this.endBatch();
  }
  
  generateChordProgression(
    trackId: string,
    key: string,
    scale: string,
    progression: string[],
    startBar: number,
    barsPerChord: number = 1
  ): string | null {
    const ppq = midiEngine.ticksPerQuarterNote;
    const ticksPerBar = ppq * 4;
    const startTick = startBar * ticksPerBar;
    const durationTicks = progression.length * barsPerChord * ticksPerBar;
    
    const notes: { pitch: number; velocity: number; startTick: number; durationTicks: number }[] = [];
    
    const chordMap: Record<string, number[]> = {
      'I': [0, 4, 7],
      'ii': [2, 5, 9],
      'iii': [4, 7, 11],
      'IV': [5, 9, 12],
      'V': [7, 11, 14],
      'vi': [9, 12, 16],
      'vii°': [11, 14, 17],
      'i': [0, 3, 7],
      'iv': [5, 8, 12],
      'v': [7, 10, 14],
      'VI': [8, 12, 15],
      'VII': [10, 14, 17],
    };
    
    const keyOffset = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(key);
    const basePitch = 48 + keyOffset;
    
    progression.forEach((chord, index) => {
      const intervals = chordMap[chord] || [0, 4, 7];
      const chordStartTick = index * barsPerChord * ticksPerBar;
      const chordDuration = barsPerChord * ticksPerBar - ppq / 4;
      
      intervals.forEach(interval => {
        notes.push({
          pitch: basePitch + interval,
          velocity: 80,
          startTick: chordStartTick,
          durationTicks: chordDuration,
        });
      });
    });
    
    return this.addGeneratedMidiClip(trackId, `AI Chords (${key} ${scale})`, startTick, durationTicks, notes);
  }
  
  generateMelody(
    trackId: string,
    key: string,
    scale: string,
    startBar: number,
    bars: number,
    density: number = 0.5
  ): string | null {
    const ppq = midiEngine.ticksPerQuarterNote;
    const ticksPerBar = ppq * 4;
    const startTick = startBar * ticksPerBar;
    const durationTicks = bars * ticksPerBar;
    
    const scaleIntervals: Record<string, number[]> = {
      'Major': [0, 2, 4, 5, 7, 9, 11],
      'Minor': [0, 2, 3, 5, 7, 8, 10],
      'Dorian': [0, 2, 3, 5, 7, 9, 10],
      'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
      'Phrygian': [0, 1, 3, 5, 7, 8, 10],
      'Lydian': [0, 2, 4, 6, 7, 9, 11],
    };
    
    const intervals = scaleIntervals[scale] || scaleIntervals['Major'];
    const keyOffset = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(key);
    const basePitch = 60 + keyOffset;
    
    const notes: { pitch: number; velocity: number; startTick: number; durationTicks: number }[] = [];
    
    const notesPerBar = Math.floor(4 + density * 8);
    const noteStep = ticksPerBar / notesPerBar;
    
    for (let bar = 0; bar < bars; bar++) {
      for (let i = 0; i < notesPerBar; i++) {
        if (Math.random() > density * 0.8 + 0.2) continue;
        
        const intervalIndex = Math.floor(Math.random() * intervals.length);
        const octaveShift = Math.floor(Math.random() * 2) * 12;
        const pitch = basePitch + intervals[intervalIndex] + octaveShift;
        
        notes.push({
          pitch,
          velocity: 70 + Math.floor(Math.random() * 30),
          startTick: bar * ticksPerBar + i * noteStep,
          durationTicks: noteStep * (0.5 + Math.random() * 0.5),
        });
      }
    }
    
    return this.addGeneratedMidiClip(trackId, `AI Melody (${key} ${scale})`, startTick, durationTicks, notes);
  }
  
  generateDrumPattern(
    trackId: string,
    genre: string,
    startBar: number,
    bars: number
  ): string | null {
    const ppq = midiEngine.ticksPerQuarterNote;
    const ticksPerBar = ppq * 4;
    const startTick = startBar * ticksPerBar;
    const durationTicks = bars * ticksPerBar;
    
    const patterns: Record<string, { kick: number[]; snare: number[]; hihat: number[] }> = {
      'hip_hop': {
        kick: [0, 0.75, 2, 2.5],
        snare: [1, 3],
        hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      },
      'house': {
        kick: [0, 1, 2, 3],
        snare: [1, 3],
        hihat: [0.5, 1.5, 2.5, 3.5],
      },
      'rock': {
        kick: [0, 2.5],
        snare: [1, 3],
        hihat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      },
    };
    
    const pattern = patterns[genre] || patterns['hip_hop'];
    const notes: { pitch: number; velocity: number; startTick: number; durationTicks: number }[] = [];
    
    for (let bar = 0; bar < bars; bar++) {
      pattern.kick.forEach(beat => {
        notes.push({
          pitch: 36,
          velocity: 100,
          startTick: bar * ticksPerBar + beat * ppq,
          durationTicks: ppq / 4,
        });
      });
      
      pattern.snare.forEach(beat => {
        notes.push({
          pitch: 38,
          velocity: 90,
          startTick: bar * ticksPerBar + beat * ppq,
          durationTicks: ppq / 4,
        });
      });
      
      pattern.hihat.forEach(beat => {
        notes.push({
          pitch: 42,
          velocity: 70 + Math.floor(Math.random() * 20),
          startTick: bar * ticksPerBar + beat * ppq,
          durationTicks: ppq / 8,
        });
      });
    }
    
    return this.addGeneratedMidiClip(trackId, `AI Drums (${genre})`, startTick, durationTicks, notes);
  }
  
  generateBassline(
    trackId: string,
    key: string,
    scale: string,
    chordProgression: string[],
    startBar: number,
    barsPerChord: number = 1
  ): string | null {
    const ppq = midiEngine.ticksPerQuarterNote;
    const ticksPerBar = ppq * 4;
    const startTick = startBar * ticksPerBar;
    const durationTicks = chordProgression.length * barsPerChord * ticksPerBar;
    
    const rootNotes: Record<string, number> = {
      'I': 0, 'ii': 2, 'iii': 4, 'IV': 5, 'V': 7, 'vi': 9, 'vii°': 11,
      'i': 0, 'iv': 5, 'v': 7, 'VI': 8, 'VII': 10,
    };
    
    const keyOffset = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(key);
    const basePitch = 36 + keyOffset;
    
    const notes: { pitch: number; velocity: number; startTick: number; durationTicks: number }[] = [];
    
    chordProgression.forEach((chord, index) => {
      const root = rootNotes[chord] ?? 0;
      const chordStart = index * barsPerChord * ticksPerBar;
      
      notes.push({
        pitch: basePitch + root,
        velocity: 100,
        startTick: chordStart,
        durationTicks: ppq,
      });
      
      notes.push({
        pitch: basePitch + root,
        velocity: 80,
        startTick: chordStart + ppq * 2,
        durationTicks: ppq / 2,
      });
      
      notes.push({
        pitch: basePitch + root + 12,
        velocity: 70,
        startTick: chordStart + ppq * 3,
        durationTicks: ppq / 2,
      });
    });
    
    return this.addGeneratedMidiClip(trackId, `AI Bass (${key} ${scale})`, startTick, durationTicks, notes);
  }
  
  addAutomationFromEnvelope(
    trackId: string,
    parameterId: string,
    parameterName: string,
    envelope: { time: number; value: number }[]
  ): string | null {
    const laneCmd = new AddAutomationLaneCommand(trackId, parameterId, parameterName, 0.5, 0, 1);
    this.emit(laneCmd);
    
    if (laneCmd.createdLaneId) {
      envelope.forEach(point => {
        this.emit(new AddAutomationPointCommand(trackId, laneCmd.createdLaneId!, {
          time: point.time,
          value: point.value,
          curve: 'linear',
        }));
      });
    }
    
    return laneCmd.createdLaneId;
  }
}

export const aiStudioService = new AIStudioService();
