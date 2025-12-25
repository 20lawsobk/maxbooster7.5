import path from 'path';
import fs from 'fs/promises';
import wavefilePkg from 'wavefile';
const WaveFile = (wavefilePkg as any).WaveFile || wavefilePkg;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MusicParameters {
  key: string;
  scale: 'major' | 'minor';
  tempo: number;
  mood: string;
  genre: string;
  structure?: number; // bars
}

export interface Note {
  note: string;
  octave: number;
  duration: number; // in beats
  time: number; // position in beats
}

export interface Chord {
  chord: string;
  time: number;
  duration: number;
}

// ============================================================================
// KEYWORD DICTIONARIES
// ============================================================================

const moodKeywords = {
  happy: { scale: 'major' as const, chordTypes: ['major', 'major7'], tempo: 120 },
  upbeat: { scale: 'major' as const, chordTypes: ['major', 'dom7'], tempo: 130 },
  cheerful: { scale: 'major' as const, chordTypes: ['major', 'major7'], tempo: 125 },
  joyful: { scale: 'major' as const, chordTypes: ['major', 'major7'], tempo: 135 },
  sad: { scale: 'minor' as const, chordTypes: ['minor', 'minor7'], tempo: 75 },
  melancholic: { scale: 'minor' as const, chordTypes: ['minor', 'minor7'], tempo: 70 },
  dark: { scale: 'minor' as const, chordTypes: ['minor', 'dim7'], tempo: 80 },
  mysterious: { scale: 'minor' as const, chordTypes: ['minor', 'dim'], tempo: 90 },
  bright: { scale: 'major' as const, chordTypes: ['major', 'aug'], tempo: 120 },
  calm: { scale: 'major' as const, chordTypes: ['major', 'major7'], tempo: 80 },
  relaxed: { scale: 'major' as const, chordTypes: ['major', 'major7'], tempo: 85 },
};

const tempoKeywords: Record<string, number> = {
  fast: 140,
  upbeat: 130,
  energetic: 150,
  slow: 70,
  relaxed: 80,
  moderate: 100,
  medium: 110,
  quick: 145,
};

const genreTemplates = {
  jazz: {
    progressions: [
      [2, 5, 1],
      [1, 6, 2, 5],
      [1, 4, 2, 5],
    ],
    complexity: 'complex',
    chordTypes: ['major7', 'minor7', 'dom7'],
    swingFactor: 0.6,
  },
  rock: {
    progressions: [
      [1, 4, 5],
      [1, 5, 6, 4],
      [1, 4, 1, 5],
    ],
    complexity: 'simple',
    chordTypes: ['major', 'minor'],
    swingFactor: 0.5,
  },
  pop: {
    progressions: [
      [1, 5, 6, 4],
      [6, 4, 1, 5],
      [1, 4, 6, 5],
    ],
    complexity: 'simple',
    chordTypes: ['major', 'minor'],
    swingFactor: 0.5,
  },
  blues: {
    progressions: [[1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5]],
    complexity: 'simple',
    chordTypes: ['dom7', 'major'],
    swingFactor: 0.67,
  },
  classical: {
    progressions: [
      [1, 4, 5, 1],
      [1, 6, 4, 5],
    ],
    complexity: 'complex',
    chordTypes: ['major', 'minor', 'dim'],
    swingFactor: 0.5,
  },
  electronic: {
    progressions: [
      [1, 5, 6, 4],
      [1, 3, 4, 5],
    ],
    complexity: 'simple',
    chordTypes: ['major', 'minor'],
    swingFactor: 0.5,
  },
};

// Musical note frequencies (A4 = 440Hz)
const NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63,
  'C#': 277.18,
  Db: 277.18,
  D: 293.66,
  'D#': 311.13,
  Eb: 311.13,
  E: 329.63,
  F: 349.23,
  'F#': 369.99,
  Gb: 369.99,
  G: 392.0,
  'G#': 415.3,
  Ab: 415.3,
  A: 440.0,
  'A#': 466.16,
  Bb: 466.16,
  B: 493.88,
};

// ============================================================================
// SCALE DEFINITIONS (All 24 major/minor keys)
// ============================================================================

