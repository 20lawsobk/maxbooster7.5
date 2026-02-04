export interface TempoEvent {
  beat: number;
  tempo: number;
  curveType: 'jump' | 'linear' | 'exponential';
}

export interface TimeSignatureEvent {
  beat: number;
  numerator: number;
  denominator: number;
}

export interface Marker {
  id: string;
  beat: number;
  name: string;
  color: string;
  type: 'marker' | 'region_start' | 'region_end' | 'loop_start' | 'loop_end' | 'punch_in' | 'punch_out';
}

export interface TempoMap {
  tempoEvents: TempoEvent[];
  timeSignatureEvents: TimeSignatureEvent[];
}

export interface TimelinePosition {
  samples: number;
  seconds: number;
  beats: number;
  bars: number;
  subBeats: number;
  smpteTimecode: string;
}

export class TimelineEngine {
  private sampleRate: number = 48000;
  private tempoMap: TempoMap = {
    tempoEvents: [{ beat: 0, tempo: 120, curveType: 'jump' }],
    timeSignatureEvents: [{ beat: 0, numerator: 4, denominator: 4 }],
  };
  private markers: Marker[] = [];
  
  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;
  }
  
  setSampleRate(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }
  
  getSampleRate(): number {
    return this.sampleRate;
  }
  
  setTempoMap(tempoMap: TempoMap): void {
    this.tempoMap = tempoMap;
  }
  
  getTempoMap(): TempoMap {
    return this.tempoMap;
  }
  
  setTempo(tempo: number, atBeat: number = 0, curveType: TempoEvent['curveType'] = 'jump'): void {
    const existingIndex = this.tempoMap.tempoEvents.findIndex(e => e.beat === atBeat);
    if (existingIndex !== -1) {
      this.tempoMap.tempoEvents[existingIndex] = { beat: atBeat, tempo, curveType };
    } else {
      this.tempoMap.tempoEvents.push({ beat: atBeat, tempo, curveType });
      this.tempoMap.tempoEvents.sort((a, b) => a.beat - b.beat);
    }
  }
  
  setTimeSignature(numerator: number, denominator: number, atBeat: number = 0): void {
    const existingIndex = this.tempoMap.timeSignatureEvents.findIndex(e => e.beat === atBeat);
    if (existingIndex !== -1) {
      this.tempoMap.timeSignatureEvents[existingIndex] = { beat: atBeat, numerator, denominator };
    } else {
      this.tempoMap.timeSignatureEvents.push({ beat: atBeat, numerator, denominator });
      this.tempoMap.timeSignatureEvents.sort((a, b) => a.beat - b.beat);
    }
  }
  
  getTempoAtBeat(beat: number): number {
    let tempo = 120;
    for (const event of this.tempoMap.tempoEvents) {
      if (event.beat <= beat) {
        tempo = event.tempo;
      } else {
        break;
      }
    }
    return tempo;
  }
  
  getTimeSignatureAtBeat(beat: number): { numerator: number; denominator: number } {
    let timeSig = { numerator: 4, denominator: 4 };
    for (const event of this.tempoMap.timeSignatureEvents) {
      if (event.beat <= beat) {
        timeSig = { numerator: event.numerator, denominator: event.denominator };
      } else {
        break;
      }
    }
    return timeSig;
  }
  
  beatsToSeconds(beats: number): number {
    if (this.tempoMap.tempoEvents.length === 1) {
      const tempo = this.tempoMap.tempoEvents[0].tempo;
      return (beats * 60) / tempo;
    }
    
    let seconds = 0;
    let currentBeat = 0;
    
    for (let i = 0; i < this.tempoMap.tempoEvents.length; i++) {
      const event = this.tempoMap.tempoEvents[i];
      const nextEvent = this.tempoMap.tempoEvents[i + 1];
      const segmentEnd = nextEvent ? Math.min(beats, nextEvent.beat) : beats;
      
      if (currentBeat >= beats) break;
      if (event.beat > beats) break;
      
      const segmentStart = Math.max(currentBeat, event.beat);
      if (segmentStart < segmentEnd) {
        const segmentBeats = segmentEnd - segmentStart;
        
        if (nextEvent && event.curveType !== 'jump') {
          const startTempo = event.tempo;
          const endTempo = nextEvent.tempo;
          const totalSegmentBeats = nextEvent.beat - event.beat;
          const progress = (segmentEnd - event.beat) / totalSegmentBeats;
          
          if (event.curveType === 'linear') {
            const t0 = (segmentStart - event.beat) / totalSegmentBeats;
            const t1 = (segmentEnd - event.beat) / totalSegmentBeats;
            const tempo0 = startTempo + (endTempo - startTempo) * t0;
            const tempo1 = startTempo + (endTempo - startTempo) * t1;
            if (Math.abs(endTempo - startTempo) > 0.001) {
              const k = (endTempo - startTempo) / totalSegmentBeats;
              seconds += (60 / k) * Math.log(tempo1 / tempo0);
            } else {
              seconds += (segmentBeats * 60) / startTempo;
            }
          } else if (event.curveType === 'exponential') {
            const k = Math.log(endTempo / startTempo) / totalSegmentBeats;
            if (Math.abs(k) > 0.0001) {
              seconds += (60 / k) * (Math.exp(k * (segmentEnd - event.beat)) - Math.exp(k * (segmentStart - event.beat))) / startTempo;
            } else {
              seconds += (segmentBeats * 60) / startTempo;
            }
          } else {
            seconds += (segmentBeats * 60) / event.tempo;
          }
        } else {
          seconds += (segmentBeats * 60) / event.tempo;
        }
        currentBeat = segmentEnd;
      }
    }
    
    return seconds;
  }
  
  secondsToBeats(seconds: number): number {
    if (this.tempoMap.tempoEvents.length === 1) {
      const tempo = this.tempoMap.tempoEvents[0].tempo;
      return (seconds * tempo) / 60;
    }
    
    let remainingSeconds = seconds;
    let beats = 0;
    
    for (let i = 0; i < this.tempoMap.tempoEvents.length; i++) {
      const event = this.tempoMap.tempoEvents[i];
      const nextEvent = this.tempoMap.tempoEvents[i + 1];
      
      if (remainingSeconds <= 0) break;
      
      if (nextEvent) {
        const segmentBeats = nextEvent.beat - event.beat;
        const startTempo = event.tempo;
        const endTempo = nextEvent.tempo;
        const totalSegmentBeats = nextEvent.beat - event.beat;
        let segmentSeconds: number;
        
        if (event.curveType === 'linear' && Math.abs(endTempo - startTempo) > 0.001) {
          const k = (endTempo - startTempo) / totalSegmentBeats;
          segmentSeconds = (60 / k) * Math.log(endTempo / startTempo);
        } else if (event.curveType === 'exponential') {
          const k = Math.log(endTempo / startTempo) / totalSegmentBeats;
          if (Math.abs(k) > 0.0001) {
            segmentSeconds = (60 / k) * (Math.exp(k * segmentBeats) - 1) / startTempo;
          } else {
            segmentSeconds = (segmentBeats * 60) / startTempo;
          }
        } else {
          segmentSeconds = (segmentBeats * 60) / event.tempo;
        }
        
        if (remainingSeconds <= segmentSeconds) {
          if (event.curveType === 'linear' && Math.abs(endTempo - startTempo) > 0.001) {
            const k = (endTempo - startTempo) / totalSegmentBeats;
            const ratio = Math.exp((remainingSeconds * k) / 60);
            beats += (startTempo * (ratio - 1)) / k;
          } else if (event.curveType === 'exponential') {
            const k = Math.log(endTempo / startTempo) / totalSegmentBeats;
            if (Math.abs(k) > 0.0001) {
              beats += Math.log(1 + (remainingSeconds * k * startTempo) / 60) / k;
            } else {
              beats += (remainingSeconds * startTempo) / 60;
            }
          } else {
            beats += (remainingSeconds * event.tempo) / 60;
          }
          remainingSeconds = 0;
        } else {
          beats += segmentBeats;
          remainingSeconds -= segmentSeconds;
        }
      } else {
        beats += (remainingSeconds * event.tempo) / 60;
        remainingSeconds = 0;
      }
    }
    
    return beats;
  }
  
  beatsToSamples(beats: number): number {
    const seconds = this.beatsToSeconds(beats);
    return Math.round(seconds * this.sampleRate);
  }
  
  samplesToBeats(samples: number): number {
    const seconds = samples / this.sampleRate;
    return this.secondsToBeats(seconds);
  }
  
  beatsToBarsBeats(beats: number): { bar: number; beat: number; subBeat: number } {
    let currentBeat = 0;
    let bar = 1;
    let timeSigIndex = 0;
    
    while (currentBeat < beats && timeSigIndex < this.tempoMap.timeSignatureEvents.length) {
      const timeSig = this.tempoMap.timeSignatureEvents[timeSigIndex];
      const nextTimeSig = this.tempoMap.timeSignatureEvents[timeSigIndex + 1];
      
      const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
      const segmentEnd = nextTimeSig ? nextTimeSig.beat : Infinity;
      
      while (currentBeat + beatsPerBar <= beats && currentBeat + beatsPerBar <= segmentEnd) {
        currentBeat += beatsPerBar;
        bar++;
      }
      
      if (nextTimeSig && currentBeat >= segmentEnd) {
        timeSigIndex++;
      } else {
        break;
      }
    }
    
    const timeSig = this.getTimeSignatureAtBeat(currentBeat);
    const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
    const beatUnit = 4 / timeSig.denominator;
    const remainingBeats = beats - currentBeat;
    const beatInBar = Math.floor(remainingBeats / beatUnit) + 1;
    const subBeat = ((remainingBeats % beatUnit) / beatUnit) * timeSig.denominator;
    
    return { bar, beat: beatInBar, subBeat };
  }
  
  barsBeatsToBeats(bar: number, beat: number, subBeat: number = 0): number {
    let beats = 0;
    let currentBar = 1;
    let timeSigIndex = 0;
    
    while (currentBar < bar && timeSigIndex < this.tempoMap.timeSignatureEvents.length) {
      const timeSig = this.tempoMap.timeSignatureEvents[timeSigIndex];
      const nextTimeSig = this.tempoMap.timeSignatureEvents[timeSigIndex + 1];
      const beatsPerBar = timeSig.numerator * (4 / timeSig.denominator);
      
      if (nextTimeSig && beats + beatsPerBar >= nextTimeSig.beat) {
        timeSigIndex++;
      }
      
      beats += beatsPerBar;
      currentBar++;
    }
    
    const timeSig = this.getTimeSignatureAtBeat(beats);
    const beatUnit = 4 / timeSig.denominator;
    beats += (beat - 1) * beatUnit + (subBeat / timeSig.denominator) * beatUnit;
    return beats;
  }
  
  getPosition(beats: number): TimelinePosition {
    const seconds = this.beatsToSeconds(beats);
    const samples = this.beatsToSamples(beats);
    const { bar, beat, subBeat } = this.beatsToBarsBeats(beats);
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    const smpteTimecode = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    
    return {
      samples,
      seconds,
      beats,
      bars: bar,
      subBeats: beat + subBeat / 4,
      smpteTimecode,
    };
  }
  
  quantize(beats: number, gridSize: number): number {
    return Math.round(beats / gridSize) * gridSize;
  }
  
  quantizeFloor(beats: number, gridSize: number): number {
    return Math.floor(beats / gridSize) * gridSize;
  }
  
  quantizeCeil(beats: number, gridSize: number): number {
    return Math.ceil(beats / gridSize) * gridSize;
  }
  
  addMarker(marker: Omit<Marker, 'id'>): Marker {
    const id = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newMarker = { ...marker, id };
    this.markers.push(newMarker);
    this.markers.sort((a, b) => a.beat - b.beat);
    return newMarker;
  }
  
  removeMarker(id: string): void {
    const index = this.markers.findIndex(m => m.id === id);
    if (index !== -1) {
      this.markers.splice(index, 1);
    }
  }
  
  getMarkers(): readonly Marker[] {
    return this.markers;
  }
  
  getMarkersInRange(startBeat: number, endBeat: number): Marker[] {
    return this.markers.filter(m => m.beat >= startBeat && m.beat <= endBeat);
  }
}

export const timelineEngine = new TimelineEngine();
