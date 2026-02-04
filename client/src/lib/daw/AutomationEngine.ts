import { transportEngine, TransportEngine } from './TransportEngine';

export type AutomationMode = 'read' | 'write' | 'touch' | 'latch' | 'off';
export type CurveType = 'linear' | 'exponential' | 'logarithmic' | 'step' | 's-curve' | 'bezier';

export interface AutomationPoint {
  id: string;
  time: number;
  value: number;
  curve: CurveType;
  tension?: number;
}

export interface AutomationLane {
  id: string;
  trackId: string;
  targetType: 'volume' | 'pan' | 'send' | 'plugin-param' | 'mute' | 'bypass';
  targetId: string;
  parameterName: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  points: AutomationPoint[];
  visible: boolean;
  armed: boolean;
  mode: AutomationMode;
  color: string;
}

export interface AutomationClip {
  id: string;
  laneId: string;
  startTime: number;
  duration: number;
  points: AutomationPoint[];
  looped: boolean;
  loopLength: number;
}

export interface AutomationEngineState {
  lanes: AutomationLane[];
  clips: AutomationClip[];
  globalMode: AutomationMode;
  touchThreshold: number;
  touchReleaseTime: number;
  writeResolution: number;
  selectedLaneIds: string[];
}

type AutomationChangeListener = (laneId: string, value: number, time: number) => void;

export class AutomationEngine {
  private state: AutomationEngineState;
  private transport: TransportEngine;
  private listeners: Set<() => void> = new Set();
  private changeListeners: Map<string, Set<AutomationChangeListener>> = new Map();
  private writeBuffer: Map<string, AutomationPoint[]> = new Map();
  private lastWriteValues: Map<string, number> = new Map();
  private touchTimeouts: Map<string, number> = new Map();

  constructor(transport: TransportEngine) {
    this.transport = transport;
    this.state = {
      lanes: [],
      clips: [],
      globalMode: 'read',
      touchThreshold: 0.01,
      touchReleaseTime: 200,
      writeResolution: 10,
      selectedLaneIds: [],
    };

    this.transport.on('*', (event) => {
      if (event.type === 'stop') {
        this.commitAllWriteBuffers();
      }
    });
  }

  getState(): Readonly<AutomationEngineState> {
    return { ...this.state };
  }

  createLane(params: Omit<AutomationLane, 'id' | 'points' | 'visible' | 'armed' | 'mode' | 'color'>): string {
    const id = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const lane: AutomationLane = {
      ...params,
      id,
      points: [],
      visible: true,
      armed: false,
      mode: this.state.globalMode,
      color: this.generateLaneColor(),
    };

    this.state.lanes.push(lane);
    this.notify();
    return id;
  }

  removeLane(laneId: string): void {
    const index = this.state.lanes.findIndex(l => l.id === laneId);
    if (index !== -1) {
      this.state.lanes.splice(index, 1);
      this.state.clips = this.state.clips.filter(c => c.laneId !== laneId);
      this.writeBuffer.delete(laneId);
      this.notify();
    }
  }

