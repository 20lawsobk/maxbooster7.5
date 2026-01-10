import { useCallback, useState, useRef, useEffect } from 'react';
import { Pen, Trash2, Circle, Plus, Minus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStudioStore } from '@/lib/studioStore';
import { audioEngine } from '@/lib/audioEngine';
import { useToast } from '@/hooks/use-toast';

interface AutomationPoint {
  id: string;
  time: number;
  value: number; // 0-1 normalized
  curve: 'linear' | 'bezier';
}

interface AutomationLaneProps {
  trackId: string;
  parameter: 'volume' | 'pan' | 'effect-param';
  duration: number;
  initialPoints?: AutomationPoint[];
  onPointsChange?: (points: AutomationPoint[]) => void;
  currentTime?: number;
}

const PARAMETER_CONFIG = {
  volume: { label: 'Volume', min: 0, max: 1, defaultValue: 0.8, unit: 'dB', color: '#3b82f6' },
  pan: { label: 'Pan', min: -1, max: 1, defaultValue: 0, unit: '', color: '#10b981' },
  'effect-param': {
    label: 'Effect',
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: '',
    color: '#8b5cf6',
  },
};

export function AutomationLane({
  trackId,
  parameter,
  duration,
  initialPoints = [],
  onPointsChange,
  currentTime = 0,
}: AutomationLaneProps) {
  const { toast } = useToast();
  const { zoom, snapEnabled, snapResolution } = useStudioStore();
  const [points, setPoints] = useState<AutomationPoint[]>(initialPoints);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = PARAMETER_CONFIG[parameter];

  useEffect(() => {
    let cancelled = false;
    const loadAutomation = async () => {
      try {
        const res = await fetch(`/api/studio/tracks/${trackId}/automation?parameter=${parameter}`, {
          credentials: 'include',
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.points && Array.isArray(data.points)) {
            setPoints(data.points);
          }
        }
      } catch (error) {
        console.error('Failed to load automation:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadAutomation();
    return () => { cancelled = true; };
  }, [trackId, parameter]);

  const saveAutomation = useCallback((pointsToSave: AutomationPoint[]) => {
    const snapshot = JSON.parse(JSON.stringify(pointsToSave));
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const res = await fetch(`/api/studio/tracks/${trackId}/automation`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ parameter, points: snapshot }),
        });
        if (!res.ok) throw new Error('Failed to save');
      } catch (error) {
        toast({ title: 'Failed to save automation', variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
    }, 500);
  }, [trackId, parameter, toast]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const interpolateValue = useCallback((time: number): number => {
    if (points.length === 0) return config.defaultValue;
    const sorted = [...points].sort((a, b) => a.time - b.time);
    if (time <= sorted[0].time) return sorted[0].value;
    if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
    
    for (let i = 0; i < sorted.length - 1; i++) {
      if (time >= sorted[i].time && time < sorted[i + 1].time) {
        const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
        return sorted[i].value + t * (sorted[i + 1].value - sorted[i].value);
      }
    }
    return config.defaultValue;
  }, [points, config.defaultValue]);

  useEffect(() => {
    if (points.length === 0) return;
    const value = interpolateValue(currentTime);
    
    if (parameter === 'volume') {
      audioEngine.setTrackVolume(trackId, value);
    } else if (parameter === 'pan') {
      audioEngine.setTrackPan(trackId, (value - 0.5) * 2);
    }
  }, [currentTime, trackId, parameter, points, interpolateValue]);

  // Draw automation curve on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw automation curve
    if (points.length > 0) {
      const sortedPoints = [...points].sort((a, b) => a.time - b.time);

      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      sortedPoints.forEach((point, index) => {
        const x = (point.time / duration) * canvas.width;
        const y = (1 - point.value) * canvas.height; // Invert Y axis

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevPoint = sortedPoints[index - 1];
          const prevX = (prevPoint.time / duration) * canvas.width;
          const prevY = (1 - prevPoint.value) * canvas.height;

          if (point.curve === 'bezier') {
            // Simple bezier curve
            const cpX = prevX + (x - prevX) * 0.5;
            const cpY = prevY;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.stroke();

      // Draw points
      sortedPoints.forEach((point) => {
        const x = (point.time / duration) * canvas.width;
        const y = (1 - point.value) * canvas.height;

        ctx.fillStyle = point.id === selectedPointId ? '#fff' : config.color;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        if (point.id === selectedPointId) {
          ctx.strokeStyle = config.color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
    }
  }, [points, selectedPointId, duration, config.color, zoom]);

  const addPoint = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isAdding || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let time = (x / rect.width) * duration;
      const value = 1 - y / rect.height;

      // Apply snap
      if (snapEnabled) {
        time = Math.round(time / snapResolution) * snapResolution;
      }

      const newPoint: AutomationPoint = {
        id: `point-${Date.now()}`,
        time: Math.max(0, Math.min(time, duration)),
        value: Math.max(0, Math.min(value, 1)),
        curve: 'linear',
      };

      const newPoints = [...points, newPoint].sort((a, b) => a.time - b.time);
      setPoints(newPoints);
      setSelectedPointId(newPoint.id);
      onPointsChange?.(newPoints);
      saveAutomation(newPoints);
      setIsAdding(false);
    },
    [isAdding, duration, snapEnabled, snapResolution, points, onPointsChange, saveAutomation]
  );

  const startDrag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isAdding || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Find clicked point
      const clickedPoint = points.find((point) => {
        const px = (point.time / duration) * rect.width;
        const py = (1 - point.value) * rect.height;
        const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        return distance < 10;
      });

      if (clickedPoint) {
        setSelectedPointId(clickedPoint.id);
        setIsDragging(true);
      } else {
        setSelectedPointId(null);
      }
    },
    [isAdding, points, duration]
  );

  const drag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || !selectedPointId || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let time = (x / rect.width) * duration;
      const value = 1 - y / rect.height;

      // Apply snap
      if (snapEnabled) {
        time = Math.round(time / snapResolution) * snapResolution;
      }

      const newPoints = points.map((point) =>
        point.id === selectedPointId
          ? {
              ...point,
              time: Math.max(0, Math.min(time, duration)),
              value: Math.max(0, Math.min(value, 1)),
            }
          : point
      );

      setPoints(newPoints);
      onPointsChange?.(newPoints);
    },
    [isDragging, selectedPointId, duration, snapEnabled, snapResolution, points, onPointsChange]
  );

  const endDrag = useCallback(() => {
    if (isDragging) {
      saveAutomation(points);
    }
    setIsDragging(false);
  }, [isDragging, points, saveAutomation]);

  const deletePoint = useCallback(() => {
    if (!selectedPointId) return;

    const newPoints = points.filter((p) => p.id !== selectedPointId);
    setPoints(newPoints);
    setSelectedPointId(null);
    onPointsChange?.(newPoints);
    saveAutomation(newPoints);
  }, [selectedPointId, points, onPointsChange, saveAutomation]);

  const toggleCurve = useCallback(() => {
    if (!selectedPointId) return;

    const newPoints = points.map((point) =>
      point.id === selectedPointId
        ? { ...point, curve: point.curve === 'linear' ? ('bezier' as const) : ('linear' as const) }
        : point
    );

    setPoints(newPoints);
    onPointsChange?.(newPoints);
    saveAutomation(newPoints);
  }, [selectedPointId, points, onPointsChange, saveAutomation]);

  const getValueLabel = (normalizedValue: number) => {
    const { min, max, unit } = config;
    const value = min + normalizedValue * (max - min);

    if (parameter === 'volume') {
      const db = 20 * Math.log10(value || 0.001);
      return `${db.toFixed(1)} dB`;
    } else if (parameter === 'pan') {
      if (value === 0) return 'C';
      return value > 0 ? `${(value * 100).toFixed(0)}% R` : `${(-value * 100).toFixed(0)}% L`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  const selectedPoint = points.find((p) => p.id === selectedPointId);

  return (
    <div
      ref={containerRef}
      className="h-24 border-t"
      style={{
        borderColor: 'var(--studio-border)',
        background: 'var(--studio-bg-deep)',
      }}
    >
      {/* Automation Lane Header */}
      <div
        className="h-6 flex items-center justify-between px-2 border-b"
        style={{
          borderColor: 'var(--studio-border)',
          background: 'var(--studio-bg-medium)',
        }}
      >
        <div className="flex items-center gap-2">
          <Circle className="h-2 w-2" style={{ fill: config.color, color: config.color }} />
          <span className="text-[10px] font-semibold" style={{ color: 'var(--studio-text)' }}>
            {config.label}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {selectedPoint && (
            <>
              <span className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                {getValueLabel(selectedPoint.value)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={toggleCurve}
                title="Toggle curve type"
              >
                <Pen className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={deletePoint}
                title="Delete point"
              >
                <Trash2 className="h-3 w-3" style={{ color: '#ef4444' }} />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${isAdding ? 'bg-blue-500/20' : ''}`}
            onClick={() => setIsAdding(!isAdding)}
            title={isAdding ? 'Cancel adding point' : 'Add automation point'}
          >
            {isAdding ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Automation Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-[calc(100%-24px)] ${
          isAdding ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-pointer'
        }`}
        onClick={isAdding ? addPoint : undefined}
        onMouseDown={startDrag}
        onMouseMove={drag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      />
    </div>
  );
}
