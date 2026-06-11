import { create } from "zustand";
import { subscribeWithSelector, persist, devtools } from "zustand/middleware";
import type { WaveformPeakCache } from "../lib/daw/AudioWorkletEngine";

export type TrackType =
  | "audio"
  | "instrument"
  | "midi"
  | "bus"
  | "master"
  | "aux";

export interface AudioClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  color: string;
  waveformData?: WaveformPeakCache | Float32Array;
  sourceUrl?: string;
  muted: boolean;
  locked: boolean;
  sampleRate?: number;
  totalSamples?: number;
  reversed?: boolean;
  normalized?: boolean;
}

export interface MidiNote {
  id: string;
  pitch: number;
  velocity: number;
  startTime: number;
  duration: number;
}

export interface MidiClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  notes: MidiNote[];
  color: string;
  muted: boolean;
  locked: boolean;
}

export interface PluginInstance {
  id: string;
  pluginId: string;
  pluginSlug: string;
  name: string;
  bypassed: boolean;
  parameters: Record<string, number | boolean | string>;
  presetName?: string;
}

export interface TrackSend {
  id: string;
  targetTrackId: string;
  gain: number;
  preFader: boolean;
  muted: boolean;
}

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  frozen: boolean;
  height: number;
  collapsed: boolean;
  inputSource?: string;
  outputTarget: string;
  plugins: PluginInstance[];
  sends: TrackSend[];
  audioClips: AudioClip[];
  midiClips: MidiClip[];
  automationLanes: AutomationLane[];
  meterLevel: { left: number; right: number };
}

export interface AutomationPoint {
  time: number;
  value: number;
  curve: "linear" | "exponential" | "logarithmic" | "step";
}

export interface AutomationLane {
  id: string;
  parameterId: string;
  parameterName: string;
  visible: boolean;
  points: AutomationPoint[];
}

export interface TransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isLooping: boolean;
  position: number;
  loopStart: number;
  loopEnd: number;
  tempo: number;
  timeSignatureNumerator: number;
  timeSignatureDenominator: number;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  countInBars: number;
  prerollEnabled: boolean;
  prerollBars: number;
}

export interface ViewState {
  zoom: number;
  scrollX: number;
  scrollY: number;
  snapToGrid: boolean;
  gridSize: number;
  showMixer: boolean;
  showPluginBrowser: boolean;
  showPianoRoll: boolean;
  selectedTrackIds: string[];
  selectedClipIds: string[];
  focusedTrackId: string | null;
  editMode: "select" | "draw" | "erase" | "slice" | "stretch" | "automation";
  timeDisplay:
    | "bars"
    | "seconds"
    | "time"
    | "samples"
    | "bars+seconds"
    | "bars+time";
  showWaveforms: boolean;
  showAutomation: boolean;
}

export interface MixerState {
  visible: boolean;
  channelWidth: number;
  showSends: boolean;
  showInserts: boolean;
  showEQ: boolean;
  soloMode: "exclusive" | "additive";
  prefaderMetering: boolean;
}

export interface ProjectState {
  id: string;
  name: string;
  sampleRate: number;
  bitDepth: number;
  duration: number;
  createdAt: number;
  modifiedAt: number;
  isDirty: boolean;
}

export interface HistoryEntry {
  id: string;
  action: string;
  timestamp: number;
  state: Partial<StudioState>;
}

interface StudioState {
  project: ProjectState;
  transport: TransportState;
  view: ViewState;
  mixer: MixerState;
  tracks: Track[];
  masterTrack: Track;
  history: HistoryEntry[];
  historyIndex: number;
  audioEngine: "webaudio" | "elementary" | "tonejs";
  isEngineReady: boolean;
  cpuUsage: number;
  latency: number;
  bufferSize: number;

  setProject: (project: Partial<ProjectState>) => void;
  setTransport: (transport: Partial<TransportState>) => void;
  setView: (view: Partial<ViewState>) => void;
  setMixer: (mixer: Partial<MixerState>) => void;

  play: () => void;
  pause: () => void;
  stop: () => void;
  record: () => void;
  toggleLoop: () => void;
  setPosition: (position: number) => void;
  setTempo: (tempo: number) => void;

