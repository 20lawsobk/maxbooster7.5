import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Check, Star, StarOff, Trash2, Copy, Volume2, VolumeX, Headphones, MoreVertical, Layers, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Take {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  waveformData?: number[];
  isComped: boolean;
  isFavorite: boolean;
  rating: number;
  color: string;
  audioUrl?: string;
}

interface CompRegion {
  id: string;
  takeId: string;
  startTime: number;
  endTime: number;
}

interface TakeLane {
  id: string;
  trackId: string;
  name: string;
  takes: Take[];
  compRegions: CompRegion[];
  isExpanded: boolean;
  isMuted: boolean;
  isSoloed: boolean;
}

interface FlowStateCompingProps {
  lanes: TakeLane[];
  onLanesChange: (lanes: TakeLane[]) => void;
  duration: number;
  currentTime?: number;
  zoom?: number;
  onCompComplete?: (compedAudioUrl: string) => void;
  height?: number;
}

const TAKE_LANE_HEIGHT = 48;
const MAIN_LANE_HEIGHT = 64;

export function FlowStateComping({
  lanes,
  onLanesChange,
  duration,
  currentTime = 0,
  zoom = 100,
  onCompComplete,
  height = 300,
}: FlowStateCompingProps) {
  const { toast } = useToast();
  const [selectedLaneId, setSelectedLaneId] = useState<string | null>(
    lanes[0]?.id || null,
  );
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);
  const [hoveredTakeId, setHoveredTakeId] = useState<string | null>(null);
  const [isDraggingComp, setIsDraggingComp] = useState(false);
  const [compDragStart, setCompDragStart] = useState<number | null>(null);

  const beatsPerPixel = 0.05 / (zoom / 100);
  const containerWidth = Math.max(800, duration / beatsPerPixel);

  const toggleLaneExpand = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, isExpanded: !lane.isExpanded } : lane,
      );
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const toggleLaneMute = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, isMuted: !lane.isMuted } : lane,
      );
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const toggleLaneSolo = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) =>
        lane.id === laneId ? { ...lane, isSoloed: !lane.isSoloed } : lane,
      );
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const toggleTakeFavorite = useCallback(
    (laneId: string, takeId: string) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          takes: lane.takes.map((take) =>
            take.id === takeId
              ? { ...take, isFavorite: !take.isFavorite }
              : take,
          ),
        };
      });
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  useCallback(
    (laneId: string, takeId: string, rating: number) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          takes: lane.takes.map((take) =>
            take.id === takeId ? { ...take, rating } : take,
          ),
        };
      });
      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const deleteTake = useCallback(
    (laneId: string, takeId: string) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          takes: lane.takes.filter((take) => take.id !== takeId),
          compRegions: lane.compRegions.filter(
            (region) => region.takeId !== takeId,
          ),
        };
      });
      onLanesChange(newLanes);
      toast({ title: "Take deleted" });
    },
    [lanes, onLanesChange, toast],
  );

  const compTake = useCallback(
    (laneId: string, takeId: string, startTime: number, endTime: number) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;

        const overlappingRegions = lane.compRegions.filter(
          (region) =>
            !(region.endTime <= startTime || region.startTime >= endTime),
        );

        let newRegions = lane.compRegions.filter(
          (region) =>
            region.endTime <= startTime || region.startTime >= endTime,
        );

        overlappingRegions.forEach((region) => {
          if (region.startTime < startTime) {
            newRegions.push({
              ...region,
              id: `${region.id}-split-left`,
              endTime: startTime,
            });
          }
          if (region.endTime > endTime) {
            newRegions.push({
              ...region,
              id: `${region.id}-split-right`,
              startTime: endTime,
            });
          }
        });

        newRegions.push({
          id: `comp-${Date.now()}`,
          takeId,
          startTime,
          endTime,
        });

        newRegions.sort((a, b) => a.startTime - b.startTime);

        return {
          ...lane,
          compRegions: newRegions,
          takes: lane.takes.map((take) => ({
            ...take,
            isComped: newRegions.some((r) => r.takeId === take.id),
          })),
        };
      });

      onLanesChange(newLanes);
    },
    [lanes, onLanesChange],
  );

  const handleTakeMouseDown = useCallback(
    (
      e: React.MouseEvent,
      laneId: string,
      takeId: string,
      takeStartTime: number,
    ) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const clickTime = takeStartTime + x * beatsPerPixel;

      setIsDraggingComp(true);
      setCompDragStart(clickTime);
      setSelectedTakeId(takeId);
      setSelectedLaneId(laneId);
    },
    [beatsPerPixel],
  );

  const handleTakeMouseUp = useCallback(
    (
      e: React.MouseEvent,
      laneId: string,
      takeId: string,
      takeStartTime: number,
    ) => {
      if (!isDraggingComp || compDragStart === null) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const endTime = takeStartTime + x * beatsPerPixel;

      const startTime = Math.min(compDragStart, endTime);
      const finalEndTime = Math.max(compDragStart, endTime);

      if (finalEndTime - startTime > 0.1) {
        compTake(laneId, takeId, startTime, finalEndTime);
      }

      setIsDraggingComp(false);
      setCompDragStart(null);
    },
    [isDraggingComp, compDragStart, beatsPerPixel, compTake],
  );

  const flattenComp = useCallback(
    (laneId: string) => {
      const lane = lanes.find((l) => l.id === laneId);
      if (!lane || lane.compRegions.length === 0) {
        toast({ title: "No comp regions to flatten" });
        return;
      }

      toast({ title: "Comp flattened to main track" });
      onCompComplete?.(`/api/studio/comp/${laneId}/flattened`);
    },
    [lanes, toast, onCompComplete],
  );

  const clearComp = useCallback(
    (laneId: string) => {
      const newLanes = lanes.map((lane) => {
        if (lane.id !== laneId) return lane;
        return {
          ...lane,
          compRegions: [],
          takes: lane.takes.map((take) => ({ ...take, isComped: false })),
        };
      });
      onLanesChange(newLanes);
      toast({ title: "Comp cleared" });
    },
    [lanes, onLanesChange, toast],
  );

  const waveformCache = useRef<Map<string, number[]>>(new Map());

  const generateMockWaveform = useCallback(
    (takeId: string, takeDuration: number): number[] => {
      const cacheKey = `${takeId}-${takeDuration.toFixed(2)}`;
      if (waveformCache.current.has(cacheKey)) {
        return waveformCache.current.get(cacheKey)!;
      }

      let seed = 0;
      for (let i = 0; i < takeId.length; i++) {
        seed = (seed << 5) - seed + takeId.charCodeAt(i);
        seed = seed & seed;
      }
      seed = Math.abs(seed);

      const seededRandom = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };

      const samples: number[] = [];
      const numSamples = Math.floor(takeDuration * 100);
      for (let i = 0; i < numSamples; i++) {
        const t = i / numSamples;
        samples.push(
          Math.abs(
            Math.sin(t * Math.PI * 8) * 0.3 + (seededRandom() - 0.5) * 0.4,
          ),
        );
      }

      waveformCache.current.set(cacheKey, samples);
      return samples;
    },
    [],
  );

  const renderWaveform = useCallback(
    (
      take: Take,
      width: number,
      height: number,
      color: string,
      isSelected: boolean,
    ) => {
      const waveformData =
        take.waveformData || generateMockWaveform(take.id, take.duration);
      const centerY = height / 2;
      const maxAmplitude = height * 0.35;

      const points: string[] = [];
      const samplesPerPixel = waveformData.length / width;

      for (let x = 0; x < width; x++) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const y = centerY - sample * maxAmplitude;
        points.push(`${x},${y}`);
      }

      for (let x = width - 1; x >= 0; x--) {
        const sampleIndex = Math.floor(x * samplesPerPixel);
        const sample = waveformData[sampleIndex] || 0;
        const y = centerY + sample * maxAmplitude;
        points.push(`${x},${y}`);
      }

      return (
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient
              id={`waveform-${take.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={color} stopOpacity="0.3" />
              <stop offset="50%" stopColor={color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={color} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          <polygon
            points={points.join(" ")}
            fill={`url(#waveform-${take.id})`}
            stroke={isSelected ? "#ffffff" : color}
            strokeWidth={isSelected ? 2 : 1}
          />
        </svg>
      );
    },
    [generateMockWaveform],
  );

  return (
    <div className="flex flex-col bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
      <div className="h-10 px-3 flex items-center justify-between border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-white/60" />
          <span className="text-sm font-medium text-white">Take Comping</span>
          <span className="text-xs text-white/40">
            {lanes.reduce((sum, l) => sum + l.takes.length, 0)} takes
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedLaneId && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => flattenComp(selectedLaneId)}
                className="h-7 text-xs"
              >
                <GitMerge className="h-3 w-3 mr-1" />
                Flatten
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearComp(selectedLaneId)}
                className="h-7 text-xs text-red-400"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ maxHeight: height }}>
        {lanes.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-white/40 text-sm">
            No take lanes available
          </div>
        ) : (
          lanes.map((lane) => (
            <div
              key={lane.id}
              className="border-b border-slate-800 last:border-b-0"
            >
              <div
                className={cn(
                  "h-10 px-3 flex items-center gap-2 cursor-pointer",
                  "bg-slate-900/30 hover:bg-slate-900/50 transition-colors",
                  selectedLaneId === lane.id && "bg-slate-800/50",
                )}
                onClick={() => setSelectedLaneId(lane.id)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLaneExpand(lane.id);
                  }}
                  className="p-0.5 hover:bg-white/10 rounded"
                >
                  {lane.isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-white/60" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-white/60" />
                  )}
                </button>

                <span className="text-sm font-medium text-white flex-1">
                  {lane.name}
                </span>
                <span className="text-xs text-white/40">
                  {lane.takes.length} takes
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLaneMute(lane.id);
                  }}
                  className={cn("h-6 w-6 p-0", lane.isMuted && "text-red-400")}
                >
                  {lane.isMuted ? (
                    <VolumeX className="h-3 w-3" />
                  ) : (
                    <Volume2 className="h-3 w-3" />
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleLaneSolo(lane.id);
                  }}
                  className={cn(
                    "h-6 w-6 p-0",
                    lane.isSoloed && "text-yellow-400",
                  )}
                >
                  <Headphones className="h-3 w-3" />
                </Button>
              </div>

              <div
                className="relative bg-black/30"
                style={{
                  height: MAIN_LANE_HEIGHT,
                  width: containerWidth,
                }}
              >
                {lane.compRegions.map((region) => {
                  const take = lane.takes.find((t) => t.id === region.takeId);
                  if (!take) return null;

                  const x = region.startTime / beatsPerPixel;
                  const width =
                    (region.endTime - region.startTime) / beatsPerPixel;

                  return (
                    <div
                      key={region.id}
                      className="absolute top-1 bottom-1 rounded border border-green-500/50 overflow-hidden"
                      style={{
                        left: x,
                        width,
                        backgroundColor: `${take.color}44`,
                      }}
                    >
                      {renderWaveform(
                        take,
                        width,
                        MAIN_LANE_HEIGHT - 8,
                        take.color,
                        false,
                      )}
                      <div className="absolute top-0 left-0 px-1 bg-green-500/80 text-[9px] text-white rounded-br">
                        {take.name}
                      </div>
                    </div>
                  );
                })}

                {currentTime > 0 && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{ left: currentTime / beatsPerPixel }}
                  />
                )}
              </div>

              <AnimatePresence>
                {lane.isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {lane.takes.map((take, index) => (
                      <div
                        key={take.id}
                        className={cn(
                          "relative border-t border-slate-800/50",
                          "hover:bg-slate-800/30 transition-colors",
                        )}
                        style={{ height: TAKE_LANE_HEIGHT }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-32 flex items-center gap-1 px-2 bg-slate-900/50 border-r border-slate-800/50 z-10">
                          <span className="text-[10px] text-white/40 w-4">
                            {index + 1}
                          </span>
                          <span className="text-xs text-white truncate flex-1">
                            {take.name}
                          </span>

                          <button
                            onClick={() => toggleTakeFavorite(lane.id, take.id)}
                            className="p-0.5 hover:bg-white/10 rounded"
                          >
                            {take.isFavorite ? (
                              <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                            ) : (
                              <StarOff className="h-3 w-3 text-white/30" />
                            )}
                          </button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-0.5 hover:bg-white/10 rounded">
                                <MoreVertical className="h-3 w-3 text-white/40" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem
                                onClick={() =>
                                  compTake(
                                    lane.id,
                                    take.id,
                                    take.startTime,
                                    take.startTime + take.duration,
                                  )
                                }
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Comp Entire Take
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="h-4 w-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => deleteTake(lane.id, take.id)}
                                className="text-red-400"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div
                          className="absolute left-32 right-0 top-0 bottom-0 cursor-crosshair"
                          onMouseDown={(e) =>
                            handleTakeMouseDown(
                              e,
                              lane.id,
                              take.id,
                              take.startTime,
                            )
                          }
                          onMouseUp={(e) =>
                            handleTakeMouseUp(
                              e,
                              lane.id,
                              take.id,
                              take.startTime,
                            )
                          }
                          onMouseEnter={() => setHoveredTakeId(take.id)}
                          onMouseLeave={() => setHoveredTakeId(null)}
                        >
                          <div
                            className={cn(
                              "absolute top-1 bottom-1 rounded overflow-hidden border transition-all",
                              selectedTakeId === take.id
                                ? "border-white"
                                : hoveredTakeId === take.id
                                  ? "border-white/40"
                                  : "border-white/20",
                              take.isComped && "ring-1 ring-green-500/50",
                            )}
                            style={{
                              left: take.startTime / beatsPerPixel,
                              width: take.duration / beatsPerPixel,
                              backgroundColor: `${take.color}33`,
                            }}
                          >
                            {renderWaveform(
                              take,
                              take.duration / beatsPerPixel,
                              TAKE_LANE_HEIGHT - 8,
                              take.color,
                              selectedTakeId === take.id,
                            )}

                            {take.isComped && (
                              <div className="absolute top-0 right-0 bg-green-500 p-0.5 rounded-bl">
                                <Check className="h-2.5 w-2.5 text-white" />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      <div className="h-8 px-3 flex items-center justify-between border-t border-slate-800 bg-slate-900/30">
        <span className="text-[10px] text-white/40">
          Click and drag on takes to create comp regions
        </span>
        <span className="text-[10px] text-white/40">
          {lanes.reduce((sum, l) => sum + l.compRegions.length, 0)} comp regions
        </span>
      </div>
    </div>
  );
}