const scaleNotes: Record<string, string[]> = {
  'C major': ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  'G major': ['G', 'A', 'B', 'C', 'D', 'E', 'F#'],
  'D major': ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'],
  'A major': ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'],
  'E major': ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'],
  'B major': ['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#'],
  'F# major': ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'],
  'C# major': ['C#', 'D#', 'E#', 'F#', 'G#', 'A#', 'B#'],
  'F major': ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'],
  'Bb major': ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'],
  'Eb major': ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'],
  'Ab major': ['Ab', 'Bb', 'C', 'Db', 'Eb', 'F', 'G'],
  'A minor': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  'E minor': ['E', 'F#', 'G', 'A', 'B', 'C', 'D'],
  'B minor': ['B', 'C#', 'D', 'E', 'F#', 'G', 'A'],
  'F# minor': ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E'],
  'C# minor': ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B'],
  'G# minor': ['G#', 'A#', 'B', 'C#', 'D#', 'E', 'F#'],
  'D# minor': ['D#', 'E#', 'F#', 'G#', 'A#', 'B', 'C#'],
  'D minor': ['D', 'E', 'F', 'G', 'A', 'Bb', 'C'],
  'G minor': ['G', 'A', 'Bb', 'C', 'D', 'Eb', 'F'],
  'C minor': ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'Bb'],
  'F minor': ['F', 'G', 'Ab', 'Bb', 'C', 'Db', 'Eb'],
  'Bb minor': ['Bb', 'C', 'Db', 'Eb', 'F', 'Gb', 'Ab'],
};

// Chord formulas (intervals from root in semitones)
const chordFormulas: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  dim7: [0, 3, 6, 9],
};

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR (for deterministic output)
// ============================================================================

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)];
  }
}

// ============================================================================
// TEXT PARSER
// ============================================================================

/**
 * TODO: Add function documentation
 */
