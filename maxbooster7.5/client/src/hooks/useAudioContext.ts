import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

let sharedAudioContext: AudioContext | null = null;
let audioContextUsers = 0;

export function getSharedAudioContext(): AudioContext | null {
  return sharedAudioContext;
}

export interface AudioContextState {
  context: AudioContext | null;
  isSupported: boolean;
  sampleRate: number;
  analyser: AnalyserNode | null;
  frequencyData: Uint8Array | null;
}

export interface AnalyserData {
  leftLevel: number;
  rightLevel: number;
  leftPeak: number;
  rightPeak: number;
  isClipping: boolean;
  lufs: number;
}

export function useSharedAudioContext() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    audioContextUsers++;
    
    if (!sharedAudioContext) {
      try {
        sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        if (sharedAudioContext.state === 'suspended') {
          const resumeOnInteraction = () => {
            sharedAudioContext?.resume().then(() => {
              setIsReady(true);
            }).catch(setError);
            document.removeEventListener('click', resumeOnInteraction);
            document.removeEventListener('keydown', resumeOnInteraction);
            document.removeEventListener('touchstart', resumeOnInteraction);
          };
          
          document.addEventListener('click', resumeOnInteraction);
          document.addEventListener('keydown', resumeOnInteraction);
          document.addEventListener('touchstart', resumeOnInteraction);
        } else {
          setIsReady(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create AudioContext'));
      }
    } else {
      if (sharedAudioContext.state === 'running') {
        setIsReady(true);
      }
    }

    return () => {
      audioContextUsers--;
      if (audioContextUsers === 0 && sharedAudioContext) {
        sharedAudioContext.close();
        sharedAudioContext = null;
      }
    };
  }, []);

  const resume = useCallback(async () => {
    if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
      await sharedAudioContext.resume();
      setIsReady(true);
    }
  }, []);

  return {
    context: sharedAudioContext,
    isReady,
    error,
    resume,
  };
}

export function useAudioAnalyser(sourceNode?: AudioNode | null) {
  const leftAnalyserRef = useRef<AnalyserNode | null>(null);
  const rightAnalyserRef = useRef<AnalyserNode | null>(null);
  const splitterRef = useRef<ChannelSplitterNode | null>(null);
  const [data, setData] = useState<AnalyserData>({
    leftLevel: -60,
    rightLevel: -60,
    leftPeak: -60,
    rightPeak: -60,
    isClipping: false,
    lufs: -60,
  });
  const animationFrameRef = useRef<number>();
  const peakHoldRef = useRef({ left: -60, right: -60, time: 0 });
  const lufsWindowRef = useRef<number[]>([]);

  useEffect(() => {
    if (!sourceNode || !sharedAudioContext) return;

    const fftSize = 2048;
    
    leftAnalyserRef.current = sharedAudioContext.createAnalyser();
    leftAnalyserRef.current.fftSize = fftSize;
    leftAnalyserRef.current.smoothingTimeConstant = 0.8;

    rightAnalyserRef.current = sharedAudioContext.createAnalyser();
    rightAnalyserRef.current.fftSize = fftSize;
    rightAnalyserRef.current.smoothingTimeConstant = 0.8;

    splitterRef.current = sharedAudioContext.createChannelSplitter(2);

    sourceNode.connect(splitterRef.current);
    splitterRef.current.connect(leftAnalyserRef.current, 0);
    splitterRef.current.connect(rightAnalyserRef.current, 1);

    const leftBuffer = new Float32Array(fftSize);
    const rightBuffer = new Float32Array(fftSize);

    const analyze = () => {
      if (!leftAnalyserRef.current || !rightAnalyserRef.current) return;

      leftAnalyserRef.current.getFloatTimeDomainData(leftBuffer);
      rightAnalyserRef.current.getFloatTimeDomainData(rightBuffer);

      let leftMax = 0;
      let rightMax = 0;
      let leftSum = 0;
      let rightSum = 0;
      let leftClip = false;
      let rightClip = false;

      for (let i = 0; i < fftSize; i++) {
        const leftAbs = Math.abs(leftBuffer[i]);
        const rightAbs = Math.abs(rightBuffer[i]);
        
        leftMax = Math.max(leftMax, leftAbs);
        rightMax = Math.max(rightMax, rightAbs);
        leftSum += leftBuffer[i] * leftBuffer[i];
        rightSum += rightBuffer[i] * rightBuffer[i];
        
        if (leftAbs >= 0.99) leftClip = true;
        if (rightAbs >= 0.99) rightClip = true;
      }

      const leftRMS = Math.sqrt(leftSum / fftSize);
      const rightRMS = Math.sqrt(rightSum / fftSize);
      
      const leftDb = 20 * Math.log10(Math.max(leftMax, 1e-10));
      const rightDb = 20 * Math.log10(Math.max(rightMax, 1e-10));
      
      const now = Date.now();
      if (leftDb > peakHoldRef.current.left || now - peakHoldRef.current.time > 2000) {
        peakHoldRef.current.left = leftDb;
        peakHoldRef.current.time = now;
      }
      if (rightDb > peakHoldRef.current.right || now - peakHoldRef.current.time > 2000) {
        peakHoldRef.current.right = rightDb;
        peakHoldRef.current.time = now;
      }

      const monoRMS = (leftRMS + rightRMS) / 2;
      const lufsInstant = -0.691 + 10 * Math.log10(Math.max(monoRMS * monoRMS, 1e-10));
      
      lufsWindowRef.current.push(lufsInstant);
      if (lufsWindowRef.current.length > 30) {
        lufsWindowRef.current.shift();
      }
      const lufsAvg = lufsWindowRef.current.reduce((a, b) => a + b, 0) / lufsWindowRef.current.length;

      setData({
        leftLevel: Math.max(-60, Math.min(3, leftDb)),
        rightLevel: Math.max(-60, Math.min(3, rightDb)),
        leftPeak: peakHoldRef.current.left,
        rightPeak: peakHoldRef.current.right,
        isClipping: leftClip || rightClip,
        lufs: Math.max(-60, Math.min(0, lufsAvg)),
      });

      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (splitterRef.current) {
        try { splitterRef.current.disconnect(); } catch {}
      }
      if (leftAnalyserRef.current) {
        try { leftAnalyserRef.current.disconnect(); } catch {}
      }
      if (rightAnalyserRef.current) {
        try { rightAnalyserRef.current.disconnect(); } catch {}
      }
    };
  }, [sourceNode]);

  return data;
}

