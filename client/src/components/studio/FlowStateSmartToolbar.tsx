import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Scissors,
  Copy,
  Clipboard,
  Trash2,
  Volume2,
  VolumeX,
  Mic,
  Wand2,
  Layers,
  Music,
  ArrowUpDown,
  Maximize,
  Minimize,
  RotateCcw,
  Clock,
  Sparkles,
  Sliders,
  Palette,
  Split,
  Merge,
  Activity,
  GitBranch,
} from "lucide-react";
import type { SelectionType } from "@/hooks/useFlowStateAdapter";
import { cn } from "@/lib/utils";

interface ToolbarAction {
  id: string;
  icon: React.ElementType;
  label: string;
  suggested?: boolean;
  group?: string;
}

interface FlowStateSmartToolbarProps {
  selectionType: SelectionType;
  selectedTrackId: string | null;
  selectedClipId: string | null;
  onAction?: (actionId: string) => void;
}

const TRACK_ACTIONS: ToolbarAction[] = [
  { id: "duplicate", icon: Copy, label: "Duplicate" },
  { id: "delete", icon: Trash2, label: "Delete" },
  { id: "mute", icon: VolumeX, label: "Mute" },
  { id: "solo", icon: Volume2, label: "Solo" },
  { id: "arm", icon: Mic, label: "Arm" },
  { id: "analyze", icon: Activity, label: "Analyze", suggested: true },
  {
    id: "stem-separate",
    icon: GitBranch,
    label: "Separate Stems",
    suggested: true,
  },
  { id: "color", icon: Palette, label: "Color", group: "appearance" },
  { id: "height", icon: ArrowUpDown, label: "Height", group: "appearance" },
  { id: "ai-process", icon: Wand2, label: "AI Process", suggested: true },
];

const CLIP_ACTIONS: ToolbarAction[] = [
  { id: "cut", icon: Scissors, label: "Cut" },
  { id: "copy", icon: Copy, label: "Copy" },
  { id: "paste", icon: Clipboard, label: "Paste" },
  { id: "delete", icon: Trash2, label: "Delete" },
  { id: "split", icon: Split, label: "Split" },
  { id: "merge", icon: Merge, label: "Merge" },
  { id: "reverse", icon: RotateCcw, label: "Reverse" },
  { id: "stretch", icon: Clock, label: "Time Stretch" },
  { id: "analyze", icon: Activity, label: "Analyze", suggested: true },
  { id: "ai-enhance", icon: Sparkles, label: "AI Enhance", suggested: true },
];

const RANGE_ACTIONS: ToolbarAction[] = [
  { id: "cut", icon: Scissors, label: "Cut" },
  { id: "copy", icon: Copy, label: "Copy" },
  { id: "delete", icon: Trash2, label: "Delete" },
  { id: "loop", icon: RotateCcw, label: "Loop Selection" },
  { id: "normalize", icon: Maximize, label: "Normalize" },
  { id: "fade", icon: Minimize, label: "Fade" },
  { id: "ai-fill", icon: Wand2, label: "AI Fill", suggested: true },
];

const MIDI_ACTIONS: ToolbarAction[] = [
  { id: "cut", icon: Scissors, label: "Cut" },
  { id: "copy", icon: Copy, label: "Copy" },
  { id: "delete", icon: Trash2, label: "Delete" },
  { id: "quantize", icon: Layers, label: "Quantize" },
  { id: "transpose", icon: ArrowUpDown, label: "Transpose" },
  { id: "velocity", icon: Sliders, label: "Velocity" },
  { id: "humanize", icon: Sparkles, label: "Humanize", suggested: true },
];

const AUTOMATION_ACTIONS: ToolbarAction[] = [
  { id: "draw", icon: Music, label: "Draw" },
  { id: "smooth", icon: Wand2, label: "Smooth" },
  { id: "clear", icon: Trash2, label: "Clear" },
  { id: "copy", icon: Copy, label: "Copy" },
  { id: "paste", icon: Clipboard, label: "Paste" },
  { id: "ai-generate", icon: Sparkles, label: "AI Generate", suggested: true },
];

export function FlowStateSmartToolbar({
  selectionType,
  selectedTrackId,
  selectedClipId,
  onAction,
}: FlowStateSmartToolbarProps) {
  const actions = useMemo(() => {
    switch (selectionType) {
      case "track":
        return TRACK_ACTIONS;
      case "clip":
        return CLIP_ACTIONS;
      case "range":
        return RANGE_ACTIONS;
      case "midi":
        return MIDI_ACTIONS;
      case "automation":
        return AUTOMATION_ACTIONS;
      default:
        return [];
    }
  }, [selectionType]);

  if (actions.length === 0) {
    return (
      <div className="h-10 border-b border-white/5 bg-black/20 flex items-center px-4">
        <span className="text-xs text-white/30">
          Select a track or clip to see available actions
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-12 border-b border-white/5 bg-gradient-to-r from-black/30 via-black/20 to-black/30 flex items-center px-4 gap-1"
    >
      <span className="text-[10px] text-white/40 uppercase tracking-wider mr-3 capitalize">
        {selectionType}
      </span>

      <div className="flex items-center gap-1">
        {actions.map((action, index) => (
          <motion.button
            key={action.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onAction?.(action.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
              action.suggested
                ? "bg-gradient-to-r from-purple-600/80 to-pink-600/80 text-white hover:from-purple-500 hover:to-pink-500"
                : "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <action.icon className="w-3.5 h-3.5" />
            <span>{action.label}</span>
            {action.suggested && (
              <Sparkles className="w-3 h-3 text-yellow-300 animate-pulse" />
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
