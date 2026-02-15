export type PresetCategory = 
  | 'vocals'
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'synth'
  | 'keys'
  | 'strings'
  | 'fx'
  | 'bus'
  | 'custom';

export interface PresetEffect {
  id: string;
  name: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'limiter' | 'gate' | 'deesser' | 'saturation' | 'chorus' | 'phaser' | 'flanger' | 'distortion';
  bypass: boolean;
  preset?: string;
  parameters?: Record<string, number>;
}

export interface PresetSend {
  busId: string;
  busName: string;
  level: number;
  preFader: boolean;
}

export interface TrackPresetData {
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  effects: PresetEffect[];
  sends: PresetSend[];
  inputAssignment?: string;
  outputBus: string;
  delayCompensation: number;
  inputMonitoring: boolean;
  recordEnabled: boolean;
  phase: boolean;
  gain: number;
}

export interface TrackPreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  icon: string;
  color: string;
  data: TrackPresetData;
  isFactory: boolean;
  isUserPreset: boolean;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

export interface PresetUndoState {
  trackId: string;
  previousData: Partial<TrackPresetData>;
  presetId: string;
  appliedAt: Date;
}

const PRESET_COLORS = {
  vocals: '#4ade80',
  drums: '#f87171',
  bass: '#60a5fa',
  guitar: '#fbbf24',
  synth: '#a78bfa',
  keys: '#fb923c',
  strings: '#facc15',
  fx: '#14b8a6',
  bus: '#8b5cf6',
  custom: '#94a3b8',
};

export const CATEGORY_INFO: Record<PresetCategory, { name: string; icon: string; color: string }> = {
  vocals: { name: 'Vocals', icon: 'Mic', color: PRESET_COLORS.vocals },
  drums: { name: 'Drums', icon: 'Drum', color: PRESET_COLORS.drums },
  bass: { name: 'Bass', icon: 'Speaker', color: PRESET_COLORS.bass },
  guitar: { name: 'Guitar', icon: 'Guitar', color: PRESET_COLORS.guitar },
  synth: { name: 'Synth', icon: 'Waves', color: PRESET_COLORS.synth },
  keys: { name: 'Keys', icon: 'Piano', color: PRESET_COLORS.keys },
  strings: { name: 'Strings', icon: 'Music', color: PRESET_COLORS.strings },
  fx: { name: 'FX', icon: 'Sparkles', color: PRESET_COLORS.fx },
  bus: { name: 'Bus', icon: 'Layers', color: PRESET_COLORS.bus },
  custom: { name: 'Custom', icon: 'Settings', color: PRESET_COLORS.custom },
};

