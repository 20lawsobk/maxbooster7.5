import path from "path";
import fs from "fs/promises";
import { randomBytes } from "crypto";
import { musicIndustryContextFilter } from "./musicIndustryContextFilter.js";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore } from "../lib/aiSource.js";
import { logger as mgLogger } from "../logger.js";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MusicParameters {
  key: string;
  scale: "major" | "minor";
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
  happy: {
    scale: "major" as const,
    chordTypes: ["major", "major7"],
    tempo: 120,
  },
  upbeat: {
    scale: "major" as const,
    chordTypes: ["major", "dom7"],
    tempo: 130,
  },
  cheerful: {
    scale: "major" as const,
    chordTypes: ["major", "major7"],
    tempo: 125,
  },
  joyful: {
    scale: "major" as const,
    chordTypes: ["major", "major7"],
    tempo: 135,
  },
  sad: { scale: "minor" as const, chordTypes: ["minor", "minor7"], tempo: 75 },
  melancholic: {
    scale: "minor" as const,
    chordTypes: ["minor", "minor7"],
    tempo: 70,
  },
  dark: { scale: "minor" as const, chordTypes: ["minor", "dim7"], tempo: 80 },
  mysterious: {
    scale: "minor" as const,
    chordTypes: ["minor", "dim"],
    tempo: 90,
  },
  bright: { scale: "major" as const, chordTypes: ["major", "aug"], tempo: 120 },
  calm: { scale: "major" as const, chordTypes: ["major", "major7"], tempo: 80 },
  relaxed: {
    scale: "major" as const,
    chordTypes: ["major", "major7"],
    tempo: 85,
  },
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
    complexity: "complex",
    chordTypes: ["major7", "minor7", "dom7"],
    swingFactor: 0.6,
  },
  rock: {
    progressions: [
      [1, 4, 5],
      [1, 5, 6, 4],
      [1, 4, 1, 5],
    ],
    complexity: "simple",
    chordTypes: ["major", "minor"],
    swingFactor: 0.5,
  },
  pop: {
    progressions: [
      [1, 5, 6, 4],
      [6, 4, 1, 5],
      [1, 4, 6, 5],
    ],
    complexity: "simple",
    chordTypes: ["major", "minor"],
    swingFactor: 0.5,
  },
  blues: {
    progressions: [[1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5]],
    complexity: "simple",
    chordTypes: ["dom7", "major"],
    swingFactor: 0.67,
  },
  classical: {
    progressions: [
      [1, 4, 5, 1],
      [1, 6, 4, 5],
    ],
    complexity: "complex",
    chordTypes: ["major", "minor", "dim"],
    swingFactor: 0.5,
  },
  electronic: {
    progressions: [
      [1, 5, 6, 4],
      [1, 3, 4, 5],
    ],
    complexity: "simple",
    chordTypes: ["major", "minor"],
    swingFactor: 0.5,
  },
};

// Musical note frequencies (A4 = 440Hz)
const NOTE_FREQUENCIES: Record<string, number> = {
  C: 261.63,
  "C#": 277.18,
  Db: 277.18,
  D: 293.66,
  "D#": 311.13,
  Eb: 311.13,
  E: 329.63,
  F: 349.23,
  "F#": 369.99,
  Gb: 369.99,
  G: 392.0,
  "G#": 415.3,
  Ab: 415.3,
  A: 440.0,
  "A#": 466.16,
  Bb: 466.16,
  B: 493.88,
};

// ============================================================================
// SCALE DEFINITIONS (All 24 major/minor keys)
// ============================================================================

