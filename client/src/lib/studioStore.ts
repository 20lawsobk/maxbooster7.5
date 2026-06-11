import { create } from "zustand";

export interface Take {
  id: string;
  takeNumber: number;
  takeGroupId: string;
  trackId: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
  isComped: boolean;
  isMuted: boolean;
  rating?: number;
  note?: string;
}

export interface Marker {
  id: string;
  name: string;
  time: number;
  position: number; // Same as time, for backend compatibility
  color: string;
  type?: string;
}

// Chord Track Types
export interface Chord {
  id: string;
  name: string;
  root: string;
  quality: string;
  bass?: string;
  startTime: number;
  duration: number;
  color: string;
}

// Video Track Types
export interface VideoClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  filePath: string;
  thumbnails: string[];
  format: "mp4" | "mov" | "webm" | "avi" | "mkv";
  width: number;
  height: number;
  frameRate: number;
  hasAudio: boolean;
  offset?: number;
  trimStart?: number;
  trimEnd?: number;
}

// Fader Flip Types
export type FaderMode =
  | "volume"
  | "fx1"
  | "fx2"
  | "fx3"
  | "fx4"
  | "cue1"
  | "cue2"
  | "cue3"
  | "cue4"
  | "bus1"
  | "bus2"
  | "bus3"
  | "bus4"
  | "bus5"
  | "bus6"
  | "bus7"
  | "bus8";

// Spatial Audio Types
export type SpeakerConfiguration = "stereo" | "5.1" | "7.1" | "9.1.6";
export type ObjectType = "bed" | "object";

export interface SpatialObject {
  id: string;
  name: string;
  type: ObjectType;
  azimuth: number;
  elevation: number;
  distance: number;
  width: number;
  lfeLevel: number;
  heightLayer: "floor" | "mid" | "ceiling";
  busId: string;
  mute: boolean;
  solo: boolean;
  color: string;
}

// Lyrics Track Types
export interface LyricWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  midiNoteId?: string;
}

export interface LyricLine {
  id: string;
  words: LyricWord[];
  startTime: number;
  endTime: number;
  text?: string;
}

// Lyrics Display Settings
export interface LyricsDisplaySettings {
  fontSize: "small" | "medium" | "large" | "xlarge";
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  lineSpacing: number;
  showWordHighlight: boolean;
  teleprompterMode: boolean;
}

// Tempo Map Types for Advanced Tempo Detection
export interface TempoMap {
  clipId: string;
  detectedBpm: number;
  confidence: number;
  beatMarkers: number[];
  downbeats: number[];
  timeSignature: string;
}

// Frozen Track/Bus State Types
export interface FrozenTrackState {
  trackId: string;
  frozenAt: number;
  originalPlugins: Array<{ id: string; settings: Record<string, any> }>;
  frozenAudioUrl?: string;
  frozenDuration: number;
}

// Store Track Type (for FlowState adapter)
export interface StoreTrack {
  id: string;
  name: string;
  trackType: string;
  trackNumber?: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  recordEnabled?: boolean;
  inputMonitoring?: boolean;
  color: string;
  height?: number;
  collapsed?: boolean;
  outputBus?: string;
  groupId?: string;
}

// Autoscroll modes matching Studio One Pro 7.2+
export type AutoscrollMode =
  | "off"
  | "turnover"
  | "continuous-centered"
  | "continuous-left";

// Musical Key Types for Global Transpose
export type MusicalKey =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";
export type KeyMode = "major" | "minor";

