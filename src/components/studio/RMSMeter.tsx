import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';

interface RMSMeterProps {
  analyserNodeLeft?: AnalyserNode | null;
  analyserNodeRight?: AnalyserNode | null;
  width?: number;
  height?: number;
  preFader?: boolean;
  kWeighting?: boolean;
  peakHoldTime?: number;
  peakDecayRate?: number;
  className?: string;
}

interface MeteringData {
  rmsLeft: number;
  rmsRight: number;
  peakLeft: number;
  peakRight: number;
  truePeakLeft: number;
  truePeakRight: number;
  lufsIntegrated: number;
  lufsShortTerm: number;
  lufsMomentary: number;
  stereoCorrelation: number;
  dynamicRange: number;
  clipLeft: boolean;
  clipRight: boolean;
}

const K_WEIGHTING_COEFFICIENTS = {
  highShelf: { frequency: 1500, gain: 4 },
  highPass: { frequency: 38, Q: 0.5 },
};

const DB_MIN = -60;
const DB_MAX = 6;
const LUFS_MIN = -60;
const LUFS_MAX = 0;

export function RMSMeter({
  analyserNodeLeft,
  analyserNodeRight,
  width = 280,
  height = 400,
  preFader = true,
  kWeighting = true,
  peakHoldTime = 2000,
  peakDecayRate = 0.02,
  className = '',
}: RMSMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const peakHoldLeftRef = useRef<number>(DB_MIN);
  const peakHoldRightRef = useRef<number>(DB_MIN);
  const peakHoldTimeLeftRef = useRef<number>(0);
  const peakHoldTimeRightRef = useRef<number>(0);
  const truePeakHoldLeftRef = useRef<number>(DB_MIN);
  const truePeakHoldRightRef = useRef<number>(DB_MIN);
  const clipLeftRef = useRef<boolean>(false);
  const clipRightRef = useRef<boolean>(false);
  const clipTimeLeftRef = useRef<number>(0);
  const clipTimeRightRef = useRef<number>(0);
  const lufsHistoryRef = useRef<number[]>([]);
  const shortTermHistoryRef = useRef<number[]>([]);

  const [isPreFader, setIsPreFader] = useState(preFader);
  const [isKWeighted, setIsKWeighted] = useState(kWeighting);
  const [meteringData, setMeteringData] = useState<MeteringData>({
    rmsLeft: DB_MIN,
    rmsRight: DB_MIN,
    peakLeft: DB_MIN,
    peakRight: DB_MIN,
    truePeakLeft: DB_MIN,
    truePeakRight: DB_MIN,
    lufsIntegrated: LUFS_MIN,
    lufsShortTerm: LUFS_MIN,
    lufsMomentary: LUFS_MIN,
    stereoCorrelation: 1,
    dynamicRange: 0,
    clipLeft: false,
    clipRight: false,
  });

  const linearToDb = useCallback((linear: number): number => {
    if (linear <= 0) return DB_MIN;
    const db = 20 * Math.log10(linear);
    return Math.max(DB_MIN, Math.min(DB_MAX, db));
  }, []);

  const calculateRMS = useCallback((data: Float32Array): number => {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }, []);

  const calculatePeak = useCallback((data: Float32Array): number => {
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }, []);

  const calculateTruePeak = useCallback((data: Float32Array): number => {
    let truePeak = 0;
    for (let i = 1; i < data.length - 1; i++) {
      const interpolated = (data[i - 1] + 2 * data[i] + data[i + 1]) / 4;
      const abs = Math.abs(interpolated);
      if (abs > truePeak) truePeak = abs;
      const abs2 = Math.abs(data[i]);
      if (abs2 > truePeak) truePeak = abs2;
    }
    return truePeak;
  }, []);

  const applyKWeighting = useCallback((data: Float32Array, sampleRate: number): Float32Array => {
    if (!isKWeighted) return data;
    const filtered = new Float32Array(data.length);
    const { highShelf, highPass } = K_WEIGHTING_COEFFICIENTS;
    const w0hs = (2 * Math.PI * highShelf.frequency) / sampleRate;
    const w0hp = (2 * Math.PI * highPass.frequency) / sampleRate;
    const A = Math.pow(10, highShelf.gain / 40);
    const alpha_hs = Math.sin(w0hs) / 2 * Math.sqrt((A + 1/A) * 2);
    const alpha_hp = Math.sin(w0hp) / (2 * highPass.Q);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x0 = data[i];
      const y0 = x0 * (1 + alpha_hs) - x1 * (-2 * Math.cos(w0hs)) + x2 * (1 - alpha_hs);
      filtered[i] = y0 / (1 + alpha_hp);
      x2 = x1; x1 = x0;
      y2 = y1; y1 = y0;
    }
    return filtered;
  }, [isKWeighted]);

  const calculateLUFS = useCallback((rmsLeft: number, rmsRight: number): number => {
    const meanSquare = (rmsLeft * rmsLeft + rmsRight * rmsRight) / 2;
    if (meanSquare <= 0) return LUFS_MIN;
    const lufs = -0.691 + 10 * Math.log10(meanSquare);
    return Math.max(LUFS_MIN, Math.min(LUFS_MAX, lufs));
  }, []);

  const calculateStereoCorrelation = useCallback((leftData: Float32Array, rightData: Float32Array): number => {
    if (leftData.length !== rightData.length || leftData.length === 0) return 1;
    let sumLR = 0, sumLL = 0, sumRR = 0;
    for (let i = 0; i < leftData.length; i++) {
      sumLR += leftData[i] * rightData[i];
      sumLL += leftData[i] * leftData[i];
      sumRR += rightData[i] * rightData[i];
    }
    const denom = Math.sqrt(sumLL * sumRR);
    if (denom === 0) return 1;
    return sumLR / denom;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const computedStyle = getComputedStyle(canvas);
    const colors = {
      background: computedStyle.getPropertyValue('--meter-background').trim() || '#1a1a2e',
      green: computedStyle.getPropertyValue('--meter-green').trim() || '#22c55e',
      yellow: computedStyle.getPropertyValue('--meter-yellow').trim() || '#eab308',
      red: computedStyle.getPropertyValue('--meter-red').trim() || '#ef4444',
      textMuted: computedStyle.getPropertyValue('--studio-text-muted').trim() || '#888888',
      text: computedStyle.getPropertyValue('--studio-text').trim() || '#ffffff',
      bgMedium: computedStyle.getPropertyValue('--studio-bg-medium').trim() || '#2a2a3e',
      accent: computedStyle.getPropertyValue('--studio-accent').trim() || '#8b5cf6',
    };

    const bufferLength = 2048;
    const leftData = new Float32Array(bufferLength);
    const rightData = new Float32Array(bufferLength);

    const draw = () => {
      const currentTime = Date.now();

      if (analyserNodeLeft) {
        analyserNodeLeft.getFloatTimeDomainData(leftData);
      }
      if (analyserNodeRight) {
        analyserNodeRight.getFloatTimeDomainData(rightData);
      } else if (analyserNodeLeft) {
        analyserNodeLeft.getFloatTimeDomainData(rightData);
      }

      const sampleRate = analyserNodeLeft?.context.sampleRate || 44100;
      const weightedLeft = applyKWeighting(leftData, sampleRate);
      const weightedRight = applyKWeighting(rightData, sampleRate);

      const rmsLeft = linearToDb(calculateRMS(weightedLeft));
      const rmsRight = linearToDb(calculateRMS(weightedRight));
      const peakLeft = linearToDb(calculatePeak(leftData));
      const peakRight = linearToDb(calculatePeak(rightData));
      const truePeakLeft = linearToDb(calculateTruePeak(leftData));
      const truePeakRight = linearToDb(calculateTruePeak(rightData));

      if (peakLeft > peakHoldLeftRef.current) {
        peakHoldLeftRef.current = peakLeft;
        peakHoldTimeLeftRef.current = currentTime;
      } else if (currentTime - peakHoldTimeLeftRef.current > peakHoldTime) {
        peakHoldLeftRef.current = Math.max(peakHoldLeftRef.current - peakDecayRate, peakLeft);
      }

      if (peakRight > peakHoldRightRef.current) {
        peakHoldRightRef.current = peakRight;
        peakHoldTimeRightRef.current = currentTime;
      } else if (currentTime - peakHoldTimeRightRef.current > peakHoldTime) {
        peakHoldRightRef.current = Math.max(peakHoldRightRef.current - peakDecayRate, peakRight);
      }

      truePeakHoldLeftRef.current = Math.max(truePeakHoldLeftRef.current, truePeakLeft);
      truePeakHoldRightRef.current = Math.max(truePeakHoldRightRef.current, truePeakRight);

      const clipLeft = peakLeft >= 0;
      const clipRight = peakRight >= 0;
      if (clipLeft) { clipLeftRef.current = true; clipTimeLeftRef.current = currentTime; }
      else if (currentTime - clipTimeLeftRef.current > 3000) clipLeftRef.current = false;
      if (clipRight) { clipRightRef.current = true; clipTimeRightRef.current = currentTime; }
      else if (currentTime - clipTimeRightRef.current > 3000) clipRightRef.current = false;

      const lufsMomentary = calculateLUFS(calculateRMS(weightedLeft), calculateRMS(weightedRight));
      shortTermHistoryRef.current.push(lufsMomentary);
      if (shortTermHistoryRef.current.length > 30) shortTermHistoryRef.current.shift();
      const lufsShortTerm = shortTermHistoryRef.current.reduce((a, b) => a + b, 0) / shortTermHistoryRef.current.length;

      lufsHistoryRef.current.push(lufsMomentary);
      if (lufsHistoryRef.current.length > 300) lufsHistoryRef.current.shift();
      const validLufs = lufsHistoryRef.current.filter(l => l > LUFS_MIN + 10);
      const lufsIntegrated = validLufs.length > 0 ? validLufs.reduce((a, b) => a + b, 0) / validLufs.length : LUFS_MIN;

      const stereoCorrelation = calculateStereoCorrelation(leftData, rightData);
      const dynamicRange = Math.max(peakLeft, peakRight) - Math.min(rmsLeft, rmsRight);

      setMeteringData({
        rmsLeft, rmsRight, peakLeft, peakRight, truePeakLeft, truePeakRight,
        lufsIntegrated, lufsShortTerm, lufsMomentary,
        stereoCorrelation, dynamicRange,
        clipLeft: clipLeftRef.current, clipRight: clipRightRef.current,
      });

      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, height);

      drawMeterBars(ctx, rmsLeft, rmsRight, peakHoldLeftRef.current, peakHoldRightRef.current, colors);
      drawLUFSSection(ctx, lufsIntegrated, lufsShortTerm, lufsMomentary, colors);
      drawCorrelationMeter(ctx, stereoCorrelation, colors);
      drawDynamicRange(ctx, dynamicRange, colors);
      drawReadouts(ctx, meteringData, colors);
      drawClipIndicators(ctx, clipLeftRef.current, clipRightRef.current, colors);
      drawTruePeakIndicators(ctx, truePeakHoldLeftRef.current, truePeakHoldRightRef.current, colors);

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyserNodeLeft, analyserNodeRight, width, height, isPreFader, isKWeighted, peakHoldTime, peakDecayRate, linearToDb, calculateRMS, calculatePeak, calculateTruePeak, applyKWeighting, calculateLUFS, calculateStereoCorrelation, meteringData]);

  const drawMeterBars = (
    ctx: CanvasRenderingContext2D,
    rmsLeft: number, rmsRight: number,
    peakLeft: number, peakRight: number,
    colors: Record<string, string>
  ) => {
    const barWidth = 24;
    const barHeight = 180;
    const startX = 20;
    const startY = 30;
    const gap = 8;

    ctx.fillStyle = colors.textMuted;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('L', startX + barWidth / 2, startY - 8);
    ctx.fillText('R', startX + barWidth + gap + barWidth / 2, startY - 8);

    const dbMarks = [0, -6, -12, -18, -24, -36, -48, -60];
    ctx.textAlign = 'right';
    ctx.font = '8px monospace';
    dbMarks.forEach(db => {
      const y = startY + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * barHeight;
      ctx.fillStyle = colors.textMuted;
      ctx.fillText(`${db}`, startX - 4, y + 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(startX + barWidth * 2 + gap, y);
      ctx.stroke();
    });

    [
      { x: startX, rms: rmsLeft, peak: peakLeft },
      { x: startX + barWidth + gap, rms: rmsRight, peak: peakRight },
    ].forEach(({ x, rms, peak }) => {
      ctx.fillStyle = colors.bgMedium;
      ctx.fillRect(x, startY, barWidth, barHeight);

      const segments = 60;
      for (let i = 0; i < segments; i++) {
        const segDb = DB_MAX - (i / segments) * (DB_MAX - DB_MIN);
        const segY = startY + (i / segments) * barHeight;
        const segHeight = barHeight / segments - 1;

        if (rms >= segDb) {
          let color: string;
          if (segDb >= -6) color = colors.red;
          else if (segDb >= -18) color = colors.yellow;
          else color = colors.green;
          ctx.fillStyle = color;
          ctx.fillRect(x + 1, segY, barWidth - 2, segHeight);
        }
      }

      const peakY = startY + ((DB_MAX - peak) / (DB_MAX - DB_MIN)) * barHeight;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, peakY - 1, barWidth, 2);
    });
  };

  const drawLUFSSection = (
    ctx: CanvasRenderingContext2D,
    integrated: number, shortTerm: number, momentary: number,
    colors: Record<string, string>
  ) => {
    const startX = 90;
    const startY = 30;
    const meterWidth = 80;
    const meterHeight = 14;

    ctx.fillStyle = colors.text;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LUFS', startX, startY - 8);

    const lufsMeters = [
      { label: 'I', value: integrated, y: startY },
      { label: 'S', value: shortTerm, y: startY + 22 },
      { label: 'M', value: momentary, y: startY + 44 },
    ];

    lufsMeters.forEach(({ label, value, y }) => {
      ctx.fillStyle = colors.textMuted;
      ctx.font = '8px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, startX, y + 10);

      ctx.fillStyle = colors.bgMedium;
      ctx.fillRect(startX + 12, y, meterWidth, meterHeight);

      const normalized = Math.max(0, (value - LUFS_MIN) / (LUFS_MAX - LUFS_MIN));
      const gradient = ctx.createLinearGradient(startX + 12, 0, startX + 12 + meterWidth, 0);
      gradient.addColorStop(0, colors.green);
      gradient.addColorStop(0.7, colors.yellow);
      gradient.addColorStop(1, colors.red);
      ctx.fillStyle = gradient;
      ctx.fillRect(startX + 12, y, meterWidth * normalized, meterHeight);

      ctx.fillStyle = colors.text;
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${value.toFixed(1)}`, startX + meterWidth + 38, y + 10);
    });
  };

  const drawCorrelationMeter = (
    ctx: CanvasRenderingContext2D,
    correlation: number,
    colors: Record<string, string>
  ) => {
    const startX = 90;
    const startY = 120;
    const meterWidth = 100;
    const meterHeight = 12;

    ctx.fillStyle = colors.text;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('STEREO CORRELATION', startX, startY - 6);

    ctx.fillStyle = colors.bgMedium;
    ctx.fillRect(startX, startY, meterWidth, meterHeight);

    ctx.fillStyle = colors.textMuted;
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('-1', startX, startY + meterHeight + 10);
    ctx.fillText('0', startX + meterWidth / 2, startY + meterHeight + 10);
    ctx.fillText('+1', startX + meterWidth, startY + meterHeight + 10);

    const centerX = startX + meterWidth / 2;
    const indicatorX = centerX + (correlation * meterWidth / 2);
    let indicatorColor = colors.green;
    if (correlation < 0) indicatorColor = colors.red;
    else if (correlation < 0.5) indicatorColor = colors.yellow;

    ctx.fillStyle = indicatorColor;
    ctx.fillRect(Math.min(centerX, indicatorX), startY, Math.abs(indicatorX - centerX), meterHeight);

    ctx.strokeStyle = colors.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, startY);
    ctx.lineTo(centerX, startY + meterHeight);
    ctx.stroke();

    ctx.fillStyle = colors.text;
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(correlation.toFixed(2), startX + meterWidth + 32, startY + 10);
  };

  const drawDynamicRange = (
    ctx: CanvasRenderingContext2D,
    dr: number,
    colors: Record<string, string>
  ) => {
    const startX = 90;
    const startY = 160;

    ctx.fillStyle = colors.text;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DYNAMIC RANGE', startX, startY);

    ctx.fillStyle = colors.accent;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`${dr.toFixed(1)} dB`, startX, startY + 20);
  };

  const drawReadouts = (
    ctx: CanvasRenderingContext2D,
    data: MeteringData,
    colors: Record<string, string>
  ) => {
    const startX = 20;
    const startY = 230;

    const readouts = [
      { label: 'RMS L/R', value: `${data.rmsLeft.toFixed(1)} / ${data.rmsRight.toFixed(1)} dB` },
      { label: 'PEAK L/R', value: `${data.peakLeft.toFixed(1)} / ${data.peakRight.toFixed(1)} dB` },
      { label: 'TRUE PEAK', value: `${data.truePeakLeft.toFixed(1)} / ${data.truePeakRight.toFixed(1)} dBTP` },
    ];

    ctx.font = '8px monospace';
    readouts.forEach((r, i) => {
      ctx.fillStyle = colors.textMuted;
      ctx.textAlign = 'left';
      ctx.fillText(r.label, startX, startY + i * 16);
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'right';
      ctx.fillText(r.value, width - 20, startY + i * 16);
    });
  };

  const drawClipIndicators = (
    ctx: CanvasRenderingContext2D,
    clipLeft: boolean, clipRight: boolean,
    colors: Record<string, string>
  ) => {
    const startY = 14;
    const indicatorSize = 8;

    ctx.fillStyle = colors.textMuted;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CLIP', 42, startY);

    ctx.fillStyle = clipLeft ? colors.red : colors.bgMedium;
    ctx.beginPath();
    ctx.arc(32, startY - 4, indicatorSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = clipRight ? colors.red : colors.bgMedium;
    ctx.beginPath();
    ctx.arc(52, startY - 4, indicatorSize / 2, 0, Math.PI * 2);
    ctx.fill();

    if (clipLeft || clipRight) {
      ctx.shadowColor = colors.red;
      ctx.shadowBlur = 8;
      if (clipLeft) {
        ctx.fillStyle = colors.red;
        ctx.beginPath();
        ctx.arc(32, startY - 4, indicatorSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (clipRight) {
        ctx.fillStyle = colors.red;
        ctx.beginPath();
        ctx.arc(52, startY - 4, indicatorSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
  };

  const drawTruePeakIndicators = (
    ctx: CanvasRenderingContext2D,
    tpLeft: number, tpRight: number,
    colors: Record<string, string>
  ) => {
    const startX = 200;
    const startY = 14;

    ctx.fillStyle = colors.textMuted;
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('TP MAX', startX, startY);

    const isOver = tpLeft > 0 || tpRight > 0;
    ctx.fillStyle = isOver ? colors.red : colors.text;
    ctx.font = '9px monospace';
    ctx.fillText(`${Math.max(tpLeft, tpRight).toFixed(1)} dBTP`, startX + 40, startY);
  };

  const resetPeaks = () => {
    peakHoldLeftRef.current = DB_MIN;
    peakHoldRightRef.current = DB_MIN;
    truePeakHoldLeftRef.current = DB_MIN;
    truePeakHoldRightRef.current = DB_MIN;
    clipLeftRef.current = false;
    clipRightRef.current = false;
    lufsHistoryRef.current = [];
    shortTermHistoryRef.current = [];
  };

  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      <canvas
        ref={canvasRef}
        className="rounded"
        style={{ width: `${width}px`, height: `${height}px`, background: 'var(--meter-background)' }}
      />

      <div className="absolute bottom-2 left-2 right-2 flex gap-2">
        <motion.button
          className="flex-1 px-2 py-1 text-[9px] rounded font-mono"
          style={{
            background: isPreFader ? 'var(--studio-accent)' : 'var(--studio-bg-medium)',
            color: isPreFader ? 'var(--studio-bg-deep)' : 'var(--studio-text-muted)',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsPreFader(!isPreFader)}
        >
          {isPreFader ? 'PRE' : 'POST'}
        </motion.button>

        <motion.button
          className="flex-1 px-2 py-1 text-[9px] rounded font-mono"
          style={{
            background: isKWeighted ? 'var(--studio-accent)' : 'var(--studio-bg-medium)',
            color: isKWeighted ? 'var(--studio-bg-deep)' : 'var(--studio-text-muted)',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsKWeighted(!isKWeighted)}
        >
          K-WEIGHT
        </motion.button>

        <motion.button
          className="flex-1 px-2 py-1 text-[9px] rounded font-mono"
          style={{
            background: 'var(--studio-bg-medium)',
            color: 'var(--studio-text-muted)',
          }}
          whileHover={{ scale: 1.02, background: 'var(--meter-red)' }}
          whileTap={{ scale: 0.98 }}
          onClick={resetPeaks}
        >
          RESET
        </motion.button>
      </div>
    </div>
  );
}