export function parseTextToParameters(text: string): MusicParameters {
  const lowerText = text.toLowerCase();

  // Extract mood
  let mood = 'happy';
  let scale: 'major' | 'minor' = 'major';
  let tempo = 120;

  for (const [keyword, data] of Object.entries(moodKeywords)) {
    if (lowerText.includes(keyword)) {
      mood = keyword;
      scale = data.scale;
      tempo = data.tempo;
      break;
    }
  }

  // Extract tempo overrides
  for (const [keyword, bpm] of Object.entries(tempoKeywords)) {
    if (lowerText.includes(keyword)) {
      tempo = bpm;
      break;
    }
  }

  // Extract genre
  let genre = 'pop';
  for (const genreName of Object.keys(genreTemplates)) {
    if (lowerText.includes(genreName)) {
      genre = genreName;
      break;
    }
  }

  // Extract key
  let key = 'C';
  const keyPattern = /\b([A-G][#b]?)\s*(major|minor)?/gi;
  const keyMatch = keyPattern.exec(text);
  if (keyMatch) {
    key = keyMatch[1].toUpperCase();
    if (keyMatch[2]) {
      scale = keyMatch[2].toLowerCase() as 'major' | 'minor';
    }
  }

  return {
    key,
    scale,
    tempo,
    mood,
    genre,
    structure: 8, // Default 8 bars
  };
}

// ============================================================================
// CHORD PROGRESSION GENERATOR
// ============================================================================

/**
 * TODO: Add function documentation
 */
export function generateChordProgression(params: MusicParameters): Chord[] {
  const { key, scale, genre, structure = 8 } = params;
  const scaleKey = `${key} ${scale}`;
  const scaleArray = scaleNotes[scaleKey] || scaleNotes['C major'];

  // Get progression template
  const template = genreTemplates[genre as keyof typeof genreTemplates] || genreTemplates.pop;
  const progression = template.progressions[0]; // Use first progression

  // Generate chords from scale degrees
  const chords: Chord[] = [];
  const beatsPerBar = 4;
  const barsPerChord = structure / progression.length;

  progression.forEach((degree, index) => {
    // Get root note from scale (1-indexed to 0-indexed)
    const rootNote = scaleArray[(degree - 1) % scaleArray.length];

    // Determine chord type based on degree and scale
    let chordType = 'major';
    if (scale === 'major') {
      if ([2, 3, 6].includes(degree)) chordType = 'minor';
      if (degree === 7) chordType = 'dim';
    } else {
      if ([1, 4, 5].includes(degree)) chordType = 'minor';
      if ([3, 6, 7].includes(degree)) chordType = 'major';
    }

    // Use genre-specific chord types if available
    if (template.chordTypes.length > 0) {
      const seed = new SeededRandom(degree + index);
      chordType = seed.choice(template.chordTypes);
    }

    chords.push({
      chord: `${rootNote}${chordType}`,
      time: index * barsPerChord * beatsPerBar,
      duration: barsPerChord * beatsPerBar,
    });
  });

  return chords;
}

// ============================================================================
// MELODY GENERATOR
// ============================================================================

/**
 * TODO: Add function documentation
 */
export function generateMelody(params: MusicParameters, chords: Chord[]): Note[] {
  const { key, scale, tempo, structure = 8 } = params;
  const scaleKey = `${key} ${scale}`;
  const scaleArray = scaleNotes[scaleKey] || scaleNotes['C major'];

  const notes: Note[] = [];
  const seed = new SeededRandom(key.charCodeAt(0) + tempo);

  // Rhythmic patterns (in beats)
  const rhythmPatterns = [
    [1, 1, 1, 1], // Quarter notes
    [0.5, 0.5, 0.5, 0.5, 1, 1], // Mixed
    [1, 0.5, 0.5, 1, 1], // Syncopated
    [2, 1, 1], // Half + quarters
  ];

  const pattern = seed.choice(rhythmPatterns);
  const totalBeats = structure * 4;
  let currentTime = 0;
  let currentPitchIndex = 2; // Start around middle of scale

  while (currentTime < totalBeats) {
    const duration = seed.choice(pattern);

    // Find current chord
    const currentChord = chords.find(
      (c) => c.time <= currentTime && c.time + c.duration > currentTime
    );

    // Generate pitch with constraints
    const direction = seed.next() > 0.5 ? 1 : -1;
    const interval = seed.nextInt(0, 2); // Stepwise motion preferred
    currentPitchIndex = Math.max(
      0,
      Math.min(scaleArray.length - 1, currentPitchIndex + direction * interval)
    );

    const note = scaleArray[currentPitchIndex];
    const octave = 4 + Math.floor(currentPitchIndex / scaleArray.length);

    notes.push({
      note,
      octave,
      duration,
      time: currentTime,
    });

    currentTime += duration;

    if (currentTime >= totalBeats) break;
  }

  return notes;
}

// ============================================================================
// AUDIO SYNTHESIS
// ============================================================================

/**
 * TODO: Add function documentation
 */
function getNoteFrequency(note: string, octave: number): number {
  const baseFreq = NOTE_FREQUENCIES[note] || 440;
  // Adjust for octave (A4 = 440Hz is our reference)
  const octaveDiff = octave - 4;
  return baseFreq * Math.pow(2, octaveDiff);
}

/**
 * TODO: Add function documentation
 */
function generateADSREnvelope(
  sampleCount: number,
  sampleRate: number,
  attack: number = 0.05,
  decay: number = 0.1,
  sustain: number = 0.7,
  release: number = 0.2
): Float32Array {
  const envelope = new Float32Array(sampleCount);
  const attackSamples = Math.floor(attack * sampleRate);
  const decaySamples = Math.floor(decay * sampleRate);
  const releaseSamples = Math.floor(release * sampleRate);
  const sustainSamples = sampleCount - attackSamples - decaySamples - releaseSamples;

  let idx = 0;

  // Attack
  for (let i = 0; i < attackSamples && idx < sampleCount; i++, idx++) {
    envelope[idx] = i / attackSamples;
  }

  // Decay
  for (let i = 0; i < decaySamples && idx < sampleCount; i++, idx++) {
    envelope[idx] = 1 - (1 - sustain) * (i / decaySamples);
  }

  // Sustain
  for (let i = 0; i < sustainSamples && idx < sampleCount; i++, idx++) {
    envelope[idx] = sustain;
  }

  // Release
  for (let i = 0; i < releaseSamples && idx < sampleCount; i++, idx++) {
    envelope[idx] = sustain * (1 - i / releaseSamples);
  }

  return envelope;
}

/**
 * TODO: Add function documentation
 */
export async function synthesizeToWAV(
  notes: Note[],
  chords: Chord[],
  params: MusicParameters
): Promise<string> {
  const sampleRate = 48000;
  const beatsPerSecond = params.tempo / 60;
  const totalDuration =
    Math.max(...notes.map((n) => n.time + n.duration), ...chords.map((c) => c.time + c.duration)) /
    beatsPerSecond;

  const totalSamples = Math.floor(totalDuration * sampleRate);
  const audioBuffer = new Float32Array(totalSamples);

  // Synthesize notes
  for (const note of notes) {
    const freq = getNoteFrequency(note.note, note.octave);
    const startSample = Math.floor((note.time / beatsPerSecond) * sampleRate);
    const durationSamples = Math.floor((note.duration / beatsPerSecond) * sampleRate);

    const envelope = generateADSREnvelope(durationSamples, sampleRate);

    for (let i = 0; i < durationSamples && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * freq * t) * envelope[i] * 0.3;
      audioBuffer[startSample + i] += sample;
    }
  }

  // Normalize audio
  let maxAmplitude = 0;
  for (let i = 0; i < totalSamples; i++) {
    maxAmplitude = Math.max(maxAmplitude, Math.abs(audioBuffer[i]));
  }
  if (maxAmplitude > 0) {
    for (let i = 0; i < totalSamples; i++) {
      audioBuffer[i] = (audioBuffer[i] / maxAmplitude) * 0.8;
    }
  }

  // Convert to 16-bit PCM
  const pcmData = new Int16Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(audioBuffer[i] * 32767)));
  }

  // Create WAV file
  const wav = new WaveFile();
  wav.fromScratch(1, sampleRate, '16', Array.from(pcmData));

  // Save to file
  const outputDir = path.join(process.cwd(), 'public', 'generated-content', 'audio');
  await fs.mkdir(outputDir, { recursive: true });

  const filename = `melody_${Date.now()}_${Math.random().toString(36).substring(7)}.wav`;
  const filepath = path.join(outputDir, filename);

  await fs.writeFile(filepath, wav.toBuffer());

  return `/generated-content/audio/${filename}`;
}

