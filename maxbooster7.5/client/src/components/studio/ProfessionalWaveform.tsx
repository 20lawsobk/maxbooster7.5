import { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfessionalWaveformProps {
  audioData?: Float32Array | number[];
  width: number;
  height: number;
  zoom?: number;
  offset?: number;
  duration?: number;
  currentTime?: number;
  showFrequencyColors?: boolean;
  showTransients?: boolean;
  showGrid?: boolean;
  primaryColor?: string;
  backgroundColor?: string;
  className?: string;
}

interface TransientMarker {
  position: number;
  strength: number;
}

/**
 * TODO: Add function documentation
 */
export function ProfessionalWaveform({
  audioData,
  width,
  height,
  zoom = 1,
  offset = 0,
  duration = 0,
  currentTime = 0,
  showFrequencyColors = true,
  showTransients = true,
  showGrid = true,
  primaryColor = '#00ff00',
  backgroundColor = 'var(--studio-bg-deep)',
  className = '',
}: ProfessionalWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [internalZoom, setInternalZoom] = useState(zoom);
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);

  // Process audio data for visualization
  const processedData = useMemo(() => {
    if (!audioData || audioData.length === 0) {
      // Generate demo waveform data if no audio data provided
      return Array.from({ length: 1000 }, (_, i) => {
        const t = i / 1000;
        return (
          Math.sin(t * Math.PI * 4) *
          Math.sin(t * Math.PI * 10) *
          Math.exp(-t * 2) *
          (0.5 + Math.random() * 0.5)
        );
      });
    }

    // Convert to array if Float32Array
    const dataArray = Array.from(audioData);

    // Apply zoom and offset
    const startIdx = Math.floor(offset * dataArray.length);
    const endIdx = Math.min(
      startIdx + Math.floor(dataArray.length / internalZoom),
      dataArray.length
    );

    return dataArray.slice(startIdx, endIdx);
  }, [audioData, internalZoom, offset]);

  // Detect transients (beat markers)
  const transients = useMemo((): TransientMarker[] => {
    if (!showTransients || !processedData) return [];

    const markers: TransientMarker[] = [];
    const threshold = 0.7;
    let previousValue = 0;

    for (let i = 1; i < processedData.length; i++) {
      const current = Math.abs(processedData[i]);
      const previous = Math.abs(previousValue);
      const delta = current - previous;

      if (delta > threshold && current > 0.5) {
        markers.push({
          position: i / processedData.length,
          strength: current,
        });
      }

      previousValue = processedData[i];
    }

    return markers;
  }, [processedData, showTransients]);

  // Get frequency-based color
  const getFrequencyColor = (value: number, index: number, total: number) => {
    if (!showFrequencyColors) return primaryColor;

    // Simulate frequency analysis based on position in waveform
    const position = index / total;
    const intensity = Math.abs(value);

    // Color based on frequency range
    if (position < 0.3) {
      // Bass (blue)
      return `hsla(220, 70%, ${40 + intensity * 30}%, ${0.8 + intensity * 0.2})`;
    } else if (position < 0.7) {
      // Mids (green)
      return `hsla(120, 60%, ${40 + intensity * 30}%, ${0.8 + intensity * 0.2})`;
    } else {
      // Highs (yellow)
      return `hsla(50, 80%, ${50 + intensity * 30}%, ${0.8 + intensity * 0.2})`;
    }
  };

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processedData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution for high DPI displays
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas with background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;

      // Vertical grid lines (time markers)
      for (let i = 0; i <= 10; i++) {
        const x = (width / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal grid lines (amplitude)
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    // Draw waveform
    const barWidth = Math.max(1, width / processedData.length);
    const centerY = height / 2;

    // Create gradient for overall waveform
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(0, 255, 100, 0.9)');
    gradient.addColorStop(0.5, 'rgba(0, 255, 0, 0.7)');
    gradient.addColorStop(1, 'rgba(0, 255, 100, 0.9)');

    // Draw waveform bars
    processedData.forEach((value, i) => {
      const x = i * barWidth;
      const amplitude = Math.abs(value);
      const barHeight = amplitude * (height * 0.9);

      // Apply frequency-based coloring
      if (showFrequencyColors) {
        ctx.fillStyle = getFrequencyColor(value, i, processedData.length);
      } else {
        ctx.fillStyle = gradient;
      }

      // Draw mirrored bars for stereo effect
      ctx.fillRect(x, centerY - barHeight / 2, Math.max(barWidth - 0.5, 0.5), barHeight);

      // Add subtle glow for peaks
      if (amplitude > 0.8) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle.toString();
        ctx.fillRect(x, centerY - barHeight / 2, Math.max(barWidth - 0.5, 0.5), barHeight);
        ctx.shadowBlur = 0;
      }
    });

    // Draw transient markers
    if (showTransients && transients.length > 0) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
      ctx.lineWidth = 1;

      transients.forEach((marker) => {
        const x = marker.position * width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        // Draw transient strength indicator
        ctx.fillStyle = `rgba(255, 100, 0, ${marker.strength * 0.8})`;
        ctx.beginPath();
        ctx.arc(x, height - 10, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Draw playhead
    if (currentTime > 0 && duration > 0) {
      const playheadX = (currentTime / duration) * width;

      // Playhead line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();

      // Playhead glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#fff';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, height);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Draw hover indicator
    if (hoveredTime !== null) {
      const hoverX = hoveredTime * width;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [
    processedData,
    width,
    height,
    currentTime,
    duration,
    showFrequencyColors,
    showTransients,
    transients,
    showGrid,
    primaryColor,
    backgroundColor,
    hoveredTime,
  ]);

  // Handle mouse hover
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    setHoveredTime(x / width);
  };

  const handleMouseLeave = () => {
    setHoveredTime(null);
  };

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="cursor-pointer"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ width, height }}
      />

      {/* Zoom Controls */}
      <div className="absolute top-2 right-2 flex gap-1">
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 bg-black/50 hover:bg-black/70"
            onClick={() => setInternalZoom(Math.min(internalZoom * 1.5, 10))}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 bg-black/50 hover:bg-black/70"
            onClick={() => setInternalZoom(Math.max(internalZoom / 1.5, 1))}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
        </motion.div>
      </div>

      {/* Transient Detection Indicator */}
      {showTransients && transients.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/50 rounded text-xs"
        >
          <Activity className="h-3 w-3 text-orange-400" />
          <span className="text-orange-400">{transients.length} beats</span>
        </motion.div>
      )}

      {/* Zoom Level Indicator */}
      <AnimatePresence>
        {internalZoom > 1 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute bottom-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white"
          >
            {internalZoom.toFixed(1)}x
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
