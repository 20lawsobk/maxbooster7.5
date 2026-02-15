import { logger } from '../logger.js';

export interface MidiNote {
  note: number;
  velocity: number;
  startTime: number;
  duration: number;
  channel?: number;
}

export interface GenerationConstraints {
  key: string;
  scale: string;
  tempo: number;
  timeSignature?: [number, number];
  octaveRange?: [number, number];
  velocityRange?: [number, number];
}

export interface HumanizationOptions {
  velocityVariation: number;
  timingOffsetMs: number;
  durationVariation: number;
  enabled: boolean;
}

export interface ArpeggiatorConfig {
  pattern: 'up' | 'down' | 'updown' | 'downup' | 'random' | 'order' | 'converge' | 'diverge';
  rate: '1/4' | '1/8' | '1/16' | '1/32' | '1/4T' | '1/8T' | '1/16T';
  octaves: number;
  gate: number;
  swing: number;
  velocity?: number;
  hold?: boolean;
}

export interface ChordProgressionConfig {
  style: 'pop' | 'jazz' | 'classical' | 'edm' | 'blues' | 'rnb' | 'custom';
  length: number;
  complexity: 'simple' | 'moderate' | 'complex';
  allowBorrowedChords: boolean;
  voicing: 'close' | 'open' | 'drop2' | 'drop3' | 'spread';
}

const SCALE_INTERVALS: Record<string, number[]> = {
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
  wholeTone: [0, 2, 4, 6, 8, 10],
  diminished: [0, 2, 3, 5, 6, 8, 9, 11],
  augmented: [0, 3, 4, 7, 8, 11],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  bebop: [0, 2, 4, 5, 7, 9, 10, 11],
  hungarianMinor: [0, 2, 3, 6, 7, 8, 11],
  spanish: [0, 1, 4, 5, 7, 8, 10],
  japanese: [0, 1, 5, 7, 8],
  arabian: [0, 2, 4, 5, 6, 8, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CHORD_PROGRESSIONS: Record<string, number[][]> = {
  pop: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]],
  jazz: [[0, 4, 7, 11], [5, 9, 0, 4], [2, 5, 9, 0], [7, 11, 2, 5]],
  classical: [[0, 4, 7], [5, 9, 0], [7, 11, 2], [0, 4, 7]],
  edm: [[0, 4, 7], [9, 0, 4], [5, 9, 0], [7, 11, 2]],
  blues: [[0, 4, 7, 10], [5, 9, 0, 3], [7, 11, 2, 5], [0, 4, 7, 10]],
  rnb: [[0, 4, 7, 11], [2, 5, 9, 0], [5, 9, 0, 4], [7, 10, 2, 5]],
};

const RHYTHM_PATTERNS: Record<string, number[]> = {
  straight: [0, 0.25, 0.5, 0.75],
  swing: [0, 0.33, 0.5, 0.83],
  triplet: [0, 0.33, 0.67],
  dotted: [0, 0.375, 0.75],
  syncopated: [0, 0.25, 0.375, 0.625, 0.75],
  hiphop: [0, 0.25, 0.5, 0.625, 0.875],
  trap: [0, 0.125, 0.25, 0.5, 0.625, 0.75, 0.875],
  house: [0, 0.25, 0.5, 0.75],
  dnb: [0, 0.167, 0.5, 0.667],
};

class MidiGeneratorService {
  private getScaleNotes(rootNote: number, scale: string, octaveRange: [number, number]): number[] {
    const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major;
    const notes: number[] = [];
    
    for (let octave = octaveRange[0]; octave <= octaveRange[1]; octave++) {
      for (const interval of intervals) {
        const note = rootNote + (octave * 12) + interval;
        if (note >= 0 && note <= 127) {
          notes.push(note);
        }
      }
    }
    
    return notes;
  }