  addTrack: (type: TrackType, name?: string) => string;
  setTracksDirectly: (tracks: Track[]) => void;
  setMasterTrackDirectly: (masterTrack: Track) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  duplicateTrack: (trackId: string) => string;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  toggleTrackArm: (trackId: string) => void;
  setTrackMeterLevel: (trackId: string, left: number, right: number) => void;

  addPlugin: (trackId: string, plugin: Omit<PluginInstance, "id">) => string;
  removePlugin: (trackId: string, pluginId: string) => void;
  updatePluginParameter: (
    trackId: string,
    pluginId: string,
    paramId: string,
    value: number | boolean | string,
  ) => void;
  togglePluginBypass: (trackId: string, pluginId: string) => void;
  reorderPlugins: (trackId: string, fromIndex: number, toIndex: number) => void;

  addAudioClip: (trackId: string, clip: Omit<AudioClip, "id">) => string;
  removeAudioClip: (trackId: string, clipId: string) => void;
  updateAudioClip: (
    trackId: string,
    clipId: string,
    updates: Partial<AudioClip>,
  ) => void;
  moveClip: (
    fromTrackId: string,
    toTrackId: string,
    clipId: string,
    newStartTime: number,
  ) => void;

  addMidiClip: (trackId: string, clip: Omit<MidiClip, "id">) => string;
  removeMidiClip: (trackId: string, clipId: string) => void;
  updateMidiClip: (
    trackId: string,
    clipId: string,
    updates: Partial<MidiClip>,
  ) => void;
  addMidiNote: (
    trackId: string,
    clipId: string,
    note: Omit<MidiNote, "id">,
  ) => string;
  removeMidiNote: (trackId: string, clipId: string, noteId: string) => void;
  updateMidiNote: (
    trackId: string,
    clipId: string,
    noteId: string,
    updates: Partial<MidiNote>,
  ) => void;

  addSend: (trackId: string, send: Omit<TrackSend, "id">) => string;
  removeSend: (trackId: string, sendId: string) => void;
  updateSend: (
    trackId: string,
    sendId: string,
    updates: Partial<TrackSend>,
  ) => void;

  addAutomationLane: (
    trackId: string,
    parameterId: string,
    parameterName: string,
  ) => string;
  removeAutomationLane: (trackId: string, laneId: string) => void;
  addAutomationPoint: (
    trackId: string,
    laneId: string,
    time: number,
    value: number,
    curve?: AutomationPoint["curve"],
  ) => void;
  removeAutomationPoint: (
    trackId: string,
    laneId: string,
    index: number,
  ) => void;
  updateAutomationPoint: (
    trackId: string,
    laneId: string,
    index: number,
    updates: Partial<AutomationPoint>,
  ) => void;

  selectTracks: (trackIds: string[]) => void;
  selectClips: (clipIds: string[]) => void;
  clearSelection: () => void;

  setZoom: (zoom: number) => void;
  setScroll: (x: number, y: number) => void;
  setEditMode: (mode: ViewState["editMode"]) => void;

  undo: () => void;
  redo: () => void;
  pushHistory: (action: string) => void;
  markSaved: () => void;
  resetForNewProject: () => void;

  setAudioEngine: (engine: "webaudio" | "elementary" | "tonejs") => void;
  setEngineReady: (ready: boolean) => void;
  updatePerformanceMetrics: (cpu: number, latency: number) => void;
}

const _generateId = () =>
  `${Date?.now()}-${Math?.random().toString(36).substr(2, 9)}`;

const _createDefaultTrack = (
  type: TrackType,
  name: string,
  index: number,
  id?: string,
): Track => ({
  id: id || generateId(),
  name,
  type,
  color: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"][
    index % 6
  ],
  volume: 0,
  pan: 0,
  muted: false,
  solo: false,
  armed: false,
  frozen: false,
  height: 80,
  collapsed: false,
  outputTarget: "master",
  plugins: [],
  sends: [],
  audioClips: [],
  midiClips: [],
  automationLanes: [],
  meterLevel: { left: -60, right: -60 },
});

const _createMasterTrack = (): Track => ({
  id: "master",
  name: "Master",
  type: "master",
  color: "#64748b",
  volume: 0.8,
  pan: 0,
  muted: false,
  solo: false,
  armed: false,
  frozen: false,
  height: 80,
  collapsed: false,
  outputTarget: "output",
  plugins: [],
  sends: [],
  audioClips: [],
  midiClips: [],
  automationLanes: [],
  meterLevel: { left: -60, right: -60 },
});

