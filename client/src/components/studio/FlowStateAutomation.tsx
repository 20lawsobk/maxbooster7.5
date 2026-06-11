import { useState, useRef, useEffect, useCallback } from "react";
import {
  MousePointer2,
  PenLine,
  Spline,
  Edit3,
  Trash2,
  Undo2,
  Redo2,
  Eye,
  EyeOff,
  ChevronDown,
  Lock,
  Unlock,
  Magnet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AutomationPoint {
  id: string;
  time: number;
  value: number;
  curve: "linear" | "bezier" | "step";
}

interface AutomationLane {
  id: string;
  trackId: string;
  parameter: string;
  label: string;
  color: string;
  points: AutomationPoint[];
  visible: boolean;
  locked: boolean;
  min: number;
  max: number;
  defaultValue: number;
  unit: string;
}

interface FlowStateAutomationProps {
  lanes: AutomationLane[];
  onLanesChange: (lanes: AutomationLane[]) => void;
  duration: number;
  currentTime?: number;
  zoom?: number;
  snapEnabled?: boolean;
  snapValue?: number;
  isPlaying?: boolean;
}

type DrawingTool = "pointer" | "pencil" | "line" | "curve";

const AUTOMATION_MODES = [
  { id: "off", label: "OFF", color: "#6b7280" },
  { id: "read", label: "READ", color: "#22c55e" },
  { id: "write", label: "WRITE", color: "#ef4444" },
  { id: "touch", label: "TOUCH", color: "#f97316" },
  { id: "latch", label: "LATCH", color: "#a855f7" },
];

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

const LANE_HEIGHT = 80;

export function FlowStateAutomation({
  lanes,
  onLanesChange,
  duration,
  currentTime = 0,
  zoom = 100,
  snapEnabled = true,
  snapValue = 0.25,
  isPlaying = false,
}: FlowStateAutomationProps) {
  const { toast } = useToast();
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(
    lanes[0]?.id || null,
  );
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [automationMode, setAutomationMode] = useState("read");
  const [drawingTool, setDrawingTool] = useState<DrawingTool>("pointer");
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [pencilPoints, setPencilPoints] = useState<
    { time: number; value: number }[]
  >([]);
  const [undoStack, setUndoStack] = useState<AutomationLane[][]>([]);
  const [redoStack, setRedoStack] = useState<AutomationLane[][]>([]);

  useEffect(() => {
    if (lanes[0]?.id && !selectedLaneId) {
      setSelectedLaneId(lanes[0].id);
    }
  }, [lanes, selectedLaneId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const beatsPerPixel = 0.05 / (zoom / 100);
  const canvasWidth = Math.max(1600, duration / beatsPerPixel);

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev.slice(-30),
      JSON.parse(JSON.stringify(lanes)),
    ]);
    setRedoStack([]);
  }, [lanes]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, JSON.parse(JSON.stringify(lanes))]);
    setUndoStack((u) => u.slice(0, -1));
    onLanesChange(prev);
  }, [undoStack, lanes, onLanesChange]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, JSON.parse(JSON.stringify(lanes))]);
    setRedoStack((r) => r.slice(0, -1));
    onLanesChange(next);
  }, [redoStack, lanes, onLanesChange]);

  const snapToGrid = (time: number): number => {
    if (!snapEnabled || snapValue === 0) return time;
    return Math.round(time / snapValue) * snapValue;
  };

  const interpolateValue = useCallback(
    (lane: AutomationLane, time: number): number => {
      if (lane.points.length === 0) return lane.defaultValue;
      const sorted = [...lane.points].sort((a, b) => a.time - b.time);
      if (time <= sorted[0].time) return sorted[0].value;
      if (time >= sorted[sorted.length - 1].time)
        return sorted[sorted.length - 1].value;

      for (let i = 0; i < sorted.length - 1; i++) {
        if (time >= sorted[i].time && time < sorted[i + 1].time) {
          const t =
            (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time);
          if (sorted[i + 1].curve === "step") {
            return sorted[i].value;
          }
          return sorted[i].value + t * (sorted[i + 1].value - sorted[i].value);
        }
      }
      return lane.defaultValue;
    },
    [],
  );

  const addPoint = useCallback(
    (laneId: string, time: number, value: number) => {
      pushUndo();
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId || lane.locked) return lane;
        const newPoint: AutomationPoint = {
          id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          time: snapToGrid(time),
          value: Math.max(0, Math.min(1, value)),
          curve: drawingTool === "curve" ? "bezier" : "linear",
        };
        return {
          ...lane,
          points: [...lane.points, newPoint].sort((a, b) => a.time - b.time),
        };
      });
      onLanesChange(newLanes);
    },
    [lanes, pushUndo, snapToGrid, drawingTool, onLanesChange],
  );

  const updatePoint = useCallback(
    (laneId: string, pointId: string, updates: Partial<AutomationPoint>) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          points: lane.points.map((p) =>
            p.id === pointId ? { ...p, ...updates } : p,
          ),
        };
      });
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const deletePoint = useCallback(
    (laneId: string, pointId: string) => {
      pushUndo();
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          points: lane.points.filter((p) => p.id !== pointId),
        };
      });
      onLanesChange(newLanes);
      setSelectedPointId(null);
    },
    [lanes, pushUndo, onLanesChange],
  );

  const toggleLaneVisibility = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, visible: !lane.visible } : lane,
      );
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const toggleLaneLock = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, locked: !lane.locked } : lane,
      );
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const clearLane = useCallback(
    (laneId: string) => {
      pushUndo();
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, points: [] } : lane,
      );
      onLanesChange(newLanes);
      toast({ title: "Automation cleared" });
    },
    [lanes, pushUndo, onLanesChange, toast],
  );

  const handleCanvasMouseDown = useCallback(
    (laneId: string, e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRefs.current.get(laneId);
      if (!canvas) return;

      const lane = lanes.find((l) => l.id === laneId);
      if (!lane || lane.locked) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = x * beatsPerPixel;
      const value = 1 - y / LANE_HEIGHT;

      if (drawingTool === "pencil") {
        setIsDrawing(true);
        setPencilPoints([{ time, value }]);
      } else if (drawingTool === "pointer") {
        const clickedPoint = lane.points.find((point) => {
          const px = point.time / beatsPerPixel;
          const py = (1 - point.value) * LANE_HEIGHT;
          const distance = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
          return distance < 10;
        });

        if (clickedPoint) {
          setSelectedPointId(clickedPoint.id);
          setSelectedLaneId(laneId);
          setIsDragging(true);
        } else {
          addPoint(laneId, time, value);
        }
      } else if (drawingTool === "line" || drawingTool === "curve") {
        addPoint(laneId, time, value);
      }
    },
    [lanes, beatsPerPixel, drawingTool, addPoint],
  );

  const handleCanvasMouseMove = useCallback(
    (laneId: string, e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRefs.current.get(laneId);
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = x * beatsPerPixel;
      const value = Math.max(0, Math.min(1, 1 - y / LANE_HEIGHT));

      if (isDrawing && drawingTool === "pencil") {
        setPencilPoints((prev) => [...prev, { time, value }]);
      } else if (isDragging && selectedPointId && selectedLaneId === laneId) {
        updatePoint(laneId, selectedPointId, {
          time: snapToGrid(Math.max(0, time)),
          value,
        });
      }
    },
    [
      beatsPerPixel,
      isDrawing,
      isDragging,
      selectedPointId,
      selectedLaneId,
      drawingTool,
      updatePoint,
      snapToGrid,
    ],
  );

  const handleCanvasMouseUp = useCallback(
    (laneId: string) => {
      if (isDrawing && pencilPoints.length > 1) {
        pushUndo();
        const newPoints: AutomationPoint[] = pencilPoints.map((p, i) => ({
          id: `point-${Date.now()}-${i}`,
          time: snapToGrid(Math.max(0, p.time)),
          value: p.value,
          curve: "linear" as const,
        }));

        const lane = lanes.find((l) => l.id === laneId);
        if (lane) {
          const newLanes = lanes.map((l) => {
            if (l.id !== laneId) return l;
            return {
              ...l,
              points: [...l.points, ...newPoints].sort(
                (a, b) => a.time - b.time,
              ),
            };
          });
          onLanesChange(newLanes);
        }
      }

      setIsDrawing(false);
      setIsDragging(false);
      setPencilPoints([]);
    },
    [isDrawing, pencilPoints, lanes, pushUndo, snapToGrid, onLanesChange],
  );

  useEffect(() => {
    lanes.forEach((lane) => {
      const canvas = canvasRefs.current.get(lane.id);
      if (!canvas || !lane.visible) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = canvasWidth;
      canvas.height = LANE_HEIGHT;

      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 10; i++) {
        const y = (i / 10) * LANE_HEIGHT;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, LANE_HEIGHT / 2);
      ctx.lineTo(canvas.width, LANE_HEIGHT / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (lane.points.length > 0) {
        const sortedPoints = [...lane.points].sort((a, b) => a.time - b.time);

        ctx.beginPath();
        ctx.strokeStyle = lane.color;
        ctx.lineWidth = 2;

        sortedPoints.forEach((point, index) => {
          const x = point.time / beatsPerPixel;
          const y = (1 - point.value) * LANE_HEIGHT;

          if (index === 0) {
            ctx.moveTo(0, y);
            ctx.lineTo(x, y);
          } else {
            const prevPoint = sortedPoints[index - 1];
            const prevX = prevPoint.time / beatsPerPixel;
            const prevY = (1 - prevPoint.value) * LANE_HEIGHT;

            if (point.curve === "step") {
              ctx.lineTo(x, prevY);
              ctx.lineTo(x, y);
            } else if (point.curve === "bezier") {
              const cpX = prevX + (x - prevX) * 0.5;
              ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
        });

        const lastPoint = sortedPoints[sortedPoints.length - 1];
        ctx.lineTo(canvas.width, (1 - lastPoint.value) * LANE_HEIGHT);
        ctx.stroke();

        sortedPoints.forEach((point) => {
          const x = point.time / beatsPerPixel;
          const y = (1 - point.value) * LANE_HEIGHT;
          const isSelected = point.id === selectedPointId;

          ctx.beginPath();
          ctx.fillStyle = isSelected ? "#ffffff" : lane.color;
          ctx.arc(x, y, isSelected ? 6 : 4, 0, Math.PI * 2);
          ctx.fill();

          if (isSelected) {
            ctx.strokeStyle = lane.color;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
      }

      if (isDrawing && pencilPoints.length > 1 && selectedLaneId === lane.id) {
        ctx.beginPath();
        ctx.strokeStyle = `${lane.color}88`;
        ctx.lineWidth = 2;
        pencilPoints.forEach((point, i) => {
          const x = point.time / beatsPerPixel;
          const y = (1 - point.value) * LANE_HEIGHT;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      if (currentTime > 0) {
        const x = currentTime / beatsPerPixel;
        if (x >= 0 && x <= canvas.width) {
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, LANE_HEIGHT);
          ctx.stroke();

          const currentValue = interpolateValue(lane, currentTime);
          const valueY = (1 - currentValue) * LANE_HEIGHT;
          ctx.beginPath();
          ctx.fillStyle = "#ef4444";
          ctx.arc(x, valueY, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }, [
    lanes,
    beatsPerPixel,
    canvasWidth,
    selectedPointId,
    currentTime,
    isDrawing,
    pencilPoints,
    selectedLaneId,
    interpolateValue,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPointId && selectedLaneId) {
          e.preventDefault();
          deletePoint(selectedLaneId, selectedPointId);
        }
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.key === "z" && e.shiftKey && (e.ctrlKey || e.metaKey)) ||
        (e.key === "y" && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPointId, selectedLaneId, deletePoint, undo, redo]);

  const visibleLanes = lanes.filter((l) => l.visible);

  return (
    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
      <div className="h-10 px-3 flex items-center justify-between border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-white">Automation</span>

          <div className="flex items-center gap-0.5 bg-slate-800 rounded-md p-0.5">
            {AUTOMATION_MODES.map((mode) => (
              <button
                key={mode.id}
                className={cn(
                  "px-2 py-1 text-[10px] font-bold rounded transition-colors",
                  automationMode === mode.id
                    ? "text-white"
                    : "text-white/40 hover:text-white/60",
                )}
                style={{
                  backgroundColor:
                    automationMode === mode.id
                      ? `${mode.color}33`
                      : "transparent",
                  color: automationMode === mode.id ? mode.color : undefined,
                }}
                onClick={() => setAutomationMode(mode.id)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 bg-slate-800 rounded-md p-0.5">
            {DRAWING_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Button
                  key={tool.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setDrawingTool(tool.id)}
                  className={cn(
                    "h-7 w-7 p-0",
                    drawingTool === tool.id && "bg-blue-500/20 text-blue-400",
                  )}
                  title={tool.label}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>

          <div className="w-px h-6 bg-slate-700" />

          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={undoStack.length === 0}
            className="h-7 w-7 p-0"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={redoStack.length === 0}
            className="h-7 w-7 p-0"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto">
        {visibleLanes.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-white/40 text-sm">
            No automation lanes visible
          </div>
        ) : (
          visibleLanes.map((lane) => (
            <div
              key={lane.id}
              className="border-b border-slate-800 last:border-b-0"
            >
              <div className="h-8 px-3 flex items-center justify-between bg-slate-900/30">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: lane.color }}
                  />
                  <span className="text-xs font-medium text-white">
                    {lane.label}
                  </span>
                  <span className="text-[10px] text-white/40">{lane.unit}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-white/40">
                    {interpolateValue(lane, currentTime).toFixed(2)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleLaneLock(lane.id)}
                    className="h-6 w-6 p-0"
                  >
                    {lane.locked ? (
                      <Lock className="h-3 w-3 text-yellow-500" />
                    ) : (
                      <Unlock className="h-3 w-3 text-white/40" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleLaneVisibility(lane.id)}
                    className="h-6 w-6 p-0"
                  >
                    {lane.visible ? (
                      <Eye className="h-3 w-3 text-white/40" />
                    ) : (
                      <EyeOff className="h-3 w-3 text-white/40" />
                    )}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => clearLane(lane.id)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Clear All Points
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(lane.id, el);
                }}
                height={LANE_HEIGHT}
                className={cn(
                  "w-full",
                  lane.locked
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-crosshair",
                )}
                onMouseDown={(e) => handleCanvasMouseDown(lane.id, e)}
                onMouseMove={(e) => handleCanvasMouseMove(lane.id, e)}
                onMouseUp={() => handleCanvasMouseUp(lane.id)}
                onMouseLeave={() => handleCanvasMouseUp(lane.id)}
              />
            </div>
          ))
        )}
      </div>

      <div className="h-8 px-3 flex items-center justify-between border-t border-slate-800 bg-slate-900/30">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">
            {lanes.length} lanes
          </span>
          <span className="text-[10px] text-white/40">
            {lanes.reduce((sum, l) => sum + l.points.length, 0)} points
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Magnet className="h-3 w-3 text-white/40" />
          <span className="text-[10px] text-white/40">
            Snap: {snapEnabled ? `1/${Math.round(1 / snapValue)}` : "Off"}
          </span>
        </div>
      </div>
    </div>
  );
}