export const FACTORY_PRESETS: TrackPreset[] = [
  {
    id: 'lead-vocal',
    name: 'Lead Vocal',
    description: 'Professional lead vocal chain with compression, EQ, and de-esser for clear, present vocals.',
    category: 'vocals',
    icon: 'Mic',
    color: PRESET_COLORS.vocals,
    data: {
      name: 'Lead Vocal',
      trackType: 'audio',
      color: PRESET_COLORS.vocals,
      volume: 0.75,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'lv-gate', name: 'Noise Gate', type: 'gate', bypass: false, parameters: { threshold: -40, ratio: 10, attack: 0.1, release: 100 } },
        { id: 'lv-comp', name: 'Vocal Compressor', type: 'compressor', bypass: false, preset: 'vocal-smooth', parameters: { threshold: -18, ratio: 4, attack: 10, release: 100 } },
        { id: 'lv-eq', name: 'Vocal EQ', type: 'eq', bypass: false, parameters: { lowCut: 80, lowGain: 0, midGain: 2, highGain: 3, midFrequency: 3000 } },
        { id: 'lv-deesser', name: 'De-Esser', type: 'deesser', bypass: false, parameters: { frequency: 6000, threshold: -20, range: 6 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.2, preFader: false },
        { busId: 'delay-bus', busName: 'Delay', level: 0.1, preFader: false },
      ],
      outputBus: 'vocal-bus',
      delayCompensation: 0,
      inputMonitoring: true,
      recordEnabled: true,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['vocals', 'lead', 'recording', 'compression', 'eq'],
  },
  {
    id: 'backing-vocal',
    name: 'Backing Vocal',
    description: 'Backing vocal preset with tighter compression and scooped mids for sitting behind lead.',
    category: 'vocals',
    icon: 'Mic',
    color: PRESET_COLORS.vocals,
    data: {
      name: 'Backing Vocal',
      trackType: 'audio',
      color: PRESET_COLORS.vocals,
      volume: 0.6,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'bv-comp', name: 'Tight Compressor', type: 'compressor', bypass: false, parameters: { threshold: -20, ratio: 6, attack: 5, release: 80 } },
        { id: 'bv-eq', name: 'Backing EQ', type: 'eq', bypass: false, parameters: { lowCut: 120, lowGain: -2, midGain: -3, highGain: 2, midFrequency: 2500 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.35, preFader: false },
      ],
      outputBus: 'vocal-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: true,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['vocals', 'backing', 'harmony', 'compression'],
  },
  {
    id: 'vocal-double',
    name: 'Vocal Double',
    description: 'Wide stereo vocal double with chorus effect for thickness.',
    category: 'vocals',
    icon: 'Mic',
    color: PRESET_COLORS.vocals,
    data: {
      name: 'Vocal Double',
      trackType: 'audio',
      color: PRESET_COLORS.vocals,
      volume: 0.55,
      pan: 0.4,
      mute: false,
      solo: false,
      effects: [
        { id: 'vd-comp', name: 'Light Compression', type: 'compressor', bypass: false, parameters: { threshold: -15, ratio: 3, attack: 15, release: 120 } },
        { id: 'vd-chorus', name: 'Stereo Chorus', type: 'chorus', bypass: false, parameters: { rate: 0.8, depth: 30, mix: 25 } },
        { id: 'vd-eq', name: 'High Pass EQ', type: 'eq', bypass: false, parameters: { lowCut: 150, midGain: 0, highGain: 1 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.4, preFader: false },
      ],
      outputBus: 'vocal-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['vocals', 'double', 'chorus', 'wide'],
  },
  {
    id: 'kick-drum',
    name: 'Kick Drum',
    description: 'Punchy kick drum with sub boost and attack enhancement.',
    category: 'drums',
    icon: 'Drum',
    color: PRESET_COLORS.drums,
    data: {
      name: 'Kick',
      trackType: 'audio',
      color: PRESET_COLORS.drums,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'kick-eq', name: 'Kick EQ', type: 'eq', bypass: false, parameters: { lowBoost: 60, lowGain: 4, midGain: -3, midFrequency: 400, highGain: 2, highFrequency: 4000 } },
        { id: 'kick-comp', name: 'Punch Compressor', type: 'compressor', bypass: false, parameters: { threshold: -10, ratio: 4, attack: 5, release: 50 } },
        { id: 'kick-sat', name: 'Saturation', type: 'saturation', bypass: false, parameters: { drive: 2, mix: 30 } },
      ],
      sends: [],
      outputBus: 'drum-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['drums', 'kick', 'punch', 'sub', 'low-end'],
  },
  {
    id: 'snare-drum',
    name: 'Snare Drum',
    description: 'Crisp snare with body and crack balanced perfectly.',
    category: 'drums',
    icon: 'Drum',
    color: PRESET_COLORS.drums,
    data: {
      name: 'Snare',
      trackType: 'audio',
      color: PRESET_COLORS.drums,
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'snare-gate', name: 'Snare Gate', type: 'gate', bypass: false, parameters: { threshold: -30, attack: 0.5, release: 150 } },
        { id: 'snare-eq', name: 'Snare EQ', type: 'eq', bypass: false, parameters: { lowGain: 2, midGain: -2, midFrequency: 400, highGain: 4, highFrequency: 5000 } },
        { id: 'snare-comp', name: 'Snare Compressor', type: 'compressor', bypass: false, parameters: { threshold: -15, ratio: 3, attack: 3, release: 80 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.15, preFader: false },
      ],
      outputBus: 'drum-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['drums', 'snare', 'crisp', 'crack'],
  },
  {
    id: 'hi-hats',
    name: 'Hi-Hats',
    description: 'Clean hi-hat channel with high-pass filter and subtle compression.',
    category: 'drums',
    icon: 'Drum',
    color: PRESET_COLORS.drums,
    data: {
      name: 'Hi-Hats',
      trackType: 'audio',
      color: PRESET_COLORS.drums,
      volume: 0.65,
      pan: 0.15,
      mute: false,
      solo: false,
      effects: [
        { id: 'hh-eq', name: 'Hi-Hat EQ', type: 'eq', bypass: false, parameters: { lowCut: 300, midGain: -1, highGain: 2, highFrequency: 10000 } },
        { id: 'hh-comp', name: 'Gentle Compression', type: 'compressor', bypass: false, parameters: { threshold: -12, ratio: 2, attack: 10, release: 60 } },
      ],
      sends: [],
      outputBus: 'drum-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['drums', 'hi-hats', 'cymbals', 'clean'],
  },
  {
    id: 'overhead-mics',
    name: 'Overhead Mics',
    description: 'Drum overhead preset with wide stereo image and room character.',
    category: 'drums',
    icon: 'Drum',
    color: PRESET_COLORS.drums,
    data: {
      name: 'Overheads',
      trackType: 'audio',
      color: PRESET_COLORS.drums,
      volume: 0.7,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'oh-eq', name: 'Overhead EQ', type: 'eq', bypass: false, parameters: { lowCut: 200, lowGain: -3, midGain: 0, highGain: 2 } },
        { id: 'oh-comp', name: 'Room Compression', type: 'compressor', bypass: false, parameters: { threshold: -20, ratio: 2.5, attack: 20, release: 150 } },
      ],
      sends: [],
      outputBus: 'drum-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['drums', 'overheads', 'stereo', 'room'],
  },
  {
    id: 'electric-bass',
    name: 'Electric Bass',
    description: 'Full-bodied electric bass with warmth and definition.',
    category: 'bass',
    icon: 'Speaker',
    color: PRESET_COLORS.bass,
    data: {
      name: 'Bass',
      trackType: 'audio',
      color: PRESET_COLORS.bass,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'bass-eq', name: 'Bass EQ', type: 'eq', bypass: false, parameters: { lowBoost: 80, lowGain: 3, midGain: -2, midFrequency: 500, highGain: 1 } },
        { id: 'bass-comp', name: 'Bass Compressor', type: 'compressor', bypass: false, parameters: { threshold: -14, ratio: 4, attack: 10, release: 100 } },
        { id: 'bass-sat', name: 'Tube Warmth', type: 'saturation', bypass: false, parameters: { drive: 1.5, mix: 25 } },
      ],
      sends: [],
      outputBus: 'bass-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['bass', 'electric', 'warm', 'punchy'],
  },
  {
    id: '808-bass',
    name: '808 Bass',
    description: 'Deep 808 sub bass with saturation for presence on smaller speakers.',
    category: 'bass',
    icon: 'Speaker',
    color: PRESET_COLORS.bass,
    data: {
      name: '808',
      trackType: 'instrument',
      color: PRESET_COLORS.bass,
      volume: 0.9,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: '808-sat', name: '808 Saturation', type: 'saturation', bypass: false, parameters: { drive: 3, mix: 40 } },
        { id: '808-eq', name: '808 EQ', type: 'eq', bypass: false, parameters: { lowBoost: 50, lowGain: 2, lowCut: 30, midGain: 0 } },
        { id: '808-lim', name: '808 Limiter', type: 'limiter', bypass: false, parameters: { ceiling: -1, release: 50 } },
      ],
      sends: [],
      outputBus: 'bass-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['bass', '808', 'sub', 'trap', 'hip-hop'],
  },
  {
    id: 'acoustic-guitar',
    name: 'Acoustic Guitar',
    description: 'Natural acoustic guitar with warmth and sparkle.',
    category: 'guitar',
    icon: 'Guitar',
    color: PRESET_COLORS.guitar,
    data: {
      name: 'Acoustic Guitar',
      trackType: 'audio',
      color: PRESET_COLORS.guitar,
      volume: 0.7,
      pan: -0.2,
      mute: false,
      solo: false,
      effects: [
        { id: 'ag-eq', name: 'Acoustic EQ', type: 'eq', bypass: false, parameters: { lowCut: 80, lowGain: 0, midGain: 2, midFrequency: 2500, highGain: 3 } },
        { id: 'ag-comp', name: 'Light Compression', type: 'compressor', bypass: false, parameters: { threshold: -12, ratio: 2, attack: 20, release: 150 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.25, preFader: false },
      ],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: true,
      recordEnabled: true,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['guitar', 'acoustic', 'strumming', 'fingerpicking'],
  },
  {
    id: 'electric-guitar-clean',
    name: 'Electric Guitar (Clean)',
    description: 'Crystal clean electric guitar with subtle chorus.',
    category: 'guitar',
    icon: 'Guitar',
    color: PRESET_COLORS.guitar,
    data: {
      name: 'Clean Guitar',
      trackType: 'audio',
      color: PRESET_COLORS.guitar,
      volume: 0.7,
      pan: 0.3,
      mute: false,
      solo: false,
      effects: [
        { id: 'cgtr-eq', name: 'Clean EQ', type: 'eq', bypass: false, parameters: { lowCut: 100, midGain: 1, highGain: 2 } },
        { id: 'cgtr-chorus', name: 'Subtle Chorus', type: 'chorus', bypass: false, parameters: { rate: 0.5, depth: 20, mix: 15 } },
        { id: 'cgtr-comp', name: 'Light Compression', type: 'compressor', bypass: false, parameters: { threshold: -10, ratio: 2, attack: 25, release: 100 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.2, preFader: false },
        { busId: 'delay-bus', busName: 'Delay', level: 0.15, preFader: false },
      ],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: true,
      recordEnabled: true,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['guitar', 'electric', 'clean', 'chorus'],
  },
  {
    id: 'electric-guitar-distorted',
    name: 'Electric Guitar (Distorted)',
    description: 'Heavy distorted guitar with presence and clarity.',
    category: 'guitar',
    icon: 'Guitar',
    color: PRESET_COLORS.guitar,
    data: {
      name: 'Distorted Guitar',
      trackType: 'audio',
      color: PRESET_COLORS.guitar,
      volume: 0.75,
      pan: -0.4,
      mute: false,
      solo: false,
      effects: [
        { id: 'dgtr-eq', name: 'Distorted EQ', type: 'eq', bypass: false, parameters: { lowCut: 80, lowGain: -2, midGain: 3, midFrequency: 2000, highGain: 1 } },
        { id: 'dgtr-gate', name: 'Noise Gate', type: 'gate', bypass: false, parameters: { threshold: -35, attack: 0.5, release: 50 } },
      ],
      sends: [],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: true,
      recordEnabled: true,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['guitar', 'electric', 'distortion', 'heavy', 'rock'],
  },
  {
    id: 'synth-lead',
    name: 'Synth Lead',
    description: 'Cutting synth lead with delay and reverb space.',
    category: 'synth',
    icon: 'Waves',
    color: PRESET_COLORS.synth,
    data: {
      name: 'Synth Lead',
      trackType: 'instrument',
      color: PRESET_COLORS.synth,
      volume: 0.7,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'sl-eq', name: 'Lead EQ', type: 'eq', bypass: false, parameters: { lowCut: 150, midGain: 2, highGain: 3 } },
        { id: 'sl-comp', name: 'Lead Compression', type: 'compressor', bypass: false, parameters: { threshold: -12, ratio: 3, attack: 10, release: 80 } },
      ],
      sends: [
        { busId: 'delay-bus', busName: 'Delay', level: 0.25, preFader: false },
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.2, preFader: false },
      ],
      outputBus: 'synth-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['synth', 'lead', 'electronic', 'melody'],
  },
  {
    id: 'synth-pad',
    name: 'Synth Pad',
    description: 'Lush synth pad with chorus and ambient reverb.',
    category: 'synth',
    icon: 'Waves',
    color: PRESET_COLORS.synth,
    data: {
      name: 'Synth Pad',
      trackType: 'instrument',
      color: PRESET_COLORS.synth,
      volume: 0.55,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'sp-eq', name: 'Pad EQ', type: 'eq', bypass: false, parameters: { lowCut: 100, lowGain: -2, midGain: 0, highGain: 1 } },
        { id: 'sp-chorus', name: 'Wide Chorus', type: 'chorus', bypass: false, parameters: { rate: 0.5, depth: 50, mix: 40 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.45, preFader: false },
      ],
      outputBus: 'synth-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['synth', 'pad', 'ambient', 'atmospheric'],
  },
  {
    id: 'synth-bass',
    name: 'Synth Bass',
    description: 'Punchy synth bass with warmth and presence.',
    category: 'synth',
    icon: 'Waves',
    color: PRESET_COLORS.synth,
    data: {
      name: 'Synth Bass',
      trackType: 'instrument',
      color: PRESET_COLORS.synth,
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'sb-eq', name: 'Synth Bass EQ', type: 'eq', bypass: false, parameters: { lowBoost: 60, lowGain: 3, midGain: -1, highGain: 0 } },
        { id: 'sb-comp', name: 'Bass Compression', type: 'compressor', bypass: false, parameters: { threshold: -12, ratio: 4, attack: 8, release: 60 } },
        { id: 'sb-sat', name: 'Harmonic Warmth', type: 'saturation', bypass: false, parameters: { drive: 2, mix: 30 } },
      ],
      sends: [],
      outputBus: 'bass-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['synth', 'bass', 'electronic', 'punchy'],
  },
  {
    id: 'piano',
    name: 'Piano',
    description: 'Natural piano sound with subtle room ambience.',
    category: 'keys',
    icon: 'Piano',
    color: PRESET_COLORS.keys,
    data: {
      name: 'Piano',
      trackType: 'instrument',
      color: PRESET_COLORS.keys,
      volume: 0.7,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'piano-eq', name: 'Piano EQ', type: 'eq', bypass: false, parameters: { lowGain: 0, midGain: 1, highGain: 2 } },
        { id: 'piano-comp', name: 'Light Compression', type: 'compressor', bypass: false, parameters: { threshold: -15, ratio: 2, attack: 20, release: 150 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.3, preFader: false },
      ],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['keys', 'piano', 'acoustic', 'grand'],
  },
  {
    id: 'electric-piano',
    name: 'Electric Piano',
    description: 'Vintage electric piano with warmth and chorusing.',
    category: 'keys',
    icon: 'Piano',
    color: PRESET_COLORS.keys,
    data: {
      name: 'Electric Piano',
      trackType: 'instrument',
      color: PRESET_COLORS.keys,
      volume: 0.65,
      pan: 0.1,
      mute: false,
      solo: false,
      effects: [
        { id: 'ep-eq', name: 'EP EQ', type: 'eq', bypass: false, parameters: { lowGain: 1, midGain: 0, highGain: 2 } },
        { id: 'ep-chorus', name: 'Classic Chorus', type: 'chorus', bypass: false, parameters: { rate: 0.7, depth: 35, mix: 30 } },
        { id: 'ep-phaser', name: 'Subtle Phaser', type: 'phaser', bypass: true, parameters: { rate: 0.3, depth: 40, feedback: 30 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.25, preFader: false },
      ],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['keys', 'electric piano', 'rhodes', 'vintage'],
  },
  {
    id: 'strings-ensemble',
    name: 'Strings Ensemble',
    description: 'Lush string section with natural room sound.',
    category: 'strings',
    icon: 'Music',
    color: PRESET_COLORS.strings,
    data: {
      name: 'Strings',
      trackType: 'instrument',
      color: PRESET_COLORS.strings,
      volume: 0.6,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'str-eq', name: 'Strings EQ', type: 'eq', bypass: false, parameters: { lowCut: 80, lowGain: 0, midGain: 1, highGain: 2 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.4, preFader: false },
      ],
      outputBus: 'instrument-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['strings', 'orchestra', 'ensemble', 'cinematic'],
  },
  {
    id: 'drum-bus',
    name: 'Drum Bus',
    description: 'Professional drum bus with glue compression and saturation.',
    category: 'bus',
    icon: 'Layers',
    color: PRESET_COLORS.bus,
    data: {
      name: 'Drum Bus',
      trackType: 'audio',
      color: PRESET_COLORS.bus,
      volume: 0.85,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'db-eq', name: 'Drum Bus EQ', type: 'eq', bypass: false, parameters: { lowGain: 1, midGain: 0, highGain: 2 } },
        { id: 'db-comp', name: 'Glue Compressor', type: 'compressor', bypass: false, preset: 'drum-glue', parameters: { threshold: -8, ratio: 4, attack: 10, release: 100 } },
        { id: 'db-sat', name: 'Tape Saturation', type: 'saturation', bypass: false, parameters: { drive: 2, mix: 20 } },
      ],
      sends: [],
      outputBus: 'master',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['bus', 'drums', 'glue', 'compression'],
  },
  {
    id: 'vocal-bus',
    name: 'Vocal Bus',
    description: 'Vocal bus with subtle compression and reverb send.',
    category: 'bus',
    icon: 'Layers',
    color: PRESET_COLORS.bus,
    data: {
      name: 'Vocal Bus',
      trackType: 'audio',
      color: PRESET_COLORS.bus,
      volume: 0.8,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'vb-comp', name: 'Bus Compressor', type: 'compressor', bypass: false, preset: 'gentle-glue', parameters: { threshold: -15, ratio: 2.5, attack: 20, release: 150 } },
        { id: 'vb-eq', name: 'Bus EQ', type: 'eq', bypass: false, parameters: { lowCut: 60, highGain: 1 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.15, preFader: false },
      ],
      outputBus: 'master',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['bus', 'vocals', 'glue', 'gentle'],
  },
  {
    id: 'fx-riser',
    name: 'FX Riser',
    description: 'Dramatic riser effect with filter and reverb.',
    category: 'fx',
    icon: 'Sparkles',
    color: PRESET_COLORS.fx,
    data: {
      name: 'FX Riser',
      trackType: 'audio',
      color: PRESET_COLORS.fx,
      volume: 0.6,
      pan: 0,
      mute: false,
      solo: false,
      effects: [
        { id: 'riser-eq', name: 'FX EQ', type: 'eq', bypass: false, parameters: { lowCut: 200, highGain: 4 } },
      ],
      sends: [
        { busId: 'reverb-bus', busName: 'Reverb', level: 0.5, preFader: false },
        { busId: 'delay-bus', busName: 'Delay', level: 0.3, preFader: false },
      ],
      outputBus: 'fx-bus',
      delayCompensation: 0,
      inputMonitoring: false,
      recordEnabled: false,
      phase: false,
      gain: 0,
    },
    isFactory: true,
    isUserPreset: false,
    author: 'Max Booster',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    tags: ['fx', 'riser', 'transition', 'build'],
  },
];

const LOCAL_STORAGE_KEY = 'max-booster-track-presets';
const UNDO_HISTORY_KEY = 'max-booster-preset-undo-history';

export function getAllPresets(): TrackPreset[] {
  const userPresets = getUserPresets();
  return [...FACTORY_PRESETS, ...userPresets];
}

export function getUserPresets(): TrackPreset[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return parsed.map((p: TrackPreset) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }));
  } catch {
    return [];
  }
}

