import { useCallback, useEffect, useRef, useState } from "react";
import { useUnifiedStore } from "@/stores/unifiedStoreAdapter";
import { AudioEngineFactory } from "@/audio/AudioEngine";

export interface PrecisionTransportState {
  isPlaying: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isLooping: boolean;
  position: number;
  positionBeats: number;
  positionBars: number;
  tempo: number;
  timeSignatureNum: number;
  timeSignatureDen: number;
  metronomeEnabled: boolean;
  countInEnabled: boolean;
  prerollBars: number;
  sampleRate: number;
  cpuUsage: number;
  latencyMs: number;
}

export interface PrecisionTransportControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  record: () => void;
  toggleLoop: () => void;
  toggleMetronome: () => void;
  seek: (position: number) => void;
  seekToBar: (bar: number) => void;
  setTempo: (bpm: number) => void;
  setLoopRegion: (start: number, end: number) => void;
  nudgeForward: (amount?: number) => void;
  nudgeBackward: (amount?: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  toggleCountIn: () => void;
}


export function usePrecisionTransport(): [
  PrecisionTransportState,
  PrecisionTransportControls,
] {
  const store = useUnifiedStore();
  const { transport, project } = store;

  useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance?.now());
  const audioEngineRef = useRef(AudioEngineFactory?.getEngine());
  const [cpuUsage, setCpuUsage] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);

  const [localPosition, setLocalPosition] = useState(transport?.position);
  const [countInEnabled, setCountInEnabled] = useState(false);
  const [metronomeEnabled, setMetronomeEnabled] = useState(
    transport?.metronomeEnabled,
  );
  const [loopStart, setLoopStart] = useState(transport?.loopStart);
  const [loopEnd, setLoopEnd] = useState(transport?.loopEnd);

  useEffect(() => {
    const engine = audioEngineRef?.current;

    engine?.setCallbacks({
      onPositionChange: (pos: number) => {
        setLocalPosition(pos);
        store?.setPosition(pos);
      },
      onMeterUpdate: () => {},
      onStateChange: (state) => {
        setCpuUsage(state?.cpuUsage);
        setLatencyMs(state?.latency);
      },
    });

    engine?.initialize().then(() => {
      const state = engine?.getState();
      setLatencyMs(state?.latency);
    });

    return () => {
      engine?.setCallbacks({
        onPositionChange: () => {},
        onMeterUpdate: () => {},
        onStateChange: () => {},
      });
    };
  }, [store]);

  useEffect(() => {
    const engine = audioEngineRef?.current;
    engine?.setTempo(transport?.tempo);
  }, [transport?.tempo]);

  useEffect(() => {
    if (transport?.isPlaying) {
      audioEngineRef?.current.play();
    } else {
      audioEngineRef?.current.pause();
    }
  }, [transport?.isPlaying]);

  useEffect(() => {
    if (!transport?.isPlaying) {
      setLocalPosition(transport?.position);
    }
  }, [transport?.position, transport?.isPlaying]);

  const beatsPerBar = 4;
  const positionBeats = localPosition;
  const positionBars = Math.floor(localPosition / beatsPerBar) + 1;

  const state: PrecisionTransportState = {
    isPlaying: transport.isPlaying,
    isRecording: transport.isRecording,
    isPaused: transport.isPaused,
    isLooping: transport.isLooping,
    position: localPosition,
    positionBeats,
    positionBars,
    tempo: transport.tempo,
    timeSignatureNum: 4,
    timeSignatureDen: 4,
    metronomeEnabled,
    countInEnabled,
    prerollBars: 1,
    sampleRate: project.sampleRate,
    cpuUsage,
    latencyMs,
  };

  const play = useCallback(() => {
    audioEngineRef?.current.play();
    lastTimeRef.current = performance?.now();
    store?.play();
  }, [store]);

  const pause = useCallback(() => {
    audioEngineRef?.current.pause();
    store?.pause();
  }, [store]);

  const stop = useCallback(() => {
    audioEngineRef?.current.stopTransport();
    store?.stop();
    setLocalPosition(0);
  }, [store]);

  const record = useCallback(() => {
    audioEngineRef?.current.play();
    lastTimeRef.current = performance?.now();
    store?.record();
  }, [store]);

  const toggleLoop = useCallback(() => {
    store?.toggleLoop();
  }, [store]);

  const toggleMetronome = useCallback(() => {
    setMetronomeEnabled((prev) => !prev);
  }, []);

  const seek = useCallback(
    (position: number) => {
      setLocalPosition(position);
      store?.setPosition(position);
    },
    [store],
  );

  const seekToBar = useCallback(
    (bar: number) => {
      const position = (bar - 1) * beatsPerBar;
      seek(position);
    },
    [seek],
  );

  const setTempo = useCallback(
    (bpm: number) => {
      const clampedBpm = Math.max(20, Math.min(999, bpm));
      store?.setTempo(clampedBpm);
    },
    [store],
  );

  const setLoopRegion = useCallback((start: number, end: number) => {
    setLoopStart(start);
    setLoopEnd(end);
  }, []);

  const nudgeForward = useCallback(
    (amount = 1) => {
      seek(localPosition + amount);
    },
    [localPosition, seek],
  );

  const nudgeBackward = useCallback(
    (amount = 1) => {
      seek(Math.max(0, localPosition - amount));
    },
    [localPosition, seek],
  );

  const goToStart = useCallback(() => {
    seek(0);
  }, [seek]);

  const goToEnd = useCallback(() => {
    seek(300);
  }, [seek]);

  const toggleCountIn = useCallback(() => {
    setCountInEnabled((prev) => !prev);
  }, []);

  const controls: PrecisionTransportControls = {
    play,
    pause,
    stop,
    record,
    toggleLoop,
    toggleMetronome,
    seek,
    seekToBar,
    setTempo,
    setLoopRegion,
    nudgeForward,
    nudgeBackward,
    goToStart,
    goToEnd,
    toggleCountIn,
  };

  return [state, controls];
}

export function useTransportShortcuts(controls: PrecisionTransportControls) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e?.target instanceof HTMLInputElement ||
        e?.target instanceof HTMLTextAreaElement
      )
        return;

      switch (e?.code) {
        case "Space":
          e?.preventDefault();
          break;
        case "Home":
          e?.preventDefault();
          controls?.goToStart();
          break;
        case "End":
          e?.preventDefault();
          controls?.goToEnd();
          break;
        case "ArrowLeft":
          if (e?.shiftKey) {
            controls?.nudgeBackward(4);
          } else {
            controls?.nudgeBackward(0.25);
          }
          break;
        case "ArrowRight":
          if (e?.shiftKey) {
            controls?.nudgeForward(4);
          } else {
            controls?.nudgeForward(0.25);
          }
          break;
        case "KeyC":
          if (e?.shiftKey) controls?.toggleCountIn();
          break;
        case "KeyK":
          controls?.toggleMetronome();
          break;
      }
    };

    window?.addEventListener("keydown", handleKeyDown);
    return () => window?.removeEventListener("keydown", handleKeyDown);
  }, [controls]);
}

export default usePrecisionTransport;
