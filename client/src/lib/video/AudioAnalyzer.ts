export interface AudioAnalysisData {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  bass: number;
  mid: number;
  treble: number;
  average: number;
  peak: number;
  beatDetected: boolean;
}

export interface BeatInfo {
  detected: boolean;
  intensity: number;
  tempo: number;
  lastBeatTime: number;
}

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyzerNode: AnalyserNode | null = null;
  private sourceNode: MediaElementAudioSourceNode | AudioBufferSourceNode | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private frequencyData: Uint8Array = new Uint8Array(0);
  private timeDomainData: Uint8Array = new Uint8Array(0);
  private fftSize: number = 2048;
  private smoothingTimeConstant: number = 0.8;
  
  private beatThreshold: number = 0.8;
  private beatHoldTime: number = 100;
  private lastBeatTime: number = 0;
  private beatHistory: number[] = [];
  private beatHistoryMax: number = 30;

  constructor(fftSize: number = 2048) {
    this.fftSize = fftSize;
  }

  async initialize(): Promise<void> {
    this.audioContext = new AudioContext();
    this.analyzerNode = this.audioContext.createAnalyser();
    this.analyzerNode.fftSize = this.fftSize;
    this.analyzerNode.smoothingTimeConstant = this.smoothingTimeConstant;
    
    const bufferLength = this.analyzerNode.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLength);
    this.timeDomainData = new Uint8Array(bufferLength);
  }

  async loadAudio(url: string): Promise<void> {
    if (!this.audioContext) await this.initialize();
    
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.audioBuffer = await this.audioContext!.decodeAudioData(arrayBuffer);
  }

  connectAudioElement(audioElement: HTMLAudioElement): void {
    if (!this.audioContext || !this.analyzerNode) {
      throw new Error('AudioAnalyzer not initialized');
    }
    
    this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
    this.sourceNode.connect(this.analyzerNode);
    this.analyzerNode.connect(this.audioContext.destination);
  }

  getAnalysisData(): AudioAnalysisData {
    if (!this.analyzerNode) {
      return {
        frequencyData: new Uint8Array(0),
        timeDomainData: new Uint8Array(0),
        bass: 0,
        mid: 0,
        treble: 0,
        average: 0,
        peak: 0,
        beatDetected: false,
      };
    }

    this.analyzerNode.getByteFrequencyData(this.frequencyData);
    this.analyzerNode.getByteTimeDomainData(this.timeDomainData);

    const bufferLength = this.frequencyData.length;
    const bassEnd = Math.floor(bufferLength * 0.1);
    const midEnd = Math.floor(bufferLength * 0.5);

    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let totalSum = 0;
    let peak = 0;

    for (let i = 0; i < bufferLength; i++) {
      const value = this.frequencyData[i];
      totalSum += value;
      if (value > peak) peak = value;

      if (i < bassEnd) {
        bassSum += value;
      } else if (i < midEnd) {
        midSum += value;
      } else {
        trebleSum += value;
      }
    }

    const bass = bassSum / bassEnd / 255;
    const mid = midSum / (midEnd - bassEnd) / 255;
    const treble = trebleSum / (bufferLength - midEnd) / 255;
    const average = totalSum / bufferLength / 255;

    const beatDetected = this.detectBeat(bass);

    return {
      frequencyData: this.frequencyData,
      timeDomainData: this.timeDomainData,
      bass,
      mid,
      treble,
      average,
      peak: peak / 255,
      beatDetected,
    };
  }

  private detectBeat(currentBass: number): boolean {
    this.beatHistory.push(currentBass);
    if (this.beatHistory.length > this.beatHistoryMax) {
      this.beatHistory.shift();
    }

    const averageBass = this.beatHistory.reduce((a, b) => a + b, 0) / this.beatHistory.length;
    const now = performance.now();

    if (currentBass > averageBass * this.beatThreshold && 
        now - this.lastBeatTime > this.beatHoldTime) {
      this.lastBeatTime = now;
      return true;
    }

    return false;
  }

  getBeatInfo(): BeatInfo {
    const analysis = this.getAnalysisData();
    
    let tempo = 0;
    if (this.beatHistory.length >= 2) {
      const beatIntervals: number[] = [];
      let lastPeak = -1;
      
      for (let i = 0; i < this.beatHistory.length; i++) {
        if (this.beatHistory[i] > 0.7) {
          if (lastPeak >= 0) {
            beatIntervals.push(i - lastPeak);
          }
          lastPeak = i;
        }
      }
      
      if (beatIntervals.length > 0) {
        const avgInterval = beatIntervals.reduce((a, b) => a + b, 0) / beatIntervals.length;
        tempo = Math.round(60 / (avgInterval * (1000 / 60) / 1000));
      }
    }

    return {
      detected: analysis.beatDetected,
      intensity: analysis.bass,
      tempo,
      lastBeatTime: this.lastBeatTime,
    };
  }

  getFrequencyBands(bandCount: number): number[] {
    if (!this.analyzerNode) return new Array(bandCount).fill(0);
    
    this.analyzerNode.getByteFrequencyData(this.frequencyData);
    
    const bands: number[] = [];
    const binPerBand = Math.floor(this.frequencyData.length / bandCount);
    
    for (let i = 0; i < bandCount; i++) {
      let sum = 0;
      const start = i * binPerBand;
      const end = start + binPerBand;
      
      for (let j = start; j < end; j++) {
        sum += this.frequencyData[j];
      }
      
      bands.push(sum / binPerBand / 255);
    }
    
    return bands;
  }

  getWaveformData(samples: number): number[] {
    if (!this.analyzerNode) return new Array(samples).fill(0.5);
    
    this.analyzerNode.getByteTimeDomainData(this.timeDomainData);
    
    const waveform: number[] = [];
    const step = Math.floor(this.timeDomainData.length / samples);
    
    for (let i = 0; i < samples; i++) {
      waveform.push(this.timeDomainData[i * step] / 255);
    }
    
    return waveform;
  }

  setSmoothing(value: number): void {
    this.smoothingTimeConstant = Math.max(0, Math.min(1, value));
    if (this.analyzerNode) {
      this.analyzerNode.smoothingTimeConstant = this.smoothingTimeConstant;
    }
  }

  setBeatThreshold(value: number): void {
    this.beatThreshold = value;
  }

  getAudioBuffer(): AudioBuffer | null {
    return this.audioBuffer;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  dispose(): void {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.analyzerNode) {
      this.analyzerNode.disconnect();
      this.analyzerNode = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.audioBuffer = null;
  }
}

