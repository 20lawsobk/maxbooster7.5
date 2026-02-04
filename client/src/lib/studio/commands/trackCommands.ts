import type { Draft } from 'immer';
import { BaseCommand, type StudioSnapshot } from './index';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface TrackData {
  id: string;
  name: string;
  type: string;
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
  plugins: any[];
  sends: any[];
  audioClips: any[];
  midiClips: any[];
  automationLanes: any[];
  meterLevel: { left: number; right: number };
}

const createDefaultTrack = (type: string, name: string, index: number, id?: string): TrackData => ({
  id: id || generateId(),
  name,
  type,
  color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'][index % 6],
  volume: 0,
  pan: 0,
  muted: false,
  solo: false,
  armed: false,
  frozen: false,
  height: 80,
  collapsed: false,
  outputTarget: 'master',
  plugins: [],
  sends: [],
  audioClips: [],
  midiClips: [],
  automationLanes: [],
  meterLevel: { left: -60, right: -60 },
});

export class AddTrackCommand extends BaseCommand {
  readonly type = 'addTrack';
  readonly description: string;
  private trackId: string;
  private trackData: TrackData | null = null;
  
  constructor(
    private readonly trackType: string,
    private readonly trackName?: string,
    batchId?: string
  ) {
    super(batchId);
    this.trackId = generateId();
    this.description = `Add ${trackType} track`;
  }
  
  get createdTrackId(): string {
    return this.trackId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const name = this.trackName || 
      `${this.trackType.charAt(0).toUpperCase() + this.trackType.slice(1)} ${
        state.tracks.filter((t: any) => t.type === this.trackType).length + 1
      }`;
    this.trackData = createDefaultTrack(this.trackType, name, state.tracks.length, this.trackId);
    state.tracks.push(this.trackData as any);
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const index = state.tracks.findIndex((t: any) => t.id === this.trackId);
    if (index !== -1) {
      state.tracks.splice(index, 1);
    }
  }
}

export class RemoveTrackCommand extends BaseCommand {
  readonly type = 'removeTrack';
  readonly description: string;
  private removedTrack: TrackData | null = null;
  private trackIndex: number = -1;
  
  constructor(
    private readonly trackId: string,
    batchId?: string
  ) {
    super(batchId);
    this.description = 'Delete track';
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const index = state.tracks.findIndex((t: any) => t.id === this.trackId);
    if (index !== -1) {
      this.trackIndex = index;
      this.removedTrack = JSON.parse(JSON.stringify(state.tracks[index]));
      state.tracks.splice(index, 1);
      state.project.isDirty = true;
      state.project.modifiedAt = Date.now();
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (this.removedTrack && this.trackIndex !== -1) {
      state.tracks.splice(this.trackIndex, 0, this.removedTrack as any);
    }
  }
}

export class UpdateTrackCommand extends BaseCommand {
  readonly type = 'updateTrack';
  readonly description: string;
  private previousValues: Partial<TrackData> | null = null;
  
  constructor(
    private readonly trackId: string,
    private readonly updates: Partial<TrackData>,
    description?: string,
    batchId?: string
  ) {
    super(batchId);
    this.description = description || 'Update track';
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      this.previousValues = {};
      for (const key of Object.keys(this.updates) as (keyof TrackData)[]) {
        (this.previousValues as any)[key] = (track as any)[key];
        (track as any)[key] = this.updates[key];
      }
      state.project.isDirty = true;
      state.project.modifiedAt = Date.now();
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (this.previousValues) {
      const track = state.tracks.find((t: any) => t.id === this.trackId);
      if (track) {
        for (const key of Object.keys(this.previousValues) as (keyof TrackData)[]) {
          (track as any)[key] = (this.previousValues as any)[key];
        }
      }
    }
  }
  
  canMerge(other: Command): boolean {
    if (other instanceof UpdateTrackCommand && 
        other.trackId === this.trackId &&
        this.timestamp - other.timestamp < 500) {
      const thisKeys = Object.keys(this.updates);
      const otherKeys = Object.keys((other as UpdateTrackCommand).updates);
      return thisKeys.length === 1 && otherKeys.length === 1 && 
             thisKeys[0] === otherKeys[0] &&
             (thisKeys[0] === 'volume' || thisKeys[0] === 'pan');
    }
    return false;
  }
  
  merge(other: Command): Command {
    const otherCmd = other as UpdateTrackCommand;
    const merged = new UpdateTrackCommand(
      this.trackId, 
      this.updates, 
      this.description,
      this.batchId
    );
    merged.previousValues = otherCmd.previousValues;
    return merged;
  }
}

export class ReorderTracksCommand extends BaseCommand {
  readonly type = 'reorderTracks';
  readonly description = 'Reorder tracks';
  
  constructor(
    private readonly fromIndex: number,
    private readonly toIndex: number,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const [track] = state.tracks.splice(this.fromIndex, 1);
    state.tracks.splice(this.toIndex, 0, track);
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const [track] = state.tracks.splice(this.toIndex, 1);
    state.tracks.splice(this.fromIndex, 0, track);
  }
}

export class DuplicateTrackCommand extends BaseCommand {
  readonly type = 'duplicateTrack';
  readonly description = 'Duplicate track';
  private newTrackId: string;
  
  constructor(
    private readonly sourceTrackId: string,
    batchId?: string
  ) {
    super(batchId);
    this.newTrackId = generateId();
  }
  
  get createdTrackId(): string {
    return this.newTrackId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const sourceIndex = state.tracks.findIndex((t: any) => t.id === this.sourceTrackId);
    if (sourceIndex !== -1) {
      const source = state.tracks[sourceIndex];
      const duplicate = JSON.parse(JSON.stringify(source));
      duplicate.id = this.newTrackId;
      duplicate.name = `${source.name} (Copy)`;
      duplicate.audioClips = duplicate.audioClips.map((c: any) => ({ ...c, id: generateId() }));
      duplicate.midiClips = duplicate.midiClips.map((c: any) => ({ ...c, id: generateId() }));
      duplicate.plugins = duplicate.plugins.map((p: any) => ({ ...p, id: generateId() }));
      state.tracks.splice(sourceIndex + 1, 0, duplicate);
      state.project.isDirty = true;
      state.project.modifiedAt = Date.now();
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const index = state.tracks.findIndex((t: any) => t.id === this.newTrackId);
    if (index !== -1) {
      state.tracks.splice(index, 1);
    }
  }
}

export class SetTrackVolumeCommand extends UpdateTrackCommand {
  constructor(trackId: string, volume: number, batchId?: string) {
    super(trackId, { volume: Math.max(-60, Math.min(12, volume)) }, 'Set volume', batchId);
  }
}

export class SetTrackPanCommand extends UpdateTrackCommand {
  constructor(trackId: string, pan: number, batchId?: string) {
    super(trackId, { pan: Math.max(-1, Math.min(1, pan)) }, 'Set pan', batchId);
  }
}

export class ToggleTrackMuteCommand extends BaseCommand {
  readonly type = 'toggleTrackMute';
  readonly description = 'Toggle mute';
  private previousValue: boolean = false;
  
  constructor(private readonly trackId: string, batchId?: string) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      this.previousValue = track.muted;
      track.muted = !track.muted;
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      track.muted = this.previousValue;
    }
  }
}

export class ToggleTrackSoloCommand extends BaseCommand {
  readonly type = 'toggleTrackSolo';
  readonly description = 'Toggle solo';
  private previousValue: boolean = false;
  
  constructor(private readonly trackId: string, batchId?: string) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      this.previousValue = track.solo;
      track.solo = !track.solo;
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      track.solo = this.previousValue;
    }
  }
}
