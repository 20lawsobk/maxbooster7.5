import type {
  LayerConfig,
  TransformConfig,
  AnimationConfig,
  VideoProject,
  Keyframe,
} from '../../../../shared/video/VideoRendererEngine';
import { 
  DEFAULT_TRANSFORM, 
  EASING_FUNCTIONS,
  interpolateValue,
  interpolateColor,
} from '../../../../shared/video/VideoRendererEngine';
import type { BlendMode } from './WebGLRenderer';

export type EasingFunction = (t: number) => number;

export interface ExtendedEasingFunctions {
  linear: EasingFunction;
  easeIn: EasingFunction;
  easeOut: EasingFunction;
  easeInOut: EasingFunction;
  bounce: EasingFunction;
  elastic: EasingFunction;
  easeInQuad: EasingFunction;
  easeOutQuad: EasingFunction;
  easeInOutQuad: EasingFunction;
  easeInCubic: EasingFunction;
  easeOutCubic: EasingFunction;
  easeInOutCubic: EasingFunction;
  easeInQuart: EasingFunction;
  easeOutQuart: EasingFunction;
  easeInOutQuart: EasingFunction;
  easeInQuint: EasingFunction;
  easeOutQuint: EasingFunction;
  easeInOutQuint: EasingFunction;
  easeInSine: EasingFunction;
  easeOutSine: EasingFunction;
  easeInOutSine: EasingFunction;
  easeInExpo: EasingFunction;
  easeOutExpo: EasingFunction;
  easeInOutExpo: EasingFunction;
  easeInCirc: EasingFunction;
  easeOutCirc: EasingFunction;
  easeInOutCirc: EasingFunction;
  easeInBack: EasingFunction;
  easeOutBack: EasingFunction;
  easeInOutBack: EasingFunction;
  easeInElastic: EasingFunction;
  easeOutElastic: EasingFunction;
  easeInOutElastic: EasingFunction;
  easeInBounce: EasingFunction;
  easeOutBounce: EasingFunction;
  easeInOutBounce: EasingFunction;
  spring: EasingFunction;
  smooth: EasingFunction;
  smoother: EasingFunction;
}

export const EXTENDED_EASING: ExtendedEasingFunctions = {
  ...EASING_FUNCTIONS,
  
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  
  easeInQuart: (t) => t * t * t * t,
  easeOutQuart: (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  
  easeInQuint: (t) => t * t * t * t * t,
  easeOutQuint: (t) => 1 + (--t) * t * t * t * t,
  easeInOutQuint: (t) => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  
  easeInExpo: (t) => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: (t) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
      ? Math.pow(2, 20 * t - 10) / 2
      : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },
  
  easeInCirc: (t) => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: (t) => Math.sqrt(1 - (--t) * t),
  easeInOutCirc: (t) => t < 0.5
    ? (1 - Math.sqrt(1 - 4 * t * t)) / 2
    : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  
  easeInBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInOutBack: (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  easeInOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return t < 0.5
      ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2
      : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * ((2 * Math.PI) / 4.5))) / 2 + 1;
  },
  
  easeInBounce: (t) => 1 - EXTENDED_EASING.easeOutBounce(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  easeInOutBounce: (t) => t < 0.5
    ? (1 - EXTENDED_EASING.easeOutBounce(1 - 2 * t)) / 2
    : (1 + EXTENDED_EASING.easeOutBounce(2 * t - 1)) / 2,
  
  spring: (t) => {
    const c = Math.cos(t * Math.PI * 4.5);
    return 1 - Math.pow(1 - t, 3) * c * Math.pow(1 - t, 2);
  },
  smooth: (t) => t * t * (3 - 2 * t),
  smoother: (t) => t * t * t * (t * (t * 6 - 15) + 10),
};

export type EasingName = keyof ExtendedEasingFunctions;

export function getEasingFunction(name: string): EasingFunction {
  return (EXTENDED_EASING as Record<string, EasingFunction>)[name] ?? EXTENDED_EASING.linear;
}