export function saveUserPreset(preset: Omit<TrackPreset, 'id' | 'createdAt' | 'updatedAt' | 'isFactory' | 'isUserPreset'>): TrackPreset {
  const userPresets = getUserPresets();
  const newPreset: TrackPreset = {
    ...preset,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    isFactory: false,
    isUserPreset: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  userPresets.push(newPreset);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userPresets));
  return newPreset;
}

export function updateUserPreset(presetId: string, updates: Partial<TrackPreset>): TrackPreset | null {
  const userPresets = getUserPresets();
  const index = userPresets.findIndex((p) => p.id === presetId);
  if (index === -1) return null;
  
  const updatedPreset = {
    ...userPresets[index],
    ...updates,
    updatedAt: new Date(),
  };
  userPresets[index] = updatedPreset;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userPresets));
  return updatedPreset;
}

export function deleteUserPreset(presetId: string): boolean {
  const userPresets = getUserPresets();
  const filtered = userPresets.filter((p) => p.id !== presetId);
  if (filtered.length === userPresets.length) return false;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

export function getPresetById(presetId: string): TrackPreset | undefined {
  return getAllPresets().find((p) => p.id === presetId);
}

export function getPresetsByCategory(category: PresetCategory): TrackPreset[] {
  return getAllPresets().filter((p) => p.category === category);
}

export function searchPresets(query: string): TrackPreset[] {
  const lowerQuery = query.toLowerCase();
  return getAllPresets().filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery) ||
      p.tags.some((t) => t.toLowerCase().includes(lowerQuery))
  );
}