const decodingJobs = new Map<string, Promise<AudioBuffer>>();

export async function decodeAudioBuffer(
  url: string,
  signal?: AbortSignal
): Promise<AudioBuffer> {
  if (decodingJobs.has(url)) {
    return decodingJobs.get(url)!;
  }

  const job = (async () => {
    if (!sharedAudioContext) {
      throw new Error('AudioContext not available');
    }

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    if (signal?.aborted) throw new Error('Decoding cancelled');
    
    const audioBuffer = await sharedAudioContext.decodeAudioData(arrayBuffer);
    return audioBuffer;
  })();

  decodingJobs.set(url, job);

  job.finally(() => {
    decodingJobs.delete(url);
  });

  return job;
}

export function generateWaveformPeaks(
  audioBuffer: AudioBuffer,
  targetWidth: number
): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPixel = Math.max(1, Math.floor(channelData.length / targetWidth));
  const peaks: number[] = [];

  for (let i = 0; i < targetWidth; i++) {
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, channelData.length);
    let max = 0;

    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }

    peaks.push(max);
  }

  return peaks;
}

/**
 * TODO: Add function documentation
 */
export function useAudioContext() {
  const [state, setState] = useState<AudioContextState>({
    context: null,
    isSupported: false,
    sampleRate: 0,
    analyser: null,
    frequencyData: null,
  });

  const animationFrameRef = useRef<number>();

  const initializeAudioContext = async () => {
    try {
      // Check for Web Audio API support
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      const context = new AudioContextClass();
      const analyser = context.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;

      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      setState({
        context,
        isSupported: true,
        sampleRate: context.sampleRate,
        analyser,
        frequencyData,
      });

      return context;
    } catch (error: unknown) {
      logger.error('Failed to initialize AudioContext:', error);
      setState((prev) => ({ ...prev, isSupported: false }));
    }
  };

  const createOscillator = (frequency: number, type: OscillatorType = 'sine') => {
    if (!state.context) return null;

    const oscillator = state.context.createOscillator();
    oscillator.frequency.setValueAtTime(frequency, state.context.currentTime);
    oscillator.type = type;

    return oscillator;
  };

  const createGainNode = (gain: number = 1) => {
    if (!state.context) return null;

    const gainNode = state.context.createGain();
    gainNode.gain.setValueAtTime(gain, state.context.currentTime);

    return gainNode;
  };

  const createFilter = (type: BiquadFilterType, frequency: number, Q: number = 1) => {
    if (!state.context) return null;

    const filter = state.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, state.context.currentTime);
    filter.Q.setValueAtTime(Q, state.context.currentTime);

    return filter;
  };

  const createDelay = (delayTime: number = 0) => {
    if (!state.context) return null;

    const delay = state.context.createDelay();
    delay.delayTime.setValueAtTime(delayTime, state.context.currentTime);

    return delay;
  };

  const createConvolver = async (impulseResponse?: ArrayBuffer) => {
    if (!state.context) return null;

    const convolver = state.context.createConvolver();

    if (impulseResponse) {
      try {
        const audioBuffer = await state.context.decodeAudioData(impulseResponse);
        convolver.buffer = audioBuffer;
      } catch (error: unknown) {
        logger.error('Failed to decode impulse response:', error);
      }
    }

    return convolver;
  };

  const getUserMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (state.context) {
        const source = state.context.createMediaStreamSource(stream);
        return { stream, source };
      }
    } catch (error: unknown) {
      logger.error('Failed to get user media:', error);
    }

    return null;
  };

  const startFrequencyAnalysis = (callback?: (data: Uint8Array) => void) => {
    if (!state.analyser || !state.frequencyData) return;

    const analyze = () => {
      state.analyser!.getByteFrequencyData(state.frequencyData!);
      callback?.(state.frequencyData!);
      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    analyze();
  };

  const stopFrequencyAnalysis = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const resume = async () => {
    if (state.context && state.context.state === 'suspended') {
      await state.context.resume();
    }
  };

  const suspend = async () => {
    if (state.context && state.context.state === 'running') {
      await state.context.suspend();
    }
  };

  useEffect(() => {
    initializeAudioContext();

    return () => {
      stopFrequencyAnalysis();
      if (state.context) {
        state.context.close();
      }
    };
  }, []);

  return {
    ...state,
    initializeAudioContext,
    createOscillator,
    createGainNode,
    createFilter,
    createDelay,
    createConvolver,
    getUserMedia,
    startFrequencyAnalysis,
    stopFrequencyAnalysis,
    resume,
    suspend,
  };
}
