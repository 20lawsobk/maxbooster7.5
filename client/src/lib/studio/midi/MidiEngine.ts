export interface MidiNote {
  id: string;
  pitch: number;
  velocity: number;
  startTick: number;
  durationTicks: number;
  channel: number;
  selected?: boolean;
  muted?: boolean;
}

export interface MidiCCEvent {
  id: string;
  controller: number;
  value: number;
  tick: number;
  channel: number;
}

export interface MidiPitchBend {
  id: string;
  value: number;
  tick: number;
  channel: number;
}

export interface MidiClip {
  id: string;
  name: string;
  startTick: number;
  durationTicks: number;
  notes: MidiNote[];
  ccEvents: MidiCCEvent[];
  pitchBends: MidiPitchBend[];
  loopEnabled: boolean;
  loopStartTick: number;
  loopEndTick: number;
  color?: string;
  muted: boolean;
  locked: boolean;
}

export interface VelocityLane {
  visible: boolean;
  height: number;
}

export interface CCLane {
  id: string;
  controller: number;
  name: string;
  visible: boolean;
  height: number;
  color?: string;
}

export interface PianoRollState {
  visibleOctaves: { start: number; end: number };
  noteHeight: number;
  ticksPerPixel: number;
  snapToGrid: boolean;
  gridDivision: number;
  velocityLane: VelocityLane;
  ccLanes: CCLane[];
  selectedNotes: Set<string>;
  editTool: 'select' | 'pencil' | 'erase' | 'split' | 'glue' | 'velocity';
  quantizeValue: number;
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const TICKS_PER_QUARTER_NOTE = 480;

export class MidiEngine {
  private ppq: number = TICKS_PER_QUARTER_NOTE;
  
  constructor(ppq: number = TICKS_PER_QUARTER_NOTE) {
    this.ppq = ppq;
  }
  
  get ticksPerQuarterNote(): number {
    return this.ppq;
  }
  
  pitchToNoteName(pitch: number): string {
    const octave = Math.floor(pitch / 12) - 1;
    const noteIndex = pitch % 12;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
  }
  
  noteNameToPitch(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) return 60;
    
    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = NOTE_NAMES.indexOf(note);
    if (noteIndex === -1) return 60;
    
    return (octave + 1) * 12 + noteIndex;
  }
  
  ticksToBeats(ticks: number): number {
    return ticks / this.ppq;
  }
  
  beatsToTicks(beats: number): number {
    return Math.round(beats * this.ppq);
  }
  
  ticksToSeconds(ticks: number, tempo: number): number {
    const beats = this.ticksToBeats(ticks);
    return (beats * 60) / tempo;
  }
  
  secondsToTicks(seconds: number, tempo: number): number {
    const beats = (seconds * tempo) / 60;
    return this.beatsToTicks(beats);
  }
  
  quantizeTick(tick: number, gridDivision: number): number {
    const gridTicks = this.ppq / gridDivision;
    return Math.round(tick / gridTicks) * gridTicks;
  }
  
  createNote(
    pitch: number,
    velocity: number,
    startTick: number,
    durationTicks: number,
    channel: number = 0
  ): MidiNote {
    return {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pitch: Math.max(0, Math.min(127, pitch)),
      velocity: Math.max(1, Math.min(127, velocity)),
      startTick,
      durationTicks: Math.max(1, durationTicks),
      channel: Math.max(0, Math.min(15, channel)),
      selected: false,
      muted: false,
    };
  }
  
  createCCEvent(
    controller: number,
    value: number,
    tick: number,
    channel: number = 0
  ): MidiCCEvent {
    return {
      id: `cc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      controller: Math.max(0, Math.min(127, controller)),
      value: Math.max(0, Math.min(127, value)),
      tick,
      channel: Math.max(0, Math.min(15, channel)),
    };
  }
  
  createPitchBend(
    value: number,
    tick: number,
    channel: number = 0
  ): MidiPitchBend {
    return {
      id: `pb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      value: Math.max(-8192, Math.min(8191, value)),
      tick,
      channel: Math.max(0, Math.min(15, channel)),
    };
  }
  
