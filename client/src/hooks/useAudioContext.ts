import { useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

export interface AudioContextState {
  context: AudioContext | null;
  isSupported: boolean;
  sampleRate: number;
  analyser: AnalyserNode | null;
  frequencyData: Uint8Array | null;
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
