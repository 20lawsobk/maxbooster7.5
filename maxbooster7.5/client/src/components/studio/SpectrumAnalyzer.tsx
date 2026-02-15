import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface SpectrumAnalyzerProps {
  analyserNode?: AnalyserNode | null;
  width?: number;
  height?: number;
  barCount?: number;
  minFreq?: number;
  maxFreq?: number;
  smoothing?: number;
  style?: 'bars' | 'line' | 'waterfall';
  showGrid?: boolean;
  showLabels?: boolean;
  color?: string;
  className?: string;
}

/**
 * TODO: Add function documentation
 */
export function SpectrumAnalyzer({
  analyserNode,
  width = 300,
  height = 150,
  barCount = 32,
  minFreq = 20,
  maxFreq = 20000,
  smoothing = 0.8,
  style = 'bars',
  showGrid = true,
  showLabels = true,
  color = 'var(--studio-accent)',
  className = '',
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const waterfallDataRef = useRef<ImageData[]>([]);
  const peakHoldRef = useRef<Float32Array>(new Float32Array(barCount));
  const peakHoldTimeRef = useRef<Float32Array>(new Float32Array(barCount));

  useEffect(() => {
    if (!analyserNode) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    canvas.width = width;
    canvas.height = height;

    // Configure analyser
    analyserNode.fftSize = Math.pow(2, Math.ceil(Math.log2(barCount * 4)));
    analyserNode.smoothingTimeConstant = smoothing;

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    // Calculate frequency bins
    const sampleRate = analyserNode.context.sampleRate;
    const nyquist = sampleRate / 2;
    const minBin = Math.floor((minFreq / nyquist) * bufferLength);
    const maxBin = Math.ceil((maxFreq / nyquist) * bufferLength);
    const binsPerBar = Math.floor((maxBin - minBin) / barCount);

    // Resolve CSS variables to actual colors (Canvas API can't parse CSS vars)
    const resolvedColors = {
      background: getComputedStyle(canvas).getPropertyValue('--meter-background').trim() || '#1a1a2e',
      green: getComputedStyle(canvas).getPropertyValue('--meter-green').trim() || '#22c55e',
      yellow: getComputedStyle(canvas).getPropertyValue('--meter-yellow').trim() || '#eab308',
      red: getComputedStyle(canvas).getPropertyValue('--meter-red').trim() || '#ef4444',
      textMuted: getComputedStyle(canvas).getPropertyValue('--studio-text-muted').trim() || '#888888',
    };

    const draw = () => {
      analyserNode.getFloatFrequencyData(dataArray);

      // Clear canvas
      ctx.fillStyle = resolvedColors.background;
      ctx.fillRect(0, 0, width, height);

      // Draw grid
      if (showGrid) {
        drawGrid(ctx, width, height);
      }

      // Draw spectrum based on style
      if (style === 'bars') {
        drawBars(ctx, dataArray, minBin, binsPerBar, barCount, width, height, resolvedColors);
      } else if (style === 'line') {
        drawLine(ctx, dataArray, minBin, binsPerBar, barCount, width, height);
      } else if (style === 'waterfall') {
        drawWaterfall(ctx, dataArray, minBin, binsPerBar, barCount, width, height);
      }

      // Draw frequency labels
      if (showLabels) {
        drawFrequencyLabels(ctx, width, height, minFreq, maxFreq, resolvedColors);
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    analyserNode,
    width,
    height,
    barCount,
    minFreq,
    maxFreq,
    smoothing,
    style,
    showGrid,
    showLabels,
    color,
  ]);

  const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    // Horizontal lines (dB scale)
    const dbLines = [-60, -48, -36, -24, -12, 0];
    dbLines.forEach((db) => {
      const y = ((db + 60) / 60) * h;
      ctx.beginPath();
      ctx.moveTo(0, h - y);
      ctx.lineTo(w, h - y);
      ctx.stroke();
    });

    // Vertical lines (frequency scale - logarithmic)
    const freqLines = [100, 1000, 10000];
    freqLines.forEach((freq) => {
      const x = (Math.log10(freq / minFreq) / Math.log10(maxFreq / minFreq)) * w;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    });
  };

  const drawBars = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    minBin: number,
    binsPerBar: number,
    bars: number,
    w: number,
    h: number,
    colors: { green: string; yellow: string; red: string }
  ) => {
    const barWidth = w / bars;
    const barGap = 1;
    const currentTime = Date.now();

    for (let i = 0; i < bars; i++) {
      // Average frequency bins for this bar
      let sum = 0;
      let count = 0;
      for (let j = 0; j < binsPerBar; j++) {
        const bin = minBin + i * binsPerBar + j;
        if (bin < data.length && !isNaN(data[bin]) && isFinite(data[bin])) {
          sum += data[bin];
          count++;
        }
      }

      const value = count > 0 ? sum / count : -100;
      const normalizedValue = Math.max(0, (value + 60) / 60); // Normalize from -60dB to 0dB
      const barHeight = normalizedValue * h;

      // Update peak hold
      if (normalizedValue > peakHoldRef.current[i]) {
        peakHoldRef.current[i] = normalizedValue;
        peakHoldTimeRef.current[i] = currentTime;
      } else if (currentTime - peakHoldTimeRef.current[i] > 1000) {
        // Decay peak after 1 second
        peakHoldRef.current[i] = Math.max(peakHoldRef.current[i] - 0.01, normalizedValue);
      }

      // Calculate color based on level (using resolved colors)
      let barColor: string;
      if (normalizedValue < 0.3) {
        barColor = colors.green;
      } else if (normalizedValue < 0.7) {
        barColor = colors.yellow;
      } else {
        barColor = colors.red;
      }

      // Draw bar gradient
      const gradient = ctx.createLinearGradient(0, h, 0, h - barHeight);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(1, `${barColor}88`);

      ctx.fillStyle = gradient;
      ctx.fillRect(i * barWidth + barGap, h - barHeight, barWidth - barGap * 2, barHeight);

      // Draw peak hold line
      const peakY = h - peakHoldRef.current[i] * h;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(i * barWidth + barGap, peakY, barWidth - barGap * 2, 2);
    }
  };

  const drawLine = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    minBin: number,
    binsPerBar: number,
    bars: number,
    w: number,
    h: number
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < bars; i++) {
      // Average frequency bins for this point
      let sum = 0;
      let count = 0;
      for (let j = 0; j < binsPerBar; j++) {
        const bin = minBin + i * binsPerBar + j;
        if (bin < data.length && !isNaN(data[bin]) && isFinite(data[bin])) {
          sum += data[bin];
          count++;
        }
      }

      const value = count > 0 ? sum / count : -100;
      const normalizedValue = Math.max(0, (value + 60) / 60);
      const x = (i / bars) * w;
      const y = h - normalizedValue * h;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Fill area under curve
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, `${color}44`);
    gradient.addColorStop(1, `${color}11`);
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  const drawWaterfall = (
    ctx: CanvasRenderingContext2D,
    data: Float32Array,
    minBin: number,
    binsPerBar: number,
    bars: number,
    w: number,
    h: number
  ) => {
    // Create new line of spectrum data
    const imageData = ctx.createImageData(w, 1);
    const pixels = imageData.data;

    for (let i = 0; i < bars; i++) {
      // Average frequency bins for this pixel
      let sum = 0;
      let count = 0;
      for (let j = 0; j < binsPerBar; j++) {
        const bin = minBin + i * binsPerBar + j;
        if (bin < data.length && !isNaN(data[bin]) && isFinite(data[bin])) {
          sum += data[bin];
          count++;
        }
      }

      const value = count > 0 ? sum / count : -100;
      const normalizedValue = Math.max(0, Math.min(1, (value + 60) / 60));

      // Map value to color
      const hue = (1 - normalizedValue) * 240; // Blue to red
      const [r, g, b] = hslToRgb(hue / 360, 1, normalizedValue * 0.5 + 0.2);

      const pixelIndex = Math.floor((i / bars) * w) * 4;
      pixels[pixelIndex] = r;
      pixels[pixelIndex + 1] = g;
      pixels[pixelIndex + 2] = b;
      pixels[pixelIndex + 3] = 255;
    }

    // Shift existing waterfall data down
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');

    if (tempCtx) {
      tempCtx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(tempCanvas, 0, 1);
      ctx.putImageData(imageData, 0, 0);
    }
  };

  const drawFrequencyLabels = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    minF: number,
    maxF: number,
    colors: { textMuted: string }
  ) => {
    ctx.fillStyle = colors.textMuted;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';

    const labels = [
      { freq: 100, label: '100' },
      { freq: 1000, label: '1k' },
      { freq: 10000, label: '10k' },
    ];

    labels.forEach(({ freq, label }) => {
      if (freq >= minF && freq <= maxF) {
        const x = (Math.log10(freq / minF) / Math.log10(maxF / minF)) * w;
        ctx.fillText(label, x, h - 2);
      }
    });

    // Draw dB scale on the left
    ctx.textAlign = 'left';
    ctx.fillText('0dB', 2, 10);
    ctx.fillText('-60dB', 2, h - 2);
  };

  const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
    let r, g, b;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="rounded"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          background: 'var(--meter-background)',
        }}
      />

      {/* Style selector */}
      <div className="absolute top-1 right-1 flex gap-1">
        {(['bars', 'line', 'waterfall'] as const).map((s) => (
          <motion.button
            key={s}
            className="px-2 py-0.5 text-[8px] rounded"
            style={{
              background: style === s ? 'var(--studio-accent)' : 'var(--studio-bg-medium)',
              color: style === s ? 'var(--studio-bg-deep)' : 'var(--studio-text-muted)',
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {s.toUpperCase()}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
