import { useState, useRef, useEffect, useMemo } from "react";
import {
  GitBranch,
  Plus,
  Trash2,
  Volume2,
  Zap,
  ArrowRight,
  Eye,
  EyeOff,
  Waves,
  Activity,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Track {
  id: string;
  name: string;
  type: "audio" | "instrument" | "bus";
  color: string;
  isMuted: boolean;
}

interface SidechainConnection {
  id: string;
  sourceId: string;
  targetId: string;
  type: "compressor" | "gate" | "ducker" | "filter";
  isActive: boolean;
  settings: {
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    amount: number;
  };
}

interface FlowStateSidechainVisualizerProps {
  tracks?: Track[];
  onUpdateConnection?: (connection: SidechainConnection) => void;
  className?: string;
}

const DEFAULT_TRACKS: Track[] = [
  { id: "t1", name: "Kick", type: "audio", color: "#ef4444", isMuted: false },
  { id: "t2", name: "Snare", type: "audio", color: "#f97316", isMuted: false },
  {
    id: "t3",
    name: "Bass",
    type: "instrument",
    color: "#8b5cf6",
    isMuted: false,
  },
  {
    id: "t4",
    name: "Synth Pad",
    type: "instrument",
    color: "#06b6d4",
    isMuted: false,
  },
  {
    id: "t5",
    name: "Lead",
    type: "instrument",
    color: "#22c55e",
    isMuted: false,
  },
  { id: "t6", name: "Vocals", type: "audio", color: "#ec4899", isMuted: false },
  { id: "t7", name: "FX Bus", type: "bus", color: "#6b7280", isMuted: false },
  { id: "t8", name: "Master", type: "bus", color: "#eab308", isMuted: false },
];

const CONNECTION_TYPES = [
  {
    id: "compressor",
    label: "Compressor",
    icon: Zap,
    description: "Sidechain compression",
  },
  { id: "gate", label: "Gate", icon: Filter, description: "Sidechain gating" },
  { id: "ducker", label: "Ducker", icon: Volume2, description: "Auto-ducking" },
  {
    id: "filter",
    label: "Filter",
    icon: Waves,
    description: "Dynamic filtering",
  },
];

export function FlowStateSidechainVisualizer({
  tracks = DEFAULT_TRACKS,
  onUpdateConnection,
  className,
}: FlowStateSidechainVisualizerProps) {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [connections, setConnections] = useState<SidechainConnection[]>([
    {
      id: "c1",
      sourceId: "t1",
      targetId: "t3",
      type: "compressor",
      isActive: true,
      settings: {
        threshold: -20,
        ratio: 4,
        attack: 5,
        release: 100,
        amount: 80,
      },
    },
    {
      id: "c2",
      sourceId: "t1",
      targetId: "t4",
      type: "compressor",
      isActive: true,
      settings: {
        threshold: -24,
        ratio: 3,
        attack: 10,
        release: 150,
        amount: 60,
      },
    },
    {
      id: "c3",
      sourceId: "t6",
      targetId: "t5",
      type: "ducker",
      isActive: true,
      settings: {
        threshold: -18,
        ratio: 2,
        attack: 20,
        release: 200,
        amount: 40,
      },
    },
  ]);

  const [selectedConnection, setSelectedConnection] = useState<string | null>(
    null,
  );
  const [isAddingConnection, setIsAddingConnection] = useState(false);
  const [newConnectionSource, setNewConnectionSource] = useState<string | null>(
    null,
  );
  const [newConnectionTarget, setNewConnectionTarget] = useState<string | null>(
    null,
  );
  const [newConnectionType, setNewConnectionType] =
    useState<SidechainConnection["type"]>("compressor");
  const [showLabels, setShowLabels] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [animateConnections, setAnimateConnections] = useState(true);
  const [gainReduction, setGainReduction] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    if (!animateConnections) return;

    const interval = setInterval(() => {
      const newGR: Record<string, number> = {};
      connections
        .filter((c) => c.isActive)
        .forEach((conn) => {
          newGR[conn.id] = Math.random() * conn.settings.amount;
        });
      setGainReduction(newGR);
    }, 100);

    return () => clearInterval(interval);
  }, [connections, animateConnections]);

  const trackPositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const canvasWidth = 600;
    const canvasHeight = 400;
    const padding = 60;
    const trackWidth = (canvasWidth - padding * 2) / tracks.length;

    tracks.forEach((track, idx) => {
      positions[track.id] = {
        x: padding + trackWidth * idx + trackWidth / 2,
        y: canvasHeight / 2,
      };
    });

    return positions;
  }, [tracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    connections.forEach((conn) => {
      if (!conn.isActive && !showInactive) return;

      const source = trackPositions[conn.sourceId];
      const target = trackPositions[conn.targetId];
      if (!source || !target) return;

      const gr = gainReduction[conn.id] || 0;
      const isSelected = selectedConnection === conn.id;

      const midY = Math.min(source.y, target.y) - 50 - (isSelected ? 20 : 0);

      ctx.strokeStyle = conn.isActive
        ? isSelected
          ? "#fff"
          : `rgba(147, 51, 234, ${0.3 + gr / 100})`
        : "rgba(100, 100, 100, 0.3)";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(conn.isActive ? [] : [5, 5]);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y - 20);
      ctx.bezierCurveTo(
        source.x,
        midY,
        target.x,
        midY,
        target.x,
        target.y - 20,
      );
      ctx.stroke();
      ctx.setLineDash([]);

      if (conn.isActive && animateConnections) {
        const arrowX = (source.x + target.x) / 2;
        const arrowY = midY;

        ctx.fillStyle = "#a855f7";
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY - 5);
        ctx.lineTo(arrowX + 5, arrowY);
        ctx.lineTo(arrowX, arrowY + 5);
        ctx.closePath();
        ctx.fill();
      }

      if (showLabels) {
        const labelX = (source.x + target.x) / 2;
        const labelY = midY - 10;

        ctx.fillStyle = isSelected ? "#fff" : "#a855f7";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(conn.type.toUpperCase(), labelX, labelY);

        if (conn.isActive && gr > 0) {
          ctx.fillStyle = "#22c55e";
          ctx.fillText(`-${gr.toFixed(1)} dB`, labelX, labelY + 12);
        }
      }
    });

    tracks.forEach((track) => {
      const pos = trackPositions[track.id];
      if (!pos) return;

      ctx.fillStyle = track.color + "40";
      ctx.strokeStyle = track.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(pos.x - 40, pos.y - 20, 80, 40, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(track.name, pos.x, pos.y);

      const isSidechainSource = connections.some(
        (c) => c.sourceId === track.id,
      );
      const isSidechainTarget = connections.some(
        (c) => c.targetId === track.id,
      );

      if (isSidechainSource) {
        ctx.fillStyle = "#a855f7";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y - 25, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isSidechainTarget) {
        ctx.fillStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y + 25, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [
    tracks,
    connections,
    trackPositions,
    selectedConnection,
    showLabels,
    showInactive,
    gainReduction,
    animateConnections,
  ]);

  const addConnection = () => {
    if (!newConnectionSource || !newConnectionTarget) {
      toast({ title: "Select source and target", variant: "destructive" });
      return;
    }

    if (newConnectionSource === newConnectionTarget) {
      toast({
        title: "Cannot connect track to itself",
        variant: "destructive",
      });
      return;
    }

    const exists = connections.some(
      (c) =>
        c.sourceId === newConnectionSource &&
        c.targetId === newConnectionTarget,
    );
    if (exists) {
      toast({ title: "Connection already exists", variant: "destructive" });
      return;
    }

    const newConnection: SidechainConnection = {
      id: `c${Date.now()}`,
      sourceId: newConnectionSource,
      targetId: newConnectionTarget,
      type: newConnectionType,
      isActive: true,
      settings: {
        threshold: -20,
        ratio: 4,
        attack: 10,
        release: 100,
        amount: 50,
      },
    };

    setConnections((prev) => [...prev, newConnection]);
    setIsAddingConnection(false);
    setNewConnectionSource(null);
    setNewConnectionTarget(null);
    toast({ title: "Connection added" });
  };

  const deleteConnection = (connId: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== connId));
    if (selectedConnection === connId) setSelectedConnection(null);
    toast({ title: "Connection deleted" });
  };

  const toggleConnection = (connId: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === connId ? { ...c, isActive: !c.isActive } : c)),
    );
  };

  const updateConnectionSettings = (
    connId: string,
    settings: Partial<SidechainConnection["settings"]>,
  ) => {
    setConnections((prev) =>
      prev.map((c) =>
        c.id === connId
          ? { ...c, settings: { ...c.settings, ...settings } }
          : c,
      ),
    );
  };

  const selectedConnectionData = connections.find(
    (c) => c.id === selectedConnection,
  );

  const getTrackName = (trackId: string): string => {
    return tracks.find((t) => t.id === trackId)?.name || "Unknown";
  };

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <GitBranch className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">Sidechain Visualizer</h2>
            <p className="text-xs text-zinc-500">
              {connections.length} connections
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsAddingConnection(true)}
          className="bg-purple-500 hover:bg-purple-600"
        >
          <Plus className="w-4 h-4 mr-1" />
          Add Connection
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 p-4">
          <div className="h-full bg-zinc-900 rounded-lg overflow-hidden relative">
            <canvas
              ref={canvasRef}
              width={600}
              height={400}
              className="w-full h-full"
              onClick={(e) => {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;

                const x = ((e.clientX - rect.left) / rect.width) * 600;
                const y = ((e.clientY - rect.top) / rect.height) * 400;

                for (const track of tracks) {
                  const pos = trackPositions[track.id];
                  if (Math.abs(x - pos.x) < 40 && Math.abs(y - pos.y) < 20) {
                    if (isAddingConnection) {
                      if (!newConnectionSource) {
                        setNewConnectionSource(track.id);
                      } else {
                        setNewConnectionTarget(track.id);
                      }
                    }
                    return;
                  }
                }

                for (const conn of connections) {
                  const source = trackPositions[conn.sourceId];
                  const target = trackPositions[conn.targetId];
                  const midX = (source.x + target.x) / 2;
                  const midY = Math.min(source.y, target.y) - 50;

                  if (Math.abs(x - midX) < 30 && Math.abs(y - midY) < 20) {
                    setSelectedConnection(conn.id);
                    return;
                  }
                }

                setSelectedConnection(null);
              }}
            />

            {/* Legend */}
            <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-500" />
                <span className="text-zinc-400">Source (Key)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-zinc-400">Target (Ducked)</span>
              </div>
            </div>

            {/* View controls */}
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={showLabels ? "default" : "outline"}
                      className="h-8 w-8"
                      onClick={() => setShowLabels(!showLabels)}
                    >
                      {showLabels ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Labels</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant={animateConnections ? "default" : "outline"}
                      className="h-8 w-8"
                      onClick={() => setAnimateConnections(!animateConnections)}
                    >
                      <Activity className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Toggle Animation</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-72 border-l border-zinc-800 overflow-auto">
          {/* Add Connection Form */}
          {isAddingConnection && (
            <div className="p-4 border-b border-zinc-800 bg-purple-500/5">
              <h4 className="font-medium mb-3">New Connection</h4>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">
                    Source (Key Input)
                  </Label>
                  <Select
                    value={newConnectionSource || ""}
                    onValueChange={setNewConnectionSource}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder="Select source..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tracks.map((track) => (
                        <SelectItem key={track.id} value={track.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: track.color }}
                            />
                            {track.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">
                    Target (Ducked Track)
                  </Label>
                  <Select
                    value={newConnectionTarget || ""}
                    onValueChange={setNewConnectionTarget}
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700">
                      <SelectValue placeholder="Select target..." />
                    </SelectTrigger>
                    <SelectContent>
                      {tracks
                        .filter((t) => t.id !== newConnectionSource)
                        .map((track) => (
                          <SelectItem key={track.id} value={track.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: track.color }}
                              />
                              {track.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-400">Type</Label>
                  <Select
                    value={newConnectionType}
                    onValueChange={(v) =>
                      setNewConnectionType(v as SidechainConnection["type"])
                    }
                  >
                    <SelectTrigger className="bg-zinc-900 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONNECTION_TYPES.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setIsAddingConnection(false);
                      setNewConnectionSource(null);
                      setNewConnectionTarget(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button className="flex-1" onClick={addConnection}>
                    Add
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Selected Connection */}
          {selectedConnectionData && (
            <div className="p-4 border-b border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Connection Settings</h4>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-red-400"
                  onClick={() => deleteConnection(selectedConnectionData.id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2 mb-4 p-2 bg-zinc-900 rounded">
                <Badge variant="secondary">
                  {getTrackName(selectedConnectionData.sourceId)}
                </Badge>
                <ArrowRight className="w-4 h-4 text-purple-400" />
                <Badge variant="secondary">
                  {getTrackName(selectedConnectionData.targetId)}
                </Badge>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Active</Label>
                  <Switch
                    checked={selectedConnectionData.isActive}
                    onCheckedChange={() =>
                      toggleConnection(selectedConnectionData.id)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Threshold: {selectedConnectionData.settings.threshold} dB
                  </Label>
                  <Slider
                    value={[selectedConnectionData.settings.threshold]}
                    onValueChange={([v]) =>
                      updateConnectionSettings(selectedConnectionData.id, {
                        threshold: v,
                      })
                    }
                    min={-60}
                    max={0}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Ratio: {selectedConnectionData.settings.ratio}:1
                  </Label>
                  <Slider
                    value={[selectedConnectionData.settings.ratio]}
                    onValueChange={([v]) =>
                      updateConnectionSettings(selectedConnectionData.id, {
                        ratio: v,
                      })
                    }
                    min={1}
                    max={20}
                    step={0.5}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Attack: {selectedConnectionData.settings.attack} ms
                  </Label>
                  <Slider
                    value={[selectedConnectionData.settings.attack]}
                    onValueChange={([v]) =>
                      updateConnectionSettings(selectedConnectionData.id, {
                        attack: v,
                      })
                    }
                    min={0.1}
                    max={100}
                    step={0.1}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Release: {selectedConnectionData.settings.release} ms
                  </Label>
                  <Slider
                    value={[selectedConnectionData.settings.release]}
                    onValueChange={([v]) =>
                      updateConnectionSettings(selectedConnectionData.id, {
                        release: v,
                      })
                    }
                    min={10}
                    max={1000}
                    step={10}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Amount: {selectedConnectionData.settings.amount}%
                  </Label>
                  <Slider
                    value={[selectedConnectionData.settings.amount]}
                    onValueChange={([v]) =>
                      updateConnectionSettings(selectedConnectionData.id, {
                        amount: v,
                      })
                    }
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Connection List */}
          <div className="p-4">
            <h4 className="font-medium mb-3">All Connections</h4>
            <div className="space-y-2">
              {connections.map((conn) => (
                <Card
                  key={conn.id}
                  className={cn(
                    "bg-zinc-900 border-zinc-800 p-3 cursor-pointer transition-all",
                    selectedConnection === conn.id && "border-purple-500/50",
                    !conn.isActive && "opacity-50",
                  )}
                  onClick={() => setSelectedConnection(conn.id)}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        conn.isActive ? "bg-green-500" : "bg-zinc-500",
                      )}
                    />
                    <span className="text-sm font-medium">
                      {getTrackName(conn.sourceId)}
                    </span>
                    <ArrowRight className="w-3 h-3 text-zinc-500" />
                    <span className="text-sm">
                      {getTrackName(conn.targetId)}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {conn.type}
                    </Badge>
                  </div>
                  {conn.isActive && gainReduction[conn.id] !== undefined && (
                    <div className="mt-2 h-1 bg-zinc-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-green-500 transition-all"
                        style={{ width: `${gainReduction[conn.id]}%` }}
                      />
                    </div>
                  )}
                </Card>
              ))}
              {connections.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-4">
                  No sidechain connections
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateSidechainVisualizer;