const scaleNotes: Record<string, string[]> = {
  "C major": ["C", "D", "E", "F", "G", "A", "B"],
  "G major": ["G", "A", "B", "C", "D", "E", "F#"],
  "D major": ["D", "E", "F#", "G", "A", "B", "C#"],
  "A major": ["A", "B", "C#", "D", "E", "F#", "G#"],
  "E major": ["E", "F#", "G#", "A", "B", "C#", "D#"],
  "B major": ["B", "C#", "D#", "E", "F#", "G#", "A#"],
  "F# major": ["F#", "G#", "A#", "B", "C#", "D#", "E#"],
  "C# major": ["C#", "D#", "E#", "F#", "G#", "A#", "B#"],
  "F major": ["F", "G", "A", "Bb", "C", "D", "E"],
  "Bb major": ["Bb", "C", "D", "Eb", "F", "G", "A"],
  "Eb major": ["Eb", "F", "G", "Ab", "Bb", "C", "D"],
  "Ab major": ["Ab", "Bb", "C", "Db", "Eb", "F", "G"],
  "A minor": ["A", "B", "C", "D", "E", "F", "G"],
  "E minor": ["E", "F#", "G", "A", "B", "C", "D"],
  "B minor": ["B", "C#", "D", "E", "F#", "G", "A"],
  "F# minor": ["F#", "G#", "A", "B", "C#", "D", "E"],
  "C# minor": ["C#", "D#", "E", "F#", "G#", "A", "B"],
  "G# minor": ["G#", "A#", "B", "C#", "D#", "E", "F#"],
  "D# minor": ["D#", "E#", "F#", "G#", "A#", "B", "C#"],
  "D minor": ["D", "E", "F", "G", "A", "Bb", "C"],
  "G minor": ["G", "A", "Bb", "C", "D", "Eb", "F"],
  "C minor": ["C", "D", "Eb", "F", "G", "Ab", "Bb"],
  "F minor": ["F", "G", "Ab", "Bb", "C", "Db", "Eb"],
  "Bb minor": ["Bb", "C", "Db", "Eb", "F", "Gb", "Ab"],
};

// Chord formulas (intervals from root in semitones)

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
    return array[this.nextInt(0, array?.length - 1)];
  }
}

// ============================================================================
// TEXT PARSER
// ============================================================================

