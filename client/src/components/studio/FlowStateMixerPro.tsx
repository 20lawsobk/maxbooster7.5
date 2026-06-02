import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Volume2,
  VolumeX,
  Headphones,
  MoreVertical,
  ChevronDown,
  ChevronUp,
  Plus,
  Settings,
  Sliders,
  Cable,
  ArrowRight,
  Power,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Send {
  id: string;
  targetBusId: string;
  level: number;
  preFader: boolean;
  enabled: boolean;
}

interface InsertSlot {
  id: string;
  pluginId: string | null;
  pluginName: string | null;
  enabled: boolean;
}

interface MixerChannel {
  id: string;
  name: string;
  type: "audio" | "instrument" | "bus" | "master";
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  meterLevel: [number, number];
  peakLevel: [number, number];
  sends: Send[];
  inserts: InsertSlot[];
  outputBus: string;
  inputSource: string;
  phase: boolean;
  eqEnabled: boolean;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

interface BusChannel {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  meterLevel: [number, number];
  inserts: InsertSlot[];
}

interface FlowStateMixerProProps {
  channels: MixerChannel[];
  buses: BusChannel[];
  masterChannel: MixerChannel;
  onChannelChange: (channelId: string, updates: Partial<MixerChannel>) => void;
  onBusChange: (busId: string, updates: Partial<BusChannel>) => void;
  onMasterChange: (updates: Partial<MixerChannel>) => void;
  onAddBus: () => void;
  onOpenPlugin: (channelId: string, slotIndex: number) => void;
  selectedChannelId?: string;
  onSelectChannel?: (channelId: string | null) => void;
}

const FADER_HEIGHT = 140;
const CHANNEL_WIDTH = 72;
const NARROW_CHANNEL_WIDTH = 56;

export function FlowStateMixerPro({
  channels,
  buses,
  masterChannel,
  onChannelChange,
  onBusChange,
  onMasterChange,
  onAddBus,
  onOpenPlugin,
  selectedChannelId,
  onSelectChannel,
}: FlowStateMixerProProps) {
  const { toast } = useToast();
  const [showSends, setShowSends] = useState(true);
  const [showEQ, setShowEQ] = useState(false);
  const [showInserts, setShowInserts] = useState(false);
  const [narrowMode, setNarrowMode] = useState(false);

  const channelWidth = narrowMode ? NARROW_CHANNEL_WIDTH : CHANNEL_WIDTH;

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900/95 to-slate-950/95 backdrop-blur-xl">
      <div className="h-10 px-3 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-white/60" />
          <span className="text-sm font-medium text-white">Mixer</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInserts(!showInserts)}
            className={cn("h-7 text-xs", showInserts && "bg-slate-700")}
          >
            Inserts
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEQ(!showEQ)}
            className={cn("h-7 text-xs", showEQ && "bg-slate-700")}
          >
            EQ
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSends(!showSends)}
            className={cn("h-7 text-xs", showSends && "bg-slate-700")}
          >
            Sends
          </Button>
          <div className="w-px h-5 bg-slate-700 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNarrowMode(!narrowMode)}
            className="h-7 text-xs"
          >
            {narrowMode ? "Wide" : "Narrow"}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-x-auto">
        <div className="flex py-2 px-1 gap-0.5">
          {channels.map((channel) => (
            <ChannelStrip
              key={channel.id}
              channel={channel}
              buses={buses}
              width={channelWidth}
              showSends={showSends}
              showEQ={showEQ}
              showInserts={showInserts}
              isSelected={selectedChannelId === channel.id}
              onSelect={() => onSelectChannel?.(channel.id)}
              onChange={(updates) => onChannelChange(channel.id, updates)}
              onOpenPlugin={(slotIndex) => onOpenPlugin(channel.id, slotIndex)}
            />
          ))}

          <div className="w-px bg-slate-700 mx-1" />

          {buses.map((bus) => (
            <BusStrip
              key={bus.id}
              bus={bus}
              width={channelWidth}
              showInserts={showInserts}
              onChange={(updates) => onBusChange(bus.id, updates)}
            />
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={onAddBus}
            className="w-8 h-8 p-0 my-auto"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <div className="w-px bg-indigo-500/30 mx-2" />

          <MasterStrip
            channel={masterChannel}
            width={channelWidth + 16}
            showInserts={showInserts}
            onChange={onMasterChange}
          />
        </div>
      </div>
    </div>
  );
}

interface ChannelStripProps {
  channel: MixerChannel;
  buses: BusChannel[];
  width: number;
  showSends: boolean;
  showEQ: boolean;
  showInserts: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<MixerChannel>) => void;
  onOpenPlugin: (slotIndex: number) => void;
}