export function generateMockAudioData(time: number, bpm: number = 120): AudioAnalysisData {
  const beatInterval = 60 / bpm;
  const beatPhase = (time % beatInterval) / beatInterval;
  const onBeat = beatPhase < 0.1;
  
  const bass = onBeat ? 0.9 + Math.random() * 0.1 : 0.3 + Math.sin(time * 2) * 0.2;
  const mid = 0.4 + Math.sin(time * 4) * 0.3;
  const treble = 0.3 + Math.sin(time * 8) * 0.2;
  
  const frequencyData = new Uint8Array(1024);
  const timeDomainData = new Uint8Array(1024);
  
  for (let i = 0; i < 1024; i++) {
    const freq = i / 1024;
    let value = 0;
    
    if (freq < 0.1) {
      value = bass * 255 * (1 - freq * 5);
    } else if (freq < 0.5) {
      value = mid * 255 * (1 - (freq - 0.1) * 1.5);
    } else {
      value = treble * 255 * (1 - (freq - 0.5) * 1.5);
    }
    
    frequencyData[i] = Math.max(0, Math.min(255, value + Math.random() * 20));
    
    const waveValue = 128 + Math.sin(time * 440 * Math.PI * 2 * (i / 1024)) * 50 * bass;
    timeDomainData[i] = Math.max(0, Math.min(255, waveValue));
  }
  
  return {
    frequencyData,
    timeDomainData,
    bass,
    mid,
    treble,
    average: (bass + mid + treble) / 3,
    peak: Math.max(bass, mid, treble),
    beatDetected: onBeat,
  };
}
