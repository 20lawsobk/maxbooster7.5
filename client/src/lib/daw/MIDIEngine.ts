import { logger } from '../logger';
import { transportEngine, TransportEngine } from './TransportEngine';
import { timelineEngine, TimelineEngine } from './TimelineEngine';

export interface MIDINote {
  id: string;
  pitch: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
  channel: number;
  selected: boolean;
  muted: boolean;
}

export interface MIDIControlChange {
  id: string;
  controller: number;
  value: number;
  time: number;
  channel: number;
}

export interface MIDIPitchBend {
  id: string;
  value: number;
  time: number;
  channel: number;
}

export interface MIDIClip {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  durationBeats: number;
  notes: MIDINote[];
  controlChanges: MIDIControlChange[];
  pitchBends: MIDIPitchBend[];
  color: string;
  looped: boolean;
  loopLength: number;
  muted: boolean;
  locked: boolean;
}

export interface QuantizeOptions {
  value: number;
  strength: number;
  swing: number;
  humanize: number;
  startOnly: boolean;
  selectedOnly: boolean;
}

export interface VelocityEditOptions {
  mode: 'set' | 'add' | 'scale' | 'compress' | 'humanize';
  value: number;
  min?: number;
  max?: number;
}

export interface MIDIEngineState {
  clips: MIDIClip[];
  selectedClipId: string | null;
  selectedNoteIds: string[];
  editingClipId: string | null;
  inputChannel: number;
  outputChannel: number;
  defaultVelocity: number;
  defaultDuration: number;
  keyboardOctave: number;
  previewEnabled: boolean;
  stepRecordEnabled: boolean;
  chordMode: boolean;
}

export type MIDIEventType = 'note-on' | 'note-off' | 'control-change' | 'pitch-bend' | 'program-change';

export interface MIDIEvent {
  type: MIDIEventType;
  channel: number;
  data1: number;
  data2: number;
  time: number;
}

type MIDIEventListener = (event: MIDIEvent) => void;

export class MIDIEngine {
  private state: MIDIEngineState;
  private transport: TransportEngine;
  private timeline: TimelineEngine;
  private listeners: Set<() => void> = new Set();
  private midiListeners: Set<MIDIEventListener> = new Set();
  private midiAccess: MIDIAccess | null = null;
  private activeNotes: Map<number, MIDINote> = new Map();
  private midiInitialized = false;

  constructor(transport: TransportEngine, timeline: TimelineEngine) {
    this.transport = transport;
    this.timeline = timeline;
    this.state = {
      clips: [],
      selectedClipId: null,
      selectedNoteIds: [],
      editingClipId: null,
      inputChannel: 0,
      outputChannel: 0,
      defaultVelocity: 100,
      defaultDuration: 0.25,
      keyboardOctave: 4,
      previewEnabled: true,
      stepRecordEnabled: false,
      chordMode: false,
    };
  }

  /**
   * Initialize Web MIDI access. Call this only from the studio page on first mount.
   * Uses localStorage to remember whether the user has already been prompted so
   * the browser permission dialog only ever appears on /studio.
   */
  async initialize(): Promise<void> {
    if (this.midiInitialized) return;
    this.midiInitialized = true;
    await this.initWebMIDI();
  }

  private async initWebMIDI(): Promise<void> {
    if ('requestMIDIAccess' in navigator) {
      try {
        this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
        this.midiAccess.inputs.forEach(input => {
          input.onmidimessage = this.handleMIDIMessage.bind(this);
        });
        localStorage.setItem('midi_access_prompted', '1');
      } catch (err) {
        logger.info('Web MIDI not available:', err);
        localStorage.setItem('midi_access_prompted', '1');
      }
    }
  }

  private handleMIDIMessage(message: MIDIMessageEvent): void {
    const [status, data1, data2] = message.data || [];
    if (status === undefined) return;

    const channel = status & 0x0F;
    const command = status >> 4;

    let eventType: MIDIEventType;
    switch (command) {
      case 0x9: eventType = data2 > 0 ? 'note-on' : 'note-off'; break;
      case 0x8: eventType = 'note-off'; break;
      case 0xB: eventType = 'control-change'; break;
      case 0xE: eventType = 'pitch-bend'; break;
      case 0xC: eventType = 'program-change'; break;
      default: return;
    }

    const event: MIDIEvent = {
      type: eventType,
      channel,
      data1,
      data2,
      time: performance.now(),
    };

    this.midiListeners.forEach(l => l(event));

    if (this.transport.getState().isRecording && this.state.editingClipId) {
      this.recordMIDIEvent(event);
    }
  }

