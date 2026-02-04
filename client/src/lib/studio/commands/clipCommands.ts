import type { Draft } from 'immer';
import { BaseCommand, type StudioSnapshot } from './index';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface AudioClipData {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  fadeInCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve';
  fadeOutCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve';
  color: string;
  waveformData?: Float32Array;
  sourceUrl?: string;
  muted: boolean;
  locked: boolean;
  pitchShift?: number;
  timeStretch?: number;
  reverse?: boolean;
}

export interface MidiClipData {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  notes: MidiNoteData[];
  color: string;
  muted: boolean;
  locked: boolean;
}

export interface MidiNoteData {
  id: string;
  pitch: number;
  velocity: number;
  startTime: number;
  duration: number;
}

export class AddAudioClipCommand extends BaseCommand {
  readonly type = 'addAudioClip';
  readonly description = 'Add audio clip';
  private clipId: string;
  
  constructor(
    private readonly trackId: string,
    private readonly clipData: Omit<AudioClipData, 'id' | 'trackId'>,
    batchId?: string
  ) {
    super(batchId);
    this.clipId = generateId();
  }
  
  get createdClipId(): string {
    return this.clipId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const clip: AudioClipData = {
        ...this.clipData,
        id: this.clipId,
        trackId: this.trackId,
      };
      track.audioClips.push(clip as any);
      state.project.isDirty = true;
      state.project.modifiedAt = Date.now();
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const index = track.audioClips.findIndex((c: any) => c.id === this.clipId);
      if (index !== -1) {
        track.audioClips.splice(index, 1);
      }
    }
  }
}

export class RemoveAudioClipCommand extends BaseCommand {
  readonly type = 'removeAudioClip';
  readonly description = 'Delete audio clip';
  private removedClip: AudioClipData | null = null;
  private clipIndex: number = -1;
  
  constructor(
    private readonly trackId: string,
    private readonly clipId: string,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const index = track.audioClips.findIndex((c: any) => c.id === this.clipId);
      if (index !== -1) {
        this.clipIndex = index;
        this.removedClip = JSON.parse(JSON.stringify(track.audioClips[index]));
        track.audioClips.splice(index, 1);
        state.project.isDirty = true;
        state.project.modifiedAt = Date.now();
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (this.removedClip && this.clipIndex !== -1) {
      const track = state.tracks.find((t: any) => t.id === this.trackId);
      if (track) {
        track.audioClips.splice(this.clipIndex, 0, this.removedClip as any);
      }
    }
  }
}

export class UpdateAudioClipCommand extends BaseCommand {
  readonly type = 'updateAudioClip';
  readonly description: string;
  private previousValues: Partial<AudioClipData> | null = null;
  
  constructor(
    private readonly trackId: string,
    private readonly clipId: string,
    private readonly updates: Partial<AudioClipData>,
    description?: string,
    batchId?: string
  ) {
    super(batchId);
    this.description = description || 'Update clip';
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const clip = track.audioClips.find((c: any) => c.id === this.clipId);
      if (clip) {
        this.previousValues = {};
        for (const key of Object.keys(this.updates) as (keyof AudioClipData)[]) {
          (this.previousValues as any)[key] = (clip as any)[key];
          (clip as any)[key] = this.updates[key];
        }
        state.project.isDirty = true;
        state.project.modifiedAt = Date.now();
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (this.previousValues) {
      const track = state.tracks.find((t: any) => t.id === this.trackId);
      if (track) {
        const clip = track.audioClips.find((c: any) => c.id === this.clipId);
        if (clip) {
          for (const key of Object.keys(this.previousValues) as (keyof AudioClipData)[]) {
            (clip as any)[key] = (this.previousValues as any)[key];
          }
        }
      }
    }
  }
  
  canMerge(other: Command): boolean {
    if (other instanceof UpdateAudioClipCommand &&
        other.trackId === this.trackId &&
        other.clipId === this.clipId &&
        this.timestamp - other.timestamp < 300) {
      const thisKeys = Object.keys(this.updates);
      const otherKeys = Object.keys((other as UpdateAudioClipCommand).updates);
      return thisKeys.length === 1 && otherKeys.length === 1 &&
             thisKeys[0] === otherKeys[0] &&
             (thisKeys[0] === 'startTime' || thisKeys[0] === 'gain');
    }
    return false;
  }
  
  merge(other: Command): Command {
    const otherCmd = other as UpdateAudioClipCommand;
    const merged = new UpdateAudioClipCommand(
      this.trackId,
      this.clipId,
      this.updates,
      this.description,
      this.batchId
    );
    merged.previousValues = otherCmd.previousValues;
    return merged;
  }
}

export class MoveClipCommand extends BaseCommand {
  readonly type = 'moveClip';
  readonly description = 'Move clip';
  private previousTrackId: string;
  private previousStartTime: number = 0;
  private clipData: AudioClipData | null = null;
  
