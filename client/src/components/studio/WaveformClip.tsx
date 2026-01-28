import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

interface WaveformClipProps {
  audioUrl?: string;
  audioBuffer?: AudioBuffer;
  waveformData?: number[];
  duration: number;
  startTime: number;
  width: number;
  height: number;
  color?: string;
  selected?: boolean;
  muted?: boolean;
  clipName?: string;
  zoom?: number;
  showFades?: boolean;
  fadeInTime?: number;
  fadeOutTime?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onResize?: (direction: 'left' | 'right', delta: number) => void;
  onMove?: (delta: number) => void;
  pixelsPerSecond?: number;
  bpm?: number;
  timeSignature?: string;
  showGridLines?: boolean;
  consolidatedWaveform?: boolean;
}

export function WaveformClip({
  audioUrl,
  audioBuffer,
  waveformData,
  duration,
  startTime,
  width,
  height,
  color = '#4ade80',
  selected = false,
  muted = false,
  clipName = 'Audio Clip',
  zoom = 1,
  showFades = true,
  fadeInTime = 0,
  fadeOutTime = 0,
  onClick,
  onDoubleClick,
  onResize,
  onMove,
  pixelsPerSecond = 50,
  bpm = 120,
  timeSignature = '4/4',
  showGridLines = true,
  consolidatedWaveform = true,
}: WaveformClipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localWaveformData, setLocalWaveformData] = useState<number[]>([]);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const secondsPerBeat = 60 / bpm;
  const [beatsPerBar] = timeSignature.split('/').map(Number);
  const secondsPerBar = secondsPerBeat * (beatsPerBar || 4);

  const calculatedWidth = useMemo(() => {
    const durationWidth = duration * pixelsPerSecond * zoom;
    return Math.max(width, durationWidth);
  }, [width, duration, pixelsPerSecond, zoom]);

  const beatWidth = useMemo(() => {
    return secondsPerBeat * pixelsPerSecond * zoom;
  }, [secondsPerBeat, pixelsPerSecond, zoom]);

  const barWidth = useMemo(() => {
    return secondsPerBar * pixelsPerSecond * zoom;
  }, [secondsPerBar, pixelsPerSecond, zoom]);

  const barsSpanned = useMemo(() => {
    return Math.ceil(duration / secondsPerBar);
  }, [duration, secondsPerBar]);

  useEffect(() => {
    if (waveformData && waveformData.length > 0) {
      setLocalWaveformData(waveformData);
      return;
    }

    if (audioBuffer) {
      const renderWidth = Math.max(Math.floor(calculatedWidth), 100);
      const channelData = audioBuffer.getChannelData(0);
      const samplesPerPixel = Math.floor(channelData.length / renderWidth);
      const peaks: number[] = [];

      for (let i = 0; i < renderWidth; i++) {
        const start = i * samplesPerPixel;
        const end = Math.min(start + samplesPerPixel, channelData.length);
        let max = 0;

        for (let j = start; j < end; j++) {
          const abs = Math.abs(channelData[j]);
          if (abs > max) max = abs;
        }

        peaks.push(max);
      }

      setLocalWaveformData(peaks);
    } else if (audioUrl) {
      const abortController = new AbortController();
      
      const loadAudioAndGenerateWaveform = async () => {
        try {
          const { generateWaveformPeaks, getSharedAudioContext } = await import('@/hooks/useAudioContext');
          
          const ctx = getSharedAudioContext();
          let audioContext: AudioContext;
          let shouldClose = false;
          
          if (ctx && ctx.state !== 'closed') {
            audioContext = ctx;
          } else {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            audioContext = new AudioContextClass();
            shouldClose = true;
          }
          
          const response = await fetch(audioUrl, { signal: abortController.signal });
          if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);
          
          const arrayBuffer = await response.arrayBuffer();
          if (abortController.signal.aborted) {
            if (shouldClose) audioContext.close();
            return;
          }
          
          const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const renderWidth = Math.max(Math.floor(calculatedWidth), Math.floor(width), 100);
          const peaks = generateWaveformPeaks(decodedBuffer, renderWidth);
          setLocalWaveformData(peaks);
          
          if (shouldClose) {
            audioContext.close();
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          console.warn('Failed to decode audio, using placeholder waveform:', error);
          const renderWidth = Math.max(Math.floor(calculatedWidth), Math.floor(width), 100);
          const peaks: number[] = [];
          for (let i = 0; i < renderWidth; i++) {
            peaks.push(0.3);
          }
          setLocalWaveformData(peaks);
        }
      };

      loadAudioAndGenerateWaveform();

      return () => {
        abortController.abort();
      };
    }
  }, [audioUrl, audioBuffer, waveformData, width, calculatedWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || localWaveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderWidth = calculatedWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = renderWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, renderWidth, height);

    if (showGridLines && barWidth > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      const numBars = Math.ceil(renderWidth / barWidth);
      for (let i = 0; i <= numBars; i++) {
        const x = i * barWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      const numBeats = Math.ceil(renderWidth / beatWidth);
      const bpb = beatsPerBar || 4;
      for (let i = 0; i <= numBeats; i++) {
        if (i % bpb !== 0) {
          const x = i * beatWidth;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
      }
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    if (consolidatedWaveform) {
      gradient.addColorStop(0, muted ? 'rgba(80, 80, 80, 0.95)' : `${color}dd`);
      gradient.addColorStop(0.3, muted ? 'rgba(90, 90, 90, 0.85)' : `${color}bb`);
      gradient.addColorStop(0.5, muted ? 'rgba(100, 100, 100, 0.75)' : `${color}99`);
      gradient.addColorStop(0.7, muted ? 'rgba(90, 90, 90, 0.85)' : `${color}bb`);
      gradient.addColorStop(1, muted ? 'rgba(80, 80, 80, 0.95)' : `${color}dd`);
    } else {
      gradient.addColorStop(0, muted ? 'rgba(100, 100, 100, 0.8)' : `${color}cc`);
      gradient.addColorStop(0.5, muted ? 'rgba(100, 100, 100, 0.6)' : `${color}99`);
      gradient.addColorStop(1, muted ? 'rgba(100, 100, 100, 0.8)' : `${color}cc`);
    }

    ctx.fillStyle = gradient;

    const centerY = height / 2;
    const maxAmplitude = consolidatedWaveform ? height * 0.48 : height * 0.45;

    ctx.beginPath();
    ctx.moveTo(0, centerY);

    const dataPointsNeeded = Math.max(localWaveformData.length, Math.floor(renderWidth));
    const resampledData = localWaveformData.length < dataPointsNeeded 
      ? resampleWaveform(localWaveformData, dataPointsNeeded)
      : localWaveformData;

    for (let i = 0; i < resampledData.length; i++) {
      const x = (i / resampledData.length) * renderWidth;
      let amplitude = resampledData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * renderWidth;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = renderWidth - (fadeOutTime / duration) * renderWidth;
        if (x > fadeOutStart) {
          amplitude *= (renderWidth - x) / (renderWidth - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY - amplitude);
    }

    for (let i = resampledData.length - 1; i >= 0; i--) {
      const x = (i / resampledData.length) * renderWidth;
      let amplitude = resampledData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * renderWidth;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = renderWidth - (fadeOutTime / duration) * renderWidth;
        if (x > fadeOutStart) {
          amplitude *= (renderWidth - x) / (renderWidth - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY + amplitude);
    }

    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = muted ? 'rgba(120, 120, 120, 0.9)' : color;
    ctx.lineWidth = consolidatedWaveform ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < resampledData.length; i++) {
      const x = (i / resampledData.length) * renderWidth;
      let amplitude = resampledData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * renderWidth;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = renderWidth - (fadeOutTime / duration) * renderWidth;
        if (x > fadeOutStart) {
          amplitude *= (renderWidth - x) / (renderWidth - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY - amplitude);
    }

    ctx.stroke();

  }, [localWaveformData, calculatedWidth, height, color, muted, showFades, fadeInTime, fadeOutTime, duration, showGridLines, barWidth, beatWidth, consolidatedWaveform]);

  const resampleWaveform = (data: number[], targetLength: number): number[] => {
    if (data.length === 0) return [];
    if (data.length >= targetLength) return data;
    
    const result: number[] = [];
    const ratio = data.length / targetLength;
    
    for (let i = 0; i < targetLength; i++) {
      const srcIndex = i * ratio;
      const lower = Math.floor(srcIndex);
      const upper = Math.min(lower + 1, data.length - 1);
      const fraction = srcIndex - lower;
      
      const interpolated = data[lower] * (1 - fraction) + data[upper] * fraction;
      result.push(interpolated);
    }
    
    return result;
  };

  const handleMouseDown = (e: React.MouseEvent, action: 'move' | 'resize-left' | 'resize-right') => {
    e.stopPropagation();
    
    if (action === 'move') {
      setIsDragging(true);
    } else if (action === 'resize-left') {
      setIsResizing('left');
    } else if (action === 'resize-right') {
      setIsResizing('right');
    }
  };

  return (
    <motion.div
      ref={containerRef}
      className="absolute rounded-md overflow-hidden cursor-pointer group"
      style={{
        left: startTime * pixelsPerSecond * zoom,
        width: calculatedWidth,
        height,
        background: muted
          ? 'linear-gradient(180deg, rgba(50,50,50,0.95) 0%, rgba(35,35,35,0.95) 100%)'
          : `linear-gradient(180deg, ${color}18 0%, ${color}08 100%)`,
        border: selected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.08)',
        boxShadow: selected ? `0 0 12px ${color}55, inset 0 0 20px ${color}11` : 'inset 0 1px 0 rgba(255,255,255,0.05)',
        borderRadius: '6px',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      whileHover={{ filter: 'brightness(1.05)' }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-5 flex items-center justify-between px-2 text-[10px] font-medium"
        style={{
          background: muted 
            ? 'linear-gradient(180deg, rgba(70,70,70,0.95) 0%, rgba(55,55,55,0.9) 100%)' 
            : `linear-gradient(180deg, ${color}88 0%, ${color}66 100%)`,
          color: muted ? '#aaa' : '#fff',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          borderTopLeftRadius: '5px',
          borderTopRightRadius: '5px',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      >
        <span className="truncate flex items-center gap-1">
          {muted && <span className="opacity-60">[M]</span>}
          {clipName}
        </span>
        <span className="text-[9px] opacity-70 ml-2 flex items-center gap-1">
          <span>{duration.toFixed(1)}s</span>
          <span className="opacity-50">|</span>
          <span>{barsSpanned} bar{barsSpanned !== 1 ? 's' : ''}</span>
        </span>
      </div>

      <canvas
        ref={canvasRef}
        className="absolute bottom-0 left-0"
        style={{ width: calculatedWidth, height: height - 20 }}
      />

      {selected && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
            onMouseDown={(e) => handleMouseDown(e, 'resize-left')}
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: `linear-gradient(-90deg, ${color}, transparent)` }}
            onMouseDown={(e) => handleMouseDown(e, 'resize-right')}
          />
        </>
      )}

      {showFades && fadeInTime > 0 && (
        <div
          className="absolute top-5 left-0 bottom-0 pointer-events-none"
          style={{
            width: (fadeInTime / duration) * width,
            background: 'linear-gradient(90deg, rgba(0,0,0,0.5), transparent)',
          }}
        />
      )}

      {showFades && fadeOutTime > 0 && (
        <div
          className="absolute top-5 right-0 bottom-0 pointer-events-none"
          style={{
            width: (fadeOutTime / duration) * width,
            background: 'linear-gradient(-90deg, rgba(0,0,0,0.5), transparent)',
          }}
        />
      )}
    </motion.div>
  );
}

interface MIDIClipProps {
  notes: { pitch: number; start: number; duration: number; velocity: number }[];
  clipDuration: number;
  startTime: number;
  width: number;
  height: number;
  color?: string;
  selected?: boolean;
  muted?: boolean;
  clipName?: string;
  zoom?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function MIDIClip({
  notes,
  clipDuration,
  startTime,
  width,
  height,
  color = '#60a5fa',
  selected = false,
  muted = false,
  clipName = 'MIDI Clip',
  zoom = 1,
  onClick,
  onDoubleClick,
}: MIDIClipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || notes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = (height - 20) * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height - 20);

    const minPitch = Math.min(...notes.map((n) => n.pitch));
    const maxPitch = Math.max(...notes.map((n) => n.pitch));
    const pitchRange = Math.max(maxPitch - minPitch, 12);

    const noteHeight = Math.max(2, (height - 24) / pitchRange);

    notes.forEach((note) => {
      const x = (note.start / clipDuration) * width;
      const noteWidth = Math.max(2, (note.duration / clipDuration) * width);
      const y = ((maxPitch - note.pitch) / pitchRange) * (height - 24) + 2;

      const noteColor = muted ? '#666' : color;
      const alpha = Math.round((note.velocity / 127) * 255)
        .toString(16)
        .padStart(2, '0');

      ctx.fillStyle = `${noteColor}${alpha}`;
      ctx.fillRect(x, y, noteWidth, noteHeight - 1);

      ctx.strokeStyle = noteColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, noteWidth, noteHeight - 1);
    });
  }, [notes, width, height, clipDuration, color, muted]);

  return (
    <motion.div
      className="absolute rounded overflow-hidden cursor-pointer group"
      style={{
        left: startTime * zoom * 50,
        width,
        height,
        background: muted
          ? 'linear-gradient(180deg, rgba(60,60,60,0.9) 0%, rgba(40,40,40,0.9) 100%)'
          : `linear-gradient(180deg, ${color}22 0%, ${color}11 100%)`,
        border: selected ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.1)',
        boxShadow: selected ? `0 0 10px ${color}44` : 'none',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      whileHover={{ filter: 'brightness(1.1)' }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-5 flex items-center px-2 text-[10px] font-medium truncate"
        style={{
          background: muted ? 'rgba(60,60,60,0.9)' : `${color}66`,
          color: muted ? '#999' : '#fff',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {muted && <span className="mr-1 opacity-50">[M]</span>}
        {clipName}
      </div>

      <canvas
        ref={canvasRef}
        className="absolute bottom-0 left-0"
        style={{ width, height: height - 20 }}
      />
    </motion.div>
  );
}
