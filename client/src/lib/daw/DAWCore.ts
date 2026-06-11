import { logger } from "../logger";
import { TransportEngine, transportEngine } from "./TransportEngine";
import { TimelineEngine, timelineEngine, EditMode } from "./TimelineEngine";
import {
  AutomationEngine,
  automationEngine,
  AutomationMode,
  AutomationLane,
} from "./AutomationEngine";
import { RoutingEngine, routingEngine } from "./RoutingEngine";
import { MIDIEngine, midiEngine } from "./MIDIEngine";
import {
  NonDestructiveAudioEngine,
  nonDestructiveAudio,
} from "./NonDestructiveAudio";
import {
  PluginStateManager,
  pluginStateManager,
  PluginState,
} from "./PluginStateManager";
import {
  MusicalIntelligenceEngine,
  musicalIntelligence,
  Chord,
  MixSuggestion,
} from "./MusicalIntelligence";
import { ProjectManager, projectManager } from "./ProjectManager";
import { CommandHistory, commandHistory, createCommand } from "./CommandSystem";

export interface DAWTrack {
  id: string;
  name: string;
  type: "audio" | "instrument" | "midi" | "bus" | "aux" | "master" | "folder";
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  frozen: boolean;
  locked: boolean;
  height: number;
  collapsed: boolean;
  parentId: string | null;
  routingNodeId: string;
  plugins: PluginState[];
  automationLanes: AutomationLane[];
  meterLevel: { left: number; right: number };
}

export interface DAWCoreState {
  isInitialized: boolean;
  audioContextState: "suspended" | "running" | "closed";
  sampleRate: number;
  bufferSize: number;
  cpuUsage: number;
  latency: number;
  tracks: DAWTrack[];
  selectedTrackIds: string[];
  focusedTrackId: string | null;
  editMode: EditMode;
  automationMode: AutomationMode;
  snapEnabled: boolean;
  gridDivision: number;
  zoom: number;
  scrollX: number;
  scrollY: number;
}

type DAWEventType =
  | "track-added"
  | "track-removed"
  | "track-updated"
  | "selection-changed"
  | "mode-changed"
  | "playback-started"
  | "playback-stopped"
  | "project-loaded"
  | "project-saved"
  | "error";

interface DAWEvent {
  type: DAWEventType;
  data?: Record<string, unknown>;
}

type DAWListener = (event: DAWEvent) => void;

export class DAWCore {
  private state: DAWCoreState;
  private audioContext: AudioContext | null = null;
  private listeners: Map<DAWEventType | "*", Set<DAWListener>> = new Map();
  private stateListeners: Set<() => void> = new Set();

  readonly transport: TransportEngine;
  readonly timeline: TimelineEngine;
  readonly automation: AutomationEngine;
  readonly routing: RoutingEngine;
  readonly midi: MIDIEngine;
  readonly audio: NonDestructiveAudioEngine;
  readonly plugins: PluginStateManager;
  readonly intelligence: MusicalIntelligenceEngine;
  readonly project: ProjectManager;
  readonly history: CommandHistory;

  constructor() {
    this.transport = transportEngine;
    this.timeline = timelineEngine;
    this.automation = automationEngine;
    this.routing = routingEngine;
    this.midi = midiEngine;
    this.audio = nonDestructiveAudio;
    this.plugins = pluginStateManager;
    this.intelligence = musicalIntelligence;
    this.project = projectManager;
    this.history = commandHistory;

    this.state = {
      isInitialized: false,
      audioContextState: "suspended",
      sampleRate: 48000,
      bufferSize: 512,
      cpuUsage: 0,
      latency: 0,
      tracks: [],
      selectedTrackIds: [],
      focusedTrackId: null,
      editMode: "slip",
      automationMode: "read",
      snapEnabled: true,
      gridDivision: 0.25,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
    };

    this.setupEngineBindings();
  }

  private setupEngineBindings(): void {
    this.transport.on("play", () => this.emit({ type: "playback-started" }));
    this.transport.on("stop", () => this.emit({ type: "playback-stopped" }));

    this.project.subscribe(() => {
      if (this.project.getState().currentProject) {
        this.emit({ type: "project-loaded" });
      }
    });
  }