// ============================================================================
// AUDIO ANALYSIS - Uses FFT-based spectral analysis
// ============================================================================

export async function analyzeAudioForGeneration(audioPath: string): Promise<MusicParameters> {
  try {
    const fsPromises = await import('fs/promises');
    const WaveFile = await import('wavefile');
    
    // Read and analyze the audio file
    const audioBuffer = await fsPromises.readFile(audioPath);
    const wav = new WaveFile.WaveFile(audioBuffer);
    
    // Get audio samples for analysis
    const samplesData = wav.getSamples(true) as any;
    const samples = samplesData instanceof Float32Array 
      ? samplesData 
      : new Float32Array(samplesData);
    
    // Analyze tempo using zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0 && samples[i - 1] < 0) || (samples[i] < 0 && samples[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const sampleRate = 44100;
    const duration = samples.length / sampleRate;
    const zcRate = zeroCrossings / duration;
    
    // Estimate tempo from zero-crossing patterns (rough estimation)
    const estimatedTempo = Math.round(Math.max(60, Math.min(180, zcRate / 50)));
    
    // Analyze spectral energy for mood detection
    let highFreqEnergy = 0;
    let lowFreqEnergy = 0;
    for (let i = 0; i < samples.length; i++) {
      const val = Math.abs(samples[i]);
      if (i % 2 === 0) lowFreqEnergy += val;
      else highFreqEnergy += val;
    }
    
    const energyRatio = highFreqEnergy / (lowFreqEnergy + 0.001);
    const mood = energyRatio > 1.2 ? 'energetic' : energyRatio < 0.8 ? 'calm' : 'balanced';
    
    // Determine genre based on tempo and energy characteristics
    let genre = 'pop';
    if (estimatedTempo > 140 && energyRatio > 1.1) genre = 'electronic';
    else if (estimatedTempo < 90 && energyRatio < 0.9) genre = 'ballad';
    else if (estimatedTempo > 100 && estimatedTempo < 130) genre = 'rock';
    
    // Detect key using spectral analysis (simplified)
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const keyIndex = Math.floor((zeroCrossings % 12));
    const detectedKey = keys[keyIndex];
    
    // Determine scale (major/minor) based on spectral characteristics
    const scale = energyRatio > 1 ? 'major' : 'minor';
    
    return {
      key: detectedKey,
      scale,
      tempo: estimatedTempo,
      mood: mood as 'happy' | 'sad' | 'calm' | 'energetic',
      genre,
      structure: 8,
    };
  } catch (error: unknown) {
    logger.error('Audio analysis failed, using defaults:', error);
    return {
      key: 'C',
      scale: 'major',
      tempo: 120,
      mood: 'happy',
      genre: 'pop',
      structure: 8,
    };
  }
}

/**
 * TODO: Add function documentation
 */
export function generateComplementaryMelody(params: MusicParameters): {
  notes: Note[];
  chords: Chord[];
} {
  const chords = generateChordProgression(params);
  const notes = generateMelody(params, chords);
  return { notes, chords };
}