export function createCustomEasing(
  controlPoints: [number, number, number, number]
): EasingFunction {
  const [x1, y1, x2, y2] = controlPoints;
  
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    
    let low = 0;
    let high = 1;
    let mid: number;
    
    for (let i = 0; i < 20; i++) {
      mid = (low + high) / 2;
      const x = cubicBezier(mid, x1, x2);
      
      if (Math.abs(x - t) < 0.0001) break;
      if (x < t) low = mid;
      else high = mid;
    }
    
    return cubicBezier(mid!, y1, y2);
  };
}

function cubicBezier(t: number, p1: number, p2: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  
  return 3 * mt2 * t * p1 + 3 * mt * t2 * p2 + t3;
}

export interface LayerState {
  id: string;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  transform: TransformConfig;
  opacity: number;
  blendMode: BlendMode;
  effects: EffectConfig[];
  mask?: string;
  parent?: string;
  children: string[];
}

export interface EffectConfig {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string | boolean | number[]>;
}

export interface KeyframeData {
  time: number;
  value: number | string | number[];
  easing: EasingName;
  tangentIn?: { x: number; y: number };
  tangentOut?: { x: number; y: number };
}

export interface PropertyTrack {
  property: string;
  keyframes: KeyframeData[];
}

export interface LayerTimeline {
  layerId: string;
  tracks: Map<string, PropertyTrack>;
  startTime: number;
  endTime: number;
  trimIn: number;
  trimOut: number;
}

export class Layer {
  public id: string;
  public name: string;
  public type: LayerConfig['type'];
  public zIndex: number;
  public config: LayerConfig['config'];
  
  private _state: LayerState;
  private _timeline: LayerTimeline;
  private _dirty: boolean = true;

  constructor(layerConfig: LayerConfig) {
    this.id = layerConfig.id;
    this.name = layerConfig.id;
    this.type = layerConfig.type;
    this.zIndex = layerConfig.zIndex;
    this.config = layerConfig.config;
    
    this._state = {
      id: this.id,
      visible: true,
      locked: false,
      solo: false,
      transform: layerConfig.transform ?? { ...DEFAULT_TRANSFORM },
      opacity: layerConfig.opacity,
      blendMode: 'normal',
      effects: [],
      children: [],
    };
    
    this._timeline = {
      layerId: this.id,
      tracks: new Map(),
      startTime: 0,
      endTime: Infinity,
      trimIn: 0,
      trimOut: 0,
    };
  }

  get state(): LayerState {
    return this._state;
  }

  get timeline(): LayerTimeline {
    return this._timeline;
  }

  get visible(): boolean {
    return this._state.visible;
  }

  set visible(value: boolean) {
    this._state.visible = value;
    this._dirty = true;
  }

  get opacity(): number {
    return this._state.opacity;
  }

  set opacity(value: number) {
    this._state.opacity = Math.max(0, Math.min(1, value));
    this._dirty = true;
  }

  get transform(): TransformConfig {
    return this._state.transform;
  }

  set transform(value: TransformConfig) {
    this._state.transform = value;
    this._dirty = true;
  }

  get blendMode(): BlendMode {
    return this._state.blendMode;
  }

  set blendMode(value: BlendMode) {
    this._state.blendMode = value;
    this._dirty = true;
  }

  setTransformProperty(property: keyof TransformConfig, value: number): void {
    (this._state.transform as Record<string, number>)[property] = value;
    this._dirty = true;
  }

  addKeyframe(property: string, time: number, value: number | string | number[], easing: EasingName = 'linear'): void {
    let track = this._timeline.tracks.get(property);
    
    if (!track) {
      track = { property, keyframes: [] };
      this._timeline.tracks.set(property, track);
    }
    
    const existingIndex = track.keyframes.findIndex(kf => kf.time === time);
    const keyframe: KeyframeData = { time, value, easing };
    
    if (existingIndex >= 0) {
      track.keyframes[existingIndex] = keyframe;
    } else {
      track.keyframes.push(keyframe);
      track.keyframes.sort((a, b) => a.time - b.time);
    }
    
    this._dirty = true;
  }

  removeKeyframe(property: string, time: number): boolean {
    const track = this._timeline.tracks.get(property);
    if (!track) return false;
    
    const index = track.keyframes.findIndex(kf => kf.time === time);
    if (index >= 0) {
      track.keyframes.splice(index, 1);
      if (track.keyframes.length === 0) {
        this._timeline.tracks.delete(property);
      }
      this._dirty = true;
      return true;
    }
    return false;
  }

