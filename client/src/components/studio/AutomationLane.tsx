import { logger } from "@/lib/logger";
import { useCallback, useState, useRef, useEffect } from "react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Pen,
  Trash2,
  Circle,
  Plus,
  Minus,
  Loader2,
  MousePointer2,
  PenLine,
  Spline,
  Edit3,
  Minimize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudioStore, AutomationMode } from "@/lib/studioStore";
import { audioEngine } from "@/lib/audioEngine";
import { useToast } from "@/hooks/use-toast";

interface AutomationPoint {
  id: string;
  time: number;
  value: number;
  curve: "linear" | "bezier";
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
}

type DrawingTool = "pointer" | "pencil" | "line" | "curve";

interface AutomationLaneProps {
  trackId: string;
  parameter:
    | "volume"
    | "pan"
    | "effect-param"
    | "mute"
    | "send-1"
    | "send-2"
    | "eq-low"
    | "eq-mid"
    | "eq-high";
  duration: number;
  initialPoints?: AutomationPoint[];
  onPointsChange?: (points: AutomationPoint[]) => void;
  currentTime?: number;
}

const PARAMETER_CONFIG: Record<
  string,
  {
    label: string;
    min: number;
    max: number;
    defaultValue: number;
    unit: string;
    color: string;
  }
> = {
  volume: {
    label: "Volume",
    min: 0,
    max: 1,
    defaultValue: 0.8,
    unit: "dB",
    color: "#3b82f6",
  },
  pan: {
    label: "Pan",
    min: -1,
    max: 1,
    defaultValue: 0,
    unit: "",
    color: "#10b981",
  },
  "effect-param": {
    label: "Effect",
    min: 0,
    max: 1,
    defaultValue: 0.5,
    unit: "",
    color: "#8b5cf6",
  },
  mute: {
    label: "Mute",
    min: 0,
    max: 1,
    defaultValue: 0,
    unit: "",
    color: "#ef4444",
  },
  "send-1": {
    label: "Send 1",
    min: 0,
    max: 1,
    defaultValue: 0,
    unit: "",
    color: "#f59e0b",
  },
  "send-2": {
    label: "Send 2",
    min: 0,
    max: 1,
    defaultValue: 0,
    unit: "",
    color: "#06b6d4",
  },
  "eq-low": {
    label: "EQ Low",
    min: -12,
    max: 12,
    defaultValue: 0,
    unit: "dB",
    color: "#8b5cf6",
  },
  "eq-mid": {
    label: "EQ Mid",
    min: -12,
    max: 12,
    defaultValue: 0,
    unit: "dB",
    color: "#ec4899",
  },
  "eq-high": {
    label: "EQ High",
    min: -12,
    max: 12,
    defaultValue: 0,
    unit: "dB",
    color: "#14b8a6",
  },
};

const AUTOMATION_MODE_CONFIG: Record<
  AutomationMode,
  { label: string; color: string; bgColor: string }
> = {
  off: { label: "OFF", color: "#6b7280", bgColor: "rgba(107, 114, 128, 0.2)" },
  read: { label: "READ", color: "#22c55e", bgColor: "rgba(34, 197, 94, 0.2)" },
  write: {
    label: "WRITE",
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.2)",
  },
  touch: {
    label: "TOUCH",
    color: "#f97316",
    bgColor: "rgba(249, 115, 22, 0.2)",
  },
  latch: {
    label: "LATCH",
    color: "#a855f7",
    bgColor: "rgba(168, 85, 247, 0.2)",
  },
};

const DRAWING_TOOLS: {
  id: DrawingTool;
  icon: React.ElementType;
  label: string;
}[] = [
  { id: "pointer", icon: MousePointer2, label: "Select/Move" },
  { id: "pencil", icon: PenLine, label: "Freehand Draw" },
  { id: "line", icon: Edit3, label: "Draw Lines" },
  { id: "curve", icon: Spline, label: "Draw Curves" },
];

