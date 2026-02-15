import { logger } from '../logger.js';

export interface TuningSystem {
  id: string;
  name: string;
  description: string;
  cents: number[];
  reference: { note: number; frequency: number };
}

export interface MicrotonalScale {
  id: string;
  name: string;
  intervals: number[];
  description?: string;
  category: 'western' | 'eastern' | 'experimental' | 'historical' | 'custom';
}

export interface ScaleSyncConfig {
  projectId: string;
  scale: string;
  rootNote: number;
  tuningSystem: string;
  affectedClips: string[];
}

const EQUAL_TEMPERAMENT_CENTS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];

const TUNING_SYSTEMS: Record<string, TuningSystem> = {
  equal12: {
    id: 'equal12',
    name: '12-TET (Equal Temperament)',
    description: 'Standard Western equal temperament with 12 equal semitones',
    cents: EQUAL_TEMPERAMENT_CENTS,
    reference: { note: 69, frequency: 440 },
  },
  justIntonation: {
    id: 'justIntonation',
    name: 'Just Intonation',
    description: 'Pure intervals based on natural harmonic ratios',
    cents: [0, 112, 204, 316, 386, 498, 590, 702, 814, 884, 996, 1088],
    reference: { note: 69, frequency: 440 },
  },
  pythagorean: {
    id: 'pythagorean',
    name: 'Pythagorean Tuning',
    description: 'Based on perfect fifths (3:2 ratio)',
    cents: [0, 90, 204, 294, 408, 498, 612, 702, 792, 906, 996, 1110],
    reference: { note: 69, frequency: 440 },
  },
  meantone: {
    id: 'meantone',
    name: 'Quarter-Comma Meantone',
    description: 'Renaissance/Baroque tuning with pure major thirds',
    cents: [0, 76, 193, 310, 386, 503, 579, 697, 773, 890, 1007, 1083],
    reference: { note: 69, frequency: 440 },
  },
  werckmeister3: {
    id: 'werckmeister3',
    name: 'Werckmeister III',
    description: 'Well temperament from the Baroque era',
    cents: [0, 90, 192, 294, 390, 498, 588, 696, 792, 888, 996, 1092],
    reference: { note: 69, frequency: 440 },
  },
  kirnberger3: {
    id: 'kirnberger3',
    name: 'Kirnberger III',
    description: '18th century well temperament',
    cents: [0, 90, 193, 294, 386, 498, 590, 697, 792, 890, 996, 1088],
    reference: { note: 69, frequency: 440 },
  },
  equal19: {
    id: 'equal19',
    name: '19-TET',
    description: 'Equal temperament with 19 notes per octave',
    cents: Array.from({ length: 19 }, (_, i) => (1200 / 19) * i),
    reference: { note: 69, frequency: 440 },
  },
  equal24: {
    id: 'equal24',
    name: '24-TET (Quarter Tones)',
    description: 'Quarter-tone equal temperament',
    cents: Array.from({ length: 24 }, (_, i) => 50 * i),
    reference: { note: 69, frequency: 440 },
  },
  equal31: {
    id: 'equal31',
    name: '31-TET',
    description: 'Extended meantone temperament',
    cents: Array.from({ length: 31 }, (_, i) => (1200 / 31) * i),
    reference: { note: 69, frequency: 440 },
  },
  equal53: {
    id: 'equal53',
    name: '53-TET (Turkish)',
    description: 'Approximates both Pythagorean and Just Intonation',
    cents: Array.from({ length: 53 }, (_, i) => (1200 / 53) * i),
    reference: { note: 69, frequency: 440 },
  },
  bohlenPierce: {
    id: 'bohlenPierce',
    name: 'Bohlen-Pierce',
    description: 'Non-octave scale based on 3:1 ratio',
    cents: [0, 133, 267, 400, 533, 667, 800, 933, 1067, 1200, 1333, 1467, 1600],
    reference: { note: 69, frequency: 440 },
  },
  arabic: {
    id: 'arabic',
    name: 'Arabic Maqam',
    description: 'Middle Eastern quarter-tone system',
    cents: [0, 100, 150, 200, 300, 350, 400, 500, 600, 700, 750, 800, 900, 950, 1000, 1100, 1150],
    reference: { note: 69, frequency: 440 },
  },
  indian: {
    id: 'indian',
    name: 'Indian Shruti',
    description: '22 shrutis of Indian classical music',
    cents: [0, 22, 70, 90, 112, 182, 204, 294, 316, 386, 408, 498, 520, 590, 612, 702, 792, 814, 884, 906, 996, 1018],
    reference: { note: 69, frequency: 440 },
  },
  gamelan: {
    id: 'gamelan',
    name: 'Javanese Gamelan (Slendro)',
    description: 'Traditional Indonesian 5-tone scale',
    cents: [0, 240, 480, 720, 960],
    reference: { note: 69, frequency: 440 },
  },
  gamelanPelog: {
    id: 'gamelanPelog',
    name: 'Javanese Gamelan (Pelog)',
    description: 'Traditional Indonesian 7-tone scale',
    cents: [0, 120, 270, 540, 670, 780, 950],
    reference: { note: 69, frequency: 440 },
  },
};