  getValueAtTime(property: string, time: number): number | string | number[] | undefined {
    const track = this._timeline.tracks.get(property);
    if (!track || track.keyframes.length === 0) {
      return this.getDefaultValue(property);
    }
    
    const keyframes = track.keyframes;
    
    if (time <= keyframes[0].time) {
      return keyframes[0].value;
    }
    
    if (time >= keyframes[keyframes.length - 1].time) {
      return keyframes[keyframes.length - 1].value;
    }
    
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf1 = keyframes[i];
      const kf2 = keyframes[i + 1];
      
      if (time >= kf1.time && time <= kf2.time) {
        const progress = (time - kf1.time) / (kf2.time - kf1.time);
        return this.interpolateKeyframes(kf1, kf2, progress);
      }
    }
    
    return keyframes[keyframes.length - 1].value;
  }

  private interpolateKeyframes(kf1: KeyframeData, kf2: KeyframeData, progress: number): number | string | number[] {
    const easedProgress = getEasingFunction(kf2.easing)(progress);
    
    if (typeof kf1.value === 'number' && typeof kf2.value === 'number') {
      return interpolateValue(kf1.value, kf2.value, easedProgress);
    }
    
    if (typeof kf1.value === 'string' && typeof kf2.value === 'string') {
      if (kf1.value.startsWith('#') && kf2.value.startsWith('#')) {
        return interpolateColor(kf1.value, kf2.value, easedProgress);
      }
      return easedProgress < 0.5 ? kf1.value : kf2.value;
    }
    
    if (Array.isArray(kf1.value) && Array.isArray(kf2.value)) {
      return kf1.value.map((v, i) => 
        interpolateValue(v, kf2.value[i], easedProgress)
      );
    }
    
    return kf1.value;
  }

  private getDefaultValue(property: string): number | string | undefined {
    const transformDefaults: Record<string, number> = {
      x: 0, y: 0,
      scaleX: 1, scaleY: 1,
      rotation: 0,
      anchorX: 0.5, anchorY: 0.5,
    };
    
    if (property === 'opacity') return this._state.opacity;
    if (property in transformDefaults) return transformDefaults[property];
    return undefined;
  }

  updateFromTime(time: number): void {
    for (const [property, track] of this._timeline.tracks) {
      const value = this.getValueAtTime(property, time);
      if (value === undefined) continue;
      
      if (property === 'opacity' && typeof value === 'number') {
        this._state.opacity = value;
      } else if (property in this._state.transform && typeof value === 'number') {
        (this._state.transform as Record<string, number>)[property] = value;
      }
    }
    this._dirty = false;
  }

  addEffect(effect: EffectConfig): void {
    this._state.effects.push(effect);
    this._dirty = true;
  }

  removeEffect(effectId: string): boolean {
    const index = this._state.effects.findIndex(e => e.id === effectId);
    if (index >= 0) {
      this._state.effects.splice(index, 1);
      this._dirty = true;
      return true;
    }
    return false;
  }

  setTimeRange(startTime: number, endTime: number): void {
    this._timeline.startTime = startTime;
    this._timeline.endTime = endTime;
  }

  setTrim(trimIn: number, trimOut: number): void {
    this._timeline.trimIn = trimIn;
    this._timeline.trimOut = trimOut;
  }

  isActiveAtTime(time: number): boolean {
    const effectiveStart = this._timeline.startTime + this._timeline.trimIn;
    const effectiveEnd = this._timeline.endTime - this._timeline.trimOut;
    return time >= effectiveStart && time <= effectiveEnd && this._state.visible;
  }

  clone(): Layer {
    const config: LayerConfig = {
      id: `${this.id}_copy_${Date.now()}`,
      type: this.type,
      zIndex: this.zIndex,
      opacity: this._state.opacity,
      transform: { ...this._state.transform },
      config: { ...this.config } as LayerConfig['config'],
    };
    
    const cloned = new Layer(config);
    cloned._state.blendMode = this._state.blendMode;
    cloned._state.effects = this._state.effects.map(e => ({ ...e }));
    
    for (const [property, track] of this._timeline.tracks) {
      cloned._timeline.tracks.set(property, {
        property,
        keyframes: track.keyframes.map(kf => ({ ...kf })),
      });
    }
    
    return cloned;
  }

  toLayerConfig(): LayerConfig {
    return {
      id: this.id,
      type: this.type,
      zIndex: this.zIndex,
      opacity: this._state.opacity,
      transform: { ...this._state.transform },
      config: this.config,
    };
  }

  isDirty(): boolean {
    return this._dirty;
  }

  markClean(): void {
    this._dirty = false;
  }
}