export function AutomationLane({
  trackId,
  parameter,
  duration,
  initialPoints = [],
  onPointsChange,
  currentTime = 0,
}: AutomationLaneProps) {
  const { toast } = useToast();
  const {
    zoom,
    snapEnabled,
    snapResolution,
    automationMode,
    setAutomationMode,
    isPlaying,
  } = useStudioStore();
  const [points, setPoints] = useState<AutomationPoint[]>(initialPoints);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [_isLoading, setIsLoading] = useState(true);
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pointer");
  const [isTouching, setIsTouching] = useState(false);
  const [pencilPoints, setPencilPoints] = useState<
    { time: number; value: number }[]
  >([]);
  const [lineStartPoint, setLineStartPoint] = useState<{
    time: number;
    value: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = PARAMETER_CONFIG[parameter] || PARAMETER_CONFIG.volume;

  useEffect(() => {
    let cancelled = false;
    const loadAutomation = async () => {
      try {
        const res = await fetch(
          `/api/studio/tracks/${trackId}/automation?parameter=${parameter}`,
          {
            credentials: "include",
          },
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.points && Array.isArray(data.points)) {
            setPoints(data.points);
          }
        }
      } catch (error) {
        logger.error("Failed to load automation:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadAutomation();
    return () => {
      cancelled = true;
    };
  }, [trackId, parameter]);

  const saveAutomation = useCallback(
    (pointsToSave: AutomationPoint[]) => {
      const snapshot = JSON.parse(JSON.stringify(pointsToSave));

      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(async () => {
        setIsSaving(true);
        try {
          const csrfToken = getCsrfTokenFromCookie();
          const res = await fetch(`/api/studio/tracks/${trackId}/automation`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ parameter, points: snapshot }),
          });
          if (!res.ok) throw new Error("Failed to save");
        } catch (error) {
          toast({ title: "Failed to save automation", variant: "destructive" });
        } finally {
          setIsSaving(false);
        }
      }, 500);
    },
    [trackId, parameter, toast],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const interpolateValue = useCallback(
    (time: number): number => {
      if (points.length === 0) return config.defaultValue;
      const sorted = [...points].sort((a, b) => a.time - b.time);
      if (time <= sorted[0].time) return sorted[0].value;
      if (time >= sorted[sorted.length - 1].time)
        return sorted[sorted.length - 1].value;

      for (let i = 0; i < sorted.length - 1; i++) {
        if (time >= sorted[i].time && time < sorted[i + 1].time) {
          const t =
            (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
          return sorted[i].value + t * (sorted[i + 1].value - sorted[i].value);
        }
      }
      return config.defaultValue;
    },
    [points, config.defaultValue],
  );

  useEffect(() => {
    if (points.length === 0) return;
    if (automationMode === "off") return;

    const value = interpolateValue(currentTime);

    if (parameter === "volume") {
      audioEngine.setTrackVolume(trackId, value);
    } else if (parameter === "pan") {
      audioEngine.setTrackPan(trackId, (value - 0.5) * 2);
    }
  }, [
    currentTime,
    trackId,
    parameter,
    points,
    interpolateValue,
    automationMode,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (points.length > 0) {
      const sortedPoints = [...points].sort((a, b) => a.time - b.time);

      ctx.strokeStyle = config.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      sortedPoints.forEach((point, index) => {
        const x = (point.time / duration) * canvas.width;
        const y = (1 - point.value) * canvas.height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevPoint = sortedPoints[index - 1];
          const prevX = (prevPoint.time / duration) * canvas.width;
          const prevY = (1 - prevPoint.value) * canvas.height;

          if (point.curve === "bezier") {
            const cpX = prevX + (x - prevX) * 0.5;
            const cpY = prevY;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
      });

      ctx.stroke();

      sortedPoints.forEach((point) => {
        const x = (point.time / duration) * canvas.width;
        const y = (1 - point.value) * canvas.height;

        ctx.fillStyle = point.id === selectedPointId ? "#fff" : config.color;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();

        if (point.id === selectedPointId) {
          ctx.strokeStyle = config.color;
          ctx.lineWidth = 2;
          ctx.stroke();

          if (point.curve === "bezier" && drawingTool === "curve") {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
            ctx.lineWidth = 1;

            const handleLength = 30;
            ctx.beginPath();
            ctx.moveTo(x - handleLength, y);
            ctx.lineTo(x + handleLength, y);
            ctx.stroke();

            ctx.fillStyle = "#fff";
            ctx.beginPath();
            ctx.arc(x - handleLength, y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x + handleLength, y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    }

    if (lineStartPoint && drawingTool === "line") {
      const startX = (lineStartPoint.time / duration) * canvas.width;
      const startY = (1 - lineStartPoint.value) * canvas.height;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(startX, startY, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    points,
    selectedPointId,
    duration,
    config.color,
    zoom,
    drawingTool,
    lineStartPoint,
  ]);

  const thinPoints = useCallback(() => {
    if (points.length < 3) return;

    const sortedPoints = [...points].sort((a, b) => a.time - b.time);
    const tolerance = 0.02;
    const thinnedPoints: AutomationPoint[] = [sortedPoints[0]];

    for (let i = 1; i < sortedPoints.length - 1; i++) {
      const prev = thinnedPoints[thinnedPoints.length - 1];
      const curr = sortedPoints[i];
      const next = sortedPoints[i + 1];

      const expectedValue =
        prev.value +
        ((next.value - prev.value) * (curr.time - prev.time)) /
          (next.time - prev.time);
      const deviation = Math.abs(curr.value - expectedValue);

      if (deviation > tolerance) {
        thinnedPoints.push(curr);
      }
    }

    thinnedPoints.push(sortedPoints[sortedPoints.length - 1]);

    if (thinnedPoints.length < points.length) {
      setPoints(thinnedPoints);
      onPointsChange?.(thinnedPoints);
      saveAutomation(thinnedPoints);
      toast({
        title: `Reduced ${points.length} points to ${thinnedPoints.length}`,
      });
    }
  }, [points, onPointsChange, saveAutomation, toast]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let time = (x / rect.width) * duration;
      const value = 1 - y / rect.height;

      if (snapEnabled) {
        time = Math.round(time / snapResolution) * snapResolution;
      }

      if (drawingTool === "line") {
        if (!lineStartPoint) {
          setLineStartPoint({ time, value });
        } else {
          const newPoint: AutomationPoint = {
            id: `point-${Date.now()}`,
            time: Math.max(0, Math.min(time, duration)),
            value: Math.max(0, Math.min(value, 1)),
            curve: "linear",
          };
          const newPoints = [...points, newPoint].sort(
            (a, b) => a.time - b.time,
          );
          setPoints(newPoints);
          onPointsChange?.(newPoints);
          saveAutomation(newPoints);
          setLineStartPoint({ time, value });
        }
        return;
      }

      if (isAdding || drawingTool === "pointer") {
        if (!isAdding) {
          const clickedPoint = points.find((point) => {
            const px = (point.time / duration) * rect.width;
            const py = (1 - point.value) * rect.height;
            const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
            return distance < 10;
          });

          if (clickedPoint) {
            setSelectedPointId(clickedPoint.id);
            return;
          }
        }

        const newPoint: AutomationPoint = {
          id: `point-${Date.now()}`,
          time: Math.max(0, Math.min(time, duration)),
          value: Math.max(0, Math.min(value, 1)),
          curve: drawingTool === "curve" ? "bezier" : "linear",
        };

        const newPoints = [...points, newPoint].sort((a, b) => a.time - b.time);
        setPoints(newPoints);
        setSelectedPointId(newPoint.id);
        onPointsChange?.(newPoints);
        saveAutomation(newPoints);
        setIsAdding(false);
      }
    },
    [
      isAdding,
      duration,
      snapEnabled,
      snapResolution,
      points,
      onPointsChange,
      saveAutomation,
      drawingTool,
      lineStartPoint,
    ],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (drawingTool === "pencil") {
        const time = (x / rect.width) * duration;
        const value = 1 - y / rect.height;
        setPencilPoints([{ time, value }]);
        setIsTouching(true);
        return;
      }

      if (drawingTool !== "pointer") return;

      const clickedPoint = points.find((point) => {
        const px = (point.time / duration) * rect.width;
        const py = (1 - point.value) * rect.height;
        const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        return distance < 10;
      });

      if (clickedPoint) {
        setSelectedPointId(clickedPoint.id);
        setIsDragging(true);
        setIsTouching(true);
      } else {
        setSelectedPointId(null);
      }
    },
    [points, duration, drawingTool],
  );

  const drag = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      let time = (x / rect.width) * duration;
      const value = 1 - y / rect.height;

      if (drawingTool === "pencil" && isTouching) {
        if (snapEnabled) {
          time = Math.round(time / snapResolution) * snapResolution;
        }
        setPencilPoints((prev) => [
          ...prev,
          { time, value: Math.max(0, Math.min(value, 1)) },
        ]);
        return;
      }

      if (!isDragging || !selectedPointId) return;

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
          : point,
      );

      setPoints(newPoints);
      onPointsChange?.(newPoints);
    },
    [
      isDragging,
      selectedPointId,
      duration,
      snapEnabled,
      snapResolution,
      points,
      onPointsChange,
      drawingTool,
      isTouching,
    ],
  );

  const endDrag = useCallback(() => {
    if (drawingTool === "pencil" && pencilPoints.length > 1) {
      const newPoints: AutomationPoint[] = pencilPoints.map((p, i) => ({
        id: `point-${Date.now()}-${i}`,
        time: Math.max(0, Math.min(p.time, duration)),
        value: p.value,
        curve: "linear" as const,
      }));

      const mergedPoints = [...points, ...newPoints].sort(
        (a, b) => a.time - b.time,
      );
      setPoints(mergedPoints);
      onPointsChange?.(mergedPoints);
      saveAutomation(mergedPoints);
      setPencilPoints([]);
    }

    if (isDragging) {
      saveAutomation(points);
    }
    setIsDragging(false);
    setIsTouching(false);
  }, [
    isDragging,
    points,
    saveAutomation,
    drawingTool,
    pencilPoints,
    duration,
    onPointsChange,
  ]);

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
        ? {
            ...point,
            curve:
              point.curve === "linear"
                ? ("bezier" as const)
                : ("linear" as const),
          }
        : point,
    );

    setPoints(newPoints);
    onPointsChange?.(newPoints);
    saveAutomation(newPoints);
  }, [selectedPointId, points, onPointsChange, saveAutomation]);

  const getValueLabel = (normalizedValue: number) => {
    const { min, max, unit } = config;
    const value = min + normalizedValue * (max - min);

    if (parameter === "volume") {
      const db = 20 * Math.log10(value || 0.001);
      return `${db.toFixed(1)} dB`;
    } else if (parameter === "pan") {
      if (value === 0) return "C";
      return value > 0
        ? `${(value * 100).toFixed(0)}% R`
        : `${(-value * 100).toFixed(0)}% L`;
    } else if (
      parameter === "eq-low" ||
      parameter === "eq-mid" ||
      parameter === "eq-high"
    ) {
      return `${value > 0 ? "+" : ""}${value.toFixed(1)} dB`;
    }
    return `${value.toFixed(2)}${unit}`;
  };

  const selectedPoint = points.find((p) => p.id === selectedPointId);
  const isWriting = automationMode === "write" && isPlaying;
  const isTouchRecording =
    automationMode === "touch" && isTouching && isPlaying;

  const getCursor = () => {
    if (isAdding) return "crosshair";
    if (isDragging) return "grabbing";
    if (drawingTool === "pencil") return "crosshair";
    if (drawingTool === "line") return "crosshair";
    if (drawingTool === "curve") return "crosshair";
    return "pointer";
  };

  return (
    <div
      ref={containerRef}
      className="h-32 border-t"
      style={{
        borderColor: "var(--studio-border)",
        background: "var(--studio-bg-deep)",
      }}
    >
      <div
        className="h-8 flex items-center justify-between px-2 border-b gap-2"
        style={{
          borderColor: "var(--studio-border)",
          background: "var(--studio-bg-medium)",
        }}
      >
        <div className="flex items-center gap-2">
          <Circle
            className="h-2 w-2 flex-shrink-0"
            style={{ fill: config.color, color: config.color }}
          />
          <span
            className="text-[10px] font-semibold"
            style={{ color: "var(--studio-text)" }}
          >
            {config.label}
          </span>

          {(isWriting || isTouchRecording) && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold animate-pulse"
              style={{
                background: isWriting
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(249, 115, 22, 0.3)",
                color: isWriting ? "#ef4444" : "#f97316",
              }}
            >
              <Circle
                className="h-1.5 w-1.5"
                style={{ fill: "currentColor" }}
              />
              {isWriting ? "REC" : "TOUCH"}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div
            className="flex items-center rounded overflow-hidden"
            style={{
              background: "var(--studio-bg-deep)",
              border: "1px solid var(--studio-border)",
            }}
          >
            {(Object.keys(AUTOMATION_MODE_CONFIG) as AutomationMode[]).map(
              (mode) => {
                const mConfig = AUTOMATION_MODE_CONFIG[mode];
                const isActive = automationMode === mode;
                return (
                  <button
                    key={mode}
                    className="px-1.5 py-0.5 text-[8px] font-bold transition-colors"
                    style={{
                      background: isActive ? mConfig.bgColor : "transparent",
                      color: isActive
                        ? mConfig.color
                        : "var(--studio-text-muted)",
                    }}
                    onClick={() => setAutomationMode(mode)}
                    title={`${mConfig.label} mode`}
                  >
                    {mConfig.label}
                  </button>
                );
              },
            )}
          </div>

          <div
            className="w-px h-4 mx-1"
            style={{ background: "var(--studio-border)" }}
          />

          <div
            className="flex items-center rounded overflow-hidden"
            style={{
              background: "var(--studio-bg-deep)",
              border: "1px solid var(--studio-border)",
            }}
          >
            {DRAWING_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const isActive = drawingTool === tool.id;
              return (
                <button
                  key={tool.id}
                  className="p-1 transition-colors"
                  style={{
                    background: isActive
                      ? "rgba(59, 130, 246, 0.2)"
                      : "transparent",
                    color: isActive ? "#3b82f6" : "var(--studio-text-muted)",
                  }}
                  onClick={() => {
                    setDrawingTool(tool.id);
                    setLineStartPoint(null);
                  }}
                  title={tool.label}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>

          <div
            className="w-px h-4 mx-1"
            style={{ background: "var(--studio-border)" }}
          />

          {selectedPoint && (
            <>
              <span
                className="text-[10px]"
                style={{ color: "var(--studio-text-muted)" }}
              >
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
                <Trash2 className="h-3 w-3" style={{ color: "#ef4444" }} />
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={thinPoints}
            title="Simplify envelope (reduce points)"
            disabled={points.length < 3}
          >
            <Minimize2 className="h-3 w-3" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={`h-5 w-5 p-0 ${isAdding ? "bg-blue-500/20" : ""}`}
            onClick={() => setIsAdding(!isAdding)}
            title={isAdding ? "Cancel adding point" : "Add automation point"}
          >
            {isAdding ? (
              <Minus className="h-3 w-3" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </Button>

          {isSaving && (
            <Loader2
              className="h-3 w-3 animate-spin"
              style={{ color: "var(--studio-text-muted)" }}
            />
          )}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-[calc(100%-32px)]"
        style={{ cursor: getCursor() }}
        onClick={handleCanvasClick}
        onMouseDown={startDrag}
        onMouseMove={drag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      />
    </div>
  );
}
