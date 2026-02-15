import { useState, useRef, useCallback, useEffect } from 'react';
import { useAudioContext } from './useAudioContext';

export interface MetronomeSettings {
  enabled: boolean;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
  volume: number;
  accentFirstBeat: boolean;
  subdivision: 'quarter' | 'eighth' | 'sixteenth';
  countIn: number; // Number of measures to count in
}

export interface MetronomeState extends MetronomeSettings {
  isPlaying: boolean;
  currentBeat: number;
  currentMeasure: number;
}

const DEFAULT_SETTINGS: MetronomeSettings = {
  enabled: true,
  bpm: 120,
  timeSignature: {
    numerator: 4,
    denominator: 4,
  },
  volume: 0.5,
  accentFirstBeat: true,
  subdivision: 'quarter',
  countIn: 1,
};

/**
 * Professional metronome with tempo control, subdivisions, and count-in
 * Essential for recording in a DAW
 */
/**
 * TODO: Add function documentation
 */
export function useMetronome(initialSettings?: Partial<MetronomeSettings>) {
  const { context } = useAudioContext();
  const [settings, setSettings] = useState<MetronomeSettings>({
    ...DEFAULT_SETTINGS,
    ...initialSettings,
  });
  const [state, setState] = useState({
    isPlaying: false,
    currentBeat: 0,
    currentMeasure: 0,
  });

  const schedulerRef = useRef<number>();
  const nextNoteTimeRef = useRef<number>(0);
  const currentBeatRef = useRef<number>(0);
  const currentMeasureRef = useRef<number>(0);

  /**
   * Calculate the time between beats based on BPM and subdivision
   */
  const getBeatInterval = useCallback(() => {
    const secondsPerBeat = 60.0 / settings.bpm;

    switch (settings.subdivision) {
      case 'eighth':
        return secondsPerBeat / 2;
      case 'sixteenth':
        return secondsPerBeat / 4;
      default:
        return secondsPerBeat;
    }
  }, [settings.bpm, settings.subdivision]);

  /**
   * Create a click sound using Web Audio API
   */
  const playClick = useCallback(
    (time: number, isAccent: boolean = false) => {
      if (!context) return;

      const osc = context.createOscillator();
      const gainNode = context.createGain();

      // Accent (first beat) is higher pitched and louder
      osc.frequency.value = isAccent ? 1200 : 800;

      gainNode.gain.setValueAtTime(settings.volume * (isAccent ? 1.2 : 1), time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.03);

      osc.connect(gainNode);
      gainNode.connect(context.destination);

      osc.start(time);
      osc.stop(time + 0.03);
    },
    [context, settings.volume]
  );

  /**
   * Schedule the next click
   */
  const scheduleClick = useCallback(() => {
    if (!context) return;

    const currentTime = context.currentTime;
    const beatInterval = getBeatInterval();

    // Schedule clicks up to 0.1 seconds ahead
    while (nextNoteTimeRef.current < currentTime + 0.1) {
      const isFirstBeat = currentBeatRef.current === 0;
      const isAccent = settings.accentFirstBeat && isFirstBeat;

      playClick(nextNoteTimeRef.current, isAccent);

      // Update beat and measure
      currentBeatRef.current++;
      if (currentBeatRef.current >= settings.timeSignature.numerator) {
        currentBeatRef.current = 0;
        currentMeasureRef.current++;
      }

      nextNoteTimeRef.current += beatInterval;

      // Update state (throttled to avoid too many re-renders)
      setState((prev) => ({
        ...prev,
        currentBeat: currentBeatRef.current,
        currentMeasure: currentMeasureRef.current,
      }));
    }

    // Continue scheduling
    schedulerRef.current = window.setTimeout(scheduleClick, 25);
  }, [
    context,
    getBeatInterval,
    playClick,
    settings.accentFirstBeat,
    settings.timeSignature.numerator,
  ]);

  /**
   * Start the metronome
   */
  const start = useCallback(() => {
    if (!context || state.isPlaying) return;

    currentBeatRef.current = 0;
    currentMeasureRef.current = 0;
    nextNoteTimeRef.current = context.currentTime;

    setState((prev) => ({ ...prev, isPlaying: true, currentBeat: 0, currentMeasure: 0 }));

    scheduleClick();
  }, [context, state.isPlaying, scheduleClick]);

  /**
   * Stop the metronome
   */
  const stop = useCallback(() => {
    if (schedulerRef.current) {
      clearTimeout(schedulerRef.current);
    }

    setState((prev) => ({ ...prev, isPlaying: false, currentBeat: 0, currentMeasure: 0 }));
  }, []);

  /**
   * Count in before starting recording
   */
  const countIn = useCallback(
    async (onComplete: () => void) => {
      if (!context) return;

      currentBeatRef.current = 0;
      currentMeasureRef.current = 0;
      nextNoteTimeRef.current = context.currentTime;

      setState((prev) => ({ ...prev, isPlaying: true, currentBeat: 0, currentMeasure: 0 }));

      const countInMeasures = settings.countIn;
      const beatsPerMeasure = settings.timeSignature.numerator;
      const totalCountInBeats = countInMeasures * beatsPerMeasure;

      const checkCountInComplete = () => {
        const totalBeats = currentMeasureRef.current * beatsPerMeasure + currentBeatRef.current;

        if (totalBeats >= totalCountInBeats) {
          stop();
          onComplete();
        } else {
          requestAnimationFrame(checkCountInComplete);
        }
      };

      scheduleClick();
      requestAnimationFrame(checkCountInComplete);
    },
    [context, settings.countIn, settings.timeSignature.numerator, scheduleClick, stop]
  );

  /**
   * Update settings
   */
  const updateSettings = useCallback((newSettings: Partial<MetronomeSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  }, []);

  /**
   * Set BPM
   */
  const setBPM = useCallback((bpm: number) => {
    setSettings((prev) => ({ ...prev, bpm: Math.max(20, Math.min(300, bpm)) }));
  }, []);

  /**
   * Set time signature
   */
  const setTimeSignature = useCallback((numerator: number, denominator: number) => {
    setSettings((prev) => ({
      ...prev,
      timeSignature: { numerator, denominator },
    }));
  }, []);

  /**
   * Set volume
   */
  const setVolume = useCallback((volume: number) => {
    setSettings((prev) => ({ ...prev, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);

  /**
   * Toggle enabled
   */
  const toggle = useCallback(() => {
    setSettings((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (schedulerRef.current) {
        clearTimeout(schedulerRef.current);
      }
    };
  }, []);

  return {
    ...settings,
    ...state,
    start,
    stop,
    countIn,
    updateSettings,
    setBPM,
    setTimeSignature,
    setVolume,
    toggle,
  };
}