export interface SceneOptions {
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor: string;
}

export class Scene {
  public id: string;
  public name: string;
  public width: number;
  public height: number;
  public fps: number;
  public duration: number;
  public backgroundColor: string;
  
  private layers: Map<string, Layer> = new Map();
  private layerOrder: string[] = [];
  private currentTime: number = 0;
  private playing: boolean = false;
  private loop: boolean = false;
  
  private onTimeUpdateCallbacks: ((time: number) => void)[] = [];
  private onLayerChangeCallbacks: ((layers: Layer[]) => void)[] = [];

  constructor(options: SceneOptions, id?: string) {
    this.id = id ?? `scene_${Date.now()}`;
    this.name = 'Untitled Scene';
    this.width = options.width;
    this.height = options.height;
    this.fps = options.fps;
    this.duration = options.duration;
    this.backgroundColor = options.backgroundColor;
  }

  addLayer(layer: Layer): void {
    this.layers.set(layer.id, layer);
    this.layerOrder.push(layer.id);
    this.sortLayers();
    this.notifyLayerChange();
  }

  removeLayer(layerId: string): boolean {
    if (this.layers.delete(layerId)) {
      const index = this.layerOrder.indexOf(layerId);
      if (index >= 0) {
        this.layerOrder.splice(index, 1);
      }
      this.notifyLayerChange();
      return true;
    }
    return false;
  }

  getLayer(layerId: string): Layer | undefined {
    return this.layers.get(layerId);
  }

  getLayers(): Layer[] {
    return this.layerOrder.map(id => this.layers.get(id)!).filter(Boolean);
  }

  getActiveLayersAtTime(time: number): Layer[] {
    return this.getLayers()
      .filter(layer => layer.isActiveAtTime(time))
      .sort((a, b) => a.zIndex - b.zIndex);
  }