const MICROTONAL_SCALES: Record<string, MicrotonalScale> = {
  chromatic: {
    id: 'chromatic',
    name: 'Chromatic',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    category: 'western',
  },
  major: {
    id: 'major',
    name: 'Major',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    category: 'western',
  },
  minor: {
    id: 'minor',
    name: 'Natural Minor',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    category: 'western',
  },
  harmonicMinor: {
    id: 'harmonicMinor',
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    category: 'western',
  },
  melodicMinor: {
    id: 'melodicMinor',
    name: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    category: 'western',
  },
  dorian: {
    id: 'dorian',
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    category: 'western',
  },
  phrygian: {
    id: 'phrygian',
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    category: 'western',
  },
  lydian: {
    id: 'lydian',
    name: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    category: 'western',
  },
  mixolydian: {
    id: 'mixolydian',
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    category: 'western',
  },
  locrian: {
    id: 'locrian',
    name: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    category: 'western',
  },
  wholeTone: {
    id: 'wholeTone',
    name: 'Whole Tone',
    intervals: [0, 2, 4, 6, 8, 10],
    category: 'western',
  },
  diminished: {
    id: 'diminished',
    name: 'Diminished (Octatonic)',
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    category: 'western',
  },
  augmented: {
    id: 'augmented',
    name: 'Augmented',
    intervals: [0, 3, 4, 7, 8, 11],
    category: 'western',
  },
  pentatonicMajor: {
    id: 'pentatonicMajor',
    name: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    category: 'western',
  },
  pentatonicMinor: {
    id: 'pentatonicMinor',
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    category: 'western',
  },
  blues: {
    id: 'blues',
    name: 'Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    category: 'western',
  },
  bebop: {
    id: 'bebop',
    name: 'Bebop Dominant',
    intervals: [0, 2, 4, 5, 7, 9, 10, 11],
    category: 'western',
  },
  phrygianDominant: {
    id: 'phrygianDominant',
    name: 'Phrygian Dominant',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    category: 'eastern',
  },
  doubleHarmonic: {
    id: 'doubleHarmonic',
    name: 'Double Harmonic (Byzantine)',
    intervals: [0, 1, 4, 5, 7, 8, 11],
    category: 'eastern',
  },
  hungarianMinor: {
    id: 'hungarianMinor',
    name: 'Hungarian Minor',
    intervals: [0, 2, 3, 6, 7, 8, 11],
    category: 'eastern',
  },
  persian: {
    id: 'persian',
    name: 'Persian',
    intervals: [0, 1, 4, 5, 6, 8, 11],
    category: 'eastern',
  },
  hirajoshi: {
    id: 'hirajoshi',
    name: 'Hirajoshi',
    intervals: [0, 2, 3, 7, 8],
    category: 'eastern',
    description: 'Japanese pentatonic scale',
  },
  insen: {
    id: 'insen',
    name: 'In-Sen',
    intervals: [0, 1, 5, 7, 10],
    category: 'eastern',
    description: 'Japanese scale used in shakuhachi music',
  },
  iwato: {
    id: 'iwato',
    name: 'Iwato',
    intervals: [0, 1, 5, 6, 10],
    category: 'eastern',
    description: 'Japanese pentatonic scale',
  },
  maqamBayati: {
    id: 'maqamBayati',
    name: 'Maqam Bayati',
    intervals: [0, 1.5, 3, 5, 7, 8, 10],
    category: 'eastern',
    description: 'Arabic maqam with quarter tones',
  },
  maqamHijaz: {
    id: 'maqamHijaz',
    name: 'Maqam Hijaz',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    category: 'eastern',
  },
  maqamRast: {
    id: 'maqamRast',
    name: 'Maqam Rast',
    intervals: [0, 2, 3.5, 5, 7, 9, 10.5],
    category: 'eastern',
  },
  ragBhairav: {
    id: 'ragBhairav',
    name: 'Raga Bhairav',
    intervals: [0, 1, 4, 5, 7, 8, 11],
    category: 'eastern',
  },
  ragBhairavi: {
    id: 'ragBhairavi',
    name: 'Raga Bhairavi',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    category: 'eastern',
  },
  prometheus: {
    id: 'prometheus',
    name: 'Prometheus',
    intervals: [0, 2, 4, 6, 9, 10],
    category: 'experimental',
    description: 'Scriabin\'s mystic scale',
  },
  tritone: {
    id: 'tritone',
    name: 'Tritone',
    intervals: [0, 1, 4, 6, 7, 10],
    category: 'experimental',
  },
  enigmatic: {
    id: 'enigmatic',
    name: 'Enigmatic',
    intervals: [0, 1, 4, 6, 8, 10, 11],
    category: 'experimental',
  },
  superLocrian: {
    id: 'superLocrian',
    name: 'Super Locrian (Altered)',
    intervals: [0, 1, 3, 4, 6, 8, 10],
    category: 'experimental',
  },
  lydianAugmented: {
    id: 'lydianAugmented',
    name: 'Lydian Augmented',
    intervals: [0, 2, 4, 6, 8, 9, 11],
    category: 'experimental',
  },
  harmonicMajor: {
    id: 'harmonicMajor',
    name: 'Harmonic Major',
    intervals: [0, 2, 4, 5, 7, 8, 11],
    category: 'experimental',
  },
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

class MicrotonalService {
  private scaleSyncConfigs: Map<string, ScaleSyncConfig> = new Map();

  getTuningSystem(id: string): TuningSystem | undefined {
    return TUNING_SYSTEMS[id];
  }

  getAllTuningSystems(): TuningSystem[] {
    return Object.values(TUNING_SYSTEMS);
  }

  getScale(id: string): MicrotonalScale | undefined {
    return MICROTONAL_SCALES[id];
  }

  getAllScales(): MicrotonalScale[] {
    return Object.values(MICROTONAL_SCALES);
  }

  getScalesByCategory(category: string): MicrotonalScale[] {
    return Object.values(MICROTONAL_SCALES).filter(s => s.category === category);
  }

  noteToFrequency(
    midiNote: number,
    tuningSystem: string = 'equal12',
    referenceNote: number = 69,
    referenceFrequency: number = 440
  ): number {
    const tuning = TUNING_SYSTEMS[tuningSystem] || TUNING_SYSTEMS.equal12;
    const octave = Math.floor(midiNote / tuning.cents.length);
    const noteInOctave = midiNote % tuning.cents.length;
    const cents = tuning.cents[noteInOctave] || 0;
    const totalCents = octave * 1200 + cents;
    const refOctave = Math.floor(referenceNote / 12);
    const refNoteInOctave = referenceNote % 12;
    const refCents = refOctave * 1200 + (tuning.cents[refNoteInOctave] || 0);
    const centsDiff = totalCents - refCents;
    return referenceFrequency * Math.pow(2, centsDiff / 1200);
  }

  frequencyToNote(
    frequency: number,
    tuningSystem: string = 'equal12',
    referenceNote: number = 69,
    referenceFrequency: number = 440
  ): { note: number; cents: number } {
    const tuning = TUNING_SYSTEMS[tuningSystem] || TUNING_SYSTEMS.equal12;
    const centsDiff = 1200 * Math.log2(frequency / referenceFrequency);
    const refOctave = Math.floor(referenceNote / 12);
    const refNoteInOctave = referenceNote % 12;
    const refCents = refOctave * 1200 + (tuning.cents[refNoteInOctave] || 0);
    const targetCents = refCents + centsDiff;
    const octave = Math.floor(targetCents / 1200);
    const centsInOctave = targetCents - octave * 1200;
    let closestNote = 0;
    let minDiff = Infinity;
    for (let i = 0; i < tuning.cents.length; i++) {
      const diff = Math.abs(tuning.cents[i] - centsInOctave);
      if (diff < minDiff) {
        minDiff = diff;
        closestNote = i;
      }
    }
    const midiNote = octave * tuning.cents.length + closestNote;
    const centsDeviation = centsInOctave - tuning.cents[closestNote];
    return { note: midiNote, cents: centsDeviation };
  }

  getMicrotonalInterval(interval: number, tuningSystem: string = 'equal12'): number {
    const tuning = TUNING_SYSTEMS[tuningSystem] || TUNING_SYSTEMS.equal12;
    const octaves = Math.floor(interval / tuning.cents.length);
    const noteInOctave = interval % tuning.cents.length;
    return octaves * 1200 + (tuning.cents[noteInOctave] || 0);
  }

  getScaleFrequencies(
    rootNote: number,
    scaleId: string,
    tuningSystem: string = 'equal12',
    octaves: number = 1
  ): number[] {
    const scale = MICROTONAL_SCALES[scaleId] || MICROTONAL_SCALES.major;
    const frequencies: number[] = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (const interval of scale.intervals) {
        const midiNote = rootNote + Math.round(interval) + oct * 12;
        frequencies.push(this.noteToFrequency(midiNote, tuningSystem));
      }
    }
    return frequencies;
  }

  fitNoteToScale(
    midiNote: number,
    rootNote: number,
    scaleId: string
  ): number {
    const scale = MICROTONAL_SCALES[scaleId] || MICROTONAL_SCALES.major;
    const intervals = scale.intervals.map(i => Math.round(i));
    const noteClass = (midiNote - rootNote + 1200) % 12;
    if (intervals.includes(noteClass)) {
      return midiNote;
    }
    let closestInterval = intervals[0];
    let minDistance = Infinity;
    for (const interval of intervals) {
      const distance = Math.min(
        Math.abs(noteClass - interval),
        12 - Math.abs(noteClass - interval)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestInterval = interval;
      }
    }
    const octave = Math.floor((midiNote - rootNote) / 12);
    return rootNote + closestInterval + octave * 12;
  }

  fitNotesToScale(
    notes: { note: number; [key: string]: any }[],
    rootNote: number,
    scaleId: string
  ): { note: number; [key: string]: any }[] {
    return notes.map(n => ({
      ...n,
      note: this.fitNoteToScale(n.note, rootNote, scaleId),
    }));
  }

  createCustomTuning(
    id: string,
    name: string,
    cents: number[],
    description?: string
  ): TuningSystem {
    const tuning: TuningSystem = {
      id,
      name,
      description: description || 'Custom tuning system',
      cents,
      reference: { note: 69, frequency: 440 },
    };
    TUNING_SYSTEMS[id] = tuning;
    return tuning;
  }

  createCustomScale(
    id: string,
    name: string,
    intervals: number[],
    description?: string
  ): MicrotonalScale {
    const scale: MicrotonalScale = {
      id,
      name,
      intervals,
      description,
      category: 'custom',
    };
    MICROTONAL_SCALES[id] = scale;
    return scale;
  }

  setScaleSync(config: ScaleSyncConfig): void {
    this.scaleSyncConfigs.set(config.projectId, config);
    logger.info(`Scale sync set for project ${config.projectId}: ${config.scale} in ${config.rootNote}`);
  }

  getScaleSync(projectId: string): ScaleSyncConfig | undefined {
    return this.scaleSyncConfigs.get(projectId);
  }

  removeScaleSync(projectId: string): void {
    this.scaleSyncConfigs.delete(projectId);
  }

  getScaleNotes(rootNote: number, scaleId: string, octaves: number = 1): number[] {
    const scale = MICROTONAL_SCALES[scaleId] || MICROTONAL_SCALES.major;
    const notes: number[] = [];
    for (let oct = 0; oct < octaves; oct++) {
      for (const interval of scale.intervals) {
        notes.push(rootNote + Math.round(interval) + oct * 12);
      }
    }
    return notes.filter(n => n >= 0 && n <= 127);
  }

  getChordInScale(
    rootNote: number,
    scaleId: string,
    degree: number,
    extensions: number = 3
  ): number[] {
    const scaleNotes = this.getScaleNotes(rootNote, scaleId, 3);
    const chord: number[] = [];
    for (let i = 0; i < extensions; i++) {
      const idx = degree + i * 2;
      if (idx < scaleNotes.length) {
        chord.push(scaleNotes[idx]);
      }
    }
    return chord;
  }

  transposeInScale(
    midiNote: number,
    steps: number,
    rootNote: number,
    scaleId: string
  ): number {
    const scaleNotes = this.getScaleNotes(rootNote, scaleId, 11);
    const fittedNote = this.fitNoteToScale(midiNote, rootNote, scaleId);
    const currentIndex = scaleNotes.indexOf(fittedNote);
    if (currentIndex === -1) {
      const closestIndex = scaleNotes.reduce((closest, note, idx) => {
        return Math.abs(note - fittedNote) < Math.abs(scaleNotes[closest] - fittedNote) ? idx : closest;
      }, 0);
      const newIndex = Math.max(0, Math.min(scaleNotes.length - 1, closestIndex + steps));
      return scaleNotes[newIndex];
    }
    const newIndex = Math.max(0, Math.min(scaleNotes.length - 1, currentIndex + steps));
    return scaleNotes[newIndex];
  }

  getIntervalName(semitones: number): string {
    const intervals: Record<number, string> = {
      0: 'Unison',
      1: 'Minor 2nd',
      2: 'Major 2nd',
      3: 'Minor 3rd',
      4: 'Major 3rd',
      5: 'Perfect 4th',
      6: 'Tritone',
      7: 'Perfect 5th',
      8: 'Minor 6th',
      9: 'Major 6th',
      10: 'Minor 7th',
      11: 'Major 7th',
      12: 'Octave',
    };
    if (semitones < 0) {
      return `Descending ${intervals[Math.abs(semitones) % 12] || `${Math.abs(semitones)} semitones`}`;
    }
    const octaves = Math.floor(semitones / 12);
    const remainder = semitones % 12;
    if (octaves === 0) {
      return intervals[remainder] || `${semitones} semitones`;
    }
    if (remainder === 0) {
      return `${octaves} Octave${octaves > 1 ? 's' : ''}`;
    }
    return `${octaves} Octave${octaves > 1 ? 's' : ''} + ${intervals[remainder]}`;
  }

  getNoteInfo(midiNote: number, tuningSystem: string = 'equal12'): {
    name: string;
    octave: number;
    frequency: number;
    cents: number;
  } {
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    const frequency = this.noteToFrequency(midiNote, tuningSystem);
    const tuning = TUNING_SYSTEMS[tuningSystem] || TUNING_SYSTEMS.equal12;
    const cents = tuning.cents[noteIndex] || 0;
    return {
      name: NOTE_NAMES[noteIndex],
      octave,
      frequency,
      cents,
    };
  }
}

export const microtonalService = new MicrotonalService();