// Musical key constants
export const MUSICAL_KEYS: MusicalKey[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

// Professional DAW Types
export type RecordingMode = "replace" | "overdub" | "stacked";
export type AutomationMode = "read" | "write" | "touch" | "latch" | "off";
export type EditTool =
  | "pointer"
  | "range"
  | "split"
  | "slip"
  | "draw"
  | "pencil"
  | "eraser";

// Chord Display Mode Types
export type ChordDisplayMode = "standard" | "nashville" | "roman";

// Mastering Project Types
export interface MasteringProject {
  id: string;
  name: string;
  songs: MasteringSong[];
  createdAt: number;
  updatedAt: number;
  targetLoudness: number; // LUFS target (-14 to -6)
  format: "wav" | "mp3" | "flac" | "aiff";
  sampleRate: 44100 | 48000 | 96000;
  bitDepth: 16 | 24 | 32;
}

export interface MasteringSong {
  id: string;
  projectId: string;
  title: string;
  sourceFileUrl?: string;
  masteredFileUrl?: string;
  duration: number;
  order: number;
  loudness?: number; // measured LUFS
  peakLevel?: number; // dB
  isProcessing: boolean;
  lastUpdated: number;
}

// Launcher Types (Ableton Session View style)
export interface LauncherClip {
  id: string;
  trackId: string;
  slotIndex: number; // vertical position (row)
  name: string;
  color: string;
  duration: number; // in beats
  isPlaying: boolean;
  isQueued: boolean;
  audioUrl?: string;
}

export interface LauncherScene {
  id: string;
  index: number;
  name: string;
  color: string;
  tempo?: number; // optional scene-specific tempo
}

export type LauncherQuantize = "1bar" | "2bars" | "4bars" | "1beat";

// Show Page Types (Live Performance Environment)
export interface SetlistItem {
  id: string;
  name: string;
  duration: number;
  bpm: number;
  key: string;
  notes?: string;
  audioUrl?: string;
  order: number;
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
  createdAt: number;
}

export interface PerformanceState {
  currentSetlistId: string | null;
  currentItemIndex: number;
  isPerforming: boolean;
  elapsedTime: number;
}

// Nashville Number System utility
const NASHVILLE_SCALE_INTERVALS: Record<MusicalKey, number[]> = {
  C: [0, 2, 4, 5, 7, 9, 11],
  "C#": [1, 3, 5, 6, 8, 10, 0],
  D: [2, 4, 6, 7, 9, 11, 1],
  "D#": [3, 5, 7, 8, 10, 0, 2],
  E: [4, 6, 8, 9, 11, 1, 3],
  F: [5, 7, 9, 10, 0, 2, 4],
  "F#": [6, 8, 10, 11, 1, 3, 5],
  G: [7, 9, 11, 0, 2, 4, 6],
  "G#": [8, 10, 0, 1, 3, 5, 7],
  A: [9, 11, 1, 2, 4, 6, 8],
  "A#": [10, 0, 2, 3, 5, 7, 9],
  B: [11, 1, 3, 4, 6, 8, 10],
};

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

export function formatChord(
  chordRoot: string,
  chordQuality: string,
  key: MusicalKey,
  mode: ChordDisplayMode,
): string {
  if (mode === "standard") {
    return `${chordRoot}${chordQuality}`;
  }

  const normalizedRoot = chordRoot
    .replace("b", "#")
    .replace("Db", "C#")
    .replace("Eb", "D#")
    .replace("Gb", "F#")
    .replace("Ab", "G#")
    .replace("Bb", "A#");

  let rootSemitone = MUSICAL_KEYS?.indexOf(normalizedRoot as MusicalKey);
  if (rootSemitone === -1) {
    const flatToSharp: Record<string, MusicalKey> = {
      Db: "C#",
      Eb: "D#",
      Gb: "F#",
      Ab: "G#",
      Bb: "A#",
    };
    const converted = flatToSharp[chordRoot];
    if (converted) {
      rootSemitone = MUSICAL_KEYS?.indexOf(converted);
    }
  }

  if (rootSemitone === -1) {
    return `${chordRoot}${chordQuality}`;
  }

  const scaleIntervals = NASHVILLE_SCALE_INTERVALS[key];
  let scaleDegree = -1;
  let accidental = "";

  for (let i = 0; i < scaleIntervals?.length; i++) {
    if (scaleIntervals[i] === rootSemitone) {
      scaleDegree = i + 1;
      break;
    }
  }

  if (scaleDegree === -1) {
    for (let i = 0; i < scaleIntervals?.length; i++) {
      if ((scaleIntervals[i] + 1) % 12 === rootSemitone) {
        scaleDegree = i + 1;
        accidental = "#";
        break;
      }
      if ((scaleIntervals[i] - 1 + 12) % 12 === rootSemitone) {
        scaleDegree = i + 1;
        accidental = "b";
        break;
      }
    }
  }

  if (scaleDegree === -1) {
    return `${chordRoot}${chordQuality}`;
  }

  const isMinor =
    chordQuality?.startsWith("m") && !chordQuality?.startsWith("maj");
  const isDiminished = chordQuality?.includes("dim");
  const qualitySuffix = chordQuality?.replace(/^m(?!aj)/, "");

  if (mode === "nashville") {
    const prefix = accidental === "#" ? "#" : accidental === "b" ? "b" : "";
    const minorSuffix = isMinor ? "m" : isDiminished ? "o" : "";
    return `${prefix}${scaleDegree}${minorSuffix}${qualitySuffix?.replace("dim", "").replace("m", "")}`;
  }

  if (mode === "roman") {
    const romanBase = ROMAN_NUMERALS[scaleDegree - 1];
    const prefix = accidental === "#" ? "#" : accidental === "b" ? "b" : "";

    if (isMinor || isDiminished) {
      const lowerRoman = romanBase?.toLowerCase();
      const dimSuffix = isDiminished ? "o" : "";
      return `${prefix}${lowerRoman}${dimSuffix}${qualitySuffix?.replace("dim", "").replace("m", "")}`;
    } else {
      return `${prefix}${romanBase}${qualitySuffix}`;
    }
  }

  return `${chordRoot}${chordQuality}`;
}

export interface StudioState {
  // Current Project
  currentProjectId: string | null;
  setCurrentProjectId: (projectId: string | null) => void;

  // Playhead and Navigation
  currentTime: number;
  isPlaying: boolean;
  isRecording: boolean;
  followPlayhead: boolean;
  autoscrollMode: AutoscrollMode;

  // Transport State
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  tempo: number;
  timeSignature: string;
  metronomeEnabled: boolean;

  // Timeline View State
  zoom: number;
  scrollPosition: number;
  snapEnabled: boolean;
  snapResolution: number; // in seconds

  // Selection
  selectedTrackIds: string[];
  selectedClipIds: string[];
  selectedMarkerId: string | null;
  selectedTrackId: string | null; // Single selection for Inspector
  selectedClipId: string | null; // Single selection for Inspector

  // Tracks (for FlowState adapter)
  tracks: StoreTrack[];

  // Browser State
  browserVisible: boolean;
  browserSearchQuery: string;
  browserActiveTab: "pool" | "presets" | "samples" | "plugins" | "files";
  browserSelectedItem: string | null;

  // Inspector State
  inspectorVisible: boolean;

  // Routing Matrix State
  routingMatrixVisible: boolean;

  // Markers
  markers: Marker[];

  // Audio Devices
  selectedInputDevice: string | null;
  selectedOutputDevice: string | null;
  bufferSize: number;

  // Metronome Advanced
  metronomeVolume: number;

  // Punch Recording
  punchMode: boolean;
  punchIn: number | null;
  punchOut: number | null;

  // Take Comping
  takesByTrack: Record<string, Take[]>;

  // Chord Track State
  chords: Chord[];

  // Video Track State
  videoClips: VideoClip[];

  // Fader Flip State
  faderModes: Record<string, FaderMode>;

  // Spatial Audio State
  spatialObjects: SpatialObject[];
  speakerConfig: SpeakerConfiguration;
  binauralEnabled: boolean;

  // Lyrics State
  lyrics: LyricLine[];
  selectedLyricId: string | null;
  lyricsDisplayVisible: boolean;
  lyricsTrackVisible: boolean;
  lyricsDisplaySettings: LyricsDisplaySettings;

  // Professional Recording State
  recordingMode: RecordingMode;
  preRollBars: number;
  countInBars: number;
  returnToStartOnStop: boolean;
  inputMonitoring: boolean;

  // Editing Tools
  currentTool: EditTool;
  rangeSelectionStart: number | null;
  rangeSelectionEnd: number | null;

  // Automation State
  automationMode: AutomationMode;
  automationLanesVisible: boolean;
  selectedAutomationParameter: string | null;

  // Grid/Snap Settings
  gridVisible: boolean;
  gridDivision: number;

  // Crossfade Settings
  crossfadeLength: number;
  crossfadeCurve: "linear" | "equal-power" | "exponential";

  // Infinite Timeline State (Studio One style)
  projectDuration: number; // Dynamic duration in seconds
  projectEndMarker: number; // Export end marker (non-restrictive)
  minProjectDuration: number; // Minimum duration before expansion
  autoExpandEnabled: boolean; // Auto-expand timeline when playhead exceeds

  // Smart Re-engagement (Studio One 7.2 style)
  autoscrollPaused: boolean; // True when user manually scrolled during playback
  lastManualScrollTime: number; // Timestamp of last manual scroll

  // Adaptive Grid and Sync Settings (Studio One style)
  adaptiveSnapEnabled: boolean; // When true, snap resolution adapts to zoom level
  translucentEventsEnabled: boolean; // When true, waveforms are semi-transparent showing grid lines through
  showSyncPoints: boolean; // When true, sync point markers are visible

  // Studio One 7-style Timeline Features
  loopToolEnabled: boolean; // When true, dragging clip edges repeats/loops the audio
  timeStretchEnabled: boolean; // When true, Alt/Option+drag stretches audio to fit
  horizontalDropMode: boolean; // When Ctrl/Cmd held, imports render horizontally on single track

  // Tempo Detection State
  projectTempoMaps: TempoMap[];
  isAnalyzingTempo: boolean;
  analyzingClipId: string | null;

  // Frozen Track State
  frozenTracks: FrozenTrackState[];
  isFreezing: boolean;
  freezingTrackId: string | null;

  // Global Transpose State
  projectKey: MusicalKey;
  projectKeyMode: KeyMode;
  globalTranspose: number;
  originalProjectKey: MusicalKey;

  // Chord Display Mode State
  chordDisplayMode: ChordDisplayMode;

  // Mastering Project State
  masteringProjects: MasteringProject[];
  activeMasteringProjectId: string | null;
  isMasteringProcessing: boolean;
  masteringPanelVisible: boolean;

  // Launcher State (Ableton Session View style)
  launcherClips: LauncherClip[];
  launcherScenes: LauncherScene[];
  activeLauncherClips: string[]; // clip IDs currently playing
  queuedLauncherClips: string[]; // clip IDs queued to play on next beat
  launcherQuantize: LauncherQuantize;
  showLauncher: boolean;

  // Show Page State (Live Performance Environment)
  setlists: Setlist[];
  activeSetlistId: string | null;
  performanceState: PerformanceState;
  showShowPage: boolean;

  // Transport Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setIsRecording: (recording: boolean) => void;
  toggleFollowPlayhead: () => void;
  setAutoscrollMode: (mode: AutoscrollMode) => void;
  cycleAutoscrollMode: () => void;
  setLoopEnabled: (enabled: boolean) => void;
  setLoopStart: (time: number) => void;
  setLoopEnd: (time: number) => void;
  setTempo: (tempo: number) => void;
  setTimeSignature: (signature: string) => void;
  setMetronomeEnabled: (enabled: boolean) => void;

  // View Actions
  setZoom: (zoom: number) => void;
  setScrollPosition: (position: number) => void;
  toggleSnap: () => void;
  setSnapResolution: (resolution: number) => void;

  // Selection Actions
  selectTrack: (trackId: string, multi?: boolean) => void;
  selectClip: (clipId: string, multi?: boolean) => void;
  selectMarker: (markerId: string | null) => void;
  clearSelection: () => void;

  // Track Actions (for FlowState adapter)
  setTracks: (tracks: StoreTrack[]) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackMute: (trackId: string, mute: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setTrackArmed: (trackId: string, armed: boolean) => void;

  // Browser Actions
  toggleBrowser: () => void;
  setBrowserSearchQuery: (query: string) => void;
  setBrowserActiveTab: (
    tab: "pool" | "presets" | "samples" | "plugins" | "files",
  ) => void;
  setBrowserSelectedItem: (itemId: string | null) => void;

  // Inspector Actions
  toggleInspector: () => void;

  // Routing Matrix Actions
  toggleRoutingMatrix: () => void;

  // Marker Actions
  addMarker: (marker: Marker) => void;
  updateMarker: (id: string, updates: Partial<Marker>) => void;
  deleteMarker: (id: string) => void;

  // Audio Device Actions
  setSelectedInputDevice: (deviceId: string | null) => void;
  setSelectedOutputDevice: (deviceId: string | null) => void;
  setBufferSize: (size: number) => void;

  // Metronome Actions
  setMetronomeVolume: (volume: number) => void;

  // Punch Recording Actions
  setPunchMode: (enabled: boolean) => void;
  setPunchIn: (time: number | null) => void;
  setPunchOut: (time: number | null) => void;

  // Take Comping Actions
  addTake: (trackId: string, take: Take) => void;
  updateTake: (trackId: string, takeId: string, updates: Partial<Take>) => void;
  deleteTake: (trackId: string, takeId: string) => void;

  // Chord Track Actions
  addChord: (chord: Chord) => void;
  updateChord: (id: string, updates: Partial<Chord>) => void;
  deleteChord: (id: string) => void;
  transposeChords: (semitones: number) => void;

  // Video Track Actions
  addVideoClip: (clip: VideoClip) => void;
  updateVideoClip: (id: string, updates: Partial<VideoClip>) => void;
  deleteVideoClip: (id: string) => void;

  // Fader Flip Actions
  setFaderMode: (channelId: string, mode: FaderMode) => void;
  getFaderMode: (channelId: string) => FaderMode;

  // Spatial Audio Actions
  addSpatialObject: (object: SpatialObject) => void;
  updateSpatialObject: (id: string, updates: Partial<SpatialObject>) => void;
  deleteSpatialObject: (id: string) => void;
  setSpeakerConfig: (config: SpeakerConfiguration) => void;
  setBinauralEnabled: (enabled: boolean) => void;

  // Lyrics Actions
  addLyric: (line: LyricLine) => void;
  updateLyric: (id: string, updates: Partial<LyricLine>) => void;
  deleteLyric: (id: string) => void;
  selectLyric: (id: string | null) => void;
  snapLyricToPlayhead: (id: string) => void;
  toggleLyricsDisplay: () => void;
  toggleLyricsTrack: () => void;
  updateLyricsDisplaySettings: (
    updates: Partial<LyricsDisplaySettings>,
  ) => void;
  importLyrics: (text: string) => void;
  getCurrentLyricLine: () => LyricLine | null;
  getCurrentLyricWord: () => LyricWord | null;

  // Recording Mode Actions
  setRecordingMode: (mode: RecordingMode) => void;
  setPreRollBars: (bars: number) => void;
  setCountInBars: (bars: number) => void;
  setReturnToStartOnStop: (enabled: boolean) => void;
  setInputMonitoring: (enabled: boolean) => void;

  // Edit Tool Actions
  setCurrentTool: (tool: EditTool) => void;
  setRangeSelection: (start: number | null, end: number | null) => void;
  clearRangeSelection: () => void;

  // Automation Actions
  setAutomationMode: (mode: AutomationMode) => void;
  toggleAutomationLanes: () => void;
  setSelectedAutomationParameter: (param: string | null) => void;

  // Grid Actions
  toggleGridVisible: () => void;
  setGridDivision: (division: number) => void;

  // Crossfade Actions
  setCrossfadeLength: (length: number) => void;
  setCrossfadeCurve: (curve: "linear" | "equal-power" | "exponential") => void;

  // Infinite Timeline Actions (Studio One style)
  setProjectDuration: (duration: number) => void;
  setProjectEndMarker: (time: number) => void;
  expandTimelineIfNeeded: (playheadTime: number) => void;
  fitTimelineToContents: (contentEndTime: number) => void;
  setAutoExpandEnabled: (enabled: boolean) => void;

  // Smart Re-engagement Actions (Studio One 7.2 style)
  pauseAutoscroll: () => void; // Called when user manually scrolls during playback
  resumeAutoscroll: () => void; // Called when user presses F or clicks autoscroll button
  isAutoscrollActive: () => boolean; // Returns false if mode is off or paused

  // Adaptive Grid and Sync Actions (Studio One style)
  setAdaptiveSnapEnabled: (enabled: boolean) => void;
  setTranslucentEventsEnabled: (enabled: boolean) => void;
  setShowSyncPoints: (enabled: boolean) => void;

  // Studio One 7-style Timeline Feature Actions
  setLoopToolEnabled: (enabled: boolean) => void;
  setTimeStretchEnabled: (enabled: boolean) => void;
  setHorizontalDropMode: (enabled: boolean) => void;
  getAdaptiveSnapInterval: (zoom: number) => number; // Returns snap interval based on zoom level

  // Tempo Detection Actions
  addTempoMap: (map: TempoMap) => void;
  removeTempoMap: (clipId: string) => void;
  setIsAnalyzingTempo: (analyzing: boolean, clipId?: string | null) => void;
  getTempoMapForClip: (clipId: string) => TempoMap | undefined;

  // Frozen Track Actions
  freezeTrack: (trackId: string, duration?: number) => Promise<void>;
  unfreezeTrack: (trackId: string) => void;
  isTrackFrozen: (trackId: string) => boolean;
  setIsFreezing: (freezing: boolean, trackId?: string | null) => void;
  getFrozenTrackCount: () => number;

  // Global Transpose Actions
  setProjectKey: (key: MusicalKey) => void;
  setProjectKeyMode: (mode: KeyMode) => void;
  setGlobalTranspose: (semitones: number) => void;
  transposeUp: () => void;
  transposeDown: () => void;
  resetTranspose: () => void;
  getTransposedKey: () => MusicalKey;

  // Chord Display Mode Actions
  setChordDisplayMode: (mode: ChordDisplayMode) => void;
  cycleChordDisplayMode: () => void;
  getFormattedChord: (chordRoot: string, chordQuality: string) => string;

  // Mastering Project Actions
  createMasteringProject: (name: string) => void;
  deleteMasteringProject: (id: string) => void;
  setActiveMasteringProject: (id: string | null) => void;
  addSongToProject: (projectId: string, song: Partial<MasteringSong>) => void;
  removeSongFromProject: (projectId: string, songId: string) => void;
  reorderSongs: (projectId: string, songIds: string[]) => void;
  updateMasteringSettings: (
    projectId: string,
    settings: Partial<MasteringProject>,
  ) => void;
  updateMasteringSong: (
    projectId: string,
    songId: string,
    updates: Partial<MasteringSong>,
  ) => void;
  toggleMasteringPanel: () => void;
  setMasteringProcessing: (processing: boolean) => void;
  getActiveMasteringProject: () => MasteringProject | null;

  // Launcher Actions (Ableton Session View style)
  addLauncherClip: (clip: Partial<LauncherClip>) => void;
  removeLauncherClip: (clipId: string) => void;
  updateLauncherClip: (clipId: string, updates: Partial<LauncherClip>) => void;
  triggerClip: (clipId: string) => void;
  stopClip: (clipId: string) => void;
  triggerScene: (sceneIndex: number) => void;
  stopAllClips: () => void;
  setLauncherQuantize: (quantize: LauncherQuantize) => void;
  toggleLauncher: () => void;
  addLauncherScene: (scene: Partial<LauncherScene>) => void;
  removeLauncherScene: (sceneIndex: number) => void;
  updateLauncherScene: (
    sceneId: string,
    updates: Partial<LauncherScene>,
  ) => void;
  getLauncherClipsForTrack: (trackId: string) => LauncherClip[];
  getLauncherClipAt: (
    trackId: string,
    slotIndex: number,
  ) => LauncherClip | undefined;

  // Show Page Actions (Live Performance Environment)
  createSetlist: (name: string) => void;
  deleteSetlist: (id: string) => void;
  addItemToSetlist: (setlistId: string, item: Partial<SetlistItem>) => void;
  removeItemFromSetlist: (setlistId: string, itemId: string) => void;
  reorderSetlistItems: (setlistId: string, itemIds: string[]) => void;
  setActiveSetlist: (id: string | null) => void;
  startPerformance: () => void;
  stopPerformance: () => void;
  nextItem: () => void;
  previousItem: () => void;
  goToItem: (index: number) => void;
  toggleShowPage: () => void;
  updatePerformanceElapsedTime: (time: number) => void;
  getActiveSetlist: () => Setlist | null;
  getCurrentSetlistItem: () => SetlistItem | null;
  getNextSetlistItem: () => SetlistItem | null;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  // Current Project
  currentProjectId: null,
  setCurrentProjectId: (projectId: string | null) =>
    set({ currentProjectId: projectId }),

  // Initial State
  currentTime: 0,
  isPlaying: false,
  isRecording: false,
  followPlayhead: true,
  autoscrollMode: "turnover" as AutoscrollMode,

  // Transport State
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  tempo: 120,
  timeSignature: "4/4",
  metronomeEnabled: false,

  zoom: 1.0,
  scrollPosition: 0,
  snapEnabled: true,
  snapResolution: 0.25, // Quarter note at 120 BPM

  selectedTrackIds: [],
  selectedClipIds: [],
  selectedMarkerId: null,
  selectedTrackId: null,
  selectedClipId: null,

  // Tracks (for FlowState adapter)
  tracks: [],

  // Browser State
  browserVisible: true,
  browserSearchQuery: "",
  browserActiveTab: "pool",
  browserSelectedItem: null,

  // Inspector State
  inspectorVisible: true,

  // Routing Matrix State
  routingMatrixVisible: false,

  markers: [],

  // Audio Devices
  selectedInputDevice: null,
  selectedOutputDevice: null,
  bufferSize: 256,

  // Metronome Advanced
  metronomeVolume: 0.5,

  // Punch Recording
  punchMode: false,
  punchIn: null,
  punchOut: null,

  // Take Comping
  takesByTrack: {},

  // Chord Track State
  chords: [],

  // Video Track State
  videoClips: [],

  // Fader Flip State
  faderModes: {},

  // Spatial Audio State
  spatialObjects: [],
  speakerConfig: "7.1",
  binauralEnabled: false,

  // Lyrics State
  lyrics: [],
  selectedLyricId: null,
  lyricsDisplayVisible: false,
  lyricsTrackVisible: true,
  lyricsDisplaySettings: {
    fontSize: "large" as const,
    fontFamily: "Inter, sans-serif",
    textColor: "#ffffff",
    highlightColor: "#fbbf24",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    textAlign: "center" as const,
    lineSpacing: 1.5,
    showWordHighlight: true,
    teleprompterMode: false,
  },

  // Professional Recording State
  recordingMode: "replace",
  preRollBars: 0,
  countInBars: 0,
  returnToStartOnStop: true,
  inputMonitoring: false,

  // Editing Tools
  currentTool: "pointer",
  rangeSelectionStart: null,
  rangeSelectionEnd: null,

  // Automation State
  automationMode: "read",
  automationLanesVisible: false,
  selectedAutomationParameter: null,

  // Grid/Snap Settings
  gridVisible: true,
  gridDivision: 4,

  // Crossfade Settings
  crossfadeLength: 0.01,
  crossfadeCurve: "equal-power",

  // Infinite Timeline State (Studio One style - default 5 minutes)
  projectDuration: 300, // 5 minutes in seconds
  projectEndMarker: 300,
  minProjectDuration: 60, // Minimum 1 minute
  autoExpandEnabled: true,

  // Smart Re-engagement State (Studio One 7.2 style)
  autoscrollPaused: false,
  lastManualScrollTime: 0,

  // Adaptive Grid and Sync Settings (Studio One style)
  adaptiveSnapEnabled: true,
  translucentEventsEnabled: false,
  showSyncPoints: true,

  // Studio One 7-style Timeline Features
  loopToolEnabled: true,
  timeStretchEnabled: true,
  horizontalDropMode: false,

  // Tempo Detection State
  projectTempoMaps: [],
  isAnalyzingTempo: false,
  analyzingClipId: null,

  // Frozen Track State
  frozenTracks: [],
  isFreezing: false,
  freezingTrackId: null,

  // Global Transpose State
  projectKey: "C",
  projectKeyMode: "major",
  globalTranspose: 0,
  originalProjectKey: "C",

  // Chord Display Mode State
  chordDisplayMode: "standard",

  // Mastering Project State
  masteringProjects: [],
  activeMasteringProjectId: null,
  isMasteringProcessing: false,
  masteringPanelVisible: false,

  // Launcher State (Ableton Session View style)
  launcherClips: [],
  launcherScenes: [
    { id: "scene-1", index: 0, name: "Scene 1", color: "#4ade80" },
    { id: "scene-2", index: 1, name: "Scene 2", color: "#60a5fa" },
    { id: "scene-3", index: 2, name: "Scene 3", color: "#f87171" },
    { id: "scene-4", index: 3, name: "Scene 4", color: "#fbbf24" },
  ],
  activeLauncherClips: [],
  queuedLauncherClips: [],
  launcherQuantize: "1bar" as LauncherQuantize,
  showLauncher: false,

  // Show Page State (Live Performance Environment) with sample data
  setlists: [
    {
      id: "setlist-demo",
      name: "Demo Show",
      createdAt: Date.now(),
      items: [
        {
          id: "item-1",
          name: "Opening Night",
          duration: 240,
          bpm: 128,
          key: "Am",
          notes: "Start with soft intro, build up at 1:30",
          order: 0,
        },
        {
          id: "item-2",
          name: "Electric Dreams",
          duration: 195,
          bpm: 140,
          key: "E",
          notes: "Heavy synth lead, crowd interaction at bridge",
          order: 1,
        },
        {
          id: "item-3",
          name: "Midnight Groove",
          duration: 280,
          bpm: 110,
          key: "Dm",
          notes: "Bass-heavy, extended outro for DJ transition",
          order: 2,
        },
        {
          id: "item-4",
          name: "Final Countdown",
          duration: 210,
          bpm: 135,
          key: "G",
          notes: "Closing anthem, pyro cue at 3:00",
          order: 3,
        },
      ],
    },
  ],
  activeSetlistId: "setlist-demo",
  performanceState: {
    currentSetlistId: null,
    currentItemIndex: 0,
    isPerforming: false,
    elapsedTime: 0,
  },
  showShowPage: false,

  // Playhead Actions
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  toggleFollowPlayhead: () =>
    set((state) => ({ followPlayhead: !state?.followPlayhead })),
  setAutoscrollMode: (mode) =>
    set({ autoscrollMode: mode, followPlayhead: mode !== "off" }),
  cycleAutoscrollMode: () =>
    set((state) => {
      const modes: AutoscrollMode[] = [
        "off",
        "turnover",
        "continuous-centered",
        "continuous-left",
      ];
      const currentIndex = modes?.indexOf(state?.autoscrollMode);
      const nextIndex = (currentIndex + 1) % modes?.length;
      const nextMode = modes[nextIndex];
      return { autoscrollMode: nextMode, followPlayhead: nextMode !== "off" };
    }),

  // Transport Actions
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setLoopStart: (time) => set({ loopStart: time }),
  setLoopEnd: (time) => set({ loopEnd: time }),
  setTempo: (tempo) => set({ tempo: Math.max(40, Math?.min(240, tempo)) }),
  setTimeSignature: (signature) => set({ timeSignature: signature }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),

  // View Actions
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math?.min(10, zoom)) }),
  setScrollPosition: (position) =>
    set({ scrollPosition: Math.max(0, position) }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state?.snapEnabled })),
  setSnapResolution: (resolution) => set({ snapResolution: resolution }),

  // Selection Actions
  selectTrack: (trackId, multi = false) =>
    set((state) => ({
      selectedTrackIds: multi
        ? state?.selectedTrackIds.includes(trackId)
          ? state?.selectedTrackIds.filter((id) => id !== trackId)
          : [...state?.selectedTrackIds, trackId]
        : [trackId],
      selectedTrackId: multi ? state?.selectedTrackId : trackId,
    })),

  selectClip: (clipId, multi = false) =>
    set((state) => ({
      selectedClipIds: multi
        ? state?.selectedClipIds.includes(clipId)
          ? state?.selectedClipIds.filter((id) => id !== clipId)
          : [...state?.selectedClipIds, clipId]
        : [clipId],
      selectedClipId: multi ? state?.selectedClipId : clipId,
    })),

  selectMarker: (markerId) => set({ selectedMarkerId: markerId }),

  clearSelection: () =>
    set({
      selectedTrackIds: [],
      selectedClipIds: [],
      selectedMarkerId: null,
      selectedTrackId: null,
      selectedClipId: null,
    }),

  // Track Actions (for FlowState adapter)
  setTracks: (tracks) => set({ tracks }),
  setTrackVolume: (trackId, volume) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t?.id === trackId
          ? { ...t, volume: Math.max(0, Math?.min(1, volume)) }
          : t,
      ),
    })),
  setTrackPan: (trackId, pan) =>
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t?.id === trackId ? { ...t, pan: Math.max(-1, Math?.min(1, pan)) } : t,
      ),
    })),
  setTrackMute: (trackId, mute) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t?.id === trackId ? { ...t, mute } : t)),
    })),
  setTrackSolo: (trackId, solo) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t?.id === trackId ? { ...t, solo } : t)),
    })),
  setTrackArmed: (trackId, armed) =>
    set((state) => ({
      tracks: state.tracks.map((t) => (t?.id === trackId ? { ...t, armed } : t)),
    })),

  // Browser Actions
  toggleBrowser: () =>
    set((state) => ({ browserVisible: !state?.browserVisible })),
  setBrowserSearchQuery: (query) => set({ browserSearchQuery: query }),
  setBrowserActiveTab: (tab) => set({ browserActiveTab: tab }),
  setBrowserSelectedItem: (itemId) => set({ browserSelectedItem: itemId }),

  // Inspector Actions
  toggleInspector: () =>
    set((state) => ({ inspectorVisible: !state?.inspectorVisible })),

  // Routing Matrix Actions
  toggleRoutingMatrix: () =>
    set((state) => ({ routingMatrixVisible: !state?.routingMatrixVisible })),

  // Marker Actions
  addMarker: (marker) =>
    set((state) => ({
      markers: [...state?.markers, marker].sort((a, b) => a?.time - b?.time),
    })),

  updateMarker: (id, updates) =>
    set((state) => ({
      markers: state.markers
        .map((m) => (m?.id === id ? { ...m, ...updates } : m))
        .sort((a, b) => a?.time - b?.time),
    })),

  deleteMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m?.id !== id),
      selectedMarkerId:
        state?.selectedMarkerId === id ? null : state?.selectedMarkerId,
    })),

  // Audio Device Actions
  setSelectedInputDevice: (deviceId) => set({ selectedInputDevice: deviceId }),
  setSelectedOutputDevice: (deviceId) =>
    set({ selectedOutputDevice: deviceId }),
  setBufferSize: (size) => set({ bufferSize: size }),

  // Metronome Actions
  setMetronomeVolume: (volume) =>
    set({ metronomeVolume: Math.max(0, Math?.min(1, volume)) }),

  // Punch Recording Actions
  setPunchMode: (enabled) => set({ punchMode: enabled }),
  setPunchIn: (time) => set({ punchIn: time }),
  setPunchOut: (time) => set({ punchOut: time }),

  // Take Comping Actions
  addTake: (trackId, take) =>
    set((state) => ({
      takesByTrack: {
        ...state?.takesByTrack,
        [trackId]: [...(state?.takesByTrack[trackId] || []), take],
      },
    })),
  updateTake: (trackId, takeId, updates) =>
    set((state) => ({
      takesByTrack: {
        ...state?.takesByTrack,
        [trackId]: (state?.takesByTrack[trackId] || []).map((t) =>
          t?.id === takeId ? { ...t, ...updates } : t,
        ),
      },
    })),
  deleteTake: (trackId, takeId) =>
    set((state) => ({
      takesByTrack: {
        ...state?.takesByTrack,
        [trackId]: (state?.takesByTrack[trackId] || []).filter(
          (t) => t?.id !== takeId,
        ),
      },
    })),

  // Chord Track Actions
  addChord: (chord) =>
    set((state) => ({
      chords: [...state?.chords, chord].sort(
        (a, b) => a?.startTime - b?.startTime,
      ),
    })),

  updateChord: (id, updates) =>
    set((state) => ({
      chords: state.chords
        .map((c) => (c?.id === id ? { ...c, ...updates } : c))
        .sort((a, b) => a?.startTime - b?.startTime),
    })),

  deleteChord: (id) =>
    set((state) => ({
      chords: state.chords.filter((c) => c?.id !== id),
    })),

  transposeChords: (semitones) =>
    set((state) => {
      const CHORD_ROOTS = [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ];
      return {
        chords: state.chords.map((chord) => {
          const rootIndex = CHORD_ROOTS?.indexOf(chord?.root);
          if (rootIndex === -1) return chord;
          const newRootIndex = (rootIndex + semitones + 12) % 12;
          const newRoot = CHORD_ROOTS[newRootIndex];
          let newBass = chord?.bass;
          if (chord?.bass) {
            const bassIndex = CHORD_ROOTS?.indexOf(chord?.bass);
            if (bassIndex !== -1) {
              newBass = CHORD_ROOTS[(bassIndex + semitones + 12) % 12];
            }
          }
          return {
            ...chord,
            root: newRoot,
            name: `${newRoot}${chord?.quality}${newBass ? `/${newBass}` : ""}`,
            bass: newBass,
          };
        }),
      };
    }),

  // Video Track Actions
  addVideoClip: (clip) =>
    set((state) => ({
      videoClips: [...state?.videoClips, clip].sort(
        (a, b) => a?.startTime - b?.startTime,
      ),
    })),

  updateVideoClip: (id, updates) =>
    set((state) => ({
      videoClips: state.videoClips
        .map((c) => (c?.id === id ? { ...c, ...updates } : c))
        .sort((a, b) => a?.startTime - b?.startTime),
    })),

  deleteVideoClip: (id) =>
    set((state) => ({
      videoClips: state.videoClips.filter((c) => c?.id !== id),
    })),

  // Fader Flip Actions
  setFaderMode: (channelId, mode) =>
    set((state) => ({
      faderModes: {
        ...state?.faderModes,
        [channelId]: mode,
      },
    })),

  getFaderMode: (channelId) => {
    return get().faderModes[channelId] || "volume";
  },

  // Spatial Audio Actions
  addSpatialObject: (object) =>
    set((state) => ({
      spatialObjects: [...state?.spatialObjects, object],
    })),

  updateSpatialObject: (id, updates) =>
    set((state) => ({
      spatialObjects: state.spatialObjects.map((o) =>
        o?.id === id ? { ...o, ...updates } : o,
      ),
    })),

  deleteSpatialObject: (id) =>
    set((state) => ({
      spatialObjects: state.spatialObjects.filter((o) => o?.id !== id),
    })),

  setSpeakerConfig: (config) => set({ speakerConfig: config }),

  setBinauralEnabled: (enabled) => set({ binauralEnabled: enabled }),

  // Lyrics Actions
  addLyric: (line) =>
    set((state) => ({
      lyrics: [...state?.lyrics, line].sort((a, b) => a?.startTime - b?.startTime),
    })),

  updateLyric: (id, updates) =>
    set((state) => ({
      lyrics: state.lyrics
        .map((l) => (l?.id === id ? { ...l, ...updates } : l))
        .sort((a, b) => a?.startTime - b?.startTime),
    })),

  deleteLyric: (id) =>
    set((state) => ({
      lyrics: state.lyrics.filter((l) => l?.id !== id),
    })),

  selectLyric: (id) => set({ selectedLyricId: id }),

  snapLyricToPlayhead: (id) =>
    set((state) => {
      const currentTime = state?.currentTime;
      const lyric = state?.lyrics.find((l) => l?.id === id);
      if (!lyric) return state;
      const duration = lyric?.endTime - lyric?.startTime;
      return {
        lyrics: state.lyrics
          .map((l) =>
            l?.id === id
              ? {
                  ...l,
                  startTime: currentTime,
                  endTime: currentTime + duration,
                }
              : l,
          )
          .sort((a, b) => a?.startTime - b?.startTime),
      };
    }),

  toggleLyricsDisplay: () =>
    set((state) => ({ lyricsDisplayVisible: !state?.lyricsDisplayVisible })),

  toggleLyricsTrack: () =>
    set((state) => ({ lyricsTrackVisible: !state?.lyricsTrackVisible })),

  updateLyricsDisplaySettings: (updates) =>
    set((state) => ({
      lyricsDisplaySettings: { ...state?.lyricsDisplaySettings, ...updates },
    })),

  importLyrics: (text) => {
    const lines = text?.split("\n").filter((line) => line?.trim());
    const newLyrics: LyricLine[] = lines?.map((line, index) => ({
      id: `lyric-${Date?.now()}-${index}`,
      text: line.trim(),
      words: line
        .trim()
        .split(/\s+/)
        .map((word, wordIndex) => ({
          id: `word-${Date?.now()}-${index}-${wordIndex}`,
          text: word,
          startTime: index * 4,
          endTime: index * 4 + 2,
        })),
      startTime: index * 4,
      endTime: (index + 1) * 4,
    }));
    set((state) => ({
      lyrics: [...state?.lyrics, ...newLyrics].sort(
        (a, b) => a?.startTime - b?.startTime,
      ),
    }));
  },

  getCurrentLyricLine: () => {
    const state = get();
    const currentTime = state?.currentTime;
    return (
      state?.lyrics.find(
        (line) => currentTime >= line?.startTime && currentTime < line?.endTime,
      ) || null
    );
  },

  getCurrentLyricWord: () => {
    const state = get();
    const currentTime = state?.currentTime;
    const currentLine = state?.lyrics.find(
      (line) => currentTime >= line?.startTime && currentTime < line?.endTime,
    );
    if (!currentLine) return null;
    return (
      currentLine?.words.find(
        (word) => currentTime >= word?.startTime && currentTime < word?.endTime,
      ) || null
    );
  },

  // Recording Mode Actions
  setRecordingMode: (mode) => set({ recordingMode: mode }),
  setPreRollBars: (bars) =>
    set({ preRollBars: Math.max(0, Math?.min(8, bars)) }),
  setCountInBars: (bars) =>
    set({ countInBars: Math.max(0, Math?.min(8, bars)) }),
  setReturnToStartOnStop: (enabled) => set({ returnToStartOnStop: enabled }),
  setInputMonitoring: (enabled) => set({ inputMonitoring: enabled }),

  // Edit Tool Actions
  setCurrentTool: (tool) => set({ currentTool: tool }),
  setRangeSelection: (start, end) =>
    set({ rangeSelectionStart: start, rangeSelectionEnd: end }),
  clearRangeSelection: () =>
    set({ rangeSelectionStart: null, rangeSelectionEnd: null }),

  // Automation Actions
  setAutomationMode: (mode) => set({ automationMode: mode }),
  toggleAutomationLanes: () =>
    set((state) => ({ automationLanesVisible: !state?.automationLanesVisible })),
  setSelectedAutomationParameter: (param) =>
    set({ selectedAutomationParameter: param }),

  // Grid Actions
  toggleGridVisible: () =>
    set((state) => ({ gridVisible: !state?.gridVisible })),
  setGridDivision: (division) => set({ gridDivision: division }),

  // Crossfade Actions
  setCrossfadeLength: (length) =>
    set({ crossfadeLength: Math.max(0.001, Math?.min(5, length)) }),
  setCrossfadeCurve: (curve) => set({ crossfadeCurve: curve }),

  // Infinite Timeline Actions (Studio One style)
  setProjectDuration: (duration) =>
    set((state) => ({
      projectDuration: Math.max(state?.minProjectDuration, duration),
    })),

  setProjectEndMarker: (time) => set({ projectEndMarker: Math.max(0, time) }),

  // Dynamic expansion: auto-allocate more time when playhead nears end
  expandTimelineIfNeeded: (playheadTime) =>
    set((state) => {
      if (!state?.autoExpandEnabled) return {};

      // Expand when playhead is within 10% of the end
      const threshold = state?.projectDuration * 0.9;
      if (playheadTime >= threshold) {
        // Expand by 50% each time
        const newDuration = state?.projectDuration * 1.5;
        return { projectDuration: newDuration };
      }
      return {};
    }),

  // Fit timeline view to content (like "Fit Timeline to Contents" command)
  fitTimelineToContents: (contentEndTime) =>
    set((state) => {
      // Add 10% padding after content
      const paddedDuration = contentEndTime * 1.1;
      const newDuration = Math?.max(state?.minProjectDuration, paddedDuration);
      return {
        projectDuration: newDuration,
        projectEndMarker: contentEndTime,
      };
    }),

  setAutoExpandEnabled: (enabled) => set({ autoExpandEnabled: enabled }),

  // Smart Re-engagement Actions (Studio One 7.2 style)
  pauseAutoscroll: () =>
    set({
      autoscrollPaused: true,
      lastManualScrollTime: Date.now(),
    }),

  resumeAutoscroll: () =>
    set({
      autoscrollPaused: false,
    }),

  isAutoscrollActive: () => {
    const state = get();
    return state?.autoscrollMode !== "off" && !state?.autoscrollPaused;
  },

  // Adaptive Grid and Sync Actions (Studio One style)
  setAdaptiveSnapEnabled: (enabled) => set({ adaptiveSnapEnabled: enabled }),
  setTranslucentEventsEnabled: (enabled) =>
    set({ translucentEventsEnabled: enabled }),
  setShowSyncPoints: (enabled) => set({ showSyncPoints: enabled }),

  // Studio One 7-style Timeline Feature Setters
  setLoopToolEnabled: (enabled) => set({ loopToolEnabled: enabled }),
  setTimeStretchEnabled: (enabled) => set({ timeStretchEnabled: enabled }),
  setHorizontalDropMode: (enabled) => set({ horizontalDropMode: enabled }),

  getAdaptiveSnapInterval: (zoom: number): number => {
    const state = get();
    const tempo = state?.tempo;
    const secondsPerBeat = 60 / tempo;

    if (zoom < 0.5) {
      const [numerator] = state?.timeSignature.split("/").map(Number);
      return secondsPerBeat * numerator;
    } else if (zoom < 1.0) {
      return secondsPerBeat;
    } else if (zoom < 2.0) {
      return secondsPerBeat / 4;
    } else if (zoom < 3.0) {
      return secondsPerBeat / 8;
    } else {
      return secondsPerBeat / 16;
    }
  },

  // Tempo Detection Actions
  addTempoMap: (map) =>
    set((state) => ({
      projectTempoMaps: [
        ...state?.projectTempoMaps.filter((m) => m?.clipId !== map?.clipId),
        map,
      ],
    })),

  removeTempoMap: (clipId) =>
    set((state) => ({
      projectTempoMaps: state.projectTempoMaps.filter(
        (m) => m?.clipId !== clipId,
      ),
    })),

  setIsAnalyzingTempo: (analyzing, clipId = null) =>
    set({
      isAnalyzingTempo: analyzing,
      analyzingClipId: analyzing ? clipId : null,
    }),

  getTempoMapForClip: (clipId) => {
    const state = get();
    return state?.projectTempoMaps.find((m) => m?.clipId === clipId);
  },

  // Frozen Track Actions
  freezeTrack: async (trackId: string, duration: number = 60) => {
    set({ isFreezing: true, freezingTrackId: trackId });

    // Mock freeze process - simulate render time proportional to duration
    const renderTime = Math?.min(2000, Math?.max(500, duration * 200));
    await new Promise((resolve) => setTimeout(resolve, renderTime));

    const frozenState: FrozenTrackState = {
      trackId,
      frozenAt: Date.now(),
      originalPlugins: [], // Would store actual plugin state in production
      frozenAudioUrl: `/frozen/${trackId}-${Date?.now()}.wav`,
      frozenDuration: duration,
    };

    set((state) => ({
      frozenTracks: [
        ...state?.frozenTracks.filter((f) => f?.trackId !== trackId),
        frozenState,
      ],
      isFreezing: false,
      freezingTrackId: null,
    }));
  },

  unfreezeTrack: (trackId) =>
    set((state) => ({
      frozenTracks: state.frozenTracks.filter((f) => f?.trackId !== trackId),
    })),

  isTrackFrozen: (trackId) => {
    const state = get();
    return state?.frozenTracks.some((f) => f?.trackId === trackId);
  },

  setIsFreezing: (freezing, trackId = null) =>
    set({
      isFreezing: freezing,
      freezingTrackId: freezing ? trackId : null,
    }),

  getFrozenTrackCount: () => {
    const state = get();
    return state?.frozenTracks.length;
  },

  // Global Transpose Actions
  setProjectKey: (key) =>
    set((state) => ({
      projectKey: key,
      originalProjectKey:
        state?.globalTranspose === 0 ? key : state?.originalProjectKey,
    })),

  setProjectKeyMode: (mode) => set({ projectKeyMode: mode }),

  setGlobalTranspose: (semitones) =>
    set({
      globalTranspose: Math.max(-12, Math?.min(12, semitones)),
    }),

  transposeUp: () =>
    set((state) => ({
      globalTranspose: Math.min(12, state?.globalTranspose + 1),
    })),

  transposeDown: () =>
    set((state) => ({
      globalTranspose: Math.max(-12, state?.globalTranspose - 1),
    })),

  resetTranspose: () => set({ globalTranspose: 0 }),

  getTransposedKey: () => {
    const state = get();
    if (state?.globalTranspose === 0) return state?.projectKey;
    const keyIndex = MUSICAL_KEYS?.indexOf(state?.projectKey);
    const newIndex = (keyIndex + state?.globalTranspose + 12) % 12;
    return MUSICAL_KEYS[newIndex];
  },

  // Chord Display Mode Actions
  setChordDisplayMode: (mode) => set({ chordDisplayMode: mode }),

  cycleChordDisplayMode: () =>
    set((state) => {
      const modes: ChordDisplayMode[] = ["standard", "nashville", "roman"];
      const currentIndex = modes?.indexOf(state?.chordDisplayMode);
      const nextIndex = (currentIndex + 1) % modes?.length;
      return { chordDisplayMode: modes[nextIndex] };
    }),

  getFormattedChord: (chordRoot: string, chordQuality: string) => {
    const state = get();
    return formatChord(
      chordRoot,
      chordQuality,
      state?.projectKey,
      state?.chordDisplayMode,
    );
  },

  // Mastering Project Actions
  createMasteringProject: (name) => {
    const newProject: MasteringProject = {
      id: `mastering-${Date?.now()}`,
      name,
      songs: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      targetLoudness: -14,
      format: "wav",
      sampleRate: 44100,
      bitDepth: 24,
    };
    set((state) => ({
      masteringProjects: [...state?.masteringProjects, newProject],
      activeMasteringProjectId: newProject.id,
    }));
  },

  deleteMasteringProject: (id) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.filter((p) => p?.id !== id),
      activeMasteringProjectId:
        state?.activeMasteringProjectId === id
          ? null
          : state?.activeMasteringProjectId,
    })),

  setActiveMasteringProject: (id) => set({ activeMasteringProjectId: id }),

  addSongToProject: (projectId, song) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.map((p) => {
        if (p?.id !== projectId) return p;
        const newSong: MasteringSong = {
          id: song.id || `song-${Date?.now()}`,
          projectId,
          title: song.title || "Untitled Song",
          sourceFileUrl: song.sourceFileUrl,
          masteredFileUrl: song.masteredFileUrl,
          duration: song.duration || 0,
          order: song.order ?? p?.songs.length,
          loudness: song.loudness,
          peakLevel: song.peakLevel,
          isProcessing: false,
          lastUpdated: Date.now(),
        };
        return {
          ...p,
          songs: [...p?.songs, newSong],
          updatedAt: Date.now(),
        };
      }),
    })),

  removeSongFromProject: (projectId, songId) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.map((p) => {
        if (p?.id !== projectId) return p;
        return {
          ...p,
          songs: p.songs.filter((s) => s?.id !== songId),
          updatedAt: Date.now(),
        };
      }),
    })),

  reorderSongs: (projectId, songIds) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.map((p) => {
        if (p?.id !== projectId) return p;
        const orderedSongs = songIds
          .map((id, index) => {
            const song = p?.songs.find((s) => s?.id === id);
            return song ? { ...song, order: index } : null;
          })
          .filter((s): s is MasteringSong => s !== null);
        return {
          ...p,
          songs: orderedSongs,
          updatedAt: Date.now(),
        };
      }),
    })),

  updateMasteringSettings: (projectId, settings) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.map((p) => {
        if (p?.id !== projectId) return p;
        return {
          ...p,
          ...settings,
          updatedAt: Date.now(),
        };
      }),
    })),

  updateMasteringSong: (projectId, songId, updates) =>
    set((state) => ({
      masteringProjects: state.masteringProjects.map((p) => {
        if (p?.id !== projectId) return p;
        return {
          ...p,
          songs: p.songs.map((s) =>
            s?.id === songId ? { ...s, ...updates, lastUpdated: Date.now() } : s,
          ),
          updatedAt: Date.now(),
        };
      }),
    })),

  toggleMasteringPanel: () =>
    set((state) => ({ masteringPanelVisible: !state?.masteringPanelVisible })),

  setMasteringProcessing: (processing) =>
    set({ isMasteringProcessing: processing }),

  getActiveMasteringProject: () => {
    const state = get();
    return (
      state?.masteringProjects.find(
        (p) => p?.id === state?.activeMasteringProjectId,
      ) || null
    );
  },

  // Launcher Actions (Ableton Session View style)
  addLauncherClip: (clip) => {
    if (!clip?.trackId) {
      throw new Error(
        "LauncherClip requires a trackId - this is a programming error",
      );
    }
    const newClip: LauncherClip = {
      id: clip.id || `clip-${Date?.now()}`,
      trackId: clip.trackId,
      slotIndex: clip.slotIndex ?? 0,
      name: clip.name || "New Clip",
      color: clip.color || "#4ade80",
      duration: clip.duration ?? 4,
      isPlaying: false,
      isQueued: false,
      audioUrl: clip.audioUrl,
    };
    set((state) => ({
      launcherClips: [...state?.launcherClips, newClip],
    }));
  },

  removeLauncherClip: (clipId) =>
    set((state) => ({
      launcherClips: state.launcherClips.filter((c) => c?.id !== clipId),
      activeLauncherClips: state.activeLauncherClips.filter(
        (id) => id !== clipId,
      ),
      queuedLauncherClips: state.queuedLauncherClips.filter(
        (id) => id !== clipId,
      ),
    })),

  updateLauncherClip: (clipId, updates) =>
    set((state) => ({
      launcherClips: state.launcherClips.map((c) =>
        c?.id === clipId ? { ...c, ...updates } : c,
      ),
    })),

  triggerClip: (clipId) =>
    set((state) => {
      const clip = state?.launcherClips.find((c) => c?.id === clipId);
      if (!clip) return {};

      // Stop any playing clip on the same track
      const stoppedClips = state?.launcherClips
        .filter(
          (c) => c?.trackId === clip?.trackId && c?.id !== clipId && c?.isPlaying,
        )
        .map((c) => c?.id);

      // If clip is already playing, stop it
      if (clip?.isPlaying) {
        return {
          launcherClips: state.launcherClips.map((c) =>
            c?.id === clipId ? { ...c, isPlaying: false, isQueued: false } : c,
          ),
          activeLauncherClips: state.activeLauncherClips.filter(
            (id) => id !== clipId,
          ),
        };
      }

      // Queue the clip (simulating quantize behavior)
      const isImmediate = state?.launcherQuantize === "1beat";

      if (isImmediate) {
        // Immediately trigger
        return {
          launcherClips: state.launcherClips.map((c) => {
            if (c?.id === clipId)
              return { ...c, isPlaying: true, isQueued: false };
            if (stoppedClips?.includes(c?.id))
              return { ...c, isPlaying: false, isQueued: false };
            return c;
          }),
          activeLauncherClips: [
            ...state?.activeLauncherClips.filter(
              (id) => !stoppedClips?.includes(id),
            ),
            clipId,
          ],
          queuedLauncherClips: state.queuedLauncherClips.filter(
            (id) => id !== clipId,
          ),
        };
      } else {
        // Queue for next quantize point
        return {
          launcherClips: state.launcherClips.map((c) =>
            c?.id === clipId ? { ...c, isQueued: true } : c,
          ),
          queuedLauncherClips: [
            ...state?.queuedLauncherClips.filter((id) => id !== clipId),
            clipId,
          ],
        };
      }
    }),

  stopClip: (clipId) =>
    set((state) => ({
      launcherClips: state.launcherClips.map((c) =>
        c?.id === clipId ? { ...c, isPlaying: false, isQueued: false } : c,
      ),
      activeLauncherClips: state.activeLauncherClips.filter(
        (id) => id !== clipId,
      ),
      queuedLauncherClips: state.queuedLauncherClips.filter(
        (id) => id !== clipId,
      ),
    })),

  triggerScene: (sceneIndex) =>
    set((state) => {
      // Find all clips in this scene
      const clipsInScene = state?.launcherClips.filter(
        (c) => c?.slotIndex === sceneIndex,
      );
      const clipIds = clipsInScene?.map((c) => c?.id);
      const trackIds = clipsInScene?.map((c) => c?.trackId);

      // Stop clips on the same tracks that are not in this scene
      const clipsToStop = state?.launcherClips.filter(
        (c) =>
          trackIds?.includes(c?.trackId) &&
          !clipIds?.includes(c?.id) &&
          (c?.isPlaying || c?.isQueued),
      );

      const isImmediate = state?.launcherQuantize === "1beat";

      if (isImmediate) {
        return {
          launcherClips: state.launcherClips.map((c) => {
            if (clipIds?.includes(c?.id)) {
              return { ...c, isPlaying: true, isQueued: false };
            }
            if (clipsToStop?.map((cs) => cs?.id).includes(c?.id)) {
              return { ...c, isPlaying: false, isQueued: false };
            }
            return c;
          }),
          activeLauncherClips: [
            ...state?.activeLauncherClips.filter(
              (id) => !clipsToStop?.map((c) => c?.id).includes(id),
            ),
            ...clipIds,
          ],
          queuedLauncherClips: state.queuedLauncherClips.filter(
            (id) => !clipIds?.includes(id),
          ),
        };
      } else {
        return {
          launcherClips: state.launcherClips.map((c) => {
            if (clipIds?.includes(c?.id)) {
              return { ...c, isQueued: true };
            }
            return c;
          }),
          queuedLauncherClips: [
            ...new Set([...state?.queuedLauncherClips, ...clipIds]),
          ],
        };
      }
    }),

  stopAllClips: () =>
    set((state) => ({
      launcherClips: state.launcherClips.map((c) => ({
        ...c,
        isPlaying: false,
        isQueued: false,
      })),
      activeLauncherClips: [],
      queuedLauncherClips: [],
    })),

  setLauncherQuantize: (quantize) => set({ launcherQuantize: quantize }),

  toggleLauncher: () => set((state) => ({ showLauncher: !state?.showLauncher })),

  addLauncherScene: (scene) => {
    const state = get();
    const maxIndex = state?.launcherScenes.reduce(
      (max, s) => Math?.max(max, s?.index),
      -1,
    );
    const newScene: LauncherScene = {
      id: scene.id || `scene-${Date?.now()}`,
      index: scene.index ?? maxIndex + 1,
      name: scene.name || `Scene ${maxIndex + 2}`,
      color: scene.color || "#8b5cf6",
      tempo: scene.tempo,
    };
    set((state) => ({
      launcherScenes: [...state?.launcherScenes, newScene].sort(
        (a, b) => a?.index - b?.index,
      ),
    }));
  },

  removeLauncherScene: (sceneIndex) =>
    set((state) => {
      // Remove all clips in this scene
      const clipsToRemove = state?.launcherClips.filter(
        (c) => c?.slotIndex === sceneIndex,
      );
      const clipIdsToRemove = clipsToRemove?.map((c) => c?.id);

      return {
        launcherScenes: state.launcherScenes
          .filter((s) => s?.index !== sceneIndex)
          .map((s, i) => ({ ...s, index: i })),
        launcherClips: state.launcherClips
          .filter((c) => c?.slotIndex !== sceneIndex)
          .map((c) => ({
            ...c,
            slotIndex: c.slotIndex > sceneIndex ? c?.slotIndex - 1 : c?.slotIndex,
          })),
        activeLauncherClips: state.activeLauncherClips.filter(
          (id) => !clipIdsToRemove?.includes(id),
        ),
        queuedLauncherClips: state.queuedLauncherClips.filter(
          (id) => !clipIdsToRemove?.includes(id),
        ),
      };
    }),

  updateLauncherScene: (sceneId, updates) =>
    set((state) => ({
      launcherScenes: state.launcherScenes.map((s) =>
        s?.id === sceneId ? { ...s, ...updates } : s,
      ),
    })),

  getLauncherClipsForTrack: (trackId) => {
    const state = get();
    return state?.launcherClips.filter((c) => c?.trackId === trackId);
  },

  getLauncherClipAt: (trackId, slotIndex) => {
    const state = get();
    return state?.launcherClips.find(
      (c) => c?.trackId === trackId && c?.slotIndex === slotIndex,
    );
  },

  // Show Page Actions (Live Performance Environment)
  createSetlist: (name) => {
    const newSetlist: Setlist = {
      id: `setlist-${Date?.now()}`,
      name,
      items: [],
      createdAt: Date.now(),
    };
    set((state) => ({
      setlists: [...state?.setlists, newSetlist],
      activeSetlistId: newSetlist.id,
    }));
  },

  deleteSetlist: (id) =>
    set((state) => ({
      setlists: state.setlists.filter((s) => s?.id !== id),
      activeSetlistId:
        state?.activeSetlistId === id ? null : state?.activeSetlistId,
      performanceState:
        state?.performanceState.currentSetlistId === id
          ? {
              ...state?.performanceState,
              currentSetlistId: null,
              isPerforming: false,
            }
          : state?.performanceState,
    })),

  addItemToSetlist: (setlistId, item) =>
    set((state) => ({
      setlists: state.setlists.map((s) => {
        if (s?.id !== setlistId) return s;
        const newItem: SetlistItem = {
          id: item.id || `item-${Date?.now()}`,
          name: item.name || "New Song",
          duration: item.duration || 180,
          bpm: item.bpm || 120,
          key: item.key || "C",
          notes: item.notes,
          audioUrl: item.audioUrl,
          order: item.order ?? s?.items.length,
        };
        return {
          ...s,
          items: [...s?.items, newItem],
        };
      }),
    })),

  removeItemFromSetlist: (setlistId, itemId) =>
    set((state) => ({
      setlists: state.setlists.map((s) => {
        if (s?.id !== setlistId) return s;
        return {
          ...s,
          items: s.items.filter((i) => i?.id !== itemId),
        };
      }),
    })),

  reorderSetlistItems: (setlistId, itemIds) =>
    set((state) => ({
      setlists: state.setlists.map((s) => {
        if (s?.id !== setlistId) return s;
        const orderedItems = itemIds
          .map((id, index) => {
            const item = s?.items.find((i) => i?.id === id);
            return item ? { ...item, order: index } : null;
          })
          .filter((i): i is SetlistItem => i !== null);
        return {
          ...s,
          items: orderedItems,
        };
      }),
    })),

  setActiveSetlist: (id) => set({ activeSetlistId: id }),

  startPerformance: () =>
    set((state) => ({
      performanceState: {
        currentSetlistId: state.activeSetlistId,
        currentItemIndex: 0,
        isPerforming: true,
        elapsedTime: 0,
      },
    })),

  stopPerformance: () =>
    set((state) => ({
      performanceState: {
        ...state?.performanceState,
        isPerforming: false,
      },
    })),

  nextItem: () =>
    set((state) => {
      const setlist = state?.setlists.find(
        (s) => s?.id === state?.performanceState.currentSetlistId,
      );
      if (!setlist) return {};
      const nextIndex = Math?.min(
        state?.performanceState.currentItemIndex + 1,
        setlist?.items.length - 1,
      );
      return {
        performanceState: {
          ...state?.performanceState,
          currentItemIndex: nextIndex,
        },
      };
    }),

  previousItem: () =>
    set((state) => ({
      performanceState: {
        ...state?.performanceState,
        currentItemIndex: Math.max(
          0,
          state?.performanceState.currentItemIndex - 1,
        ),
      },
    })),

  goToItem: (index) =>
    set((state) => {
      const setlist = state?.setlists.find(
        (s) => s?.id === state?.performanceState.currentSetlistId,
      );
      if (!setlist) return {};
      const clampedIndex = Math?.max(
        0,
        Math?.min(index, setlist?.items.length - 1),
      );
      return {
        performanceState: {
          ...state?.performanceState,
          currentItemIndex: clampedIndex,
        },
      };
    }),

  toggleShowPage: () => set((state) => ({ showShowPage: !state?.showShowPage })),

  updatePerformanceElapsedTime: (time) =>
    set((state) => ({
      performanceState: {
        ...state?.performanceState,
        elapsedTime: time,
      },
    })),

  getActiveSetlist: () => {
    const state = get();
    return state?.setlists.find((s) => s?.id === state?.activeSetlistId) || null;
  },

  getCurrentSetlistItem: () => {
    const state = get();
    const setlist = state?.setlists.find(
      (s) => s?.id === state?.performanceState.currentSetlistId,
    );
    if (!setlist) return null;
    return setlist?.items[state?.performanceState.currentItemIndex] || null;
  },

  getNextSetlistItem: () => {
    const state = get();
    const setlist = state?.setlists.find(
      (s) => s?.id === state?.performanceState.currentSetlistId,
    );
    if (!setlist) return null;
    return setlist?.items[state?.performanceState.currentItemIndex + 1] || null;
  },
}));