  moveLayer(layerId: string, newZIndex: number): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.zIndex = newZIndex;
      this.sortLayers();
      this.notifyLayerChange();
    }
  }

  private sortLayers(): void {
    this.layerOrder.sort((a, b) => {
      const layerA = this.layers.get(a);
      const layerB = this.layers.get(b);
      return (layerA?.zIndex ?? 0) - (layerB?.zIndex ?? 0);
    });
  }

  setTime(time: number): void {
    this.currentTime = Math.max(0, Math.min(time, this.duration));
    
    for (const layer of this.layers.values()) {
      layer.updateFromTime(this.currentTime);
    }
    
    this.notifyTimeUpdate();
  }

  getTime(): number {
    return this.currentTime;
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.animate();
  }

  pause(): void {
    this.playing = false;
  }

  stop(): void {
    this.playing = false;
    this.setTime(0);
  }

  setLoop(loop: boolean): void {
    this.loop = loop;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  private animate = (): void => {
    if (!this.playing) return;
    
    const frameTime = 1 / this.fps;
    this.currentTime += frameTime;
    
    if (this.currentTime >= this.duration) {
      if (this.loop) {
        this.currentTime = 0;
      } else {
        this.playing = false;
        this.currentTime = this.duration;
      }
    }
    
    for (const layer of this.layers.values()) {
      layer.updateFromTime(this.currentTime);
    }
    
    this.notifyTimeUpdate();
    
    if (this.playing) {
      requestAnimationFrame(this.animate);
    }
  };

  onTimeUpdate(callback: (time: number) => void): () => void {
    this.onTimeUpdateCallbacks.push(callback);
    return () => {
      const index = this.onTimeUpdateCallbacks.indexOf(callback);
      if (index >= 0) this.onTimeUpdateCallbacks.splice(index, 1);
    };
  }

  onLayerChange(callback: (layers: Layer[]) => void): () => void {
    this.onLayerChangeCallbacks.push(callback);
    return () => {
      const index = this.onLayerChangeCallbacks.indexOf(callback);
      if (index >= 0) this.onLayerChangeCallbacks.splice(index, 1);
    };
  }

  private notifyTimeUpdate(): void {
    for (const callback of this.onTimeUpdateCallbacks) {
      callback(this.currentTime);
    }
  }

  private notifyLayerChange(): void {
    for (const callback of this.onLayerChangeCallbacks) {
      callback(this.getLayers());
    }
  }

  serialize(): SceneData {
    const layers: SerializedLayer[] = [];
    
    for (const layer of this.layers.values()) {
      const tracks: SerializedTrack[] = [];
      
      for (const [property, track] of layer.timeline.tracks) {
        tracks.push({
          property,
          keyframes: track.keyframes.map(kf => ({
            time: kf.time,
            value: kf.value,
            easing: kf.easing,
          })),
        });
      }
      
      layers.push({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        zIndex: layer.zIndex,
        state: {
          visible: layer.state.visible,
          locked: layer.state.locked,
          solo: layer.state.solo,
          transform: { ...layer.state.transform },
          opacity: layer.state.opacity,
          blendMode: layer.state.blendMode,
          effects: layer.state.effects.map(e => ({ ...e })),
        },
        timeline: {
          startTime: layer.timeline.startTime,
          endTime: layer.timeline.endTime,
          trimIn: layer.timeline.trimIn,
          trimOut: layer.timeline.trimOut,
          tracks,
        },
        config: layer.config,
      });
    }
    
    return {
      id: this.id,
      name: this.name,
      width: this.width,
      height: this.height,
      fps: this.fps,
      duration: this.duration,
      backgroundColor: this.backgroundColor,
      layers,
      layerOrder: [...this.layerOrder],
    };
  }

  static deserialize(data: SceneData): Scene {
    const scene = new Scene({
      width: data.width,
      height: data.height,
      fps: data.fps,
      duration: data.duration,
      backgroundColor: data.backgroundColor,
    }, data.id);
    
    scene.name = data.name;
    
    for (const layerData of data.layers) {
      const layerConfig: LayerConfig = {
        id: layerData.id,
        type: layerData.type,
        zIndex: layerData.zIndex,
        opacity: layerData.state.opacity,
        transform: layerData.state.transform,
        config: layerData.config as LayerConfig['config'],
      };
      
      const layer = new Layer(layerConfig);
      layer.name = layerData.name;
      layer.visible = layerData.state.visible;
      layer.blendMode = layerData.state.blendMode;
      
      for (const effect of layerData.state.effects) {
        layer.addEffect(effect);
      }
      
      layer.setTimeRange(layerData.timeline.startTime, layerData.timeline.endTime);
      layer.setTrim(layerData.timeline.trimIn, layerData.timeline.trimOut);
      
      for (const track of layerData.timeline.tracks) {
        for (const kf of track.keyframes) {
          layer.addKeyframe(track.property, kf.time, kf.value, kf.easing);
        }
      }
      
      scene.layers.set(layer.id, layer);
    }
    
    scene.layerOrder = data.layerOrder;
    
    return scene;
  }

  clone(): Scene {
    const data = this.serialize();
    data.id = `${this.id}_copy_${Date.now()}`;
    data.name = `${this.name} (Copy)`;
    
    for (const layer of data.layers) {
      layer.id = `${layer.id}_copy_${Date.now()}`;
    }
    data.layerOrder = data.layers.map(l => l.id);
    
    return Scene.deserialize(data);
  }

  toVideoProject(): VideoProject {
    const keyframes: Keyframe[] = [];
    
    for (const layer of this.layers.values()) {
      for (const [property, track] of layer.timeline.tracks) {
        for (const kf of track.keyframes) {
          keyframes.push({
            layerId: layer.id,
            time: kf.time,
            property,
            value: typeof kf.value === 'number' ? kf.value : 
                   Array.isArray(kf.value) ? kf.value[0] : kf.value,
            easing: kf.easing,
          });
        }
      }
    }
    
    return {
      id: this.id,
      name: this.name,
      width: this.width,
      height: this.height,
      fps: this.fps,
      duration: this.duration,
      backgroundColor: this.backgroundColor,
      layers: this.getLayers().map(l => l.toLayerConfig()),
      keyframes,
    };
  }

  static fromVideoProject(project: VideoProject): Scene {
    const scene = new Scene({
      width: project.width,
      height: project.height,
      fps: project.fps,
      duration: project.duration,
      backgroundColor: project.backgroundColor,
    }, project.id);
    
    scene.name = project.name;
    
    for (const layerConfig of project.layers) {
      const layer = new Layer(layerConfig);
      scene.addLayer(layer);
    }
    
    for (const keyframe of project.keyframes) {
      const layer = scene.getLayer(keyframe.layerId);
      if (layer) {
        layer.addKeyframe(
          keyframe.property,
          keyframe.time,
          keyframe.value,
          keyframe.easing as EasingName
        );
      }
    }
    
    return scene;
  }
}