const _initialState = {
  project: {
    id: generateId(),
    name: "Untitled Project",
    sampleRate: 48000,
    bitDepth: 32,
    duration: 300,
    createdAt: Date?.now(),
    modifiedAt: Date?.now(),
    isDirty: false,
  },
  transport: {
    isPlaying: false,
    isRecording: false,
    isPaused: false,
    isLooping: false,
    position: 0,
    loopStart: 0,
    loopEnd: 16,
    tempo: 120,
    timeSignatureNumerator: 4,
    timeSignatureDenominator: 4,
    metronomeEnabled: false,
    countInEnabled: false,
    countInBars: 1,
    prerollEnabled: false,
    prerollBars: 1,
  },
  view: {
    zoom: 1,
    scrollX: 0,
    scrollY: 0,
    snapToGrid: true,
    gridSize: 0.25,
    showMixer: true,
    showPluginBrowser: false,
    showPianoRoll: false,
    selectedTrackIds: [],
    selectedClipIds: [],
    focusedTrackId: null,
    editMode: "select" as const,
    timeDisplay: "bars" as const,
    showWaveforms: true,
    showAutomation: false,
  },
  mixer: {
    visible: true,
    channelWidth: 80,
    showSends: true,
    showInserts: true,
    showEQ: false,
    soloMode: "additive" as const,
    prefaderMetering: false,
  },
  tracks: [] as Track[],
  masterTrack: createMasterTrack(),
  history: [] as HistoryEntry[],
  historyIndex: -1,
  audioEngine: "webaudio" as const,
  isEngineReady: false,
  cpuUsage: 0,
  latency: 0,
  bufferSize: 512,
};

