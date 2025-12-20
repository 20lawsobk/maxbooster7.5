import { logger } from '../logger.js';

export interface MidiNote {
  note: number;
  velocity: number;
  startTime: number;
  duration: number;
  channel?: number;
}

export interface TransformOptions {
  preserveRhythm?: boolean;
  preserveVelocity?: boolean;
  quantize?: number;
}

export interface OrnamentConfig {
  type: 'trill' | 'mordent' | 'turn' | 'graceNote' | 'tremolo' | 'glissando';
  speed?: number;
  interval?: number;
  count?: number;
}

export interface StrumConfig {
  direction: 'up' | 'down' | 'alternating';
  speed: number;
  velocityCurve: 'linear' | 'exponential' | 'logarithmic';
  humanize: boolean;
}

export interface AccelerationConfig {
  type: 'accelerando' | 'ritardando' | 'rubato';
  factor: number;
  curve: 'linear' | 'exponential' | 'sine';
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
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

class MidiTransformService {
  transpose(notes: MidiNote[], semitones: number): MidiNote[] {
    return notes.map(note => ({
      ...note,
      note: Math.max(0, Math.min(127, note.note + semitones)),
    }));
  }

  invert(notes: MidiNote[], pivotNote?: number): MidiNote[] {
    if (notes.length === 0) return [];
    
    const pivot = pivotNote ?? notes.reduce((sum, n) => sum + n.note, 0) / notes.length;
    
    return notes.map(note => ({
      ...note,
      note: Math.max(0, Math.min(127, Math.round(2 * pivot - note.note))),
    }));
  }

  retrograde(notes: MidiNote[]): MidiNote[] {
    if (notes.length === 0) return [];
    
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    const totalDuration = sorted[sorted.length - 1].startTime + sorted[sorted.length - 1].duration;
    
    return sorted.map(note => ({
      ...note,
      startTime: totalDuration - note.startTime - note.duration,
    })).sort((a, b) => a.startTime - b.startTime);
  }

  retrogradeInversion(notes: MidiNote[], pivotNote?: number): MidiNote[] {
    return this.retrograde(this.invert(notes, pivotNote));
  }

  augment(notes: MidiNote[], factor: number): MidiNote[] {
    return notes.map(note => ({
      ...note,
      startTime: note.startTime * factor,
      duration: note.duration * factor,
    }));
  }

  diminish(notes: MidiNote[], factor: number): MidiNote[] {
    return this.augment(notes, 1 / factor);
  }

  addOrnament(notes: MidiNote[], config: OrnamentConfig): MidiNote[] {
    const result: MidiNote[] = [];
    
    for (const note of notes) {
      switch (config.type) {
        case 'trill':
          result.push(...this.createTrill(note, config));
          break;
        case 'mordent':
          result.push(...this.createMordent(note, config));
          break;
        case 'turn':
          result.push(...this.createTurn(note, config));
          break;
        case 'graceNote':
          result.push(...this.createGraceNote(note, config));
          break;
        case 'tremolo':
          result.push(...this.createTremolo(note, config));
          break;
        case 'glissando':
          result.push(...this.createGlissando(note, config));
          break;
        default:
          result.push(note);
      }
    }
    
    return result;
  }

  private createTrill(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const interval = config.interval || 2;
    const count = config.count || 4;
    const noteDuration = note.duration / count;
    const result: MidiNote[] = [];
    
    for (let i = 0; i < count; i++) {
      result.push({
        ...note,
        note: i % 2 === 0 ? note.note : note.note + interval,
        startTime: note.startTime + i * noteDuration,
        duration: noteDuration * 0.95,
      });
    }
    
    return result;
  }

  private createMordent(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const interval = config.interval || 2;
    const ornamentDuration = note.duration * 0.15;
    
    return [
      { ...note, duration: ornamentDuration * 0.95 },
      { ...note, note: note.note + interval, startTime: note.startTime + ornamentDuration, duration: ornamentDuration * 0.95 },
      { ...note, startTime: note.startTime + ornamentDuration * 2, duration: note.duration - ornamentDuration * 2 },
    ];
  }

  private createTurn(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const interval = config.interval || 2;
    const ornamentDuration = note.duration * 0.1;
    
    return [
      { ...note, note: note.note + interval, duration: ornamentDuration },
      { ...note, startTime: note.startTime + ornamentDuration, duration: ornamentDuration },
      { ...note, note: note.note - interval, startTime: note.startTime + ornamentDuration * 2, duration: ornamentDuration },
      { ...note, startTime: note.startTime + ornamentDuration * 3, duration: note.duration - ornamentDuration * 3 },
    ];
  }