export function filterPresets(options: {
  category?: PresetCategory;
  search?: string;
  tags?: string[];
  factoryOnly?: boolean;
  userOnly?: boolean;
}): TrackPreset[] {
  let presets = getAllPresets();

  if (options.category) {
    presets = presets.filter((p) => p.category === options.category);
  }

  if (options.search) {
    presets = searchPresets(options.search).filter((p) => presets.includes(p));
  }

  if (options.tags && options.tags.length > 0) {
    presets = presets.filter((p) =>
      options.tags!.every((tag) => p.tags.includes(tag.toLowerCase()))
    );
  }

  if (options.factoryOnly) {
    presets = presets.filter((p) => p.isFactory);
  }

  if (options.userOnly) {
    presets = presets.filter((p) => p.isUserPreset);
  }

  return presets;
}

export interface StudioTrackSnapshot {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed?: boolean;
  recordEnabled?: boolean;
  inputMonitoring?: boolean;
  outputBus: string;
  effects?: {
    eq?: { lowGain: number; midGain: number; highGain: number; midFrequency?: number; bypass?: boolean };
    compressor?: { threshold: number; ratio: number; attack: number; release: number; bypass?: boolean };
    reverb?: { mix: number; irId?: string; bypass?: boolean };
  };
}

export function createPresetFromTrack(
  track: StudioTrackSnapshot,
  name: string,
  description: string,
  category: PresetCategory,
  tags: string[] = []
): TrackPreset {
  const effects: PresetEffect[] = [];

  if (track.effects?.eq) {
    effects.push({
      id: `eq-${Date.now()}`,
      name: 'EQ',
      type: 'eq',
      bypass: track.effects.eq.bypass || false,
      parameters: {
        lowGain: track.effects.eq.lowGain,
        midGain: track.effects.eq.midGain,
        highGain: track.effects.eq.highGain,
        midFrequency: track.effects.eq.midFrequency || 1000,
      },
    });
  }

  if (track.effects?.compressor) {
    effects.push({
      id: `comp-${Date.now()}`,
      name: 'Compressor',
      type: 'compressor',
      bypass: track.effects.compressor.bypass || false,
      parameters: {
        threshold: track.effects.compressor.threshold,
        ratio: track.effects.compressor.ratio,
        attack: track.effects.compressor.attack,
        release: track.effects.compressor.release,
      },
    });
  }

  if (track.effects?.reverb) {
    effects.push({
      id: `reverb-${Date.now()}`,
      name: 'Reverb',
      type: 'reverb',
      bypass: track.effects.reverb.bypass || false,
      parameters: {
        mix: track.effects.reverb.mix,
      },
    });
  }

  const presetData: TrackPresetData = {
    name: track.name,
    trackType: track.trackType,
    color: track.color,
    volume: track.volume,
    pan: track.pan,
    mute: track.mute,
    solo: track.solo,
    effects,
    sends: [],
    inputAssignment: undefined,
    outputBus: track.outputBus || 'master',
    delayCompensation: 0,
    inputMonitoring: track.inputMonitoring || false,
    recordEnabled: track.recordEnabled || false,
    phase: false,
    gain: 0,
  };

  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    description,
    category,
    icon: CATEGORY_INFO[category].icon,
    color: CATEGORY_INFO[category].color,
    data: presetData,
    isFactory: false,
    isUserPreset: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    tags,
  };
}

