import type { Draft } from 'immer';
import { BaseCommand, type StudioSnapshot } from './index';

const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

export interface AutomationPointData {
  time: number;
  value: number;
  curve: 'linear' | 'exponential' | 'logarithmic' | 'step';
}

export interface AutomationLaneData {
  id: string;
  parameterId: string;
  parameterName: string;
  visible: boolean;
  armed: boolean;
  mode: 'read' | 'write' | 'touch' | 'latch' | 'off';
  points: AutomationPointData[];
  defaultValue: number;
  minValue: number;
  maxValue: number;
}

export class AddAutomationLaneCommand extends BaseCommand {
  readonly type = 'addAutomationLane';
  readonly description = 'Add automation lane';
  private laneId: string;
  
  constructor(
    private readonly trackId: string,
    private readonly parameterId: string,
    private readonly parameterName: string,
    private readonly defaultValue: number = 0,
    private readonly minValue: number = 0,
    private readonly maxValue: number = 1,
    batchId?: string
  ) {
    super(batchId);
    this.laneId = generateId();
  }
  
  get createdLaneId(): string {
    return this.laneId;
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const lane: AutomationLaneData = {
        id: this.laneId,
        parameterId: this.parameterId,
        parameterName: this.parameterName,
        visible: true,
        armed: false,
        mode: 'read',
        points: [],
        defaultValue: this.defaultValue,
        minValue: this.minValue,
        maxValue: this.maxValue,
      };
      track.automationLanes.push(lane as any);
      state.project.isDirty = true;
      state.project.modifiedAt = Date.now();
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const index = track.automationLanes.findIndex((l: any) => l.id === this.laneId);
      if (index !== -1) {
        track.automationLanes.splice(index, 1);
      }
    }
  }
}

export class RemoveAutomationLaneCommand extends BaseCommand {
  readonly type = 'removeAutomationLane';
  readonly description = 'Remove automation lane';
  private removedLane: AutomationLaneData | null = null;
  private laneIndex: number = -1;
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (track) {
      const index = track.automationLanes.findIndex((l: any) => l.id === this.laneId);
      if (index !== -1) {
        this.laneIndex = index;
        this.removedLane = JSON.parse(JSON.stringify(track.automationLanes[index]));
        track.automationLanes.splice(index, 1);
        state.project.isDirty = true;
        state.project.modifiedAt = Date.now();
      }
    }
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (this.removedLane && this.laneIndex !== -1) {
      const track = state.tracks.find((t: any) => t.id === this.trackId);
      if (track) {
        track.automationLanes.splice(this.laneIndex, 0, this.removedLane as any);
      }
    }
  }
}

export class AddAutomationPointCommand extends BaseCommand {
  readonly type = 'addAutomationPoint';
  readonly description = 'Add automation point';
  private insertIndex: number = -1;
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    private readonly point: AutomationPointData,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    this.insertIndex = lane.points.findIndex((p: any) => p.time > this.point.time);
    if (this.insertIndex === -1) {
      this.insertIndex = lane.points.length;
      lane.points.push(this.point as any);
    } else {
      lane.points.splice(this.insertIndex, 0, this.point as any);
    }
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane || this.insertIndex === -1) return;
    
    lane.points.splice(this.insertIndex, 1);
  }
}

export class RemoveAutomationPointCommand extends BaseCommand {
  readonly type = 'removeAutomationPoint';
  readonly description = 'Remove automation point';
  private removedPoint: AutomationPointData | null = null;
  private pointIndex: number = -1;
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    private readonly pointIndex_: number,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane || this.pointIndex_ < 0 || this.pointIndex_ >= lane.points.length) return;
    
    this.pointIndex = this.pointIndex_;
    this.removedPoint = JSON.parse(JSON.stringify(lane.points[this.pointIndex]));
    lane.points.splice(this.pointIndex, 1);
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.removedPoint || this.pointIndex === -1) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    lane.points.splice(this.pointIndex, 0, this.removedPoint as any);
  }
}