function ChannelStrip({
  channel,
  buses,
  width,
  showSends,
  showEQ,
  showInserts,
  isSelected,
  onSelect,
  onChange,
  onOpenPlugin,
}: ChannelStripProps) {
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const [isDraggingPan, setIsDraggingPan] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingFader) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!faderRef.current) return;
      const rect = faderRef.current.getBoundingClientRect();
      const y =
        1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onChange({ volume: y });
    };

    const handleMouseUp = () => setIsDraggingFader(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFader, onChange]);

  const dbValue =
    channel.volume > 0 ? 20 * Math.log10(channel.volume) : -Infinity;
  const dbDisplay = dbValue === -Infinity ? "-∞" : dbValue.toFixed(1);

  return (
    <motion.div
      className={cn(
        "flex flex-col bg-black/40 rounded-lg border overflow-hidden transition-all",
        isSelected ? "border-blue-500" : "border-white/5",
      )}
      style={{ width }}
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
    >
      <div
        className="h-6 flex items-center justify-center text-[10px] font-medium truncate px-1"
        style={{ backgroundColor: `${channel.color}40`, color: channel.color }}
      >
        {channel.name}
      </div>

      {showInserts && (
        <div className="p-1 space-y-0.5 border-b border-white/5">
          {channel.inserts.slice(0, 4).map((insert, i) => (
            <button
              key={insert.id}
              className={cn(
                "w-full h-4 rounded text-[8px] truncate px-1",
                insert.pluginId
                  ? insert.enabled
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-slate-700 text-white/40"
                  : "bg-white/5 text-white/20",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPlugin(i);
              }}
            >
              {insert.pluginName || "—"}
            </button>
          ))}
        </div>
      )}

      {showEQ && (
        <div className="p-1 space-y-1 border-b border-white/5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-white/40">EQ</span>
            <button
              className={cn(
                "w-4 h-4 rounded flex items-center justify-center",
                channel.eqEnabled
                  ? "bg-green-500/20 text-green-500"
                  : "bg-white/5 text-white/20",
              )}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ eqEnabled: !channel.eqEnabled });
              }}
            >
              <Power className="h-2.5 w-2.5" />
            </button>
          </div>
          {["Low", "Mid", "High"].map((band, i) => {
            const key = `eq${band}` as "eqLow" | "eqMid" | "eqHigh";
            return (
              <div key={band} className="flex items-center gap-1">
                <span className="text-[7px] text-white/40 w-4">{band[0]}</span>
                <Slider
                  value={[channel[key]]}
                  onValueChange={([v]) => onChange({ [key]: v })}
                  min={-12}
                  max={12}
                  step={0.5}
                  className="flex-1"
                  disabled={!channel.eqEnabled}
                />
              </div>
            );
          })}
        </div>
      )}

      <div
        ref={panRef}
        className="mx-auto my-1 w-6 h-6 rounded-full border-2 border-white/20 relative cursor-pointer"
        style={{
          background: `conic-gradient(from -135deg, ${channel.color} ${(channel.pan + 1) * 135}deg, transparent 0)`,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-0.5 h-2 bg-white rounded-full"
            style={{ transform: `rotate(${channel.pan * 135}deg)` }}
          />
        </div>
      </div>

      <div className="flex gap-0.5 mx-1">
        <MeterBar
          level={channel.meterLevel[0]}
          peak={channel.peakLevel[0]}
          color={channel.color}
        />
        <MeterBar
          level={channel.meterLevel[1]}
          peak={channel.peakLevel[1]}
          color={channel.color}
        />
      </div>

      <div
        ref={faderRef}
        className="mx-1 my-1 relative bg-black/60 rounded cursor-ns-resize"
        style={{ height: FADER_HEIGHT }}
        onMouseDown={(e) => {
          e.stopPropagation();
          setIsDraggingFader(true);
        }}
      >
        <div className="absolute inset-x-0.5 inset-y-0.5 bg-gradient-to-t from-slate-800 to-slate-700 rounded overflow-hidden">
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((i) => (
            <div
              key={i}
              className="absolute w-full h-px bg-white/10"
              style={{ top: `${i}%` }}
            />
          ))}
        </div>

        <motion.div
          className="absolute left-0.5 right-0.5 h-4 rounded-sm shadow-lg cursor-grab active:cursor-grabbing"
          style={{
            background: `linear-gradient(to bottom, ${channel.color}, ${channel.color}aa)`,
            bottom: `${channel.volume * 100}%`,
            transform: "translateY(50%)",
          }}
          whileHover={{ scale: 1.05 }}
        />
      </div>

      <div className="text-[9px] text-white/60 text-center font-mono py-0.5">
        {dbDisplay} dB
      </div>

      {showSends && (
        <div className="p-1 space-y-0.5 border-t border-white/5">
          {channel.sends.map((send, i) => {
            const targetBus = buses.find((b) => b.id === send.targetBusId);
            return (
              <div key={send.id} className="flex items-center gap-0.5">
                <button
                  className={cn(
                    "w-3 h-3 rounded flex items-center justify-center",
                    send.enabled
                      ? "bg-green-500/20 text-green-500"
                      : "bg-white/5 text-white/20",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    const newSends = [...channel.sends];
                    newSends[i] = { ...send, enabled: !send.enabled };
                    onChange({ sends: newSends });
                  }}
                >
                  <ArrowRight className="h-2 w-2" />
                </button>
                <span className="text-[7px] text-white/40 flex-1 truncate">
                  {targetBus?.name || `Bus ${i + 1}`}
                </span>
                <Slider
                  value={[send.level]}
                  onValueChange={([v]) => {
                    const newSends = [...channel.sends];
                    newSends[i] = { ...send, level: v };
                    onChange({ sends: newSends });
                  }}
                  min={0}
                  max={1}
                  step={0.01}
                  className="w-8"
                  disabled={!send.enabled}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-0.5 p-1 border-t border-white/5">
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onChange({ mute: !channel.mute });
          }}
          className={cn(
            "flex-1 h-5 rounded text-[9px] font-bold flex items-center justify-center",
            channel.mute
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white/60",
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          M
        </motion.button>

        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onChange({ solo: !channel.solo });
          }}
          className={cn(
            "flex-1 h-5 rounded text-[9px] font-bold flex items-center justify-center",
            channel.solo
              ? "bg-yellow-500 text-black"
              : "bg-white/10 text-white/60",
          )}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          S
        </motion.button>
      </div>

      <motion.button
        className={cn(
          "mx-1 mb-1 h-4 rounded text-[8px] flex items-center justify-center",
          channel.armed
            ? "bg-red-600 text-white animate-pulse"
            : "bg-white/5 text-white/30",
        )}
        onClick={(e) => {
          e.stopPropagation();
          onChange({ armed: !channel.armed });
        }}
        whileHover={{ scale: 1.02 }}
      >
        REC
      </motion.button>
    </motion.div>
  );
}

interface BusStripProps {
  bus: BusChannel;
  width: number;
  showInserts: boolean;
  onChange: (updates: Partial<BusChannel>) => void;
}

function BusStrip({ bus, width, showInserts, onChange }: BusStripProps) {
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingFader) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!faderRef.current) return;
      const rect = faderRef.current.getBoundingClientRect();
      const y =
        1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onChange({ volume: y });
    };

    const handleMouseUp = () => setIsDraggingFader(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFader, onChange]);

  const dbValue = bus.volume > 0 ? 20 * Math.log10(bus.volume) : -Infinity;
  const dbDisplay = dbValue === -Infinity ? "-∞" : dbValue.toFixed(1);

  return (
    <div
      className="flex flex-col bg-black/40 rounded-lg border border-orange-500/20 overflow-hidden"
      style={{ width }}
    >
      <div className="h-6 flex items-center justify-center text-[10px] font-bold bg-orange-500/20 text-orange-400">
        {bus.name}
      </div>

      {showInserts && (
        <div className="p-1 space-y-0.5 border-b border-white/5">
          {bus.inserts.slice(0, 4).map((insert) => (
            <div
              key={insert.id}
              className={cn(
                "w-full h-4 rounded text-[8px] truncate px-1 flex items-center",
                insert.pluginId
                  ? insert.enabled
                    ? "bg-orange-500/20 text-orange-400"
                    : "bg-slate-700 text-white/40"
                  : "bg-white/5 text-white/20",
              )}
            >
              {insert.pluginName || "—"}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-0.5 mx-1 my-1">
        <MeterBar level={bus.meterLevel[0]} color="#f97316" />
        <MeterBar level={bus.meterLevel[1]} color="#f97316" />
      </div>

      <div
        ref={faderRef}
        className="mx-1 my-1 relative bg-black/60 rounded cursor-ns-resize"
        style={{ height: FADER_HEIGHT }}
        onMouseDown={() => setIsDraggingFader(true)}
      >
        <div className="absolute inset-x-0.5 inset-y-0.5 bg-gradient-to-t from-slate-800 to-slate-700 rounded" />
        <motion.div
          className="absolute left-0.5 right-0.5 h-4 rounded-sm bg-gradient-to-b from-orange-400 to-orange-500 shadow-lg"
          style={{
            bottom: `${bus.volume * 100}%`,
            transform: "translateY(50%)",
          }}
        />
      </div>

      <div className="text-[9px] text-white/60 text-center font-mono py-0.5">
        {dbDisplay} dB
      </div>

      <div className="flex gap-0.5 p-1">
        <motion.button
          onClick={() => onChange({ mute: !bus.mute })}
          className={cn(
            "flex-1 h-5 rounded text-[9px] font-bold flex items-center justify-center",
            bus.mute ? "bg-red-500 text-white" : "bg-white/10 text-white/60",
          )}
          whileTap={{ scale: 0.95 }}
        >
          M
        </motion.button>

        <motion.button
          onClick={() => onChange({ solo: !bus.solo })}
          className={cn(
            "flex-1 h-5 rounded text-[9px] font-bold flex items-center justify-center",
            bus.solo ? "bg-yellow-500 text-black" : "bg-white/10 text-white/60",
          )}
          whileTap={{ scale: 0.95 }}
        >
          S
        </motion.button>
      </div>
    </div>
  );
}

interface MasterStripProps {
  channel: MixerChannel;
  width: number;
  showInserts: boolean;
  onChange: (updates: Partial<MixerChannel>) => void;
}

function MasterStrip({
  channel,
  width,
  showInserts,
  onChange,
}: MasterStripProps) {
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDraggingFader) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!faderRef.current) return;
      const rect = faderRef.current.getBoundingClientRect();
      const y =
        1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      onChange({ volume: y });
    };

    const handleMouseUp = () => setIsDraggingFader(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingFader, onChange]);

  const dbValue =
    channel.volume > 0 ? 20 * Math.log10(channel.volume) : -Infinity;
  const dbDisplay = dbValue === -Infinity ? "-∞" : dbValue.toFixed(1);

  return (
    <div
      className="flex flex-col bg-black/40 rounded-lg border-2 border-indigo-500/30 overflow-hidden"
      style={{ width }}
    >
      <div className="h-7 flex items-center justify-center text-[11px] font-bold bg-indigo-500/20 text-indigo-300">
        MASTER
      </div>

      {showInserts && (
        <div className="p-1 space-y-0.5 border-b border-white/5">
          {channel.inserts.slice(0, 4).map((insert) => (
            <div
              key={insert.id}
              className={cn(
                "w-full h-4 rounded text-[8px] truncate px-1 flex items-center",
                insert.pluginId
                  ? insert.enabled
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-slate-700 text-white/40"
                  : "bg-white/5 text-white/20",
              )}
            >
              {insert.pluginName || "—"}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 mx-1 my-2">
        <MeterBar
          level={channel.meterLevel[0]}
          peak={channel.peakLevel[0]}
          color="#818cf8"
          height={24}
        />
        <MeterBar
          level={channel.meterLevel[1]}
          peak={channel.peakLevel[1]}
          color="#818cf8"
          height={24}
        />
      </div>

      <div
        ref={faderRef}
        className="mx-1 my-1 relative bg-black/60 rounded cursor-ns-resize"
        style={{ height: FADER_HEIGHT + 20 }}
        onMouseDown={() => setIsDraggingFader(true)}
      >
        <div className="absolute inset-x-0.5 inset-y-0.5 bg-gradient-to-t from-slate-800 to-slate-700 rounded overflow-hidden">
          {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((i) => (
            <div
              key={i}
              className="absolute w-full h-px bg-white/10"
              style={{ top: `${i}%` }}
            />
          ))}
        </div>
        <motion.div
          className="absolute left-0.5 right-0.5 h-5 rounded-sm bg-gradient-to-b from-indigo-400 to-indigo-500 shadow-lg"
          style={{
            bottom: `${channel.volume * 100}%`,
            transform: "translateY(50%)",
          }}
        />
      </div>

      <div className="text-[10px] text-white font-mono text-center py-1 bg-black/20">
        {dbDisplay} dB
      </div>

      <div className="flex gap-0.5 p-1">
        <motion.button
          onClick={() => onChange({ mute: !channel.mute })}
          className={cn(
            "flex-1 h-6 rounded text-[10px] font-bold flex items-center justify-center",
            channel.mute
              ? "bg-red-500 text-white"
              : "bg-white/10 text-white/60",
          )}
          whileTap={{ scale: 0.95 }}
        >
          M
        </motion.button>
      </div>
    </div>
  );
}

function MeterBar({
  level,
  peak,
  color,
  height = 16,
}: {
  level: number;
  peak?: number;
  color: string;
  height?: number;
}) {
  const segments = 20;
  const activeSegments = Math.floor(level * segments);
  const peakSegment = peak ? Math.floor(peak * segments) : -1;

  return (
    <div
      className="flex-1 flex flex-col-reverse gap-px bg-black/40 rounded p-0.5"
      style={{ height: `${height * 4}px` }}
    >
      {Array.from({ length: segments }).map((_, i) => {
        const isActive = i < activeSegments;
        const isPeakHold = i === peakSegment - 1;
        const isPeak = i >= segments - 2;
        const isWarn = i >= segments - 5 && i < segments - 2;

        let segmentColor = color;
        if (isPeak) segmentColor = "#ef4444";
        else if (isWarn) segmentColor = "#eab308";

        return (
          <motion.div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              backgroundColor:
                isActive || isPeakHold
                  ? segmentColor
                  : "rgba(255,255,255,0.05)",
              opacity: isActive ? 1 : isPeakHold ? 0.8 : 0.3,
            }}
            animate={{
              scaleY: isActive ? 1 : 0.8,
            }}
            transition={{ duration: 0.05 }}
          />
        );
      })}
    </div>
  );
}