  setLaneMode(laneId: string, mode: AutomationMode): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (lane) {
      lane.mode = mode;
      this.notify();
    }
  }

  setGlobalMode(mode: AutomationMode): void {
    this.state.globalMode = mode;
    for (const lane of this.state.lanes) {
      lane.mode = mode;
    }
    this.notify();
  }

  armLane(laneId: string, armed: boolean): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (lane) {
      lane.armed = armed;
      this.notify();
    }
  }

  addPoint(laneId: string, time: number, value: number, curve: CurveType = 'linear'): string {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return '';

    const clampedValue = Math.max(lane.minValue, Math.min(lane.maxValue, value));
    const id = `pt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const point: AutomationPoint = { id, time, value: clampedValue, curve };
    
    const existingIndex = lane.points.findIndex(p => Math.abs(p.time - time) < 0.001);
    if (existingIndex !== -1) {
      lane.points[existingIndex] = point;
    } else {
      lane.points.push(point);
      lane.points.sort((a, b) => a.time - b.time);
    }

    this.notify();
    return id;
  }

  removePoint(laneId: string, pointId: string): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    const index = lane.points.findIndex(p => p.id === pointId);
    if (index !== -1) {
      lane.points.splice(index, 1);
      this.notify();
    }
  }

  movePoint(laneId: string, pointId: string, newTime: number, newValue: number): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    const point = lane.points.find(p => p.id === pointId);
    if (point) {
      point.time = Math.max(0, newTime);
      point.value = Math.max(lane.minValue, Math.min(lane.maxValue, newValue));
      lane.points.sort((a, b) => a.time - b.time);
      this.notify();
    }
  }

  setPointCurve(laneId: string, pointId: string, curve: CurveType, tension?: number): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    const point = lane.points.find(p => p.id === pointId);
    if (point) {
      point.curve = curve;
      if (tension !== undefined) point.tension = tension;
      this.notify();
    }
  }

  getValueAtTime(laneId: string, time: number): number {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane || lane.points.length === 0) {
      return lane?.defaultValue ?? 0;
    }

    if (lane.points.length === 1) {
      return lane.points[0].value;
    }

    if (time <= lane.points[0].time) {
      return lane.points[0].value;
    }

    if (time >= lane.points[lane.points.length - 1].time) {
      return lane.points[lane.points.length - 1].value;
    }

    for (let i = 0; i < lane.points.length - 1; i++) {
      const p1 = lane.points[i];
      const p2 = lane.points[i + 1];

      if (time >= p1.time && time <= p2.time) {
        return this.interpolate(p1, p2, time);
      }
    }

    return lane.defaultValue;
  }

  private interpolate(p1: AutomationPoint, p2: AutomationPoint, time: number): number {
    const t = (time - p1.time) / (p2.time - p1.time);
    const range = p2.value - p1.value;

    switch (p1.curve) {
      case 'step':
        return p1.value;
      
      case 'linear':
        return p1.value + range * t;
      
      case 'exponential':
        return p1.value + range * (Math.pow(t, 2));
      
      case 'logarithmic':
        return p1.value + range * (1 - Math.pow(1 - t, 2));
      
      case 's-curve': {
        const s = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        return p1.value + range * s;
      }
      
      case 'bezier': {
        const tension = p1.tension ?? 0.5;
        const b = 3 * tension * t * (1 - t) * (1 - t) + 
                  3 * tension * t * t * (1 - t) + 
                  t * t * t;
        return p1.value + range * b;
      }
      
      default:
        return p1.value + range * t;
    }
  }

  writeValue(laneId: string, value: number): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    const mode = lane.mode;
    if (mode === 'off' || mode === 'read') return;

    const time = this.transport.getCurrentPosition().seconds;
    const clampedValue = Math.max(lane.minValue, Math.min(lane.maxValue, value));

    if (mode === 'touch') {
      const lastValue = this.lastWriteValues.get(laneId);
      if (lastValue !== undefined && Math.abs(clampedValue - lastValue) < this.state.touchThreshold) {
        return;
      }

      if (this.touchTimeouts.has(laneId)) {
        clearTimeout(this.touchTimeouts.get(laneId));
      }

      this.touchTimeouts.set(laneId, window.setTimeout(() => {
        this.commitWriteBuffer(laneId);
        this.touchTimeouts.delete(laneId);
      }, this.state.touchReleaseTime));
    }

    this.lastWriteValues.set(laneId, clampedValue);

    if (!this.writeBuffer.has(laneId)) {
      this.writeBuffer.set(laneId, []);
    }

    const buffer = this.writeBuffer.get(laneId)!;
    const point: AutomationPoint = {
      id: `pt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      time,
      value: clampedValue,
      curve: 'linear',
    };

    const lastPoint = buffer[buffer.length - 1];
    if (!lastPoint || (time - lastPoint.time) * 1000 >= this.state.writeResolution) {
      buffer.push(point);
    }

    this.emitChange(laneId, clampedValue, time);
  }

  private commitWriteBuffer(laneId: string): void {
    const buffer = this.writeBuffer.get(laneId);
    if (!buffer || buffer.length === 0) return;

    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    const reduced = this.reducePoints(buffer);
    
    for (const point of reduced) {
      const existingIndex = lane.points.findIndex(p => Math.abs(p.time - point.time) < 0.001);
      if (existingIndex !== -1) {
        lane.points[existingIndex] = point;
      } else {
        lane.points.push(point);
      }
    }

    lane.points.sort((a, b) => a.time - b.time);
    this.writeBuffer.delete(laneId);
    this.notify();
  }

  private commitAllWriteBuffers(): void {
    for (const laneId of this.writeBuffer.keys()) {
      this.commitWriteBuffer(laneId);
    }
    this.lastWriteValues.clear();
    for (const timeout of this.touchTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.touchTimeouts.clear();
  }

  private reducePoints(points: AutomationPoint[], tolerance: number = 0.01): AutomationPoint[] {
    if (points.length <= 2) return points;

    const result: AutomationPoint[] = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const expectedValue = prev.value + (next.value - prev.value) * 
        ((curr.time - prev.time) / (next.time - prev.time));
      
      if (Math.abs(curr.value - expectedValue) > tolerance * Math.abs(next.value - prev.value)) {
        result.push(curr);
      }
    }

    result.push(points[points.length - 1]);
    return result;
  }

  getLanesForTrack(trackId: string): AutomationLane[] {
    return this.state.lanes.filter(l => l.trackId === trackId);
  }

  getLanesForPlugin(trackId: string, pluginId: string): AutomationLane[] {
    return this.state.lanes.filter(l => 
      l.trackId === trackId && 
      l.targetType === 'plugin-param' && 
      l.targetId.startsWith(pluginId)
    );
  }

  selectLanes(laneIds: string[]): void {
    this.state.selectedLaneIds = laneIds;
    this.notify();
  }

  copyPoints(laneId: string, startTime: number, endTime: number): AutomationPoint[] {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return [];

    return lane.points
      .filter(p => p.time >= startTime && p.time <= endTime)
      .map(p => ({ ...p, time: p.time - startTime }));
  }

  pastePoints(laneId: string, points: AutomationPoint[], pasteTime: number): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    for (const point of points) {
      this.addPoint(laneId, point.time + pasteTime, point.value, point.curve);
    }
  }

  clearRange(laneId: string, startTime: number, endTime: number): void {
    const lane = this.state.lanes.find(l => l.id === laneId);
    if (!lane) return;

    lane.points = lane.points.filter(p => p.time < startTime || p.time > endTime);
    this.notify();
  }

  onValueChange(laneId: string, listener: AutomationChangeListener): () => void {
    if (!this.changeListeners.has(laneId)) {
      this.changeListeners.set(laneId, new Set());
    }
    this.changeListeners.get(laneId)!.add(listener);
    return () => this.changeListeners.get(laneId)?.delete(listener);
  }

  private emitChange(laneId: string, value: number, time: number): void {
    this.changeListeners.get(laneId)?.forEach(l => l(laneId, value, time));
  }

  private generateLaneColor(): string {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
    return colors[this.state.lanes.length % colors.length];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l());
  }

  serialize(): AutomationEngineState {
    return structuredClone(this.state);
  }

  deserialize(state: AutomationEngineState): void {
    this.state = structuredClone(state);
    this.notify();
  }
}

export const automationEngine = new AutomationEngine(transportEngine);