export const _useStudioStore = create<StudioState>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          ...initialState,

          setProject: (project) =>
            set((state) => ({
              project: {
                ...state?.project,
                ...project,
                modifiedAt: Date?.now(),
                isDirty: true,
              },
            })),

          setTransport: (transport) =>
            set((state) => ({
              transport: { ...state?.transport, ...transport },
            })),

          setView: (view) =>
            set((state) => ({
              view: { ...state?.view, ...view },
            })),

          setMixer: (mixer) =>
            set((state) => ({
              mixer: { ...state?.mixer, ...mixer },
            })),

          play: () =>
            set((state) => ({
              transport: {
                ...state?.transport,
                isPlaying: true,
                isPaused: false,
              },
            })),

          pause: () =>
            set((state) => ({
              transport: {
                ...state?.transport,
                isPlaying: false,
                isPaused: true,
              },
            })),

          stop: () =>
            set((state) => ({
              transport: {
                ...state?.transport,
                isPlaying: false,
                isPaused: false,
                isRecording: false,
                position: 0,
              },
            })),

          record: () =>
            set((state) => ({
              transport: {
                ...state?.transport,
                isPlaying: true,
                isRecording: true,
              },
            })),

          toggleLoop: () =>
            set((state) => ({
              transport: {
                ...state?.transport,
                isLooping: !state?.transport.isLooping,
              },
            })),

          setPosition: (position) =>
            set((state) => ({
              transport: { ...state?.transport, position },
            })),

          setTempo: (tempo) =>
            set((state) => ({
              transport: {
                ...state?.transport,
                tempo: Math?.max(20, Math?.min(999, tempo)),
              },
            })),

          addTrack: (type, name) => {
            const _id = generateId();
            const { tracks } = get();
            const _trackName =
              name ||
              `${type?.charAt(0).toUpperCase() + type?.slice(1)} ${tracks?.filter((t) => t?.type === type).length + 1}`;
            set((state) => ({
              tracks: [
                ...state?.tracks,
                createDefaultTrack(type, trackName, state?.tracks.length, id),
              ],
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            get().pushHistory(`Add ${type} track: ${trackName}`);
            return id;
          },

          setTracksDirectly: (tracks) =>
            set((state) => ({
              tracks,
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          setMasterTrackDirectly: (masterTrack) =>
            set((state) => ({
              masterTrack,
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          removeTrack: (trackId) => {
            const _track = get().tracks?.find((t) => t?.id === trackId);
            set((state) => ({
              tracks: state?.tracks.filter((t) => t?.id !== trackId),
              view: {
                ...state?.view,
                selectedTrackIds: state?.view.selectedTrackIds?.filter(
                  (id) => id !== trackId,
                ),
                focusedTrackId:
                  state?.view.focusedTrackId === trackId
                    ? null
                    : state?.view.focusedTrackId,
              },
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            if (track) get().pushHistory(`Remove track: ${track?.name}`);
          },

          updateTrack: (trackId, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, ...updates } : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          duplicateTrack: (trackId) => {
            const _track = get().tracks?.find((t) => t?.id === trackId);
            if (!track) return "";
            const _newId = generateId();
            const _newTrack = {
              ...track,
              id: newId,
              name: `${track?.name} (Copy)`,
            };
            set((state) => ({
              tracks: [...state?.tracks, newTrack],
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            get().pushHistory(`Duplicate track: ${track?.name}`);
            return newId;
          },

          reorderTracks: (fromIndex, toIndex) =>
            set((state) => {
              const _tracks = [...state?.tracks];
              const [removed] = tracks?.splice(fromIndex, 1);
              tracks?.splice(toIndex, 0, removed);
              return {
                tracks,
                project: {
                  ...state?.project,
                  isDirty: true,
                  modifiedAt: Date?.now(),
                },
              };
            }),

          setTrackVolume: (trackId, volume) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, volume } : t,
              ),
              masterTrack:
                trackId === "master"
                  ? { ...state?.masterTrack, volume }
                  : state?.masterTrack,
            })),

          setTrackPan: (trackId, pan) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, pan } : t,
              ),
              masterTrack:
                trackId === "master"
                  ? { ...state?.masterTrack, pan }
                  : state?.masterTrack,
            })),

          toggleTrackMute: (trackId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, muted: !t?.muted } : t,
              ),
              masterTrack:
                trackId === "master"
                  ? { ...state?.masterTrack, muted: !state?.masterTrack.muted }
                  : state?.masterTrack,
            })),

          toggleTrackSolo: (trackId) => {
            const { mixer } = get();
            if (mixer?.soloMode === "exclusive") {
              set((state) => ({
                tracks: state?.tracks.map((t) => ({
                  ...t,
                  solo: t?.id === trackId ? !t?.solo : false,
                })),
              }));
            } else {
              set((state) => ({
                tracks: state?.tracks.map((t) =>
                  t?.id === trackId ? { ...t, solo: !t?.solo } : t,
                ),
              }));
            }
          },

          toggleTrackArm: (trackId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, armed: !t?.armed } : t,
              ),
            })),

          setTrackMeterLevel: (trackId, left, right) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId ? { ...t, meterLevel: { left, right } } : t,
              ),
              masterTrack:
                trackId === "master"
                  ? { ...state?.masterTrack, meterLevel: { left, right } }
                  : state?.masterTrack,
            })),

          addPlugin: (trackId, plugin) => {
            const _id = generateId();
            const _newPlugin = { ...plugin, id };
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? { ...t, plugins: [...t?.plugins, newPlugin] }
                  : t,
              ),
              masterTrack:
                trackId === "master"
                  ? {
                      ...state?.masterTrack,
                      plugins: [...state?.masterTrack.plugins, newPlugin],
                    }
                  : state?.masterTrack,
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            get().pushHistory(`Add plugin: ${plugin?.name}`);
            return id;
          },

          removePlugin: (trackId, pluginId) => {
            const _track =
              get().tracks?.find((t) => t?.id === trackId) ||
              (trackId === "master" ? get().masterTrack : null);
            const _plugin = track?.plugins?.find((p) => p?.id === pluginId);
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      plugins: t?.plugins.filter((p) => p?.id !== pluginId),
                    }
                  : t,
              ),
              masterTrack:
                trackId === "master"
                  ? {
                      ...state?.masterTrack,
                      plugins: state?.masterTrack.plugins?.filter(
                        (p) => p?.id !== pluginId,
                      ),
                    }
                  : state?.masterTrack,
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            if (plugin) get().pushHistory(`Remove plugin: ${plugin?.name}`);
          },

          updatePluginParameter: (trackId, pluginId, paramId, value) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      plugins: t?.plugins.map((p) =>
                        p?.id === pluginId
                          ? {
                              ...p,
                              parameters: { ...p?.parameters, [paramId]: value },
                            }
                          : p,
                      ),
                    }
                  : t,
              ),
              masterTrack:
                trackId === "master"
                  ? {
                      ...state?.masterTrack,
                      plugins: state?.masterTrack.plugins?.map((p) =>
                        p?.id === pluginId
                          ? {
                              ...p,
                              parameters: { ...p?.parameters, [paramId]: value },
                            }
                          : p,
                      ),
                    }
                  : state?.masterTrack,
            })),

          togglePluginBypass: (trackId, pluginId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      plugins: t?.plugins.map((p) =>
                        p?.id === pluginId ? { ...p, bypassed: !p?.bypassed } : p,
                      ),
                    }
                  : t,
              ),
              masterTrack:
                trackId === "master"
                  ? {
                      ...state?.masterTrack,
                      plugins: state?.masterTrack.plugins?.map((p) =>
                        p?.id === pluginId ? { ...p, bypassed: !p?.bypassed } : p,
                      ),
                    }
                  : state?.masterTrack,
            })),

          reorderPlugins: (trackId, fromIndex, toIndex) =>
            set((state) => {
              const _updatePlugins = (plugins: PluginInstance[]) => {
                const _newPlugins = [...plugins];
                const [removed] = newPlugins?.splice(fromIndex, 1);
                newPlugins?.splice(toIndex, 0, removed);
                return newPlugins;
              };
              return {
                tracks: state?.tracks.map((t) =>
                  t?.id === trackId
                    ? { ...t, plugins: updatePlugins(t?.plugins) }
                    : t,
                ),
                masterTrack:
                  trackId === "master"
                    ? {
                        ...state?.masterTrack,
                        plugins: updatePlugins(state?.masterTrack.plugins),
                      }
                    : state?.masterTrack,
              };
            }),

          addAudioClip: (trackId, clip) => {
            const _id = generateId();
            const _newClip = { ...clip, id };
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? { ...t, audioClips: [...t?.audioClips, newClip] }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            get().pushHistory(`Add audio clip: ${clip?.name}`);
            return id;
          },

          removeAudioClip: (trackId, clipId) => {
            const _track = get().tracks?.find((t) => t?.id === trackId);
            const _clip = track?.audioClips?.find((c) => c?.id === clipId);
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      audioClips: t?.audioClips.filter((c) => c?.id !== clipId),
                    }
                  : t,
              ),
              view: {
                ...state?.view,
                selectedClipIds: state?.view.selectedClipIds?.filter(
                  (id) => id !== clipId,
                ),
              },
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            if (clip) get().pushHistory(`Remove audio clip: ${clip?.name}`);
          },

          updateAudioClip: (trackId, clipId, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      audioClips: t?.audioClips.map((c) =>
                        c?.id === clipId ? { ...c, ...updates } : c,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          moveClip: (fromTrackId, toTrackId, clipId, newStartTime) =>
            set((state) => {
              const _fromTrack = state?.tracks.find((t) => t?.id === fromTrackId);
              const _clip = fromTrack?.audioClips?.find((c) => c?.id === clipId);
              if (!clip) return state;

              return {
                tracks: state?.tracks.map((t) => {
                  if (t?.id === fromTrackId) {
                    return {
                      ...t,
                      audioClips: t?.audioClips.filter((c) => c?.id !== clipId),
                    };
                  }
                  if (t?.id === toTrackId) {
                    return {
                      ...t,
                      audioClips: [
                        ...t?.audioClips,
                        { ...clip, startTime: newStartTime },
                      ],
                    };
                  }
                  return t;
                }),
                project: {
                  ...state?.project,
                  isDirty: true,
                  modifiedAt: Date?.now(),
                },
              };
            }),

          addMidiClip: (trackId, clip) => {
            const _clipId = generateId();
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: [...t?.midiClips, { ...clip, id: clipId }],
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            return clipId;
          },

          removeMidiClip: (trackId, clipId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: t?.midiClips.filter((c) => c?.id !== clipId),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          updateMidiClip: (trackId, clipId, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: t?.midiClips.map((c) =>
                        c?.id === clipId ? { ...c, ...updates } : c,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          addMidiNote: (trackId, clipId, note) => {
            const _noteId = generateId();
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: t?.midiClips.map((c) =>
                        c?.id === clipId
                          ? {
                              ...c,
                              notes: [...c?.notes, { ...note, id: noteId }],
                            }
                          : c,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            return noteId;
          },

          removeMidiNote: (trackId, clipId, noteId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: t?.midiClips.map((c) =>
                        c?.id === clipId
                          ? {
                              ...c,
                              notes: c?.notes.filter((n) => n?.id !== noteId),
                            }
                          : c,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          updateMidiNote: (trackId, clipId, noteId, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      midiClips: t?.midiClips.map((c) =>
                        c?.id === clipId
                          ? {
                              ...c,
                              notes: c?.notes.map((n) =>
                                n?.id === noteId ? { ...n, ...updates } : n,
                              ),
                            }
                          : c,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          addSend: (trackId, send) => {
            const _sendId = generateId();
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? { ...t, sends: [...t?.sends, { ...send, id: sendId }] }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            return sendId;
          },

          removeSend: (trackId, sendId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? { ...t, sends: t?.sends.filter((s) => s?.id !== sendId) }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          updateSend: (trackId, sendId, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      sends: t?.sends.map((s) =>
                        s?.id === sendId ? { ...s, ...updates } : s,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          addAutomationLane: (trackId, parameterId, parameterName) => {
            const _laneId = generateId();
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      automationLanes: [
                        ...t?.automationLanes,
                        {
                          id: laneId,
                          parameterId,
                          parameterName,
                          visible: true,
                          points: [],
                        },
                      ],
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            }));
            return laneId;
          },

          removeAutomationLane: (trackId, laneId) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      automationLanes: t?.automationLanes.filter(
                        (l) => l?.id !== laneId,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          addAutomationPoint: (
            trackId,
            laneId,
            time,
            value,
            curve = "linear",
          ) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      automationLanes: t?.automationLanes.map((l) =>
                        l?.id === laneId
                          ? {
                              ...l,
                              points: [
                                ...l?.points,
                                { time, value, curve },
                              ].sort((a, b) => a?.time - b?.time),
                            }
                          : l,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          removeAutomationPoint: (trackId, laneId, index) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      automationLanes: t?.automationLanes.map((l) =>
                        l?.id === laneId
                          ? {
                              ...l,
                              points: l?.points.filter((_, i) => i !== index),
                            }
                          : l,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          updateAutomationPoint: (trackId, laneId, index, updates) =>
            set((state) => ({
              tracks: state?.tracks.map((t) =>
                t?.id === trackId
                  ? {
                      ...t,
                      automationLanes: t?.automationLanes.map((l) =>
                        l?.id === laneId
                          ? {
                              ...l,
                              points: l?.points.map((p, i) =>
                                i === index ? { ...p, ...updates } : p,
                              ),
                            }
                          : l,
                      ),
                    }
                  : t,
              ),
              project: {
                ...state?.project,
                isDirty: true,
                modifiedAt: Date?.now(),
              },
            })),

          selectTracks: (trackIds) =>
            set((state) => ({
              view: {
                ...state?.view,
                selectedTrackIds: trackIds,
                focusedTrackId: trackIds[0] || null,
              },
            })),

          selectClips: (clipIds) =>
            set((state) => ({
              view: { ...state?.view, selectedClipIds: clipIds },
            })),

          clearSelection: () =>
            set((state) => ({
              view: {
                ...state?.view,
                selectedTrackIds: [],
                selectedClipIds: [],
              },
            })),

          setZoom: (zoom) =>
            set((state) => ({
              view: { ...state?.view, zoom: Math?.max(0.1, Math?.min(10, zoom)) },
            })),

          setScroll: (x, y) =>
            set((state) => ({
              view: {
                ...state?.view,
                scrollX: Math?.max(0, x),
                scrollY: Math?.max(0, y),
              },
            })),

          setEditMode: (mode) =>
            set((state) => ({
              view: { ...state?.view, editMode: mode },
            })),

          undo: () => {
            const { history, historyIndex } = get();
            if (historyIndex > 0) {
              const _prevEntry = history[historyIndex - 1];
              set((_state) => ({
                ...prevEntry?.state,
                historyIndex: historyIndex - 1,
              }));
            }
          },

          redo: () => {
            const { history, historyIndex } = get();
            if (historyIndex < history?.length - 1) {
              const _nextEntry = history[historyIndex + 1];
              set((_state) => ({
                ...nextEntry?.state,
                historyIndex: historyIndex + 1,
              }));
            }
          },

          pushHistory: (action) => {
            const _state = get();
            const entry: HistoryEntry = {
              id: generateId(),
              action,
              timestamp: Date?.now(),
              state: {
                tracks: state?.tracks,
                masterTrack: state?.masterTrack,
                project: state?.project,
              },
            };
            set((s) => ({
              history: [...s?.history.slice(0, s?.historyIndex + 1), entry].slice(
                -50,
              ),
              historyIndex: Math?.min(s?.historyIndex + 1, 49),
            }));
          },

          markSaved: () =>
            set((state) => ({
              project: { ...state?.project, isDirty: false },
            })),

          resetForNewProject: () =>
            set({
              project: {
                id: generateId(),
                name: "Untitled Project",
                sampleRate: 48000,
                bitDepth: 32,
                duration: 300,
                createdAt: Date?.now(),
                modifiedAt: Date?.now(),
                isDirty: false,
              },
              transport: {
                isPlaying: false,
                isRecording: false,
                isPaused: false,
                isLooping: false,
                position: 0,
                loopStart: 0,
                loopEnd: 16,
                tempo: 120,
                timeSignatureNumerator: 4,
                timeSignatureDenominator: 4,
                metronomeEnabled: false,
                countInEnabled: false,
                countInBars: 1,
                prerollEnabled: false,
                prerollBars: 1,
              },
              view: {
                zoom: 1,
                scrollX: 0,
                scrollY: 0,
                snapToGrid: true,
                gridSize: 0.25,
                showMixer: true,
                showPluginBrowser: false,
                showPianoRoll: false,
                selectedTrackIds: [],
                selectedClipIds: [],
                focusedTrackId: null,
                editMode: "select" as const,
                timeDisplay: "bars" as const,
                showWaveforms: true,
                showAutomation: false,
              },
              tracks: [],
              history: [],
              historyIndex: -1,
            }),

          setAudioEngine: (engine) => set({ audioEngine: engine }),

          setEngineReady: (ready) => set({ isEngineReady: ready }),

          updatePerformanceMetrics: (cpu, latency) =>
            set({ cpuUsage: cpu, latency }),
        }),
        {
          name: "studio-storage",
          partialize: (state) => ({
            project: state?.project,
            tracks: state?.tracks.map((track) => ({
              ...track,
              audioClips: track?.audioClips.map((clip) => ({
                ...clip,
                waveformData: undefined,
              })),
              meterLevel: { left: -60, right: -60 },
            })),
            masterTrack: {
              ...state?.masterTrack,
              meterLevel: { left: -60, right: -60 },
            },
            mixer: state?.mixer,
            view: {
              zoom: state?.view.zoom,
              gridSize: state?.view.gridSize,
              snapToGrid: state?.view.snapToGrid,
              showWaveforms: state?.view.showWaveforms,
              showAutomation: state?.view.showAutomation,
              timeDisplay: state?.view.timeDisplay,
            },
          }),
        },
      ),
    ),
    { name: "StudioStore" },
  ),
);

export const _useTransport = () => useStudioStore((state) => state?.transport);
export const _useTracks = () => useStudioStore((state) => state?.tracks);
export const _useMasterTrack = () =>
  useStudioStore((state) => state?.masterTrack);
export const _useView = () => useStudioStore((state) => state?.view);
export const _useMixer = () => useStudioStore((state) => state?.mixer);
export const _useProject = () => useStudioStore((state) => state?.project);

export const _useTrack = (trackId: string) =>
  useStudioStore(
    (state) =>
      state?.tracks.find((t) => t?.id === trackId) ||
      (trackId === "master" ? state?.masterTrack : null),
  );

export const _useSelectedTracks = () =>
  useStudioStore((state) =>
    state?.tracks.filter((t) => state?.view.selectedTrackIds?.includes(t?.id)),
  );

export default useStudioStore;