  private createGraceNote(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const interval = config.interval || -2;
    const graceDuration = 0.05;
    
    return [
      { ...note, note: note.note + interval, duration: graceDuration, velocity: Math.round(note.velocity * 0.7) },
      { ...note, startTime: note.startTime + graceDuration, duration: note.duration - graceDuration },
    ];
  }

  private createTremolo(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const count = config.count || 8;
    const noteDuration = note.duration / count;
    const result: MidiNote[] = [];
    
    for (let i = 0; i < count; i++) {
      result.push({
        ...note,
        startTime: note.startTime + i * noteDuration,
        duration: noteDuration * 0.9,
        velocity: Math.round(note.velocity * (0.7 + Math.random() * 0.3)),
      });
    }
    
    return result;
  }

  private createGlissando(note: MidiNote, config: OrnamentConfig): MidiNote[] {
    const interval = config.interval || 12;
    const count = Math.abs(interval);
    const noteDuration = note.duration / count;
    const direction = interval > 0 ? 1 : -1;
    const result: MidiNote[] = [];
    
    for (let i = 0; i < count; i++) {
      result.push({
        ...note,
        note: note.note + i * direction,
        startTime: note.startTime + i * noteDuration,
        duration: noteDuration * 1.1,
        velocity: Math.round(note.velocity * (0.8 + (i / count) * 0.2)),
      });
    }
    
    return result;
  }

  applyStrumPattern(notes: MidiNote[], config: StrumConfig): MidiNote[] {
    const sorted = [...notes].sort((a, b) => a.note - b.note);
    const strumDelay = config.speed / 1000;
    let direction = config.direction === 'up' ? 1 : -1;
    
    const result: MidiNote[] = [];
    let chordGroups: Map<number, MidiNote[]> = new Map();
    
    for (const note of sorted) {
      const key = Math.round(note.startTime * 1000);
      if (!chordGroups.has(key)) {
        chordGroups.set(key, []);
      }
      chordGroups.get(key)!.push(note);
    }
    
    for (const [, chord] of chordGroups) {
      const orderedChord = direction > 0 ? chord : [...chord].reverse();
      
      orderedChord.forEach((note, index) => {
        let velocityMultiplier = 1;
        switch (config.velocityCurve) {
          case 'exponential':
            velocityMultiplier = Math.pow(index / orderedChord.length, 0.5);
            break;
          case 'logarithmic':
            velocityMultiplier = Math.log(index + 2) / Math.log(orderedChord.length + 2);
            break;
          default:
            velocityMultiplier = 1 - (index / orderedChord.length) * 0.2;
        }
        
        const humanizeOffset = config.humanize ? (Math.random() - 0.5) * strumDelay * 0.2 : 0;
        
        result.push({
          ...note,
          startTime: note.startTime + index * strumDelay + humanizeOffset,
          velocity: Math.round(note.velocity * velocityMultiplier),
        });
      });
      
      if (config.direction === 'alternating') {
        direction *= -1;
      }
    }
    
    return result;
  }

  applyAcceleration(notes: MidiNote[], config: AccelerationConfig): MidiNote[] {
    if (notes.length === 0) return [];
    
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    const totalDuration = sorted[sorted.length - 1].startTime + sorted[sorted.length - 1].duration;
    
    return sorted.map(note => {
      const position = note.startTime / totalDuration;
      let timeFactor: number;
      
      switch (config.curve) {
        case 'exponential':
          timeFactor = config.type === 'accelerando'
            ? Math.pow(position, config.factor)
            : Math.pow(position, 1 / config.factor);
          break;
        case 'sine':
          timeFactor = config.type === 'accelerando'
            ? position - Math.sin(position * Math.PI * 2) * (config.factor - 1) * 0.1
            : position + Math.sin(position * Math.PI * 2) * (config.factor - 1) * 0.1;
          break;
        default:
          const adjustment = (config.factor - 1) * position;
          timeFactor = config.type === 'accelerando'
            ? position * (1 - adjustment * 0.5)
            : position * (1 + adjustment * 0.5);
      }
      
      return {
        ...note,
        startTime: timeFactor * totalDuration,
        duration: note.duration * (config.type === 'accelerando' ? 1 / config.factor : config.factor),
      };
    });
  }