  createClip(
    name: string,
    startTick: number,
    durationTicks: number
  ): MidiClip {
    return {
      id: `midi-clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      startTick,
      durationTicks,
      notes: [],
      ccEvents: [],
      pitchBends: [],
      loopEnabled: false,
      loopStartTick: 0,
      loopEndTick: durationTicks,
      muted: false,
      locked: false,
    };
  }
  
  transposeNotes(notes: MidiNote[], semitones: number): MidiNote[] {
    return notes.map(note => ({
      ...note,
      pitch: Math.max(0, Math.min(127, note.pitch + semitones)),
    }));
  }
  
  scaleVelocities(notes: MidiNote[], factor: number): MidiNote[] {
    return notes.map(note => ({
      ...note,
      velocity: Math.max(1, Math.min(127, Math.round(note.velocity * factor))),
    }));
  }
  
  setVelocities(notes: MidiNote[], velocity: number): MidiNote[] {
    return notes.map(note => ({
      ...note,
      velocity: Math.max(1, Math.min(127, velocity)),
    }));
  }
  
  quantizeNotes(notes: MidiNote[], gridDivision: number, strength: number = 1): MidiNote[] {
    return notes.map(note => {
      const quantizedStart = this.quantizeTick(note.startTick, gridDivision);
      const diff = quantizedStart - note.startTick;
      const newStart = note.startTick + Math.round(diff * strength);
      return {
        ...note,
        startTick: newStart,
      };
    });
  }
  
  humanizeNotes(
    notes: MidiNote[],
    timingRange: number,
    velocityRange: number
  ): MidiNote[] {
    return notes.map(note => {
      const timingOffset = Math.round((Math.random() - 0.5) * 2 * timingRange);
      const velocityOffset = Math.round((Math.random() - 0.5) * 2 * velocityRange);
      return {
        ...note,
        startTick: Math.max(0, note.startTick + timingOffset),
        velocity: Math.max(1, Math.min(127, note.velocity + velocityOffset)),
      };
    });
  }
  
  splitNoteAtTick(note: MidiNote, splitTick: number): [MidiNote, MidiNote] | null {
    if (splitTick <= note.startTick || splitTick >= note.startTick + note.durationTicks) {
      return null;
    }
    
    const firstDuration = splitTick - note.startTick;
    const secondDuration = note.durationTicks - firstDuration;
    
    const first: MidiNote = {
      ...note,
      durationTicks: firstDuration,
    };
    
    const second: MidiNote = {
      ...note,
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTick: splitTick,
      durationTicks: secondDuration,
    };
    
    return [first, second];
  }
  
  glueNotes(notes: MidiNote[]): MidiNote | null {
    if (notes.length < 2) return null;
    
    const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
    const samePitch = sorted.every(n => n.pitch === sorted[0].pitch);
    if (!samePitch) return null;
    
    const firstNote = sorted[0];
    const lastNote = sorted[sorted.length - 1];
    const endTick = lastNote.startTick + lastNote.durationTicks;
    
    return {
      ...firstNote,
      durationTicks: endTick - firstNote.startTick,
    };
  }
  
  getNotesInRange(
    notes: MidiNote[],
    startTick: number,
    endTick: number,
    pitchStart?: number,
    pitchEnd?: number
  ): MidiNote[] {
    return notes.filter(note => {
      const noteEnd = note.startTick + note.durationTicks;
      const inTimeRange = noteEnd > startTick && note.startTick < endTick;
      
      if (!inTimeRange) return false;
      
      if (pitchStart !== undefined && pitchEnd !== undefined) {
        return note.pitch >= pitchStart && note.pitch <= pitchEnd;
      }
      
      return true;
    });
  }
  
  getCCValueAtTick(ccEvents: MidiCCEvent[], controller: number, tick: number): number {
    const events = ccEvents
      .filter(e => e.controller === controller && e.tick <= tick)
      .sort((a, b) => b.tick - a.tick);
    
    return events.length > 0 ? events[0].value : 64;
  }
  
  interpolateCCValues(
    ccEvents: MidiCCEvent[],
    controller: number,
    startTick: number,
    endTick: number,
    resolution: number = 10
  ): MidiCCEvent[] {
    const startValue = this.getCCValueAtTick(ccEvents, controller, startTick);
    const endValue = this.getCCValueAtTick(ccEvents, controller, endTick);
    
    const tickStep = Math.max(1, Math.floor((endTick - startTick) / resolution));
    const result: MidiCCEvent[] = [];
    
    for (let tick = startTick; tick <= endTick; tick += tickStep) {
      const progress = (tick - startTick) / (endTick - startTick);
      const value = Math.round(startValue + (endValue - startValue) * progress);
      result.push(this.createCCEvent(controller, value, tick));
    }
    
    return result;
  }
  
  calculateClipBounds(clip: MidiClip): { minPitch: number; maxPitch: number; endTick: number } {
    if (clip.notes.length === 0) {
      return { minPitch: 60, maxPitch: 72, endTick: clip.startTick + clip.durationTicks };
    }
    
    let minPitch = 127;
    let maxPitch = 0;
    let endTick = clip.startTick;
    
    for (const note of clip.notes) {
      minPitch = Math.min(minPitch, note.pitch);
      maxPitch = Math.max(maxPitch, note.pitch);
      endTick = Math.max(endTick, clip.startTick + note.startTick + note.durationTicks);
    }
    
    return { minPitch, maxPitch, endTick };
  }
  
  sortNotes(notes: MidiNote[]): MidiNote[] {
    return [...notes].sort((a, b) => {
      if (a.startTick !== b.startTick) return a.startTick - b.startTick;
      return a.pitch - b.pitch;
    });
  }
  
  sortCCEvents(events: MidiCCEvent[]): MidiCCEvent[] {
    return [...events].sort((a, b) => a.tick - b.tick);
  }
  
  duplicateClip(clip: MidiClip, newStartTick: number): MidiClip {
    const newId = `midi-clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      ...clip,
      id: newId,
      startTick: newStartTick,
      notes: clip.notes.map(note => ({
        ...note,
        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })),
      ccEvents: clip.ccEvents.map(event => ({
        ...event,
        id: `cc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })),
      pitchBends: clip.pitchBends.map(pb => ({
        ...pb,
        id: `pb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      })),
    };
  }
}

export const midiEngine = new MidiEngine();