export function applyPresetToTrack(preset: TrackPreset, track: StudioTrackSnapshot): Partial<StudioTrackSnapshot> {
  const updates: Partial<StudioTrackSnapshot> = {
    name: preset.data.name,
    color: preset.data.color,
    volume: preset.data.volume,
    pan: preset.data.pan,
    mute: preset.data.mute,
    solo: preset.data.solo,
    outputBus: preset.data.outputBus,
    inputMonitoring: preset.data.inputMonitoring,
    recordEnabled: preset.data.recordEnabled,
  };

  const eqEffect = preset.data.effects.find((e) => e.type === 'eq');
  const compressorEffect = preset.data.effects.find((e) => e.type === 'compressor');
  const reverbEffect = preset.data.effects.find((e) => e.type === 'reverb');

  if (eqEffect || compressorEffect || reverbEffect) {
    updates.effects = {};
    
    if (eqEffect && eqEffect.parameters) {
      updates.effects.eq = {
        lowGain: eqEffect.parameters.lowGain || 0,
        midGain: eqEffect.parameters.midGain || 0,
        highGain: eqEffect.parameters.highGain || 0,
        midFrequency: eqEffect.parameters.midFrequency || 1000,
        bypass: eqEffect.bypass,
      };
    }

    if (compressorEffect && compressorEffect.parameters) {
      updates.effects.compressor = {
        threshold: compressorEffect.parameters.threshold || -24,
        ratio: compressorEffect.parameters.ratio || 4,
        attack: compressorEffect.parameters.attack || 10,
        release: compressorEffect.parameters.release || 100,
        bypass: compressorEffect.bypass,
      };
    }

    if (reverbEffect && reverbEffect.parameters) {
      updates.effects.reverb = {
        mix: reverbEffect.parameters.mix || 0.2,
        bypass: reverbEffect.bypass,
      };
    }
  }

  return updates;
}

