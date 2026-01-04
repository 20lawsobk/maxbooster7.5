import { useEffect, useRef, useState, useMemo } from 'react';
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
}: WaveformClipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localWaveformData, setLocalWaveformData] = useState<number[]>([]);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (waveformData && waveformData.length > 0) {
      setLocalWaveformData(waveformData);
      return;
    }

    if (audioBuffer) {
      const channelData = audioBuffer.getChannelData(0);
      const samplesPerPixel = Math.floor(channelData.length / width);
      const peaks: number[] = [];

      for (let i = 0; i < width; i++) {
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
          const peaks = generateWaveformPeaks(decodedBuffer, Math.floor(width));
          setLocalWaveformData(peaks);
          
          if (shouldClose) {
            audioContext.close();
          }
        } catch (error) {
          if ((error as Error).name === 'AbortError') return;
          console.warn('Failed to decode audio, using placeholder waveform:', error);
          const points = Math.floor(width);
          const peaks: number[] = [];
          for (let i = 0; i < points; i++) {
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
  }, [audioUrl, audioBuffer, waveformData, width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || localWaveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, muted ? 'rgba(100, 100, 100, 0.8)' : `${color}cc`);
    gradient.addColorStop(0.5, muted ? 'rgba(100, 100, 100, 0.6)' : `${color}99`);
    gradient.addColorStop(1, muted ? 'rgba(100, 100, 100, 0.8)' : `${color}cc`);

    ctx.fillStyle = gradient;

    const centerY = height / 2;
    const maxAmplitude = height * 0.45;

    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < localWaveformData.length; i++) {
      const x = (i / localWaveformData.length) * width;
      let amplitude = localWaveformData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * width;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = width - (fadeOutTime / duration) * width;
        if (x > fadeOutStart) {
          amplitude *= (width - x) / (width - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY - amplitude);
    }

    for (let i = localWaveformData.length - 1; i >= 0; i--) {
      const x = (i / localWaveformData.length) * width;
      let amplitude = localWaveformData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * width;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = width - (fadeOutTime / duration) * width;
        if (x > fadeOutStart) {
          amplitude *= (width - x) / (width - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY + amplitude);
    }

    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = muted ? 'rgba(120, 120, 120, 0.8)' : color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);

    for (let i = 0; i < localWaveformData.length; i++) {
      const x = (i / localWaveformData.length) * width;
      let amplitude = localWaveformData[i] * maxAmplitude;

      if (showFades && fadeInTime > 0) {
        const fadeInWidth = (fadeInTime / duration) * width;
        if (x < fadeInWidth) {
          amplitude *= x / fadeInWidth;
        }
      }

      if (showFades && fadeOutTime > 0) {
        const fadeOutStart = width - (fadeOutTime / duration) * width;
        if (x > fadeOutStart) {
          amplitude *= (width - x) / (width - fadeOutStart);
        }
      }

      ctx.lineTo(x, centerY - amplitude);
    }

    ctx.stroke();

  }, [localWaveformData, width, height, color, muted, showFades, fadeInTime, fadeOutTime, duration]);

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
