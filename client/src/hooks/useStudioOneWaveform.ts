import { useRef, useCallback, useEffect, useState } from "react";
import {
  StudioOneWaveformEngine,
  ClipRenderData,
  TimelineRenderConfig,
  EngineStats,
  ProcessingChain,
} from "@/lib/daw/StudioOneWaveformEngine";

export interface UseStudioOneWaveformOptions {
  sampleRate?: number;
  bpm?: number;
  timeSignature?: [number, number];
  renderConfig?: Partial<TimelineRenderConfig>;
  autoStart?: boolean;
  statsInterval?: number;
}

export function useStudioOneWaveform(
  options: UseStudioOneWaveformOptions = {},
) {
  const {
    sampleRate = 44100,
    bpm = 120,
    timeSignature = [4, 4],
    renderConfig,
    autoStart = true,
    statsInterval = 500,
  } = options;

  const engineRef = useRef<StudioOneWaveformEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [stats, setStats] = useState<EngineStats | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(1);
  const [verticalScale, setVerticalScaleState] = useState(1);

  const initializeEngine = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }

      const engine = new StudioOneWaveformEngine({
        sampleRate,
        bpm,
        timeSignature,
        renderConfig,
      });

      engine.initialize(canvas);
      engineRef.current = engine;
      canvasRef.current = canvas;
      setIsInitialized(true);

      if (autoStart) {
        engine.start();
      }

      return engine;
    },
    [sampleRate, bpm, timeSignature, renderConfig, autoStart],
  );

  useEffect(() => {
    if (!isInitialized) return;

    const interval = setInterval(() => {
      if (engineRef.current) {
        setStats(engineRef.current.getStats());
      }
    }, statsInterval);

    return () => clearInterval(interval);
  }, [isInitialized, statsInterval]);

  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  const loadAudio = useCallback(
    (sourceId: string, data: Float32Array | AudioBuffer) => {
      const engine = engineRef.current;
      if (!engine) return;

      if (data instanceof AudioBuffer) {
        engine.loadAudioBuffer(sourceId, data);
      } else {
        engine.loadAudio(sourceId, data, sampleRate);
      }
    },
    [sampleRate],
  );

  const setClips = useCallback((clips: ClipRenderData[]) => {
    engineRef.current?.setClips(clips);
  }, []);

  const play = useCallback((from?: number) => {
    engineRef.current?.play(from);
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const seek = useCallback((time: number) => {
    engineRef.current?.seek(time);
  }, []);

  const zoomIn = useCallback((factor?: number) => {
    engineRef.current?.zoomIn(factor);
    setCurrentZoom((prev) => prev * (factor || 1.5));
  }, []);

  const zoomOut = useCallback((factor?: number) => {
    engineRef.current?.zoomOut(factor);
    setCurrentZoom((prev) => prev / (factor || 1.5));
  }, []);

  const setVerticalScale = useCallback((scale: number) => {
    engineRef.current?.setVerticalScale(scale);
    setVerticalScaleState(scale);
  }, []);

  const scrollTo = useCallback((offset: number) => {
    engineRef.current?.scrollTo(offset);
  }, []);

  const registerProcessingChain = useCallback(
    (sourceId: string, chain: ProcessingChain) => {
      engineRef.current?.registerProcessingChain(sourceId, chain);
    },
    [],
  );

  const renderToAudio = useCallback(
    async (sourceId: string, audioContext?: AudioContext) => {
      return engineRef.current?.renderToAudio(sourceId, audioContext) ?? null;
    },
    [],
  );

  const updateRenderConfig = useCallback(
    (config: Partial<TimelineRenderConfig>) => {
      engineRef.current?.updateRenderConfig(config);
    },
    [],
  );

  return {
    initializeEngine,
    engine: engineRef,
    isInitialized,
    stats,
    isPlaying,
    currentZoom,
    verticalScale,
    loadAudio,
    setClips,
    play,
    pause,
    seek,
    zoomIn,
    zoomOut,
    setVerticalScale,
    scrollTo,
    registerProcessingChain,
    renderToAudio,
    updateRenderConfig,
  };
}
