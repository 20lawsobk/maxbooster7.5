import { create } from 'zustand';

interface AudioPreviewState {
  audioContext: AudioContext | null;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  currentBuffer: AudioBuffer | null;
  isPlaying: boolean;
  currentBeatId: string | null;
  currentTime: number;
  duration: number;
  playbackRate: number;
  pitchShift: number;
  volume: number;
  originalBpm: number;
  targetBpm: number;
  originalKey: string;
  targetKey: string;
  isLoading: boolean;
  error: string | null;
}

interface AudioPreviewActions {
  initializeContext: () => Promise<AudioContext>;
  loadBeat: (beatId: string, audioUrl: string, originalBpm?: number, originalKey?: string) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setPlaybackRate: (rate: number) => void;
  setPitchShift: (semitones: number) => void;
  setVolume: (volume: number) => void;
  setTargetBpm: (bpm: number) => void;
  setTargetKey: (key: string) => void;
  cleanup: () => void;
}

const MUSICAL_KEYS = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'
];

const KEY_TO_SEMITONE: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
  'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
  'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
};

function parseKey(key: string): { note: string; mode: 'major' | 'minor' } {
  const normalized = key.trim();
  const isMinor = normalized.toLowerCase().includes('m') && !normalized.toLowerCase().includes('maj');
  const note = normalized.replace(/m$|min$|minor$|maj$|major$/i, '').trim();
  return { note, mode: isMinor ? 'minor' : 'major' };
}

function getSemitonesBetweenKeys(fromKey: string, toKey: string): number {
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  
  const fromSemitone = KEY_TO_SEMITONE[from.note] ?? 0;
  const toSemitone = KEY_TO_SEMITONE[to.note] ?? 0;
  
  let diff = toSemitone - fromSemitone;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  
  return diff;
}

export const useAudioPreviewStore = create<AudioPreviewState & AudioPreviewActions>((set, get) => ({
  audioContext: null,
  sourceNode: null,
  gainNode: null,
  currentBuffer: null,
  isPlaying: false,
  currentBeatId: null,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  pitchShift: 0,
  volume: 0.8,
  originalBpm: 120,
  targetBpm: 120,
  originalKey: 'C',
  targetKey: 'C',
  isLoading: false,
  error: null,

  initializeContext: async () => {
    let { audioContext } = get();
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const gainNode = audioContext.createGain();
      gainNode.connect(audioContext.destination);
      gainNode.gain.value = get().volume;
      set({ audioContext, gainNode });
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    return audioContext;
  },

  loadBeat: async (beatId: string, audioUrl: string, originalBpm = 120, originalKey = 'C') => {
    const state = get();
    
    if (state.currentBeatId === beatId && state.currentBuffer) {
      return;
    }
    
    state.stop();
    set({ isLoading: true, error: null, currentBeatId: beatId });
    
    try {
      const audioContext = await state.initializeContext();
      
      const response = await fetch(audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to load audio: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      set({
        currentBuffer: audioBuffer,
        duration: audioBuffer.duration,
        originalBpm,
        targetBpm: originalBpm,
        originalKey,
        targetKey: originalKey,
        playbackRate: 1.0,
        pitchShift: 0,
        isLoading: false,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load audio',
      });
    }
  },

  play: () => {
    const { audioContext, currentBuffer, gainNode, isPlaying, playbackRate } = get();
    
    if (!audioContext || !currentBuffer || !gainNode || isPlaying) {
      return;
    }
    
    const sourceNode = audioContext.createBufferSource();
    sourceNode.buffer = currentBuffer;
    sourceNode.playbackRate.value = playbackRate;
    sourceNode.connect(gainNode);
    
    sourceNode.onended = () => {
      set({ isPlaying: false, sourceNode: null, currentTime: 0 });
    };
    
    sourceNode.start(0, get().currentTime);
    set({ sourceNode, isPlaying: true });
  },

  pause: () => {
    const { sourceNode, audioContext, isPlaying } = get();
    
    if (!sourceNode || !audioContext || !isPlaying) {
      return;
    }
    
    sourceNode.stop();
    set({ isPlaying: false, sourceNode: null });
  },

  stop: () => {
    const { sourceNode, isPlaying } = get();
    
    if (sourceNode && isPlaying) {
      try {
        sourceNode.stop();
      } catch (e) {
      }
    }
    
    set({ isPlaying: false, sourceNode: null, currentTime: 0 });
  },

  seek: (time: number) => {
    const { isPlaying, duration } = get();
    const clampedTime = Math.max(0, Math.min(time, duration));
    
    if (isPlaying) {
      get().pause();
      set({ currentTime: clampedTime });
      get().play();
    } else {
      set({ currentTime: clampedTime });
    }
  },

  setPlaybackRate: (rate: number) => {
    const { sourceNode, isPlaying } = get();
    const clampedRate = Math.max(0.5, Math.min(2.0, rate));
    
    if (sourceNode && isPlaying) {
      sourceNode.playbackRate.value = clampedRate;
    }
    
    set({ playbackRate: clampedRate });
  },

  setPitchShift: (semitones: number) => {
    const clampedPitch = Math.max(-12, Math.min(12, semitones));
    const pitchRate = Math.pow(2, clampedPitch / 12);
    
    set({ pitchShift: clampedPitch });
    get().setPlaybackRate(pitchRate);
  },

  setVolume: (volume: number) => {
    const { gainNode } = get();
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    if (gainNode) {
      gainNode.gain.value = clampedVolume;
    }
    
    set({ volume: clampedVolume });
  },

  setTargetBpm: (bpm: number) => {
    const { originalBpm } = get();
    const clampedBpm = Math.max(60, Math.min(200, bpm));
    const rate = clampedBpm / originalBpm;
    
    set({ targetBpm: clampedBpm });
    get().setPlaybackRate(rate);
  },

  setTargetKey: (key: string) => {
    const { originalKey } = get();
    const semitones = getSemitonesBetweenKeys(originalKey, key);
    
    set({ targetKey: key });
    get().setPitchShift(semitones);
  },

  cleanup: () => {
    const { sourceNode, audioContext } = get();
    
    if (sourceNode) {
      try {
        sourceNode.stop();
      } catch (e) {
      }
    }
    
    if (audioContext) {
      audioContext.close();
    }
    
    set({
      audioContext: null,
      sourceNode: null,
      gainNode: null,
      currentBuffer: null,
      isPlaying: false,
      currentBeatId: null,
      currentTime: 0,
      duration: 0,
    });
  },
}));

export { MUSICAL_KEYS, getSemitonesBetweenKeys, parseKey };