  async initialize(): Promise<void> {
    if (this.state.isInitialized) return;

    try {
      this.audioContext = new AudioContext({
        sampleRate: this.state.sampleRate,
        latencyHint: "interactive",
      });

      this.state.sampleRate = this.audioContext.sampleRate;
      this.state.bufferSize = 512;

      this.transport.setAudioContext(this.audioContext);
      this.audio.setAudioContext(this.audioContext);

      this.routing.addNode({
        type: "master",
        name: "Master",
        latency: 0,
        bypass: false,
      });

      this.state.isInitialized = true;
      this.state.audioContextState = this.audioContext.state as
        | "suspended"
        | "running"
        | "closed";

      this.audioContext.onstatechange = () => {
        this.state.audioContextState = this.audioContext!.state as
          | "suspended"
          | "running"
          | "closed";
        this.notifyState();
      };

      this.notifyState();
    } catch (error) {
      logger.error("Failed to initialize DAW:", error);
      this.emit({ type: "error", data: error });
      throw error;
    }
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
      this.state.audioContextState = "running";
      this.notifyState();
    }
  }

  getState(): Readonly<DAWCoreState> {
    return { ...this.state };
  }

  addTrack(
    type: DAWTrack["type"],
    name?: string,
    options: Partial<DAWTrack> = {},
  ): string {
    const id = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const trackCount = this.state.tracks.filter((t) => t.type === type).length;
    const defaultName =
      name ||
      `${type.charAt(0).toUpperCase() + type.slice(1)} ${trackCount + 1}`;

    const routingNodeId = this.routing.addNode({
      type:
        type === "audio" || type === "instrument"
          ? "track"
          : (type as Record<string, unknown>),
      name: defaultName,
      trackId: id,
      latency: 0,
      bypass: false,
    });

    const masterNode = this.routing.getState().masterNodeId;
    if (masterNode && type !== "master") {
      this.routing.connect(routingNodeId, masterNode);
    }

    const track: DAWTrack = {
      id,
      name: defaultName,
      type,
      color: this.getNextTrackColor(),
      volume: 0,
      pan: 0,
      muted: false,
      solo: false,
      armed: false,
      frozen: false,
      locked: false,
      height: 80,
      collapsed: false,
      parentId: null,
      routingNodeId,
      plugins: [],
      automationLanes: [],
      meterLevel: { left: -60, right: -60 },
      ...options,
    };

    const beforeState = [...this.state.tracks];
    this.state.tracks.push(track);

    this.history.execute(
      createCommand(
        "add-track",
        { before: beforeState, after: [...this.state.tracks] },
        (tracks) => {
          this.state.tracks = tracks;
          this.notifyState();
        },
      ),
    );

    this.emit({ type: "track-added", data: track });
    return id;
  }

  removeTrack(trackId: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track || track.type === "master") return;

    const beforeState = [...this.state.tracks];

    this.routing.removeNode(track.routingNodeId);

    for (const plugin of track.plugins) {
      this.plugins.unregisterPlugin(plugin.instanceId);
    }

    for (const lane of track.automationLanes) {
      this.automation.removeLane(lane.id);
    }

    this.state.tracks = this.state.tracks.filter((t) => t.id !== trackId);
    this.state.selectedTrackIds = this.state.selectedTrackIds.filter(
      (id) => id !== trackId,
    );
    if (this.state.focusedTrackId === trackId) {
      this.state.focusedTrackId = null;
    }

    this.history.execute(
      createCommand(
        "remove-track",
        { before: beforeState, after: [...this.state.tracks] },
        (tracks) => {
          this.state.tracks = tracks;
          this.notifyState();
        },
      ),
    );

    this.emit({ type: "track-removed", data: { trackId } });
  }

  updateTrack(trackId: string, updates: Partial<DAWTrack>): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const beforeState = structuredClone(track);
    Object.assign(track, updates);
    const afterState = structuredClone(track);

    this.history.execute(
      createCommand(
        "update-track",
        { trackId, before: beforeState, after: afterState },
        (data: { trackId: string; before: DAWTrack; after: DAWTrack }) => {
          const t = this.state.tracks.find((t) => t.id === data.trackId);
          if (t) {
            Object.keys(t).forEach(
              (key) => delete (t as Record<string, unknown>)[key],
            );
            Object.assign(t, data.after);
          }
          this.notifyState();
        },
      ),
    );

    this.emit({ type: "track-updated", data: { trackId, updates } });
    this.notifyState();
  }

  duplicateTrack(trackId: string): string | null {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    return this.addTrack(track.type, `${track.name} (Copy)`, {
      color: track.color,
      volume: track.volume,
      pan: track.pan,
      height: track.height,
    });
  }

  reorderTracks(fromIndex: number, toIndex: number): void {
    const beforeTracks = structuredClone(this.state.tracks);
    const tracks = [...this.state.tracks];
    const [removed] = tracks.splice(fromIndex, 1);
    tracks.splice(toIndex, 0, removed);
    this.state.tracks = tracks;
    const afterTracks = structuredClone(this.state.tracks);

    this.history.execute(
      createCommand(
        "reorder-tracks",
        { before: beforeTracks, after: afterTracks },
        (data: { before: DAWTrack[]; after: DAWTrack[] }) => {
          this.state.tracks = structuredClone(data.after);
          this.notifyState();
        },
      ),
    );

    this.notifyState();
  }

  setTrackVolume(trackId: string, volume: number): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      const beforeVolume = track.volume;
      const newVolume = Math.max(-60, Math.min(12, volume));
      track.volume = newVolume;

      this.history.execute(
        createCommand(
          "set-track-volume",
          { trackId, before: beforeVolume, after: newVolume },
          (data: { trackId: string; before: number; after: number }) => {
            const t = this.state.tracks.find((t) => t.id === data.trackId);
            if (t) {
              t.volume = data.after;
              this.notifyState();
            }
          },
        ),
      );

      this.notifyState();
    }
  }

  setTrackPan(trackId: string, pan: number): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      const beforePan = track.pan;
      const newPan = Math.max(-1, Math.min(1, pan));
      track.pan = newPan;

      this.history.execute(
        createCommand(
          "set-track-pan",
          { trackId, before: beforePan, after: newPan },
          (data: { trackId: string; before: number; after: number }) => {
            const t = this.state.tracks.find((t) => t.id === data.trackId);
            if (t) {
              t.pan = data.after;
              this.notifyState();
            }
          },
        ),
      );

      this.notifyState();
    }
  }

  toggleTrackMute(trackId: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      const beforeMuted = track.muted;
      track.muted = !track.muted;

      this.history.execute(
        createCommand(
          "toggle-track-mute",
          { trackId, before: beforeMuted, after: track.muted },
          (data: { trackId: string; before: boolean; after: boolean }) => {
            const t = this.state.tracks.find((t) => t.id === data.trackId);
            if (t) {
              t.muted = data.after;
              this.notifyState();
            }
          },
        ),
      );

      this.notifyState();
    }
  }

  toggleTrackSolo(trackId: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      const beforeSolo = track.solo;
      track.solo = !track.solo;

      this.history.execute(
        createCommand(
          "toggle-track-solo",
          { trackId, before: beforeSolo, after: track.solo },
          (data: { trackId: string; before: boolean; after: boolean }) => {
            const t = this.state.tracks.find((t) => t.id === data.trackId);
            if (t) {
              t.solo = data.after;
              this.notifyState();
            }
          },
        ),
      );

      this.notifyState();
    }
  }

  toggleTrackArm(trackId: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (track) {
      track.armed = !track.armed;
      this.notifyState();
    }
  }

  selectTracks(trackIds: string[]): void {
    this.state.selectedTrackIds = trackIds;
    this.state.focusedTrackId = trackIds[0] || null;
    this.emit({ type: "selection-changed", data: { trackIds } });
    this.notifyState();
  }

  addPlugin(
    trackId: string,
    pluginId: string,
    pluginName: string,
  ): string | null {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return null;

    const instanceId = `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.plugins.registerPlugin(instanceId, pluginId, trackId, pluginName);

    const pluginState = this.plugins
      .getState()
      .plugins.find((p) => p.instanceId === instanceId);
    if (pluginState) {
      track.plugins.push(pluginState);
    }

    this.notifyState();
    return instanceId;
  }

  removePlugin(trackId: string, instanceId: string): void {
    const track = this.state.tracks.find((t) => t.id === trackId);
    if (!track) return;

    this.plugins.unregisterPlugin(instanceId);
    track.plugins = track.plugins.filter((p) => p.instanceId !== instanceId);
    this.notifyState();
  }

  createSend(
    sourceTrackId: string,
    targetTrackId: string,
    gain: number = 0,
    preFader: boolean = false,
  ): string | null {
    const sourceTrack = this.state.tracks.find((t) => t.id === sourceTrackId);
    const targetTrack = this.state.tracks.find((t) => t.id === targetTrackId);

    if (!sourceTrack || !targetTrack) return null;

    return this.routing.createSend(
      sourceTrack.routingNodeId,
      targetTrack.routingNodeId,
      Math.pow(10, gain / 20),
      preFader,
    );
  }

  createBus(name: string): string {
    const busId = this.addTrack("bus", name);
    return busId;
  }

  setEditMode(mode: EditMode): void {
    this.state.editMode = mode;
    this.timeline.setEditMode(mode);
    this.emit({ type: "mode-changed", data: { editMode: mode } });
    this.notifyState();
  }

  setAutomationMode(mode: AutomationMode): void {
    this.state.automationMode = mode;
    this.automation.setGlobalMode(mode);
    this.emit({ type: "mode-changed", data: { automationMode: mode } });
    this.notifyState();
  }

  setSnap(enabled: boolean): void {
    this.state.snapEnabled = enabled;
    this.timeline.setSnapToGrid(enabled);
    this.notifyState();
  }

  setGridDivision(division: number): void {
    this.state.gridDivision = division;
    this.timeline.setGridDivision(division);
    this.notifyState();
  }

  setZoom(zoom: number): void {
    this.state.zoom = Math.max(0.1, Math.min(10, zoom));
    this.timeline.setZoom(this.state.zoom);
    this.notifyState();
  }

  setScroll(x: number, y: number): void {
    this.state.scrollX = Math.max(0, x);
    this.state.scrollY = Math.max(0, y);
    this.notifyState();
  }

  play(): void {
    this.resume().then(() => {
      this.transport.play();
    });
  }

  pause(): void {
    this.transport.pause();
  }

  stop(): void {
    this.transport.stop();
  }

  record(): void {
    this.resume().then(() => {
      this.transport.record();
    });
  }

  setPosition(beats: number): void {
    const samples = this.timeline.beatsToSamples(beats);
    this.transport.setPosition(samples);
  }

  setTempo(tempo: number): void {
    this.transport.setTempo(tempo);
    if (this.project.getState().currentProject) {
      this.project.setProjectMetadata({ tempo });
    }
  }

  setLoop(enabled: boolean, startBeat?: number, endBeat?: number): void {
    const startSamples =
      startBeat !== undefined
        ? this.timeline.beatsToSamples(startBeat)
        : undefined;
    const endSamples =
      endBeat !== undefined ? this.timeline.beatsToSamples(endBeat) : undefined;
    this.transport.setLoop(enabled, startSamples, endSamples);
  }

  undo(): void {
    this.history.undo();
  }

  redo(): void {
    this.history.redo();
  }

  suggestChords(): Chord[] {
    const state = this.intelligence.getState();
    return this.intelligence.suggestChords(
      state.currentKey,
      state.currentMode,
      4,
    );
  }

  analyzeMix(): MixSuggestion[] {
    const trackData = this.state.tracks.map((t) => ({
      id: t.id,
      volume: t.volume,
      pan: t.pan,
      type: t.type,
    }));
    return this.intelligence.analyzeMix(trackData);
  }

  suggestArrangement(): void {
    const tempo = this.transport.getState().tempoMap[0]?.tempo || 120;
    const durationSeconds =
      this.project.getState().currentProject?.duration || 180;
    const totalBars = Math.floor((durationSeconds * tempo) / 60 / 4);
    this.intelligence.suggestArrangement(totalBars);
  }

  newProject(name?: string): void {
    this.project.createNew(name);
    this.state.tracks = [];
    this.state.selectedTrackIds = [];
    this.state.focusedTrackId = null;
    this.history.clear();

    this.routing.addNode({
      type: "master",
      name: "Master",
      latency: 0,
      bypass: false,
    });

    this.addTrack("audio", "Audio 1");
    this.notifyState();
  }

  saveProject(): void {
    this.project.save();
    this.emit({ type: "project-saved" });
  }

  loadProject(data: string): void {
    this.project.load(data);
    this.emit({ type: "project-loaded" });
    this.notifyState();
  }

  private getNextTrackColor(): string {
    const colors = [
      "#3b82f6",
      "#10b981",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#ec4899",
      "#06b6d4",
      "#84cc16",
    ];
    return colors[this.state.tracks.length % colors.length];
  }

  on(type: DAWEventType | "*", listener: DAWListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.off(type, listener);
  }

  off(type: DAWEventType | "*", listener: DAWListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(event: DAWEvent): void {
    this.listeners.get(event.type)?.forEach((l) => l(event));
    this.listeners.get("*")?.forEach((l) => l(event));
  }

  subscribe(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private notifyState(): void {
    this.stateListeners.forEach((l) => l());
  }

  dispose(): void {
    this.transport.dispose();
    this.project.dispose();
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.listeners.clear();
    this.stateListeners.clear();
  }
}

export const dawCore = new DAWCore();