export interface SerializedKeyframe {
  time: number;
  value: number | string | number[];
  easing: EasingName;
}

export interface SerializedTrack {
  property: string;
  keyframes: SerializedKeyframe[];
}

export interface SerializedTimeline {
  startTime: number;
  endTime: number;
  trimIn: number;
  trimOut: number;
  tracks: SerializedTrack[];
}

export interface SerializedLayerState {
  visible: boolean;
  locked: boolean;
  solo: boolean;
  transform: TransformConfig;
  opacity: number;
  blendMode: BlendMode;
  effects: EffectConfig[];
}

export interface SerializedLayer {
  id: string;
  name: string;
  type: LayerConfig['type'];
  zIndex: number;
  state: SerializedLayerState;
  timeline: SerializedTimeline;
  config: LayerConfig['config'];
}

export interface SceneData {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor: string;
  layers: SerializedLayer[];
  layerOrder: string[];
}

export class Timeline {
  private scenes: Map<string, Scene> = new Map();
  private currentSceneId: string | null = null;
  private globalTime: number = 0;
  private markers: TimelineMarker[] = [];

  addScene(scene: Scene): void {
    this.scenes.set(scene.id, scene);
    if (!this.currentSceneId) {
      this.currentSceneId = scene.id;
    }
  }

  removeScene(sceneId: string): boolean {
    if (this.scenes.delete(sceneId)) {
      if (this.currentSceneId === sceneId) {
        this.currentSceneId = this.scenes.keys().next().value ?? null;
      }
      return true;
    }
    return false;
  }

  getCurrentScene(): Scene | null {
    return this.currentSceneId ? this.scenes.get(this.currentSceneId) ?? null : null;
  }

  setCurrentScene(sceneId: string): boolean {
    if (this.scenes.has(sceneId)) {
      this.currentSceneId = sceneId;
      return true;
    }
    return false;
  }

  getScenes(): Scene[] {
    return Array.from(this.scenes.values());
  }

  addMarker(time: number, label: string, color?: string): TimelineMarker {
    const marker: TimelineMarker = {
      id: `marker_${Date.now()}`,
      time,
      label,
      color: color ?? '#ff0000',
    };
    this.markers.push(marker);
    this.markers.sort((a, b) => a.time - b.time);
    return marker;
  }

  removeMarker(markerId: string): boolean {
    const index = this.markers.findIndex(m => m.id === markerId);
    if (index >= 0) {
      this.markers.splice(index, 1);
      return true;
    }
    return false;
  }

  getMarkers(): TimelineMarker[] {
    return [...this.markers];
  }

  goToMarker(markerId: string): boolean {
    const marker = this.markers.find(m => m.id === markerId);
    if (marker) {
      const scene = this.getCurrentScene();
      if (scene) {
        scene.setTime(marker.time);
        return true;
      }
    }
    return false;
  }

  getTotalDuration(): number {
    let total = 0;
    for (const scene of this.scenes.values()) {
      total += scene.duration;
    }
    return total;
  }
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export function createLayerFromConfig(config: LayerConfig): Layer {
  return new Layer(config);
}

export function createDefaultScene(): Scene {
  return new Scene({
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 10,
    backgroundColor: '#000000',
  });
}