export function saveUndoState(undoState: PresetUndoState): void {
  try {
    const history = getUndoHistory();
    history.push(undoState);
    if (history.length > 50) {
      history.shift();
    }
    localStorage.setItem(UNDO_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

export function getUndoHistory(): PresetUndoState[] {
  try {
    const stored = localStorage.getItem(UNDO_HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored).map((s: PresetUndoState) => ({
      ...s,
      appliedAt: new Date(s.appliedAt),
    }));
  } catch {
    return [];
  }
}

export function getLastUndoState(trackId: string): PresetUndoState | undefined {
  const history = getUndoHistory();
  return history.filter((s) => s.trackId === trackId).pop();
}

export function clearUndoHistory(trackId?: string): void {
  if (trackId) {
    const history = getUndoHistory().filter((s) => s.trackId !== trackId);
    localStorage.setItem(UNDO_HISTORY_KEY, JSON.stringify(history));
  } else {
    localStorage.removeItem(UNDO_HISTORY_KEY);
  }
}

export function exportPresets(presets: TrackPreset[]): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    presets: presets.map((p) => ({
      ...p,
      id: p.isUserPreset ? p.id : undefined,
      isFactory: false,
      isUserPreset: true,
    })),
  };
  return JSON.stringify(exportData, null, 2);
}

export function importPresets(jsonString: string): { success: boolean; presets: TrackPreset[]; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    
    if (!data.version || !data.presets || !Array.isArray(data.presets)) {
      return { success: false, presets: [], error: 'Invalid preset file format' };
    }

    const importedPresets: TrackPreset[] = data.presets.map((p: Partial<TrackPreset>) => ({
      ...p,
      id: `imported-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      isFactory: false,
      isUserPreset: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const existingPresets = getUserPresets();
    const newPresets = [...existingPresets, ...importedPresets];
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newPresets));

    return { success: true, presets: importedPresets };
  } catch (err) {
    return { success: false, presets: [], error: `Failed to parse preset file: ${err}` };
  }
}

export function getPresetPreview(preset: TrackPreset): {
  effectCount: number;
  sendCount: number;
  hasEQ: boolean;
  hasCompressor: boolean;
  hasReverb: boolean;
  outputBus: string;
} {
  return {
    effectCount: preset.data.effects.length,
    sendCount: preset.data.sends.length,
    hasEQ: preset.data.effects.some((e) => e.type === 'eq'),
    hasCompressor: preset.data.effects.some((e) => e.type === 'compressor'),
    hasReverb: preset.data.effects.some((e) => e.type === 'reverb'),
    outputBus: preset.data.outputBus,
  };
}
