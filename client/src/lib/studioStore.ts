import { create } from 'zustand';

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
  format: 'mp4' | 'mov' | 'webm' | 'avi' | 'mkv';
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
  | 'volume'
  | 'fx1' | 'fx2' | 'fx3' | 'fx4'
  | 'cue1' | 'cue2' | 'cue3' | 'cue4'
  | 'bus1' | 'bus2' | 'bus3' | 'bus4' | 'bus5' | 'bus6' | 'bus7' | 'bus8';

// Spatial Audio Types
export type SpeakerConfiguration = 'stereo' | '5.1' | '7.1' | '9.1.6';
export type ObjectType = 'bed' | 'object';

export interface SpatialObject {
  id: string;
  name: string;
  type: ObjectType;
  azimuth: number;
  elevation: number;
  distance: number;
  width: number;
  lfeLevel: number;
  heightLayer: 'floor' | 'mid' | 'ceiling';
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
  fontSize: 'small' | 'medium' | 'large' | 'xlarge';
  fontFamily: string;
  textColor: string;
  highlightColor: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  lineSpacing: number;
  showWordHighlight: boolean;
  teleprompterMode: boolean;
}

// Autoscroll modes matching Studio One Pro 7.2+
export type AutoscrollMode = 'off' | 'turnover' | 'continuous-centered' | 'continuous-left';

// Professional DAW Types
export type RecordingMode = 'replace' | 'overdub' | 'stacked';
export type AutomationMode = 'read' | 'write' | 'touch' | 'latch' | 'off';
export type EditTool = 'pointer' | 'range' | 'split' | 'slip' | 'draw' | 'pencil' | 'eraser';

export interface StudioState {
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

  // Browser State
  browserVisible: boolean;
  browserSearchQuery: string;
  browserActiveTab: 'pool' | 'presets' | 'samples' | 'plugins' | 'files';
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
  crossfadeCurve: 'linear' | 'equal-power' | 'exponential';

  // Infinite Timeline State (Studio One style)
  projectDuration: number; // Dynamic duration in seconds
  projectEndMarker: number; // Export end marker (non-restrictive)
  minProjectDuration: number; // Minimum duration before expansion
  autoExpandEnabled: boolean; // Auto-expand timeline when playhead exceeds

  // Smart Re-engagement (Studio One 7.2 style)
  autoscrollPaused: boolean; // True when user manually scrolled during playback
  lastManualScrollTime: number; // Timestamp of last manual scroll

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

  // Browser Actions
  toggleBrowser: () => void;
  setBrowserSearchQuery: (query: string) => void;
  setBrowserActiveTab: (tab: 'pool' | 'presets' | 'samples' | 'plugins' | 'files') => void;
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
  updateLyricsDisplaySettings: (updates: Partial<LyricsDisplaySettings>) => void;
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
  setCrossfadeCurve: (curve: 'linear' | 'equal-power' | 'exponential') => void;

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
}

