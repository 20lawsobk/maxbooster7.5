import type { Draft } from 'immer';
import { BaseCommand, type StudioSnapshot } from './index';
import type { MidiNote, MidiClip, MidiCCEvent } from '../midi/MidiEngine';

export class AddMidiClipCommand extends BaseCommand {
  readonly type = 'add_midi_clip';
  readonly description: string;
  createdClipId: string | null = null;
  
  constructor(
    private trackId: string,
    private clipData: Partial<MidiClip> & { name: string; startTick: number; durationTicks: number }
  ) {
    super();
    this.description = `Add MIDI clip "${clipData.name}"`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    if (!track.midiClips) track.midiClips = [];
    
    const newClip: MidiClip = {
      id: `midi-clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: this.clipData.name,
      startTick: this.clipData.startTick,
      durationTicks: this.clipData.durationTicks,
      notes: this.clipData.notes || [],
      ccEvents: this.clipData.ccEvents || [],
      pitchBends: this.clipData.pitchBends || [],
      loopEnabled: this.clipData.loopEnabled || false,
      loopStartTick: this.clipData.loopStartTick || 0,
      loopEndTick: this.clipData.loopEndTick || this.clipData.durationTicks,
      color: this.clipData.color,
      muted: this.clipData.muted || false,
      locked: this.clipData.locked || false,
    };
    
    this.createdClipId = newClip.id;
    track.midiClips.push(newClip);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips || !this.createdClipId) return;
    
    track.midiClips = track.midiClips.filter((c: MidiClip) => c.id !== this.createdClipId);
  }
}

export class RemoveMidiClipCommand extends BaseCommand {
  readonly type = 'remove_midi_clip';
  readonly description: string;
  private removedClip: MidiClip | null = null;
  private clipIndex: number = -1;
  
  constructor(
    private trackId: string,
    private clipId: string
  ) {
    super();
    this.description = 'Remove MIDI clip';
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    this.clipIndex = track.midiClips.findIndex((c: MidiClip) => c.id === this.clipId);
    if (this.clipIndex === -1) return;
    
    this.removedClip = JSON.parse(JSON.stringify(track.midiClips[this.clipIndex]));
    track.midiClips.splice(this.clipIndex, 1);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.removedClip) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    if (!track.midiClips) track.midiClips = [];
    track.midiClips.splice(this.clipIndex, 0, this.removedClip);
  }
}

export class AddMidiNoteCommand extends BaseCommand {
  readonly type = 'add_midi_note';
  readonly description = 'Add MIDI note';
  createdNoteId: string | null = null;
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteData: { pitch: number; velocity: number; startTick: number; durationTicks: number; channel?: number }
  ) {
    super();
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    const newNote: MidiNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      pitch: Math.max(0, Math.min(127, this.noteData.pitch)),
      velocity: Math.max(1, Math.min(127, this.noteData.velocity)),
      startTick: this.noteData.startTick,
      durationTicks: Math.max(1, this.noteData.durationTicks),
      channel: this.noteData.channel ?? 0,
      selected: false,
      muted: false,
    };
    
    this.createdNoteId = newNote.id;
    clip.notes.push(newNote);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.createdNoteId) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    clip.notes = clip.notes.filter((n: MidiNote) => n.id !== this.createdNoteId);
  }
}

export class RemoveMidiNoteCommand extends BaseCommand {
  readonly type = 'remove_midi_note';
  readonly description = 'Remove MIDI note';
  private removedNote: MidiNote | null = null;
  private noteIndex: number = -1;
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteId: string
  ) {
    super();
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    this.noteIndex = clip.notes.findIndex((n: MidiNote) => n.id === this.noteId);
    if (this.noteIndex === -1) return;
    
    this.removedNote = { ...clip.notes[this.noteIndex] };
    clip.notes.splice(this.noteIndex, 1);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.removedNote) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    clip.notes.splice(this.noteIndex, 0, this.removedNote);
  }
}

export class UpdateMidiNoteCommand extends BaseCommand {
  readonly type = 'update_midi_note';
  readonly description: string;
  private previousValues: Partial<MidiNote> | null = null;
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteId: string,
    private updates: Partial<MidiNote>,
    description?: string
  ) {
    super();
    this.description = description || 'Update MIDI note';
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    const note = clip.notes.find((n: MidiNote) => n.id === this.noteId);
    if (!note) return;
    
    this.previousValues = {};
    for (const key of Object.keys(this.updates) as (keyof MidiNote)[]) {
      (this.previousValues as any)[key] = note[key];
      (note as any)[key] = this.updates[key];
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.previousValues) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    const note = clip.notes.find((n: MidiNote) => n.id === this.noteId);
    if (!note) return;
    
    for (const key of Object.keys(this.previousValues) as (keyof MidiNote)[]) {
      (note as any)[key] = this.previousValues[key];
    }
  }
  
  canMerge(other: UpdateMidiNoteCommand): boolean {
    if (!(other instanceof UpdateMidiNoteCommand)) return false;
    return (
      other.trackId === this.trackId &&
      other.clipId === this.clipId &&
      other.noteId === this.noteId &&
      Date.now() - other.timestamp < 500
    );
  }
  
  merge(other: UpdateMidiNoteCommand): UpdateMidiNoteCommand {
    return new UpdateMidiNoteCommand(
      this.trackId,
      this.clipId,
      this.noteId,
      { ...other.updates, ...this.updates },
      this.description
    );
  }
}

export class TransposeNotesCommand extends BaseCommand {
  readonly type = 'transpose_notes';
  readonly description: string;
  private originalPitches: Map<string, number> = new Map();
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteIds: string[],
    private semitones: number
  ) {
    super();
    this.description = `Transpose ${noteIds.length} note(s) by ${semitones > 0 ? '+' : ''}${semitones}`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    for (const note of clip.notes) {
      if (this.noteIds.includes(note.id)) {
        this.originalPitches.set(note.id, note.pitch);
        note.pitch = Math.max(0, Math.min(127, note.pitch + this.semitones));
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    for (const note of clip.notes) {
      const original = this.originalPitches.get(note.id);
      if (original !== undefined) {
        note.pitch = original;
      }
    }
  }
}

export class QuantizeNotesCommand extends BaseCommand {
  readonly type = 'quantize_notes';
  readonly description: string;
  private originalTicks: Map<string, number> = new Map();
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteIds: string[],
    private gridDivision: number,
    private strength: number = 1,
    private ppq: number = 480
  ) {
    super();
    this.description = `Quantize ${noteIds.length} note(s)`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    const gridTicks = this.ppq / this.gridDivision;
    
    for (const note of clip.notes) {
      if (this.noteIds.includes(note.id)) {
        this.originalTicks.set(note.id, note.startTick);
        const quantized = Math.round(note.startTick / gridTicks) * gridTicks;
        const diff = quantized - note.startTick;
        note.startTick = note.startTick + Math.round(diff * this.strength);
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    for (const note of clip.notes) {
      const original = this.originalTicks.get(note.id);
      if (original !== undefined) {
        note.startTick = original;
      }
    }
  }
}

export class SetNoteVelocitiesCommand extends BaseCommand {
  readonly type = 'set_velocities';
  readonly description: string;
  private originalVelocities: Map<string, number> = new Map();
  
  constructor(
    private trackId: string,
    private clipId: string,
    private noteIds: string[],
    private velocity: number
  ) {
    super();
    this.description = `Set velocity to ${velocity}`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    for (const note of clip.notes) {
      if (this.noteIds.includes(note.id)) {
        this.originalVelocities.set(note.id, note.velocity);
        note.velocity = Math.max(1, Math.min(127, this.velocity));
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    for (const note of clip.notes) {
      const original = this.originalVelocities.get(note.id);
      if (original !== undefined) {
        note.velocity = original;
      }
    }
  }
}

export class AddCCEventCommand extends BaseCommand {
  readonly type = 'add_cc_event';
  readonly description: string;
  createdEventId: string | null = null;
  
  constructor(
    private trackId: string,
    private clipId: string,
    private eventData: { controller: number; value: number; tick: number; channel?: number }
  ) {
    super();
    this.description = `Add CC${eventData.controller} event`;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    const newEvent: MidiCCEvent = {
      id: `cc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      controller: Math.max(0, Math.min(127, this.eventData.controller)),
      value: Math.max(0, Math.min(127, this.eventData.value)),
      tick: this.eventData.tick,
      channel: this.eventData.channel ?? 0,
    };
    
    this.createdEventId = newEvent.id;
    clip.ccEvents.push(newEvent);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.createdEventId) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    clip.ccEvents = clip.ccEvents.filter((e: MidiCCEvent) => e.id !== this.createdEventId);
  }
}

export class RemoveCCEventCommand extends BaseCommand {
  readonly type = 'remove_cc_event';
  readonly description = 'Remove CC event';
  private removedEvent: MidiCCEvent | null = null;
  private eventIndex: number = -1;
  
  constructor(
    private trackId: string,
    private clipId: string,
    private eventId: string
  ) {
    super();
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    this.eventIndex = clip.ccEvents.findIndex((e: MidiCCEvent) => e.id === this.eventId);
    if (this.eventIndex === -1) return;
    
    this.removedEvent = { ...clip.ccEvents[this.eventIndex] };
    clip.ccEvents.splice(this.eventIndex, 1);
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.removedEvent) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track || !track.midiClips) return;
    
    const clip = track.midiClips.find((c: MidiClip) => c.id === this.clipId);
    if (!clip) return;
    
    clip.ccEvents.splice(this.eventIndex, 0, this.removedEvent);
  }
}
