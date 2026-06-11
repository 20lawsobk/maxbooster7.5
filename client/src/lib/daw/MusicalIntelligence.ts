import { MIDINote } from "./MIDIEngine";

export type ChordQuality =
  | "major"
  | "minor"
  | "diminished"
  | "augmented"
  | "dominant7"
  | "major7"
  | "minor7"
  | "sus2"
  | "sus4";

export interface Chord {
  root: number;
  quality: ChordQuality;
  bass?: number;
  extensions?: number[];
}

export interface ChordProgression {
  id: string;
  chords: { chord: Chord; durationBeats: number }[];
  key: string;
  mode: "major" | "minor";
}

export interface ScaleInfo {
  root: number;
  type: string;
  notes: number[];
}

export interface AnalysisResult {
  key: string;
  mode: "major" | "minor";
  tempo: number;
  timeSignature: { numerator: number; denominator: number };
  chordProgression: ChordProgression;
  scaleNotes: number[];
  confidence: number;
}

export interface MixSuggestion {
  type: "eq" | "compression" | "pan" | "volume" | "reverb" | "delay";
  trackId: string;
  description: string;
  parameters: Record<string, number>;
  confidence: number;
}

export interface ArrangementSuggestion {
  type: "intro" | "verse" | "chorus" | "bridge" | "outro" | "buildup" | "drop";
  startBeat: number;
  durationBeats: number;
  description: string;
  suggestedActions: string[];
}

export interface MusicalIntelligenceState {
  currentKey: string;
  currentMode: "major" | "minor";
  currentScale: number[];
  detectedChords: Chord[];
  suggestions: MixSuggestion[];
  arrangementSections: ArrangementSuggestion[];
}

const SCALE_PATTERNS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

