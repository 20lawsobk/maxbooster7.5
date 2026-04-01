/**
 * DigitalGPUVideoPlayer
 *
 * Consumes video frames produced by the Max Booster PyTorch diffusion API
 * and renders them through the DigitalGPUInferenceBridge WebGL2 post-
 * processing chain.
 *
 * Data flow:
 *   Python diffusion API  →  base64 frames (server-side DigitalGPU already applied)
 *     ↓
 *   DigitalGPUInferenceBridge.process()  (client-side WebGL: bloom, chroma, vignette)
 *     ↓
 *   <canvas>  with real-time audio reactivity
 *
 * The server reports which scene preset was used via `scene_name`.
 * We pass that straight into the WebGL bridge so the client-side
 * visual tweaks are perfectly matched to what the server baked in.
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';

import {
  DigitalGPUInferenceBridge,
  type InferenceConfig,
} from '@/lib/video/DigitalGPUInferenceBridge';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SceneMetadata {
  scene_name?:         string;
  bloom_threshold?:    number;
  bloom_intensity?:    number;
  bloom_radius?:       number;
  chroma_amount?:      number;
  vignette_intensity?: number;
  saturation?:         number;
  temperature?:        number;
}

export interface DigitalGPUVideoPlayerProps {
  /** base64-encoded JPEG frames from the diffusion API */
  frames: string[];
  /** Scene/style name returned by the API — selects the WebGL preset */
  sceneName?: string;
  /** Full scene metadata from the API response (optional — used for display) */
  sceneMetadata?: SceneMetadata;
  /** Whether server already ran its DigitalGPU chain on these frames */
  serverGpuApplied?: boolean;
  /** Skip client-side WebGL post-processing (useful when server already did a full pass) */
  skipClientGpu?: boolean;

  /** Playback */
  fps?: number;
  autoPlay?: boolean;
  loop?: boolean;

  /** Audio reactivity — live values from AudioAnalyzer (0–1) */
  bass?: number;
  mid?: number;
  treble?: number;

  /** Canvas dimensions */
  width?: number;
  height?: number;
  className?: string;

  onReady?: (bridge: DigitalGPUInferenceBridge) => void;
  onFrameRendered?: (frameIndex: number) => void;
}

export interface DigitalGPUVideoPlayerHandle {
  play:    () => void;
  pause:   () => void;
  seek:    (frame: number) => void;
  bridge:  DigitalGPUInferenceBridge | null;
  canvas:  HTMLCanvasElement | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

const DigitalGPUVideoPlayer = forwardRef<
  DigitalGPUVideoPlayerHandle,
  DigitalGPUVideoPlayerProps
>((props, ref) => {
  const {
    frames,
    sceneName = 'default',
    sceneMetadata,
    serverGpuApplied = false,
    skipClientGpu = false,
    fps         = 24,
    autoPlay    = true,
    loop        = true,
    bass        = 0,
    mid         = 0,
    treble      = 0,
    width       = 512,
    height      = 512,
    className,
    onReady,
    onFrameRendered,
  } = props;

  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const bridgeRef   = useRef<DigitalGPUInferenceBridge | null>(null);
  const rafRef      = useRef<number>(0);
  const frameIdxRef = useRef<number>(0);
  const playingRef  = useRef<boolean>(false);
  const lastTimeRef = useRef<number>(0);

  const [gpuReady,     setGpuReady]     = useState(false);
  const [gpuWarning,   setGpuWarning]   = useState('');
  const [currentFrame, setCurrentFrame] = useState(0);

  // ── Initialise WebGL bridge ─────────────────────────────────────────────

  useEffect(() => {
    if (!canvasRef.current) return;

    const cfg: InferenceConfig = {
      width,
      height,
      scene:            sceneName,
      audioReactivity:  (bass * 0.5 + mid * 0.3 + treble * 0.2),
      bass,
      mid,
      treble,
    };

    const bridge = new DigitalGPUInferenceBridge(cfg);
    bridgeRef.current = bridge;

    bridge.init().then(() => {
      if (bridge.isReady) {
        setGpuReady(true);
        setGpuWarning('');
      } else {
        setGpuWarning('WebGL2 not available — rendering frames without GPU polish');
      }
      onReady?.(bridge);
      if (autoPlay && frames.length > 0) {
        playingRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      }
    });

    return () => {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
      bridge.destroy();
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  // ── Update scene when it changes ─────────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.setScene(sceneName);
  }, [sceneName]);

  // ── Update audio params in real-time ─────────────────────────────────────

  useEffect(() => {
    bridgeRef.current?.setAudioParams(bass, mid, treble);
  }, [bass, mid, treble]);

  // ── Re-start playback when frames array changes ───────────────────────────

  useEffect(() => {
    frameIdxRef.current = 0;
    if (autoPlay && frames.length > 0 && bridgeRef.current) {
      playingRef.current = true;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames]);

  // ── Main render loop ──────────────────────────────────────────────────────

  const tick = useCallback(async (now: number) => {
    if (!playingRef.current) return;

    const msPerFrame = 1000 / fps;
    if (now - lastTimeRef.current >= msPerFrame) {
      lastTimeRef.current = now;

      const idx = frameIdxRef.current;
      if (idx < frames.length) {
        await renderFrame(idx);
        frameIdxRef.current = loop
          ? (idx + 1) % frames.length
          : Math.min(idx + 1, frames.length - 1);

        if (!loop && idx >= frames.length - 1) {
          playingRef.current = false;
          return;
        }
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, fps, loop, skipClientGpu]);

  const renderFrame = useCallback(async (idx: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !frames[idx]) return;

    const b64 = frames[idx];

    // Decode frame
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = reject;
      img.src     = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
    });

    const bridge = bridgeRef.current;

    if (!skipClientGpu && bridge?.isReady) {
      // Run the full WebGL post-processing chain
      const imageData = await bridge.process(img as any, sceneName);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.putImageData(imageData, 0, 0);
    } else {
      // Direct blit — server GPU chain already applied
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }

    setCurrentFrame(idx);
    onFrameRendered?.(idx);
  }, [frames, sceneName, skipClientGpu, onFrameRendered]);

  // ── Imperative handle ─────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    play() {
      if (!playingRef.current) {
        playingRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      }
    },
    pause() {
      playingRef.current = false;
      cancelAnimationFrame(rafRef.current);
    },
    seek(frame: number) {
      frameIdxRef.current = Math.max(0, Math.min(frame, frames.length - 1));
      renderFrame(frameIdxRef.current);
    },
    bridge: bridgeRef.current,
    canvas: canvasRef.current,
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* GPU status badge */}
      <div className="absolute top-2 right-2 flex flex-col gap-1 items-end pointer-events-none">
        {gpuReady && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold
                           bg-purple-600/80 text-white backdrop-blur-sm">
            DigitalGPU ⚡
          </span>
        )}
        {serverGpuApplied && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono
                           bg-blue-600/80 text-white backdrop-blur-sm">
            Server GPU ✓
          </span>
        )}
        {gpuWarning && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono
                           bg-yellow-600/80 text-white backdrop-blur-sm">
            CPU fallback
          </span>
        )}
      </div>

      {/* Scene + frame counter */}
      <div className="absolute bottom-2 left-2 pointer-events-none">
        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono
                         bg-black/50 text-white/80 backdrop-blur-sm">
          {sceneName} · {currentFrame + 1}/{frames.length}
        </span>
      </div>
    </div>
  );
});

DigitalGPUVideoPlayer.displayName = 'DigitalGPUVideoPlayer';

export default DigitalGPUVideoPlayer;
