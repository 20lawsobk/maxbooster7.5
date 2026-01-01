import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Activity, BarChart3 } from 'lucide-react';
import type AudioEngine from '@/lib/audioEngine';

interface WaveformVisualizerProps {
  audioEngine: AudioEngine;
  isPlaying: boolean;
  mode?: 'waveform' | 'spectrum';
  onModeChange?: (mode: 'waveform' | 'spectrum') => void;
}

/**
 * TODO: Add function documentation
 */
export function WaveformVisualizer({
  audioEngine,
  isPlaying,
  mode = 'waveform',
  onModeChange,
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const isPageVisibleRef = useRef<boolean>(true);

  // Reusable typed arrays to avoid allocations in RAF loop
  const waveformBufferRef = useRef<Float32Array | null>(null);
  const frequencyBufferRef = useRef<Uint8Array | null>(null);

  const [localMode, setLocalMode] = useState<'waveform' | 'spectrum'>(mode);
  const [buffersReady, setBuffersReady] = useState(false);

  // Initialize buffers with retry mechanism
  useEffect(() => {
    let isMounted = true;
    let retryTimeout: NodeJS.Timeout | null = null;

    const initializeBuffers = () => {
      const analyser = audioEngine.getMasterAnalyser();

      if (!analyser) {
        // Retry after a short delay if analyser not yet available
        if (isMounted) {
          retryTimeout = setTimeout(initializeBuffers, 100);
        }
        return;
      }

      // Allocate buffers once based on analyser settings
      const bufferLength = analyser.frequencyBinCount;
      waveformBufferRef.current = new Float32Array(bufferLength);
      frequencyBufferRef.current = new Uint8Array(bufferLength);

      if (isMounted) {
        setBuffersReady(true);
      }
    };

    initializeBuffers();

    return () => {
      isMounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
      waveformBufferRef.current = null;
      frequencyBufferRef.current = null;
      setBuffersReady(false);
    };
  }, [audioEngine]);

  // Handle Page Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync mode with prop
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  const handleModeChange = useCallback(
    (newMode: 'waveform' | 'spectrum') => {
      setLocalMode(newMode);
      onModeChange?.(newMode);
    },
    [onModeChange]
  );

  // Drawing functions
  const drawWaveform = useCallback(
    (ctx: CanvasRenderingContext2D, buffer: Float32Array, width: number, height: number) => {
      const bufferLength = buffer.length;
      const sliceWidth = width / bufferLength;

      // Clear canvas
      ctx.fillStyle = 'rgb(15, 23, 42)'; // Dark background
      ctx.fillRect(0, 0, width, height);

      // Draw waveform
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(34, 197, 94)'; // Green waveform
      ctx.beginPath();

      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = buffer[i];
        const y = ((v + 1) / 2) * height; // Normalize from [-1, 1] to [0, height]

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Draw center line
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    },
    []
  );

  const drawSpectrum = useCallback(
    (ctx: CanvasRenderingContext2D, buffer: Uint8Array, width: number, height: number) => {
      const bufferLength = buffer.length;
      const barWidth = (width / bufferLength) * 2.5;

      // Clear canvas
      ctx.fillStyle = 'rgb(15, 23, 42)'; // Dark background
      ctx.fillRect(0, 0, width, height);

      // Draw spectrum bars
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (buffer[i] / 255) * height;

        // Gradient based on frequency
        const hue = (i / bufferLength) * 120 + 120; // Green to blue
        ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;

        ctx.fillRect(x, height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
      }
    },
    []
  );

  // Animation loop
  const animate = useCallback(
    (timestamp: number) => {
      if (!isPageVisibleRef.current || !isPlaying || !buffersReady) {
        animationFrameRef.current = null;
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Throttle to ~60fps (16.67ms per frame)
      const timeSinceLastFrame = timestamp - lastFrameTimeRef.current;
      if (timeSinceLastFrame < 16) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      lastFrameTimeRef.current = timestamp;

      const width = canvas.width;
      const height = canvas.height;

      // Get data from analyser
      if (localMode === 'waveform' && waveformBufferRef.current) {
        audioEngine.getRealtimeWaveformData(waveformBufferRef.current);
        drawWaveform(ctx, waveformBufferRef.current, width, height);
      } else if (localMode === 'spectrum' && frequencyBufferRef.current) {
        audioEngine.getRealtimeFrequencyData(frequencyBufferRef.current);
        drawSpectrum(ctx, frequencyBufferRef.current, width, height);
      }

      animationFrameRef.current = requestAnimationFrame(animate);
    },
    [audioEngine, isPlaying, localMode, drawWaveform, drawSpectrum, buffersReady]
  );

  // Start/stop animation based on playback state
  useEffect(() => {
    if (isPlaying && isPageVisibleRef.current && buffersReady) {
      if (!animationFrameRef.current) {
        lastFrameTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Clear canvas when stopped
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgb(15, 23, 42)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, animate, buffersReady]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 0 || height <= 0) return;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        }
      }
    });

    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Card className="bg-slate-900 border-slate-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-200">Audio Visualization</h3>
        <div className="flex gap-2" data-testid="select-visualizer-mode">
          <Button
            variant={localMode === 'waveform' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleModeChange('waveform')}
            className="h-8"
            data-testid="button-visualizer-mode-waveform"
          >
            <Activity className="w-4 h-4 mr-1" />
            Waveform
          </Button>
          <Button
            variant={localMode === 'spectrum' ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleModeChange('spectrum')}
            className="h-8"
            data-testid="button-visualizer-mode-spectrum"
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            Spectrum
          </Button>
        </div>
      </div>
      <div className="relative w-full h-32 bg-slate-950 rounded border border-slate-700 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          data-testid={localMode === 'waveform' ? 'canvas-waveform' : 'canvas-spectrum'}
        />
      </div>
    </Card>
  );
}