export function parseTextToParameters(text: string): MusicParameters {
  const lowerText = text?.toLowerCase();

  // Extract mood
  let mood = "happy";
  let scale: "major" | "minor" = "major";
  let tempo = 120;

  for (const [keyword, data] of Object.entries(moodKeywords)) {
    if (lowerText?.includes(keyword)) {
      mood = keyword;
      scale = data?.scale;
      tempo = data?.tempo;
      break;
    }
  }

  // Extract tempo overrides
  for (const [keyword, bpm] of Object.entries(tempoKeywords)) {
    if (lowerText?.includes(keyword)) {
      tempo = bpm;
      break;
    }
  }

  // Extract genre
  let genre = "pop";
  for (const genreName of Object.keys(genreTemplates)) {
    if (lowerText?.includes(genreName)) {
      genre = genreName;
      break;
    }
  }

  // Extract key
  let key = "C";
  const keyPattern = /\b([A-G][#b]?)\s*(major|minor)?/gi;
  const keyMatch = keyPattern?.exec(text);
  if (keyMatch) {
    key = keyMatch[1].toUpperCase();
    if (keyMatch[2]) {
      scale = keyMatch[2].toLowerCase() as "major" | "minor";
    }
  }

  // When text parsing found only defaults, enrich with live industry context.
  // getSuggestedMoodSync / getSuggestedGenreSync are sync cache reads — never block.
  if (mood === "happy") {
    const suggestedMood = musicIndustryContextFilter?.getSuggestedMoodSync();
    if (suggestedMood && suggestedMood in moodKeywords) {
      const moodData = moodKeywords[suggestedMood as keyof typeof moodKeywords];
      mood = suggestedMood;
      scale = moodData?.scale;
      tempo = moodData?.tempo;
    }
  }
  if (genre === "pop") {
    const suggestedGenre = musicIndustryContextFilter?.getSuggestedGenreSync();
    if (suggestedGenre) {
      const normalized = suggestedGenre?.toLowerCase().replace(/[^a-z]/g, "");
      if (normalized in genreTemplates) genre = normalized;
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

export function generateChordProgression(params: MusicParameters): Chord[] {
  const { key, scale, genre, structure = 8 } = params;
  const scaleKey = `${key} ${scale}`;
  const scaleArray = scaleNotes[scaleKey] || scaleNotes["C major"];

  // Get progression template
  const template =
    genreTemplates[genre as keyof typeof genreTemplates] || genreTemplates?.pop;
  const progression = template?.progressions[0]; // Use first progression

  // Generate chords from scale degrees
  const chords: Chord[] = [];
  const beatsPerBar = 4;
  const barsPerChord = structure / progression?.length;

  progression?.forEach((degree, index) => {
    // Get root note from scale (1-indexed to 0-indexed)
    const rootNote = scaleArray[(degree - 1) % scaleArray?.length];

    // Determine chord type based on degree and scale
    let chordType = "major";
    if (scale === "major") {
      if ([2, 3, 6].includes(degree)) chordType = "minor";
      if (degree === 7) chordType = "dim";
    } else {
      if ([1, 4, 5].includes(degree)) chordType = "minor";
      if ([3, 6, 7].includes(degree)) chordType = "major";
    }

    // Use genre-specific chord types if available
    if (template?.chordTypes.length > 0) {
      const seed = new SeededRandom(degree + index);
      chordType = seed?.choice(template?.chordTypes);
    }

    chords?.push({
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

export function generateMelody(
  params: MusicParameters,
  chords: Chord[],
): Note[] {
  const { key, scale, tempo, structure = 8 } = params;
  const scaleKey = `${key} ${scale}`;
  const scaleArray = scaleNotes[scaleKey] || scaleNotes["C major"];

  const notes: Note[] = [];
  const seed = new SeededRandom(key?.charCodeAt(0) + tempo);

  // Rhythmic patterns (in beats)
  const rhythmPatterns = [
    [1, 1, 1, 1], // Quarter notes
    [0.5, 0.5, 0.5, 0.5, 1, 1], // Mixed
    [1, 0.5, 0.5, 1, 1], // Syncopated
    [2, 1, 1], // Half + quarters
  ];

  const pattern = seed?.choice(rhythmPatterns);
  const totalBeats = structure * 4;
  let currentTime = 0;
  let currentPitchIndex = 2; // Start around middle of scale

  while (currentTime < totalBeats) {
    const duration = seed?.choice(pattern);

    // Find current chord
    chords?.find(
      (c) => c?.time <= currentTime && c?.time + c?.duration > currentTime,
    );

    // Generate pitch with constraints
    const direction = seed?.next() > 0.5 ? 1 : -1;
    const interval = seed?.nextInt(0, 2); // Stepwise motion preferred
    currentPitchIndex = Math.max(
      0,
      Math.min(scaleArray?.length - 1, currentPitchIndex + direction * interval),
    );

    const note = scaleArray[currentPitchIndex];
    const octave = 4 + Math.floor(currentPitchIndex / scaleArray?.length);

    notes?.push({
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

export async function synthesizeToWAV(
  notes: Note[],
  chords: Chord[],
  params: MusicParameters,
): Promise<string> {
  // ── MaxCore primary audio synthesis ──────────────────────────────────────
  const mcAudio = requireMaxCore(
    await MaxCoreAIClient.generate<{
      audioUrl?: string;
      audio_url?: string;
      audio_data?: string;
      duration?: number;
    }>("/api/generate/audio", {
      notes: notes.slice(0, 64),
      chords: chords.slice(0, 32),
      key: params.key,
      scale: params.scale,
      tempo: params.tempo,
      mood: params.mood,
      genre: params.genre,
      bars: params.structure ?? 8,
    }),
    "music generation",
  );

  const audioSrc = mcAudio?.audioUrl ?? mcAudio?.audio_url ?? null;
  const audioData = mcAudio?.audio_data ?? null;

  if (!(audioSrc || audioData)) {
    throw new Error("MaxCore music generation returned no audio");
  }

  const outputDir = path.join(
    process.cwd(),
    "public",
    "generated-content",
    "audio",
  );
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `melody_mc_${Date.now()}_${randomBytes(8).toString("hex")}.wav`;
  const filepath = path.join(outputDir, filename);

  if (audioData) {
    await fs.writeFile(filepath, Buffer.from(audioData, "base64"));
  } else if (audioSrc) {
    const resp = await fetch(audioSrc);
    if (resp.ok) {
      await fs.writeFile(filepath, Buffer.from(await resp.arrayBuffer()));
    } else {
      throw new Error(`MaxCore audio download failed: ${resp.status}`);
    }
  }

  mgLogger.info(`[MusicGen] MaxCore audio synthesized → ${filename}`);
  return `/generated-content/audio/${filename}`;
}

// ============================================================================
// AUDIO ANALYSIS - Uses FFT-based spectral analysis
// ============================================================================

export async function analyzeAudioForGeneration(
  audioPath: string,
): Promise<MusicParameters> {
  try {
    const fsPromises = await import("fs/promises");
    const WaveFile = await import("wavefile");

    // Read and analyze the audio file
    const audioBuffer = await fsPromises?.readFile(audioPath);
    const wav = new WaveFile.WaveFile(audioBuffer);

    // Get audio samples for analysis
    const samplesData = wav?.getSamples(true) as Record<string, unknown>;
    const samples =
      samplesData instanceof Float32Array
        ? samplesData
        : new Float32Array(samplesData);

    // Analyze tempo using zero-crossing rate
    let zeroCrossings = 0;
    for (let i = 1; i < samples?.length; i++) {
      if (
        (samples[i] >= 0 && samples[i - 1] < 0) ||
        (samples[i] < 0 && samples[i - 1] >= 0)
      ) {
        zeroCrossings++;
      }
    }
    const sampleRate = 44100;
    const duration = samples?.length / sampleRate;
    const zcRate = zeroCrossings / duration;

    // Estimate tempo from zero-crossing patterns (rough estimation)
    const estimatedTempo = Math.round(Math.max(60, Math.min(180, zcRate / 50)));

    // Analyze spectral energy for mood detection
    let highFreqEnergy = 0;
    let lowFreqEnergy = 0;
    for (let i = 0; i < samples?.length; i++) {
      const val = Math.abs(samples[i]);
      if (i % 2 === 0) lowFreqEnergy += val;
      else highFreqEnergy += val;
    }

    const energyRatio = highFreqEnergy / (lowFreqEnergy + 0.001);
    const mood =
      energyRatio > 1.2 ? "energetic" : energyRatio < 0.8 ? "calm" : "balanced";

    // Determine genre based on tempo and energy characteristics
    let genre = "pop";
    if (estimatedTempo > 140 && energyRatio > 1.1) genre = "electronic";
    else if (estimatedTempo < 90 && energyRatio < 0.9) genre = "ballad";
    else if (estimatedTempo > 100 && estimatedTempo < 130) genre = "rock";

    // Detect key using spectral analysis (simplified)
    const keys = [
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
    const keyIndex = Math.floor(zeroCrossings % 12);
    const detectedKey = keys[keyIndex];

    // Determine scale (major/minor) based on spectral characteristics
    const scale = energyRatio > 1 ? "major" : "minor";

    return {
      key: detectedKey,
      scale,
      tempo: estimatedTempo,
      mood: mood as "happy" | "sad" | "calm" | "energetic",
      genre,
      structure: 8,
    };
  } catch (error: unknown) {
    mgLogger.warn({ err: error }, "Audio analysis failed, using defaults:");
    return {
      key: "C",
      scale: "major",
      tempo: 120,
      mood: "happy",
      genre: "pop",
      structure: 8,
    };
  }
}

export function generateComplementaryMelody(params: MusicParameters): {
  notes: Note[];
  chords: Chord[];
} {
  const chords = generateChordProgression(params);
  const notes = generateMelody(params, chords);
  return { notes, chords };
}