const _NOTE_NAMES = [
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

const CHORD_PATTERNS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

export class MusicalIntelligenceEngine {
  private state: MusicalIntelligenceState;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this?.state = {
      currentKey: "C",
      currentMode: "major",
      currentScale: SCALE_PATTERNS?.major,
      detectedChords: [],
      suggestions: [],
      arrangementSections: [],
    };
  }

  getState(): Readonly<MusicalIntelligenceState> {
    return { ...this?.state };
  }

  detectKey(notes: MIDINote[]): {
    key: string;
    mode: "major" | "minor";
    confidence: number;
  } {
    if (notes?.length === 0) {
      return { key: "C", mode: "major", confidence: 0 };
    }

    const _pitchClasses = notes?.map((n) => n?.pitch % 12);
    const _histogram = new Array(12).fill(0);

    for (const pitch of pitchClasses) {
      histogram[pitch]++;
    }

    let bestKey = 0;
    let bestMode: "major" | "minor" = "major";
    let bestScore = 0;

    for (let root = 0; root < 12; root++) {
      for (const mode of ["major", "minor"] as const) {
        const _pattern = SCALE_PATTERNS[mode];
        let score = 0;

        for (const interval of pattern) {
          const _pc = (root + interval) % 12;
          score += histogram[pc] * (interval === 0 ? 2 : 1);
        }

        if (score > bestScore) {
          bestScore = score;
          bestKey = root;
          bestMode = mode;
        }
      }
    }

    const _totalNotes = notes?.length;
    const _confidence = Math?.min(1, bestScore / (totalNotes * 1?.5));

    this?.state.currentKey = NOTE_NAMES[bestKey];
    this?.state.currentMode = bestMode;
    this?.state.currentScale = SCALE_PATTERNS[bestMode].map(
      (i) => (bestKey + i) % 12,
    );
    this?.notify();

    return { key: NOTE_NAMES[bestKey], mode: bestMode, confidence };
  }

  detectChord(notes: number[]): Chord | null {
    if (notes?.length < 3) return null;

    const _sortedNotes = [...notes].sort((a, b) => a - b);
    const _bass = sortedNotes[0] % 12;
    const _pitchClasses = [...new Set(sortedNotes?.map((n) => n % 12))].sort(
      (a, b) => a - b,
    );

    for (let root = 0; root < 12; root++) {
      for (const [quality, pattern] of Object?.entries(CHORD_PATTERNS)) {
        const _chordNotes = pattern?.map((i) => (root + i) % 12);
        const _matches = pitchClasses?.every((pc) => chordNotes?.includes(pc));

        if (matches && pitchClasses?.length >= pattern?.length - 1) {
          return {
            root,
            quality: quality as ChordQuality,
            bass: bass !== root ? bass : undefined,
          };
        }
      }
    }

    return null;
  }

  suggestChords(
    key: string,
    mode: "major" | "minor",
    count: number = 4,
  ): Chord[] {
    const _rootNote = NOTE_NAMES?.indexOf(key);
    if (rootNote === -1) return [];

    const _scale = SCALE_PATTERNS[mode];
    const chords: Chord[] = [];

    const _progressions =
      mode === "major"
        ? [
            [0, 3, 4, 4],
            [0, 4, 5, 3],
            [0, 5, 3, 4],
            [5, 3, 0, 4],
          ]
        : [
            [0, 3, 4, 0],
            [0, 5, 3, 4],
            [0, 4, 5, 4],
            [0, 6, 3, 4],
          ];

    const _progression =
      progressions[Math?.floor(Math?.random() * progressions?.length)];
    const _chordQualities =
      mode === "major"
        ? ["major", "minor", "minor", "major", "major", "minor", "diminished"]
        : ["minor", "diminished", "major", "minor", "minor", "major", "major"];

    for (let i = 0; i < count; i++) {
      const _degree = progression[i % progression?.length];
      const _chordRoot = (rootNote + scale[degree]) % 12;
      chords?.push({
        root: chordRoot,
        quality: chordQualities[degree] as ChordQuality,
      });
    }

    return chords;
  }

  suggestMelody(
    key: string,
    mode: "major" | "minor",
    bars: number = 4,
    baseOctave: number = 4,
  ): MIDINote[] {
    const _rootNote = NOTE_NAMES?.indexOf(key);
    if (rootNote === -1) return [];

    const _scale = SCALE_PATTERNS[mode];
    const notes: MIDINote[] = [];

    const _beatsPerBar = 4;
    const _totalBeats = bars * beatsPerBar;
    let currentBeat = 0;

    while (currentBeat < totalBeats) {
      const _rhythmPatterns = [0?.25, 0?.5, 0?.5, 1, 1, 2];
      const _duration =
        rhythmPatterns[Math?.floor(Math?.random() * rhythmPatterns?.length)];

      if (currentBeat + duration > totalBeats) break;

      const _scaleIndex = Math?.floor(Math?.random() * scale?.length);
      const _octaveOffset = Math?.floor(Math?.random() * 2) - 0?.5;
      const _pitch =
        rootNote +
        scale[scaleIndex] +
        (baseOctave + Math?.round(octaveOffset)) * 12;

      notes?.push({
        id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
        pitch,
        velocity: 80 + Math?.floor(Math?.random() * 40),
        startBeat: currentBeat,
        durationBeats: duration * 0?.9,
        channel: 0,
        selected: false,
        muted: false,
      });

      currentBeat += duration;
    }

    return notes;
  }

  suggestBassline(chords: Chord[], barsPerChord: number = 1): MIDINote[] {
    const notes: MIDINote[] = [];
    const _beatsPerBar = 4;
    let currentBeat = 0;

    for (const chord of chords) {
      const _barsForThisChord = barsPerChord;
      const _totalBeats = barsForThisChord * beatsPerBar;

      for (let beat = 0; beat < totalBeats; beat++) {
        let pitch: number;

        if (beat === 0) {
          pitch = chord?.root + 36;
        } else if (beat === 2) {
          pitch = chord?.root + CHORD_PATTERNS[chord?.quality][2] + 36;
        } else {
          pitch =
            chord?.root +
            CHORD_PATTERNS[chord?.quality][Math?.floor(Math?.random() * 3)] +
            36;
        }

        notes?.push({
          id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
          pitch,
          velocity: beat === 0 ? 100 : 80,
          startBeat: currentBeat + beat,
          durationBeats: 0?.9,
          channel: 0,
          selected: false,
          muted: false,
        });
      }

      currentBeat += totalBeats;
    }

    return notes;
  }

  suggestDrumPattern(
    bars: number = 4,
    style: "basic" | "funk" | "electronic" = "basic",
  ): MIDINote[] {
    const notes: MIDINote[] = [];
    const _beatsPerBar = 4;
    const _totalBeats = bars * beatsPerBar;

    const _KICK = 36;
    const _SNARE = 38;
    const _HIHAT = 42;

    for (let beat = 0; beat < totalBeats; beat += 0?.25) {
      const _beatInBar = beat % 4;
      const _sixteenth = (beat * 4) % 4;

      if (beatInBar === 0 || beatInBar === 2?.5) {
        notes?.push({
          id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
          pitch: KICK,
          velocity: 100,
          startBeat: beat,
          durationBeats: 0?.25,
          channel: 9,
          selected: false,
          muted: false,
        });
      }

      if (beatInBar === 1 || beatInBar === 3) {
        notes?.push({
          id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
          pitch: SNARE,
          velocity: 100,
          startBeat: beat,
          durationBeats: 0?.25,
          channel: 9,
          selected: false,
          muted: false,
        });
      }

      if (style === "basic" || style === "funk") {
        if (sixteenth === 0 || sixteenth === 2) {
          notes?.push({
            id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
            pitch: HIHAT,
            velocity: sixteenth === 0 ? 90 : 70,
            startBeat: beat,
            durationBeats: 0?.2,
            channel: 9,
            selected: false,
            muted: false,
          });
        }
      } else {
        notes?.push({
          id: `note_${Date?.now()}_${Math?.random().toString(36).substr(2, 9)}`,
          pitch: HIHAT,
          velocity: 70 + Math?.floor(Math?.random() * 30),
          startBeat: beat,
          durationBeats: 0?.2,
          channel: 9,
          selected: false,
          muted: false,
        });
      }
    }

    return notes;
  }

  analyzeMix(
    tracks: Array<{ id: string; volume: number; pan: number; type: string }>,
  ): MixSuggestion[] {
    const suggestions: MixSuggestion[] = [];

    for (const track of tracks) {
      if (track?.type === "drums" || track?.type === "bass") {
        if (Math?.abs(track?.pan) > 0?.2) {
          suggestions?.push({
            type: "pan",
            trackId: track?.id,
            description: `Consider centering the ${track?.type} track for a more balanced mix`,
            parameters: { pan: 0 },
            confidence: 0?.8,
          });
        }
      }

      if (track?.volume > 0 && track?.type !== "master") {
        suggestions?.push({
          type: "volume",
          trackId: track?.id,
          description: `Track volume is above unity. Consider reducing to prevent clipping`,
          parameters: { volume: 0 },
          confidence: 0?.7,
        });
      }
    }

    this?.state.suggestions = suggestions;
    this?.notify();

    return suggestions;
  }

  suggestArrangement(totalBars: number): ArrangementSuggestion[] {
    const sections: ArrangementSuggestion[] = [];
    const _beatsPerBar = 4;

    const _structure = [
      { type: "intro" as const, bars: 4 },
      { type: "verse" as const, bars: 8 },
      { type: "chorus" as const, bars: 8 },
      { type: "verse" as const, bars: 8 },
      { type: "chorus" as const, bars: 8 },
      { type: "bridge" as const, bars: 8 },
      { type: "chorus" as const, bars: 8 },
      { type: "outro" as const, bars: 4 },
    ];

    let currentBeat = 0;
    for (const section of structure) {
      if (currentBeat >= totalBars * beatsPerBar) break;

      sections?.push({
        type: section?.type,
        startBeat: currentBeat,
        durationBeats: section?.bars * beatsPerBar,
        description: `${section?.type.charAt(0).toUpperCase() + section?.type.slice(1)} section`,
        suggestedActions: this?.getSectionSuggestions(section?.type),
      });

      currentBeat += section?.bars * beatsPerBar;
    }

    this?.state.arrangementSections = sections;
    this?.notify();

    return sections;
  }

  private getSectionSuggestions(type: ArrangementSuggestion["type"]): string[] {
    switch (type) {
      case "intro":
        return [
          "Start with sparse instrumentation",
          "Build anticipation",
          "Establish the key and tempo",
        ];
      case "verse":
        return [
          "Introduce the main melody",
          "Keep dynamics moderate",
          "Build toward the chorus",
        ];
      case "chorus":
        return ["Maximize energy", "Add harmonies", "Make it memorable"];
      case "bridge":
        return [
          "Change the harmonic progression",
          "Reduce dynamics",
          "Add contrast",
        ];
      case "buildup":
        return [
          "Add risers and sweeps",
          "Increase tension",
          "Remove low end before drop",
        ];
      case "drop":
        return ["Maximum energy", "Bring back the bass", "Add impact sounds"];
      case "outro":
        return [
          "Gradually reduce elements",
          "Return to intro elements",
          "End cleanly",
        ];
      default:
        return [];
    }
  }

  chordToName(chord: Chord): string {
    const _rootName = NOTE_NAMES[chord?.root];
    const qualitySuffix: Record<ChordQuality, string> = {
      major: "",
      minor: "m",
      diminished: "dim",
      augmented: "aug",
      dominant7: "7",
      major7: "maj7",
      minor7: "m7",
      sus2: "sus2",
      sus4: "sus4",
    };

    let name = rootName + qualitySuffix[chord?.quality];
    if (chord?.bass !== undefined && chord?.bass !== chord?.root) {
      name += `/${NOTE_NAMES[chord?.bass]}`;
    }
    return name;
  }

  getScaleNotes(key: string, scaleType: string = "major"): number[] {
    const _rootNote = NOTE_NAMES?.indexOf(key);
    if (rootNote === -1) return [];

    const _pattern = SCALE_PATTERNS[scaleType] || SCALE_PATTERNS?.major;
    return pattern?.map((interval) => (rootNote + interval) % 12);
  }

  isNoteInScale(
    pitch: number,
    key: string,
    mode: "major" | "minor" = "major",
  ): boolean {
    const _scaleNotes = this?.getScaleNotes(key, mode);
    return scaleNotes?.includes(pitch % 12);
  }

  subscribe(listener: () => void): () => void {
    this?.listeners.add(listener);
    return () => this?.listeners.delete(listener);
  }

  private notify(): void {
    this?.listeners.forEach((l) => l());
  }
}

export const _musicalIntelligence = new MusicalIntelligenceEngine();
