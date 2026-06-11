import { useState, useEffect, useCallback, useRef } from "react";
import {
  audioWorkletEngine,
  type PlaybackState,
  type MeteringData,
  type ScheduledClip,
} from "@/lib/daw";
import type { WaveformPeakCache } from "@/lib/daw/AudioWorkletEngine";

interface AudioEngineHook {
  isInitialized: boolean;
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  currentSample: number;
  sampleRate: number;
  latency: number;
  meteringData: Map<string, MeteringData>;

  initialize: () => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setPosition: (sample: number) => void;
  setPositionTime: (seconds: number) => void;
  setLoop: (enabled: boolean, startSample?: number, endSample?: number) => void;

  createTrack: (trackId: string) => void;
  removeTrack: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackMute: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;
  setMasterVolume: (volume: number) => void;

  scheduleClip: (clip: ScheduledClip) => void;
  removeClip: (clipId: string) => void;

  loadAudioFile: (url: string) => Promise<AudioBuffer>;
  loadAudioBlob: (blob: Blob) => Promise<AudioBuffer>;
  extractPeakData: (
    buffer: AudioBuffer,
    samplesPerPeak?: number,
  ) => Float32Array;
  extractPeakCache: (buffer: AudioBuffer) => WaveformPeakCache;

  getTrackMeter: (trackId: string) => MeteringData | undefined;
  getMasterMeter: () => MeteringData | undefined;
}

export function useAudioEngine(): AudioEngineHook {
  const [isInitialized, setIsInitialized] = useState(false);
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    isRecording: false,
    currentSample: 0,
    currentTime: 0,
    loopStart: 0,
    loopEnd: 0,
    isLooping: false,
  });
  const [meteringData, setMeteringData] = useState<Map<string, MeteringData>>(
    new Map(),
  );
  const [sampleRate, setSampleRate] = useState(48000);
  const [latency, setLatency] = useState(0);

  const positionRef = useRef({ sample: 0, time: 0 });
  const positionUpdateScheduledRef = useRef(false);

  useEffect(() => {
    const unsubscribe = audioWorkletEngine?.on((event) => {
      switch (event?.type) {
        case "state-change":
          const data = event?.data as {
            initialized?: boolean;
            isPlaying?: boolean;
          };
          if (data?.initialized) {
            setIsInitialized(true);
            setSampleRate(audioWorkletEngine?.getSampleRate());
            setLatency(audioWorkletEngine?.getLatency());
          }
          if (data?.isPlaying !== undefined) {
            setPlaybackState((prev) => ({
              ...prev,
              isPlaying: data.isPlaying!,
            }));
          }
          break;

        case "position-update":
          const pos = event?.data as { sample: number; time: number };
          positionRef.current = pos;
          if (!positionUpdateScheduledRef?.current) {
            positionUpdateScheduledRef.current = true;
            requestAnimationFrame(() => {
              positionUpdateScheduledRef.current = false;
              const latestPos = positionRef?.current;
              setPlaybackState((prev) => ({
                ...prev,
                currentSample: latestPos.sample,
                currentTime: latestPos.time,
              }));
            });
          }
          break;

        case "metering-update":
          const meters = event?.data as MeteringData[];
          setMeteringData((prev) => {
            const next = new Map(prev);
            meters?.forEach((m) => next?.set(m?.trackId, m));
            return next;
          });
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const initialize = useCallback(async () => {
    if (isInitialized) return;
    await audioWorkletEngine?.initialize({
      sampleRate: 48000,
      bufferSize: 256,
      channels: 2,
      latencyHint: "interactive",
    });
  }, [isInitialized]);

  const play = useCallback(() => {
    audioWorkletEngine?.play();
  }, []);

  const pause = useCallback(() => {
    audioWorkletEngine?.pause();
  }, []);

  const stop = useCallback(() => {
    audioWorkletEngine?.stop();
  }, []);

  const setPosition = useCallback((sample: number) => {
    audioWorkletEngine?.setPosition(sample);
  }, []);

  const setPositionTime = useCallback((seconds: number) => {
    const sample = Math?.round(seconds * audioWorkletEngine?.getSampleRate());
    audioWorkletEngine?.setPosition(sample);
  }, []);

  const setLoop = useCallback(
    (enabled: boolean, startSample?: number, endSample?: number) => {
      audioWorkletEngine?.setLoop(enabled, startSample, endSample);
    },
    [],
  );

  const createTrack = useCallback((trackId: string) => {
    audioWorkletEngine?.createTrack(trackId);
  }, []);

  const removeTrack = useCallback((trackId: string) => {
    audioWorkletEngine?.removeTrack(trackId);
  }, []);

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    audioWorkletEngine?.setTrackVolume(trackId, volume);
  }, []);

  const setTrackPan = useCallback((trackId: string, pan: number) => {
    audioWorkletEngine?.setTrackPan(trackId, pan);
  }, []);

  const setTrackMute = useCallback((trackId: string, muted: boolean) => {
    audioWorkletEngine?.setTrackMute(trackId, muted);
  }, []);

  const setTrackSolo = useCallback((trackId: string, solo: boolean) => {
    audioWorkletEngine?.setTrackSolo(trackId, solo);
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    audioWorkletEngine?.setMasterVolume(volume);
  }, []);

  const scheduleClip = useCallback((clip: ScheduledClip) => {
    audioWorkletEngine?.scheduleClip(clip);
  }, []);

  const removeClip = useCallback((clipId: string) => {
    audioWorkletEngine?.removeClip(clipId);
  }, []);

  const loadAudioFile = useCallback(async (url: string) => {
    return audioWorkletEngine?.loadAudioFile(url);
  }, []);

  const loadAudioBlob = useCallback(async (blob: Blob) => {
    return audioWorkletEngine?.loadAudioBlob(blob);
  }, []);

  const extractPeakData = useCallback(
    (buffer: AudioBuffer, samplesPerPeak: number = 256) => {
      return audioWorkletEngine?.extractPeakData(buffer, samplesPerPeak);
    },
    [],
  );

  const extractPeakCache = useCallback((buffer: AudioBuffer) => {
    return audioWorkletEngine?.extractPeakCache(buffer);
  }, []);

  const getTrackMeter = useCallback(
    (trackId: string) => {
      return meteringData?.get(trackId);
    },
    [meteringData],
  );

  const getMasterMeter = useCallback(() => {
    return meteringData?.get("master");
  }, [meteringData]);

  return {
    isInitialized,
    isPlaying: playbackState.isPlaying,
    isRecording: playbackState.isRecording,
    currentTime: playbackState.currentTime,
    currentSample: playbackState.currentSample,
    sampleRate,
    latency,
    meteringData,

    initialize,
    play,
    pause,
    stop,
    setPosition,
    setPositionTime,
    setLoop,

    createTrack,
    removeTrack,
    setTrackVolume,
    setTrackPan,
    setTrackMute,
    setTrackSolo,
    setMasterVolume,

    scheduleClip,
    removeClip,

    loadAudioFile,
    loadAudioBlob,
    extractPeakData,
    extractPeakCache,

    getTrackMeter,
    getMasterMeter,
  };
}