export const useStudioStore = create<StudioState>((set, get) => ({
  // Initial State
  currentTime: 0,
  isPlaying: false,
  isRecording: false,
  followPlayhead: true,
  autoscrollMode: 'turnover' as AutoscrollMode,

  // Transport State
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 8,
  tempo: 120,
  timeSignature: '4/4',
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

  // Browser State
  browserVisible: true,
  browserSearchQuery: '',
  browserActiveTab: 'pool',
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
  speakerConfig: '7.1',
  binauralEnabled: false,

  // Lyrics State
  lyrics: [],
  selectedLyricId: null,
  lyricsDisplayVisible: false,
  lyricsTrackVisible: true,
  lyricsDisplaySettings: {
    fontSize: 'large' as const,
    fontFamily: 'Inter, sans-serif',
    textColor: '#ffffff',
    highlightColor: '#fbbf24',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    textAlign: 'center' as const,
    lineSpacing: 1.5,
    showWordHighlight: true,
    teleprompterMode: false,
  },

  // Professional Recording State
  recordingMode: 'replace',
  preRollBars: 0,
  countInBars: 0,
  returnToStartOnStop: true,
  inputMonitoring: false,

  // Editing Tools
  currentTool: 'pointer',
  rangeSelectionStart: null,
  rangeSelectionEnd: null,

  // Automation State
  automationMode: 'read',
  automationLanesVisible: false,
  selectedAutomationParameter: null,

  // Grid/Snap Settings
  gridVisible: true,
  gridDivision: 4,

  // Crossfade Settings
  crossfadeLength: 0.01,
  crossfadeCurve: 'equal-power',

  // Infinite Timeline State (Studio One style - default 5 minutes)
  projectDuration: 300, // 5 minutes in seconds
  projectEndMarker: 300,
  minProjectDuration: 60, // Minimum 1 minute
  autoExpandEnabled: true,

  // Smart Re-engagement State (Studio One 7.2 style)
  autoscrollPaused: false,
  lastManualScrollTime: 0,

  // Playhead Actions
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  toggleFollowPlayhead: () => set((state) => ({ followPlayhead: !state.followPlayhead })),
  setAutoscrollMode: (mode) => set({ autoscrollMode: mode, followPlayhead: mode !== 'off' }),
  cycleAutoscrollMode: () => set((state) => {
    const modes: AutoscrollMode[] = ['off', 'turnover', 'continuous-centered', 'continuous-left'];
    const currentIndex = modes.indexOf(state.autoscrollMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    return { autoscrollMode: nextMode, followPlayhead: nextMode !== 'off' };
  }),

  // Transport Actions
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setLoopStart: (time) => set({ loopStart: time }),
  setLoopEnd: (time) => set({ loopEnd: time }),
  setTempo: (tempo) => set({ tempo: Math.max(40, Math.min(240, tempo)) }),
  setTimeSignature: (signature) => set({ timeSignature: signature }),
  setMetronomeEnabled: (enabled) => set({ metronomeEnabled: enabled }),

  // View Actions
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setScrollPosition: (position) => set({ scrollPosition: Math.max(0, position) }),
  toggleSnap: () => set((state) => ({ snapEnabled: !state.snapEnabled })),
  setSnapResolution: (resolution) => set({ snapResolution: resolution }),

  // Selection Actions
  selectTrack: (trackId, multi = false) =>
    set((state) => ({
      selectedTrackIds: multi
        ? state.selectedTrackIds.includes(trackId)
          ? state.selectedTrackIds.filter((id) => id !== trackId)
          : [...state.selectedTrackIds, trackId]
        : [trackId],
      selectedTrackId: multi ? state.selectedTrackId : trackId,
    })),

  selectClip: (clipId, multi = false) =>
    set((state) => ({
      selectedClipIds: multi
        ? state.selectedClipIds.includes(clipId)
          ? state.selectedClipIds.filter((id) => id !== clipId)
          : [...state.selectedClipIds, clipId]
        : [clipId],
      selectedClipId: multi ? state.selectedClipId : clipId,
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

  // Browser Actions
  toggleBrowser: () => set((state) => ({ browserVisible: !state.browserVisible })),
  setBrowserSearchQuery: (query) => set({ browserSearchQuery: query }),
  setBrowserActiveTab: (tab) => set({ browserActiveTab: tab }),
  setBrowserSelectedItem: (itemId) => set({ browserSelectedItem: itemId }),

  // Inspector Actions
  toggleInspector: () => set((state) => ({ inspectorVisible: !state.inspectorVisible })),

  // Routing Matrix Actions
  toggleRoutingMatrix: () =>
    set((state) => ({ routingMatrixVisible: !state.routingMatrixVisible })),

  // Marker Actions
  addMarker: (marker) =>
    set((state) => ({
      markers: [...state.markers, marker].sort((a, b) => a.time - b.time),
    })),

  updateMarker: (id, updates) =>
    set((state) => ({
      markers: state.markers
        .map((m) => (m.id === id ? { ...m, ...updates } : m))
        .sort((a, b) => a.time - b.time),
    })),

  deleteMarker: (id) =>
    set((state) => ({
      markers: state.markers.filter((m) => m.id !== id),
      selectedMarkerId: state.selectedMarkerId === id ? null : state.selectedMarkerId,
    })),

  // Audio Device Actions
  setSelectedInputDevice: (deviceId) => set({ selectedInputDevice: deviceId }),
  setSelectedOutputDevice: (deviceId) => set({ selectedOutputDevice: deviceId }),
  setBufferSize: (size) => set({ bufferSize: size }),

  // Metronome Actions
  setMetronomeVolume: (volume) => set({ metronomeVolume: Math.max(0, Math.min(1, volume)) }),

  // Punch Recording Actions
  setPunchMode: (enabled) => set({ punchMode: enabled }),
  setPunchIn: (time) => set({ punchIn: time }),
  setPunchOut: (time) => set({ punchOut: time }),

  // Take Comping Actions
  addTake: (trackId, take) =>
    set((state) => ({
      takesByTrack: {
        ...state.takesByTrack,
        [trackId]: [...(state.takesByTrack[trackId] || []), take],
      },
    })),
  updateTake: (trackId, takeId, updates) =>
    set((state) => ({
      takesByTrack: {
        ...state.takesByTrack,
        [trackId]: (state.takesByTrack[trackId] || []).map((t) =>
          t.id === takeId ? { ...t, ...updates } : t
        ),
      },
    })),
  deleteTake: (trackId, takeId) =>
    set((state) => ({
      takesByTrack: {
        ...state.takesByTrack,
        [trackId]: (state.takesByTrack[trackId] || []).filter((t) => t.id !== takeId),
      },
    })),

  // Chord Track Actions
  addChord: (chord) =>
    set((state) => ({
      chords: [...state.chords, chord].sort((a, b) => a.startTime - b.startTime),
    })),

  updateChord: (id, updates) =>
    set((state) => ({
      chords: state.chords
        .map((c) => (c.id === id ? { ...c, ...updates } : c))
        .sort((a, b) => a.startTime - b.startTime),
    })),

  deleteChord: (id) =>
    set((state) => ({
      chords: state.chords.filter((c) => c.id !== id),
    })),

  transposeChords: (semitones) =>
    set((state) => {
      const CHORD_ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      return {
        chords: state.chords.map((chord) => {
          const rootIndex = CHORD_ROOTS.indexOf(chord.root);
          if (rootIndex === -1) return chord;
          const newRootIndex = (rootIndex + semitones + 12) % 12;
          const newRoot = CHORD_ROOTS[newRootIndex];
          let newBass = chord.bass;
          if (chord.bass) {
            const bassIndex = CHORD_ROOTS.indexOf(chord.bass);
            if (bassIndex !== -1) {
              newBass = CHORD_ROOTS[(bassIndex + semitones + 12) % 12];
            }
          }
          return {
            ...chord,
            root: newRoot,
            name: `${newRoot}${chord.quality}${newBass ? `/${newBass}` : ''}`,
            bass: newBass,
          };
        }),
      };
    }),

  // Video Track Actions
  addVideoClip: (clip) =>
    set((state) => ({
      videoClips: [...state.videoClips, clip].sort((a, b) => a.startTime - b.startTime),
    })),

  updateVideoClip: (id, updates) =>
    set((state) => ({
      videoClips: state.videoClips
        .map((c) => (c.id === id ? { ...c, ...updates } : c))
        .sort((a, b) => a.startTime - b.startTime),
    })),

  deleteVideoClip: (id) =>
    set((state) => ({
      videoClips: state.videoClips.filter((c) => c.id !== id),
    })),

  // Fader Flip Actions
  setFaderMode: (channelId, mode) =>
    set((state) => ({
      faderModes: {
        ...state.faderModes,
        [channelId]: mode,
      },
    })),

  getFaderMode: (channelId) => {
    return get().faderModes[channelId] || 'volume';
  },

  // Spatial Audio Actions
  addSpatialObject: (object) =>
    set((state) => ({
      spatialObjects: [...state.spatialObjects, object],
    })),

  updateSpatialObject: (id, updates) =>
    set((state) => ({
      spatialObjects: state.spatialObjects.map((o) =>
        o.id === id ? { ...o, ...updates } : o
      ),
    })),

  deleteSpatialObject: (id) =>
    set((state) => ({
      spatialObjects: state.spatialObjects.filter((o) => o.id !== id),
    })),

  setSpeakerConfig: (config) => set({ speakerConfig: config }),

  setBinauralEnabled: (enabled) => set({ binauralEnabled: enabled }),

  // Lyrics Actions
  addLyric: (line) =>
    set((state) => ({
      lyrics: [...state.lyrics, line].sort((a, b) => a.startTime - b.startTime),
    })),

  updateLyric: (id, updates) =>
    set((state) => ({
      lyrics: state.lyrics
        .map((l) => (l.id === id ? { ...l, ...updates } : l))
        .sort((a, b) => a.startTime - b.startTime),
    })),

  deleteLyric: (id) =>
    set((state) => ({
      lyrics: state.lyrics.filter((l) => l.id !== id),
    })),

  selectLyric: (id) => set({ selectedLyricId: id }),

  snapLyricToPlayhead: (id) =>
    set((state) => {
      const currentTime = state.currentTime;
      const lyric = state.lyrics.find((l) => l.id === id);
      if (!lyric) return state;
      const duration = lyric.endTime - lyric.startTime;
      return {
        lyrics: state.lyrics
          .map((l) =>
            l.id === id
              ? { ...l, startTime: currentTime, endTime: currentTime + duration }
              : l
          )
          .sort((a, b) => a.startTime - b.startTime),
      };
    }),

  toggleLyricsDisplay: () =>
    set((state) => ({ lyricsDisplayVisible: !state.lyricsDisplayVisible })),

  toggleLyricsTrack: () =>
    set((state) => ({ lyricsTrackVisible: !state.lyricsTrackVisible })),

  updateLyricsDisplaySettings: (updates) =>
    set((state) => ({
      lyricsDisplaySettings: { ...state.lyricsDisplaySettings, ...updates },
    })),

  importLyrics: (text) => {
    const lines = text.split('\n').filter((line) => line.trim());
    const newLyrics: LyricLine[] = lines.map((line, index) => ({
      id: `lyric-${Date.now()}-${index}`,
      text: line.trim(),
      words: line.trim().split(/\s+/).map((word, wordIndex) => ({
        id: `word-${Date.now()}-${index}-${wordIndex}`,
        text: word,
        startTime: index * 4,
        endTime: index * 4 + 2,
      })),
      startTime: index * 4,
      endTime: (index + 1) * 4,
    }));
    set((state) => ({
      lyrics: [...state.lyrics, ...newLyrics].sort((a, b) => a.startTime - b.startTime),
    }));
  },

  getCurrentLyricLine: () => {
    const state = get();
    const currentTime = state.currentTime;
    return state.lyrics.find(
      (line) => currentTime >= line.startTime && currentTime < line.endTime
    ) || null;
  },

  getCurrentLyricWord: () => {
    const state = get();
    const currentTime = state.currentTime;
    const currentLine = state.lyrics.find(
      (line) => currentTime >= line.startTime && currentTime < line.endTime
    );
    if (!currentLine) return null;
    return currentLine.words.find(
      (word) => currentTime >= word.startTime && currentTime < word.endTime
    ) || null;
  },

  // Recording Mode Actions
  setRecordingMode: (mode) => set({ recordingMode: mode }),
  setPreRollBars: (bars) => set({ preRollBars: Math.max(0, Math.min(8, bars)) }),
  setCountInBars: (bars) => set({ countInBars: Math.max(0, Math.min(8, bars)) }),
  setReturnToStartOnStop: (enabled) => set({ returnToStartOnStop: enabled }),
  setInputMonitoring: (enabled) => set({ inputMonitoring: enabled }),

  // Edit Tool Actions
  setCurrentTool: (tool) => set({ currentTool: tool }),
  setRangeSelection: (start, end) => set({ rangeSelectionStart: start, rangeSelectionEnd: end }),
  clearRangeSelection: () => set({ rangeSelectionStart: null, rangeSelectionEnd: null }),

  // Automation Actions
  setAutomationMode: (mode) => set({ automationMode: mode }),
  toggleAutomationLanes: () => set((state) => ({ automationLanesVisible: !state.automationLanesVisible })),
  setSelectedAutomationParameter: (param) => set({ selectedAutomationParameter: param }),

  // Grid Actions
  toggleGridVisible: () => set((state) => ({ gridVisible: !state.gridVisible })),
  setGridDivision: (division) => set({ gridDivision: division }),

  // Crossfade Actions
  setCrossfadeLength: (length) => set({ crossfadeLength: Math.max(0.001, Math.min(5, length)) }),
  setCrossfadeCurve: (curve) => set({ crossfadeCurve: curve }),

  // Infinite Timeline Actions (Studio One style)
  setProjectDuration: (duration) => set((state) => ({ 
    projectDuration: Math.max(state.minProjectDuration, duration) 
  })),
  
  setProjectEndMarker: (time) => set({ projectEndMarker: Math.max(0, time) }),
  
  // Dynamic expansion: auto-allocate more time when playhead nears end
  expandTimelineIfNeeded: (playheadTime) => set((state) => {
    if (!state.autoExpandEnabled) return {};
    
    // Expand when playhead is within 10% of the end
    const threshold = state.projectDuration * 0.9;
    if (playheadTime >= threshold) {
      // Expand by 50% each time
      const newDuration = state.projectDuration * 1.5;
      return { projectDuration: newDuration };
    }
    return {};
  }),
  
  // Fit timeline view to content (like "Fit Timeline to Contents" command)
  fitTimelineToContents: (contentEndTime) => set((state) => {
    // Add 10% padding after content
    const paddedDuration = contentEndTime * 1.1;
    const newDuration = Math.max(state.minProjectDuration, paddedDuration);
    return { 
      projectDuration: newDuration,
      projectEndMarker: contentEndTime 
    };
  }),
  
  setAutoExpandEnabled: (enabled) => set({ autoExpandEnabled: enabled }),

  // Smart Re-engagement Actions (Studio One 7.2 style)
  pauseAutoscroll: () => set({ 
    autoscrollPaused: true, 
    lastManualScrollTime: Date.now() 
  }),
  
  resumeAutoscroll: () => set({ 
    autoscrollPaused: false 
  }),
  
  isAutoscrollActive: () => {
    const state = get();
    return state.autoscrollMode !== 'off' && !state.autoscrollPaused;
  },
}));