  constructor(
    private readonly fromTrackId: string,
    private readonly toTrackId: string,
    private readonly clipId: string,
    private readonly newStartTime: number,
    batchId?: string
  ) {
    super(batchId);
    this.previousTrackId = fromTrackId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const fromTrack = state.tracks.find((t: any) => t.id === this.fromTrackId);
    if (!fromTrack) return;
    
    const clipIndex = fromTrack.audioClips.findIndex((c: any) => c.id === this.clipId);
    if (clipIndex === -1) return;
    
    this.previousStartTime = fromTrack.audioClips[clipIndex].startTime;
    this.clipData = JSON.parse(JSON.stringify(fromTrack.audioClips[clipIndex]));
    
    if (this.fromTrackId === this.toTrackId) {
      fromTrack.audioClips[clipIndex].startTime = this.newStartTime;
    } else {
      const [clip] = fromTrack.audioClips.splice(clipIndex, 1);
      clip.startTime = this.newStartTime;
      clip.trackId = this.toTrackId;
      
      const toTrack = state.tracks.find((t: any) => t.id === this.toTrackId);
      if (toTrack) {
        toTrack.audioClips.push(clip);
      }
    }
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.clipData) return;
    
    if (this.fromTrackId === this.toTrackId) {
      const track = state.tracks.find((t: any) => t.id === this.fromTrackId);
      if (track) {
        const clip = track.audioClips.find((c: any) => c.id === this.clipId);
        if (clip) {
          clip.startTime = this.previousStartTime;
        }
      }
    } else {
      const toTrack = state.tracks.find((t: any) => t.id === this.toTrackId);
      if (toTrack) {
        const clipIndex = toTrack.audioClips.findIndex((c: any) => c.id === this.clipId);
        if (clipIndex !== -1) {
          toTrack.audioClips.splice(clipIndex, 1);
        }
      }
      
      const fromTrack = state.tracks.find((t: any) => t.id === this.fromTrackId);
      if (fromTrack) {
        const restoredClip = { ...this.clipData, trackId: this.fromTrackId };
        fromTrack.audioClips.push(restoredClip as any);
      }
    }
  }
  
  canMerge(other: Command): boolean {
    return other instanceof MoveClipCommand &&
           other.clipId === this.clipId &&
           other.toTrackId === this.fromTrackId &&
           this.timestamp - other.timestamp < 300;
  }
  