export class UpdateAutomationPointCommand extends BaseCommand {
  readonly type = 'updateAutomationPoint';
  readonly description = 'Move automation point';
  private previousPoint: AutomationPointData | null = null;
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    private readonly pointIndex: number,
    private readonly updates: Partial<AutomationPointData>,
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane || this.pointIndex < 0 || this.pointIndex >= lane.points.length) return;
    
    this.previousPoint = JSON.parse(JSON.stringify(lane.points[this.pointIndex]));
    
    const point = lane.points[this.pointIndex];
    if (this.updates.time !== undefined) point.time = this.updates.time;
    if (this.updates.value !== undefined) point.value = this.updates.value;
    if (this.updates.curve !== undefined) point.curve = this.updates.curve;
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    if (!this.previousPoint) return;
    
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    lane.points[this.pointIndex] = this.previousPoint as any;
  }
  
  canMerge(other: Command): boolean {
    return other instanceof UpdateAutomationPointCommand &&
           other.trackId === this.trackId &&
           other.laneId === this.laneId &&
           other.pointIndex === this.pointIndex &&
           this.timestamp - other.timestamp < 300;
  }
  
  merge(other: Command): Command {
    const otherCmd = other as UpdateAutomationPointCommand;
    const merged = new UpdateAutomationPointCommand(
      this.trackId,
      this.laneId,
      this.pointIndex,
      this.updates,
      this.batchId
    );
    merged.previousPoint = otherCmd.previousPoint;
    return merged;
  }
}

export class SetAutomationModeCommand extends BaseCommand {
  readonly type = 'setAutomationMode';
  readonly description = 'Set automation mode';
  private previousMode: 'read' | 'write' | 'touch' | 'latch' | 'off' = 'read';
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    private readonly mode: 'read' | 'write' | 'touch' | 'latch' | 'off',
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    this.previousMode = lane.mode || 'read';
    lane.mode = this.mode;
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    lane.mode = this.previousMode;
  }
}

export class WriteAutomationCommand extends BaseCommand {
  readonly type = 'writeAutomation';
  readonly description = 'Write automation';
  private addedPointIndices: number[] = [];
  private removedPoints: { index: number; point: AutomationPointData }[] = [];
  
  constructor(
    private readonly trackId: string,
    private readonly laneId: string,
    private readonly points: AutomationPointData[],
    private readonly replaceRange?: { start: number; end: number },
    batchId?: string
  ) {
    super(batchId);
  }
  
  execute(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    if (this.replaceRange) {
      for (let i = lane.points.length - 1; i >= 0; i--) {
        const p = lane.points[i];
        if (p.time >= this.replaceRange.start && p.time <= this.replaceRange.end) {
          this.removedPoints.push({ index: i, point: JSON.parse(JSON.stringify(p)) });
          lane.points.splice(i, 1);
        }
      }
      this.removedPoints.reverse();
    }
    
    for (const point of this.points) {
      const insertIndex = lane.points.findIndex((p: any) => p.time > point.time);
      if (insertIndex === -1) {
        this.addedPointIndices.push(lane.points.length);
        lane.points.push(point as any);
      } else {
        this.addedPointIndices.push(insertIndex);
        lane.points.splice(insertIndex, 0, point as any);
      }
    }
    
    state.project.isDirty = true;
    state.project.modifiedAt = Date.now();
  }
  
  undo(state: Draft<StudioSnapshot>): void {
    const track = state.tracks.find((t: any) => t.id === this.trackId);
    if (!track) return;
    
    const lane = track.automationLanes.find((l: any) => l.id === this.laneId);
    if (!lane) return;
    
    for (let i = this.addedPointIndices.length - 1; i >= 0; i--) {
      lane.points.splice(this.addedPointIndices[i], 1);
    }
    
    for (const { index, point } of this.removedPoints) {
      lane.points.splice(index, 0, point as any);
    }
  }
}
