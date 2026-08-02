import { useCallback, useMemo, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Handle,
  Position,
  MarkerType,
  NodeProps,
  Panel,
} from "reactflow";
import { Volume2, Headphones, Music, Radio, Sliders, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnifiedStore } from "@/stores/unifiedStoreAdapter";
import { cn } from "@/lib/utils";
import "reactflow/dist/style.css";

interface RoutingNode {
  id: string;
  type: "track" | "bus" | "master" | "aux" | "sidechain";
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}


const NODE_TYPE_ICONS: Record<string, React.ReactNode> = {
  track: <Music className="w-4 h-4" />,
  bus: <Radio className="w-4 h-4" />,
  master: <Headphones className="w-4 h-4" />,
  aux: <Volume2 className="w-4 h-4" />,
  sidechain: <Sliders className="w-4 h-4" />,
};

const NODE_TYPE_COLORS: Record<string, string> = {
  track: "#3b82f6",
  bus: "#8b5cf6",
  master: "#f59e0b",
  aux: "#10b981",
  sidechain: "#ec4899",
};

function TrackNode({ data, selected }: NodeProps<RoutingNode>) {
  return (
    <div
      className={cn(
        "px-4 py-3 rounded-lg border-2 min-w-[140px] transition-all",
        selected ? "ring-2 ring-white/50 shadow-lg" : "shadow-md",
        data.muted && "opacity-50",
      )}
      style={{
        backgroundColor: `${data.color}20`,
        borderColor: data.color,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-white !border-2"
        style={{ borderColor: data.color }}
      />

      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-6 h-6 rounded flex items-center justify-center"
          style={{ backgroundColor: data.color }}
        >
          {NODE_TYPE_ICONS[data.type]}
        </div>
        <span className="font-medium text-white text-sm truncate">
          {data.name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.max(0, ((60 + data.volume) / 66) * 100)}%`,
              backgroundColor: data.color,
            }}
          />
        </div>
        <span className="text-[10px] text-zinc-400 w-8 text-right">
          {data.volume > 0
            ? `+${data.volume.toFixed(1)}`
            : data.volume.toFixed(1)}{" "}
          dB
        </span>
      </div>

      <div className="flex items-center gap-1 mt-2">
        <button
          className={cn(
            "px-2 py-0.5 text-[10px] font-bold rounded transition-colors",
            data.muted
              ? "bg-amber-500 text-black"
              : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
          )}
        >
          M
        </button>
        <button
          className={cn(
            "px-2 py-0.5 text-[10px] font-bold rounded transition-colors",
            data.solo
              ? "bg-yellow-400 text-black"
              : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600",
          )}
        >
          S
        </button>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-white !border-2"
        style={{ borderColor: data.color }}
      />
    </div>
  );
}

function BusNode({ data, selected }: NodeProps<RoutingNode>) {
  return (
    <div
      className={cn(
        "px-4 py-3 rounded-xl border-2 min-w-[160px] transition-all",
        selected ? "ring-2 ring-white/50 shadow-lg" : "shadow-md",
      )}
      style={{
        backgroundColor: `${NODE_TYPE_COLORS.bus}20`,
        borderColor: NODE_TYPE_COLORS.bus,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-purple-400 !border-2 !border-purple-600"
      />

      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
          <Radio className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-semibold text-white text-sm">{data.name}</span>
          <span className="block text-[10px] text-purple-300">Submix Bus</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <input
          type="range"
          min="-60"
          max="6"
          value={data.volume}
          readOnly
          className="flex-1 h-1 bg-zinc-700 rounded appearance-none cursor-pointer"
        />
        <span className="text-[10px] text-zinc-400">
          {data.volume.toFixed(1)}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-purple-400 !border-2 !border-purple-600"
      />
    </div>
  );
}

function MasterNode({ data, selected }: NodeProps<RoutingNode>) {
  return (
    <div
      className={cn(
        "px-5 py-4 rounded-2xl border-3 min-w-[180px] transition-all bg-gradient-to-b from-amber-900/30 to-amber-950/50",
        selected ? "ring-2 ring-amber-400/50 shadow-xl" : "shadow-lg",
      )}
      style={{ borderColor: NODE_TYPE_COLORS.master }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-400 !border-2 !border-amber-600 !w-4 !h-4"
      />

      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg">
          <Headphones className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-white text-base">{data.name}</span>
          <span className="block text-xs text-amber-300">Master Output</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center">
          <div className="w-4 h-16 bg-zinc-800 rounded-full relative overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 rounded-full transition-all"
              style={{
                height: `${Math.max(0, ((60 + data.volume) / 66) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">L</span>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-4 h-16 bg-zinc-800 rounded-full relative overflow-hidden">
            <div
              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-green-500 via-yellow-500 to-red-500 rounded-full transition-all"
              style={{
                height: `${Math.max(0, ((60 + data.volume) / 66) * 100)}%`,
              }}
            />
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">R</span>
        </div>
      </div>

      <div className="text-center mt-2 text-sm font-mono text-amber-400">
        {data.volume.toFixed(1)} dB
      </div>
    </div>
  );
}

const nodeTypes = {
  track: TrackNode,
  bus: BusNode,
  master: MasterNode,
};

interface RoutingFlowPanelProps {
  projectId: string | null;
  onClose?: () => void;
}

export function RoutingFlowPanel({
  _projectId,
  onClose,
}: RoutingFlowPanelProps) {
  const store = useUnifiedStore();
  const { tracks, masterTrack } = store;

  const initialNodes = useMemo<Node<RoutingNode>[]>(() => {
    const trackNodes: Node<RoutingNode>[] = tracks.map((track, index) => ({
      id: track.id,
      type: "track",
      position: {
        x: 100 + (index % 6) * 180,
        y: 50 + Math.floor(index / 6) * 150,
      },
      data: {
        id: track.id,
        type: "track",
        name: track.name,
        color: track.color,
        volume: track.volume,
        muted: track.muted,
        solo: track.solo,
      },
      draggable: true,
    }));

    const busNodes: Node<RoutingNode>[] = [
      {
        id: "bus-drums",
        type: "bus",
        position: { x: 200, y: 280 },
        data: {
          id: "bus-drums",
          type: "bus",
          name: "Drums Bus",
          color: NODE_TYPE_COLORS.bus,
          volume: 0,
          muted: false,
          solo: false,
        },
      },
      {
        id: "bus-vocals",
        type: "bus",
        position: { x: 420, y: 280 },
        data: {
          id: "bus-vocals",
          type: "bus",
          name: "Vocals Bus",
          color: NODE_TYPE_COLORS.bus,
          volume: 0,
          muted: false,
          solo: false,
        },
      },
      {
        id: "bus-instruments",
        type: "bus",
        position: { x: 640, y: 280 },
        data: {
          id: "bus-instruments",
          type: "bus",
          name: "Instruments",
          color: NODE_TYPE_COLORS.bus,
          volume: 0,
          muted: false,
          solo: false,
        },
      },
    ];

    const masterNode: Node<RoutingNode> = {
      id: "master",
      type: "master",
      position: { x: 420, y: 450 },
      data: {
        id: "master",
        type: "master",
        name: "Master",
        color: NODE_TYPE_COLORS.master,
        volume: masterTrack.volume,
        muted: masterTrack.muted,
        solo: false,
      },
    };

    return [...trackNodes, ...busNodes, masterNode];
  }, [tracks, masterTrack]);

  const initialEdges = useMemo<Edge[]>(() => {
    const edges: Edge[] = [];

    tracks.forEach((track) => {
      const targetBus =
        track.type === "audio"
          ? "bus-instruments"
          : track.name.toLowerCase().includes("drum")
            ? "bus-drums"
            : track.name.toLowerCase().includes("vocal")
              ? "bus-vocals"
              : "bus-instruments";

      edges.push({
        id: `${track.id}-to-${targetBus}`,
        source: track.id,
        target: targetBus,
        animated: true,
        style: { stroke: track.color, strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: track.color },
      });
    });

    ["bus-drums", "bus-vocals", "bus-instruments"].forEach((busId) => {
      edges.push({
        id: `${busId}-to-master`,
        source: busId,
        target: "master",
        animated: true,
        style: { stroke: NODE_TYPE_COLORS.bus, strokeWidth: 3 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: NODE_TYPE_COLORS.bus,
        },
      });
    });

    return edges;
  }, [tracks]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [tracks, masterTrack, setNodes, setEdges, initialNodes, initialEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#3b82f6", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const addNewBus = useCallback(() => {
    const busCount = nodes.filter((n) => n.type === "bus").length;
    const newBus: Node<RoutingNode> = {
      id: `bus-new-${Date.now()}`,
      type: "bus",
      position: { x: 100 + busCount * 200, y: 280 },
      data: {
        id: `bus-new-${Date.now()}`,
        type: "bus",
        name: `Bus ${busCount + 1}`,
        color: NODE_TYPE_COLORS.bus,
        volume: 0,
        muted: false,
        solo: false,
      },
    };
    setNodes((nds) => [...nds, newBus]);
  }, [nodes, setNodes]);

  return (
    <div className="h-full w-full bg-zinc-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} size={1} />
        <Controls className="!bg-zinc-800 !border-zinc-700" />
        <MiniMap
          nodeColor={(node) => node.data?.color || "#64748b"}
          maskColor="rgba(0, 0, 0, 0.8)"
          className="!bg-zinc-900 !border-zinc-700"
        />

        <Panel position="top-left" className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={addNewBus}
            className="bg-zinc-800 border-zinc-700 text-white hover:bg-zinc-700"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Bus
          </Button>
        </Panel>

        {onClose && (
          <Panel position="top-right">
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="w-5 h-5" />
            </Button>
          </Panel>
        )}

        <Panel position="bottom-left" className="text-xs text-zinc-500">
          Drag to connect tracks to buses. Click and drag nodes to reposition.
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default RoutingFlowPanel;