  merge(other: Command): Command {
    const otherCmd = other as MoveClipCommand;
    return new MoveClipCommand(
      otherCmd.fromTrackId,
      this.toTrackId,
      this.clipId,
      this.newStartTime,
      this.batchId
    );
  }
}

export class SetClipGainCommand extends UpdateAudioClipCommand {
  constructor(trackId: string, clipId: string, gain: number, batchId?: string) {
    super(trackId, clipId, { gain: Math.max(-60, Math.min(24, gain)) }, 'Set clip gain', batchId);
  }
}

export class SetClipFadesCommand extends UpdateAudioClipCommand {
  constructor(
    trackId: string, 
    clipId: string, 
    fadeIn: number, 
    fadeOut: number,
    fadeInCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve',
    fadeOutCurve?: 'linear' | 'exponential' | 'logarithmic' | 's-curve',
    batchId?: string
  ) {
    super(trackId, clipId, { 
      fadeIn: Math.max(0, fadeIn), 
      fadeOut: Math.max(0, fadeOut),
      fadeInCurve: fadeInCurve || 'linear',
      fadeOutCurve: fadeOutCurve || 'linear',
    }, 'Set clip fades', batchId);
  }
}

export class SplitClipCommand extends BaseCommand {
  readonly type = 'splitClip';
  readonly description = 'Split clip';
  private newClipId: string;
  private originalDuration: number = 0;
  
  constructor(
    private readonly trackId: string,
    private readonly clipId: string,
    private readonly splitTime: number,
    batchId?: string
  ) {
    super(batchId);
    this.newClipId = generateId();
  }
  
  get createdClipId(): string {
    return this.newClipId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const clip = track.audioClips.find((c: any) => c.id === this.clipId);
    if (!clip) return;
    
    const relativeTime = this.splitTime - clip.startTime;
    if (relativeTime <= 0 || relativeTime >= clip.duration) return;
    
    this.originalDuration = clip.duration;
    
    const newClip: AudioClipData = {
      ...JSON.parse(JSON.stringify(clip)),
      id: this.newClipId,
      startTime: this.splitTime,
      duration: clip.duration - relativeTime,
      offset: clip.offset + relativeTime,
      fadeIn: 0,
    };
    
    clip.duration = relativeTime;
    clip.fadeOut = 0;
    
    track.audioClips.push(newClip as any);
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const newClipIndex = track.audioClips.findIndex((c: any) => c.id === this.newClipId);
    if (newClipIndex !== -1) {
      track.audioClips.splice(newClipIndex, 1);
    }
    
    const originalClip = track.audioClips.find((c: any) => c.id === this.clipId);
    if (originalClip) {
      originalClip.duration = this.originalDuration;
    }
  }
}

export class TrimClipCommand extends BaseCommand {
  readonly type = 'trimClip';
  readonly description = 'Trim clip';
  private previousStartTime: number = 0;
  private previousDuration: number = 0;
  private previousOffset: number = 0;
  
  constructor(
    private readonly trackId: string,
    private readonly clipId: string,
    private readonly edge: 'start' | 'end',
    private readonly newValue: number,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const clip = track.audioClips.find((c: any) => c.id === this.clipId);
    if (!clip) return;
    
    this.previousStartTime = clip.startTime;
    this.previousDuration = clip.duration;
    this.previousOffset = clip.offset;
    
    if (this.edge === 'start') {
      const delta = this.newValue - clip.startTime;
      clip.startTime = this.newValue;
      clip.duration = clip.duration - delta;
      clip.offset = clip.offset + delta;
    } else {
      clip.duration = this.newValue - clip.startTime;
    }
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const clip = track.audioClips.find((c: any) => c.id === this.clipId);
    if (clip) {
      clip.startTime = this.previousStartTime;
      clip.duration = this.previousDuration;
      clip.offset = this.previousOffset;
    }
  }
  
  canMerge(other: Command): boolean {
    return other instanceof TrimClipCommand &&
           other.trackId === this.trackId &&
           other.clipId === this.clipId &&
           other.edge === this.edge &&
           this.timestamp - other.timestamp < 300;
  }
  
  merge(other: Command): Command {
    const otherCmd = other as TrimClipCommand;
    const merged = new TrimClipCommand(
      this.trackId,
      this.clipId,
      this.edge,
      this.newValue,
      this.batchId
    );
    merged.previousStartTime = otherCmd.previousStartTime;
    merged.previousDuration = otherCmd.previousDuration;
    merged.previousOffset = otherCmd.previousOffset;
    return merged;
  }
}