  private recordMIDIEvent(event: MIDIEvent): void {
    const clip = this.state.clips.find(c => c.id === this.state.editingClipId);
    if (!clip) return;

    const currentBeat = this.timeline.secondsToBeats(this.transport.getCurrentPosition().seconds);
    const relativeBeat = currentBeat - clip.startBeat;

    if (event.type === 'note-on') {
      const noteId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const note: MIDINote = {
        id: noteId,
        pitch: event.data1,
        velocity: event.data2,
        startBeat: relativeBeat,
        durationBeats: 0.25,
        channel: event.channel,
        selected: false,
        muted: false,
      };
      this.activeNotes.set(event.data1, note);
    } else if (event.type === 'note-off') {
      const note = this.activeNotes.get(event.data1);
      if (note) {
        note.durationBeats = Math.max(0.0625, relativeBeat - note.startBeat);
        clip.notes.push(note);
        this.activeNotes.delete(event.data1);
        this.notify();
      }
    } else if (event.type === 'control-change') {
      const cc: MIDIControlChange = {
        id: `cc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        controller: event.data1,
        value: event.data2,
        time: relativeBeat,
        channel: event.channel,
      };
      clip.controlChanges.push(cc);
      this.notify();
    }
  }

  getState(): Readonly<MIDIEngineState> {
    return { ...this.state };
  }

  createClip(trackId: string, startBeat: number, durationBeats: number = 4, name?: string): string {
    const id = `midi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clip: MIDIClip = {
      id,
      trackId,
      name: name || 'MIDI Clip',
      startBeat,
      durationBeats,
      notes: [],
      controlChanges: [],
      pitchBends: [],
      color: '#8b5cf6',
      looped: false,
      loopLength: durationBeats,
      muted: false,
      locked: false,
    };

    this.state.clips.push(clip);
    this.notify();
    return id;
  }

  removeClip(clipId: string): void {
    const index = this.state.clips.findIndex(c => c.id === clipId);
    if (index !== -1) {
      this.state.clips.splice(index, 1);
      if (this.state.selectedClipId === clipId) {
        this.state.selectedClipId = null;
      }
      if (this.state.editingClipId === clipId) {
        this.state.editingClipId = null;
      }
      this.notify();
    }
  }

  duplicateClip(clipId: string, newStartBeat?: number): string | null {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip) return null;

    const newId = `midi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newClip: MIDIClip = {
      ...structuredClone(clip),
      id: newId,
      name: `${clip.name} (Copy)`,
      startBeat: newStartBeat ?? clip.startBeat + clip.durationBeats,
      notes: clip.notes.map(n => ({
        ...n,
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      })),
    };

    this.state.clips.push(newClip);
    this.notify();
    return newId;
  }

  selectClip(clipId: string | null): void {
    this.state.selectedClipId = clipId;
    this.notify();
  }

  editClip(clipId: string | null): void {
    this.state.editingClipId = clipId;
    this.state.selectedNoteIds = [];
    this.notify();
  }

  addNote(clipId: string, note: Omit<MIDINote, 'id' | 'selected' | 'muted'>): string | null {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return null;

    const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newNote: MIDINote = {
      ...note,
      id,
      selected: false,
      muted: false,
    };

    clip.notes.push(newNote);
    clip.notes.sort((a, b) => a.startBeat - b.startBeat);
    this.notify();
    return id;
  }

  removeNote(clipId: string, noteId: string): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const index = clip.notes.findIndex(n => n.id === noteId);
    if (index !== -1) {
      clip.notes.splice(index, 1);
      this.state.selectedNoteIds = this.state.selectedNoteIds.filter(id => id !== noteId);
      this.notify();
    }
  }

  moveNote(clipId: string, noteId: string, newPitch: number, newStartBeat: number): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const note = clip.notes.find(n => n.id === noteId);
    if (note) {
      note.pitch = Math.max(0, Math.min(127, newPitch));
      note.startBeat = Math.max(0, newStartBeat);
      clip.notes.sort((a, b) => a.startBeat - b.startBeat);
      this.notify();
    }
  }

  resizeNote(clipId: string, noteId: string, newDuration: number): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const note = clip.notes.find(n => n.id === noteId);
    if (note) {
      note.durationBeats = Math.max(0.0625, newDuration);
      this.notify();
    }
  }

  setNoteVelocity(clipId: string, noteId: string, velocity: number): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const note = clip.notes.find(n => n.id === noteId);
    if (note) {
      note.velocity = Math.max(1, Math.min(127, velocity));
      this.notify();
    }
  }

  selectNotes(noteIds: string[]): void {
    this.state.selectedNoteIds = noteIds;
    
    const clip = this.state.clips.find(c => c.id === this.state.editingClipId);
    if (clip) {
      for (const note of clip.notes) {
        note.selected = noteIds.includes(note.id);
      }
    }
    
    this.notify();
  }

  selectAllNotes(clipId: string): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip) return;

    this.state.selectedNoteIds = clip.notes.map(n => n.id);
    for (const note of clip.notes) {
      note.selected = true;
    }
    this.notify();
  }

  quantizeNotes(clipId: string, options: QuantizeOptions): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const notesToQuantize = options.selectedOnly 
      ? clip.notes.filter(n => n.selected)
      : clip.notes;

    for (const note of notesToQuantize) {
      const quantized = Math.round(note.startBeat / options.value) * options.value;
      let offset = (quantized - note.startBeat) * options.strength;

      if (options.humanize > 0) {
        const randomOffset = (Math.random() - 0.5) * 2 * options.humanize * options.value;
        offset += randomOffset;
      }

      note.startBeat = Math.max(0, note.startBeat + offset);

      if (!options.startOnly) {
        const endBeat = note.startBeat + note.durationBeats;
        const quantizedEnd = Math.round(endBeat / options.value) * options.value;
        note.durationBeats = Math.max(0.0625, quantizedEnd - note.startBeat);
      }
    }

    clip.notes.sort((a, b) => a.startBeat - b.startBeat);
    this.notify();
  }

  humanizeNotes(clipId: string, amount: number): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const selectedNotes = clip.notes.filter(n => this.state.selectedNoteIds.includes(n.id));
    const notesToHumanize = selectedNotes.length > 0 ? selectedNotes : clip.notes;

    for (const note of notesToHumanize) {
      const timeOffset = (Math.random() - 0.5) * amount * 0.1;
      const velocityOffset = Math.round((Math.random() - 0.5) * amount * 20);

      note.startBeat = Math.max(0, note.startBeat + timeOffset);
      note.velocity = Math.max(1, Math.min(127, note.velocity + velocityOffset));
    }

    this.notify();
  }

  editVelocity(clipId: string, options: VelocityEditOptions): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const selectedNotes = clip.notes.filter(n => this.state.selectedNoteIds.includes(n.id));
    const notesToEdit = selectedNotes.length > 0 ? selectedNotes : clip.notes;

    for (const note of notesToEdit) {
      switch (options.mode) {
        case 'set':
          note.velocity = options.value;
          break;
        case 'add':
          note.velocity += options.value;
          break;
        case 'scale':
          note.velocity = Math.round(note.velocity * (options.value / 100));
          break;
        case 'compress': {
          const min = options.min ?? 60;
          const max = options.max ?? 100;
          const range = max - min;
          note.velocity = Math.round(min + (note.velocity / 127) * range);
          break;
        }
        case 'humanize': {
          const offset = Math.round((Math.random() - 0.5) * options.value);
          note.velocity += offset;
          break;
        }
      }
      note.velocity = Math.max(1, Math.min(127, note.velocity));
    }

    this.notify();
  }

  transposeNotes(clipId: string, semitones: number): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const selectedNotes = clip.notes.filter(n => this.state.selectedNoteIds.includes(n.id));
    const notesToTranspose = selectedNotes.length > 0 ? selectedNotes : clip.notes;

    for (const note of notesToTranspose) {
      note.pitch = Math.max(0, Math.min(127, note.pitch + semitones));
    }

    this.notify();
  }

  legato(clipId: string): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const sortedNotes = [...clip.notes].sort((a, b) => a.startBeat - b.startBeat);

    for (let i = 0; i < sortedNotes.length - 1; i++) {
      const currentNote = sortedNotes[i];
      const nextNote = sortedNotes[i + 1];
      
      if (currentNote.pitch === nextNote.pitch) continue;
      
      const gap = nextNote.startBeat - (currentNote.startBeat + currentNote.durationBeats);
      if (gap > 0 && gap < 0.5) {
        currentNote.durationBeats = nextNote.startBeat - currentNote.startBeat;
      }
    }

    this.notify();
  }

  addControlChange(clipId: string, cc: Omit<MIDIControlChange, 'id'>): string | null {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return null;

    const id = `cc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newCC: MIDIControlChange = { ...cc, id };
    clip.controlChanges.push(newCC);
    clip.controlChanges.sort((a, b) => a.time - b.time);
    this.notify();
    return id;
  }

  removeControlChange(clipId: string, ccId: string): void {
    const clip = this.state.clips.find(c => c.id === clipId);
    if (!clip || clip.locked) return;

    const index = clip.controlChanges.findIndex(cc => cc.id === ccId);
    if (index !== -1) {
      clip.controlChanges.splice(index, 1);
      this.notify();
    }
  }

  pitchToNoteName(pitch: number): string {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(pitch / 12) - 1;
    const note = noteNames[pitch % 12];
    return `${note}${octave}`;
  }

  noteNameToPitch(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(-?\d+)$/i);
    if (!match) return 60;

    const noteNames: Record<string, number> = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
      'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
    };

    const note = match[1].toUpperCase();
    const octave = parseInt(match[2]);
    return (octave + 1) * 12 + noteNames[note];
  }

  onMIDIEvent(listener: MIDIEventListener): () => void {
    this.midiListeners.add(listener);
    return () => this.midiListeners.delete(listener);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  serialize(): MIDIEngineState {
    return structuredClone(this.state);
  }

  deserialize(state: MIDIEngineState): void {
    this.state = structuredClone(state);
    this.notify();
  }
}

export const midiEngine = new MIDIEngine(transportEngine, timelineEngine);