  private noteNameToMidi(noteName: string): number {
    const match = noteName.match(/^([A-G]#?)(\d)?$/i);
    if (!match) return 60;
    
    const [, note, octaveStr] = match;
    const noteIndex = NOTE_NAMES.indexOf(note.toUpperCase());
    const octave = octaveStr ? parseInt(octaveStr) : 4;
    
    return noteIndex + (octave + 1) * 12;
  }

  private applyHumanization(notes: MidiNote[], options: HumanizationOptions): MidiNote[] {
    if (!options.enabled) return notes;
    
    return notes.map(note => {
      const velocityOffset = (Math.random() - 0.5) * 2 * options.velocityVariation;
      const timingOffset = (Math.random() - 0.5) * 2 * options.timingOffsetMs / 1000;
      const durationOffset = (Math.random() - 0.5) * 2 * options.durationVariation;
      
      return {
        ...note,
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity + velocityOffset))),
        startTime: Math.max(0, note.startTime + timingOffset),
        duration: Math.max(0.01, note.duration * (1 + durationOffset)),
      };
    });
  }

  generateMelody(
    constraints: GenerationConstraints,
    bars: number = 4,
    density: 'sparse' | 'normal' | 'dense' = 'normal',
    humanization?: HumanizationOptions
  ): MidiNote[] {
    const rootNote = this.noteNameToMidi(constraints.key);
    const octaveRange = constraints.octaveRange || [4, 5];
    const scaleNotes = this.getScaleNotes(rootNote % 12, constraints.scale, octaveRange);
    
    const beatsPerBar = constraints.timeSignature?.[0] || 4;
    const totalBeats = bars * beatsPerBar;
    const beatDuration = 60 / constraints.tempo;
    
    const notesPerBeat = density === 'sparse' ? 0.5 : density === 'dense' ? 2 : 1;
    const totalNotes = Math.round(totalBeats * notesPerBeat);
    
    const notes: MidiNote[] = [];
    let currentTime = 0;
    let lastNoteIndex = Math.floor(scaleNotes.length / 2);
    
    for (let i = 0; i < totalNotes; i++) {
      const stepSize = Math.floor(Math.random() * 5) - 2;
      lastNoteIndex = Math.max(0, Math.min(scaleNotes.length - 1, lastNoteIndex + stepSize));
      
      const velocity = constraints.velocityRange
        ? Math.floor(Math.random() * (constraints.velocityRange[1] - constraints.velocityRange[0]) + constraints.velocityRange[0])
        : Math.floor(Math.random() * 40 + 70);
      
      const noteDuration = beatDuration * (0.5 + Math.random() * 0.5);
      
      notes.push({
        note: scaleNotes[lastNoteIndex],
        velocity,
        startTime: currentTime,
        duration: noteDuration,
      });
      
      currentTime += beatDuration / notesPerBeat;
    }
    
    return humanization ? this.applyHumanization(notes, humanization) : notes;
  }

  generateRhythm(
    constraints: GenerationConstraints,
    bars: number = 4,
    pattern: keyof typeof RHYTHM_PATTERNS = 'straight',
    noteValue: number = 60
  ): MidiNote[] {
    const beatDuration = 60 / constraints.tempo;
    const beatsPerBar = constraints.timeSignature?.[0] || 4;
    const patternPositions = RHYTHM_PATTERNS[pattern] || RHYTHM_PATTERNS.straight;
    
    const notes: MidiNote[] = [];
    
    for (let bar = 0; bar < bars; bar++) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        for (const position of patternPositions) {
          const startTime = (bar * beatsPerBar + beat + position) * beatDuration;
          const velocity = position === 0 ? 110 : position === 0.5 ? 90 : 70 + Math.floor(Math.random() * 30);
          
          notes.push({
            note: noteValue,
            velocity,
            startTime,
            duration: beatDuration * 0.1,
          });
        }
      }
    }
    
    return notes;
  }

  generateChords(
    constraints: GenerationConstraints,
    config: ChordProgressionConfig
  ): MidiNote[] {
    const rootNote = this.noteNameToMidi(constraints.key);
    const beatDuration = 60 / constraints.tempo;
    const progression = CHORD_PROGRESSIONS[config.style] || CHORD_PROGRESSIONS.pop;
    
    const notes: MidiNote[] = [];
    let currentTime = 0;
    const chordDuration = beatDuration * 4;
    
    for (let i = 0; i < config.length; i++) {
      const chordIntervals = progression[i % progression.length];
      const baseOctave = 3;
      
      for (const interval of chordIntervals) {
        const midiNote = (rootNote % 12) + interval + (baseOctave * 12);
        
        notes.push({
          note: midiNote,
          velocity: 80 + Math.floor(Math.random() * 20),
          startTime: currentTime,
          duration: chordDuration * 0.9,
        });
      }
      
      currentTime += chordDuration;
    }
    
    return notes;
  }

  arpeggiate(
    inputNotes: MidiNote[],
    config: ArpeggiatorConfig,
    tempo: number
  ): MidiNote[] {
    const uniquePitches = [...new Set(inputNotes.map(n => n.note))].sort((a, b) => a - b);
    if (uniquePitches.length === 0) return [];
    
    const expandedNotes: number[] = [];
    for (let oct = 0; oct < config.octaves; oct++) {
      for (const pitch of uniquePitches) {
        expandedNotes.push(pitch + oct * 12);
      }
    }
    
    let orderedNotes: number[];
    switch (config.pattern) {
      case 'up':
        orderedNotes = [...expandedNotes];
        break;
      case 'down':
        orderedNotes = [...expandedNotes].reverse();
        break;
      case 'updown':
        orderedNotes = [...expandedNotes, ...expandedNotes.slice(1, -1).reverse()];
        break;
      case 'downup':
        orderedNotes = [...expandedNotes.reverse(), ...expandedNotes.slice(1, -1)];
        break;
      case 'random':
        orderedNotes = [...expandedNotes].sort(() => Math.random() - 0.5);
        break;
      case 'converge':
        orderedNotes = [];
        for (let i = 0; i < Math.ceil(expandedNotes.length / 2); i++) {
          orderedNotes.push(expandedNotes[i]);
          if (expandedNotes.length - 1 - i !== i) {
            orderedNotes.push(expandedNotes[expandedNotes.length - 1 - i]);
          }
        }
        break;
      case 'diverge':
        orderedNotes = [];
        const mid = Math.floor(expandedNotes.length / 2);
        for (let i = 0; i <= mid; i++) {
          if (mid + i < expandedNotes.length) orderedNotes.push(expandedNotes[mid + i]);
          if (mid - i >= 0 && i !== 0) orderedNotes.push(expandedNotes[mid - i]);
        }
        break;
      default:
        orderedNotes = [...expandedNotes];
    }
    
    const rateMs = this.rateToMs(config.rate, tempo);
    const noteDuration = (rateMs / 1000) * config.gate;
    
    const result: MidiNote[] = [];
    let time = 0;
    const velocity = config.velocity || 100;
    
    for (const note of orderedNotes) {
      const swingOffset = (result.length % 2 === 1) ? (config.swing / 100) * (rateMs / 1000) : 0;
      
      result.push({
        note,
        velocity,
        startTime: time + swingOffset,
        duration: noteDuration,
      });
      
      time += rateMs / 1000;
    }
    
    return result;
  }

  private rateToMs(rate: string, tempo: number): number {
    const beatMs = 60000 / tempo;
    const rates: Record<string, number> = {
      '1/4': beatMs,
      '1/8': beatMs / 2,
      '1/16': beatMs / 4,
      '1/32': beatMs / 8,
      '1/4T': beatMs * 2 / 3,
      '1/8T': beatMs / 3,
      '1/16T': beatMs / 6,
    };
    return rates[rate] || beatMs / 2;
  }

  generateChordProgression(
    constraints: GenerationConstraints,
    config: ChordProgressionConfig
  ): { chords: string[]; notes: MidiNote[][] } {
    const rootNote = this.noteNameToMidi(constraints.key) % 12;
    const scaleIntervals = SCALE_INTERVALS[constraints.scale] || SCALE_INTERVALS.major;
    
    const chordQualities: Record<number, string> = {
      0: 'maj',
      1: 'min',
      2: 'min',
      3: 'maj',
      4: 'maj',
      5: 'min',
      6: 'dim',
    };
    
    const progressions: Record<string, number[]> = {
      pop: [0, 3, 4, 0],
      jazz: [1, 4, 0, 3],
      classical: [0, 3, 4, 0],
      edm: [0, 5, 3, 4],
      blues: [0, 0, 0, 0, 3, 3, 0, 0, 4, 3, 0, 4],
      rnb: [1, 4, 0, 5],
    };
    
    const degreeSequence = progressions[config.style] || progressions.pop;
    const chords: string[] = [];
    const noteArrays: MidiNote[][] = [];
    
    const beatDuration = 60 / constraints.tempo;
    let currentTime = 0;
    
    for (let i = 0; i < config.length; i++) {
      const degree = degreeSequence[i % degreeSequence.length];
      const chordRoot = (rootNote + scaleIntervals[degree]) % 12;
      const quality = chordQualities[degree] || 'maj';
      
      const chordName = `${NOTE_NAMES[chordRoot]}${quality}`;
      chords.push(chordName);
      
      const chordNotes = this.buildChord(chordRoot, quality, config.voicing);
      const midiNotes: MidiNote[] = chordNotes.map(note => ({
        note: note + 48,
        velocity: 85,
        startTime: currentTime,
        duration: beatDuration * 4 * 0.95,
      }));
      
      noteArrays.push(midiNotes);
      currentTime += beatDuration * 4;
    }
    
    return { chords, notes: noteArrays };
  }

  private buildChord(root: number, quality: string, voicing: string): number[] {
    const intervals: Record<string, number[]> = {
      maj: [0, 4, 7],
      min: [0, 3, 7],
      dim: [0, 3, 6],
      aug: [0, 4, 8],
      maj7: [0, 4, 7, 11],
      min7: [0, 3, 7, 10],
      dom7: [0, 4, 7, 10],
      dim7: [0, 3, 6, 9],
      sus2: [0, 2, 7],
      sus4: [0, 5, 7],
      add9: [0, 4, 7, 14],
    };
    
    const chordIntervals = intervals[quality] || intervals.maj;
    let notes = chordIntervals.map(i => root + i);
    
    switch (voicing) {
      case 'open':
        if (notes.length >= 3) {
          notes[1] += 12;
        }
        break;
      case 'drop2':
        if (notes.length >= 4) {
          notes[2] -= 12;
          notes.sort((a, b) => a - b);
        }
        break;
      case 'drop3':
        if (notes.length >= 4) {
          notes[1] -= 12;
          notes.sort((a, b) => a - b);
        }
        break;
      case 'spread':
        notes = notes.map((n, i) => n + i * 12);
        break;
    }
    
    return notes;
  }

  getAvailableScales(): string[] {
    return Object.keys(SCALE_INTERVALS);
  }

  getAvailableRhythmPatterns(): string[] {
    return Object.keys(RHYTHM_PATTERNS);
  }

  getAvailableChordStyles(): string[] {
    return Object.keys(CHORD_PROGRESSIONS);
  }
}

export const midiGeneratorService = new MidiGeneratorService();