  fitToScale(notes: MidiNote[], rootNote: number, scale: string): MidiNote[] {
    const scaleIntervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.major;
    const scaleNotes = new Set(scaleIntervals.map(i => (rootNote + i) % 12));
    
    return notes.map(note => {
      const noteClass = note.note % 12;
      
      if (scaleNotes.has(noteClass)) {
        return note;
      }
      
      let closestNote = note.note;
      let minDistance = Infinity;
      
      for (const scaleNote of scaleNotes) {
        const distance = Math.min(
          Math.abs(noteClass - scaleNote),
          12 - Math.abs(noteClass - scaleNote)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          const direction = ((scaleNote - noteClass + 12) % 12) <= 6 ? 1 : -1;
          closestNote = note.note + direction * distance;
        }
      }
      
      return {
        ...note,
        note: Math.max(0, Math.min(127, closestNote)),
      };
    });
  }

  quantize(notes: MidiNote[], gridSize: number, strength: number = 1): MidiNote[] {
    return notes.map(note => {
      const quantizedStart = Math.round(note.startTime / gridSize) * gridSize;
      const newStart = note.startTime + (quantizedStart - note.startTime) * strength;
      
      return {
        ...note,
        startTime: newStart,
      };
    });
  }

  legato(notes: MidiNote[], overlap: number = 0): MidiNote[] {
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    
    return sorted.map((note, index) => {
      if (index < sorted.length - 1) {
        const nextStart = sorted[index + 1].startTime;
        const newDuration = nextStart - note.startTime + overlap;
        return { ...note, duration: Math.max(note.duration, newDuration) };
      }
      return note;
    });
  }

  staccato(notes: MidiNote[], factor: number = 0.5): MidiNote[] {
    return notes.map(note => ({
      ...note,
      duration: note.duration * factor,
    }));
  }

  velocityCurve(
    notes: MidiNote[],
    curve: 'crescendo' | 'decrescendo' | 'swell' | 'accent',
    intensity: number = 1
  ): MidiNote[] {
    if (notes.length === 0) return [];
    
    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);
    const totalDuration = sorted[sorted.length - 1].startTime - sorted[0].startTime;
    
    return sorted.map(note => {
      const position = totalDuration > 0 
        ? (note.startTime - sorted[0].startTime) / totalDuration 
        : 0;
      
      let velocityMultiplier: number;
      switch (curve) {
        case 'crescendo':
          velocityMultiplier = 0.5 + position * 0.5 * intensity;
          break;
        case 'decrescendo':
          velocityMultiplier = 1 - position * 0.5 * intensity;
          break;
        case 'swell':
          velocityMultiplier = 0.5 + Math.sin(position * Math.PI) * 0.5 * intensity;
          break;
        case 'accent':
          velocityMultiplier = position < 0.1 ? 1 + 0.3 * intensity : 1;
          break;
        default:
          velocityMultiplier = 1;
      }
      
      return {
        ...note,
        velocity: Math.max(1, Math.min(127, Math.round(note.velocity * velocityMultiplier))),
      };
    });
  }

  randomize(notes: MidiNote[], options: {
    pitchRange?: number;
    velocityRange?: number;
    timingRange?: number;
    durationRange?: number;
  }): MidiNote[] {
    return notes.map(note => ({
      ...note,
      note: Math.max(0, Math.min(127, note.note + Math.round((Math.random() - 0.5) * 2 * (options.pitchRange || 0)))),
      velocity: Math.max(1, Math.min(127, note.velocity + Math.round((Math.random() - 0.5) * 2 * (options.velocityRange || 0)))),
      startTime: Math.max(0, note.startTime + (Math.random() - 0.5) * 2 * (options.timingRange || 0)),
      duration: Math.max(0.01, note.duration * (1 + (Math.random() - 0.5) * 2 * (options.durationRange || 0))),
    }));
  }

  split(notes: MidiNote[], splitPoint: number): { lower: MidiNote[]; upper: MidiNote[] } {
    return {
      lower: notes.filter(n => n.note < splitPoint),
      upper: notes.filter(n => n.note >= splitPoint),
    };
  }

  merge(...noteSets: MidiNote[][]): MidiNote[] {
    return noteSets.flat().sort((a, b) => a.startTime - b.startTime);
  }
}

export const midiTransformService = new MidiTransformService();
