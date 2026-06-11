import {
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Music,
  Wand2,
  Sliders,
  Layers,
  Volume2,
  Copy,
  Trash2,
  Download,
  Users,
  Cloud,
  GitBranch,
  Undo,
  Redo,
  Info,
  X,
  ChevronRight,
  Play,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type OutcomeType =
  | "generation_progress"
  | "generation_complete"
  | "generation_failed"
  | "style_transfer"
  | "ai_suggestions"
  | "mix_applied"
  | "master_applied"
  | "processing_progress"
  | "processing_failed"
  | "track_added"
  | "track_deleted"
  | "track_duplicated"
  | "track_bounced"
  | "plugin_loaded"
  | "plugin_error"
  | "preset_applied"
  | "preset_saved"
  | "collaborator_joined"
  | "sync_progress"
  | "conflict_resolution"
  | "session_saved"
  | "export_progress"
  | "export_complete"
  | "export_failed"
  | "undo"
  | "redo";

export interface StudioOutcome {
  id: string;
  type: OutcomeType;
  title: string;
  description?: string;
  progress?: number;
  data?: Record<string, any>;
  timestamp: Date;
  duration?: number;
  onAction?: () => void;
  actionLabel?: string;
  onDismiss?: () => void;
}

interface StudioOutcomeContextType {
  outcomes: StudioOutcome[];
  addOutcome: (outcome: Omit<StudioOutcome, "id" | "timestamp">) => string;
  updateOutcome: (id: string, updates: Partial<StudioOutcome>) => void;
  removeOutcome: (id: string) => void;
  clearOutcomes: () => void;
}

const StudioOutcomeContext = createContext<StudioOutcomeContextType | null>(
  null,
);

export function useStudioOutcome() {
  const context = useContext(StudioOutcomeContext);
  if (!context) {
    throw new Error(
      "useStudioOutcome must be used within StudioOutcomeProvider",
    );
  }
  return context;
}

interface StudioOutcomeProviderProps {
  children: ReactNode;
}

export function StudioOutcomeProvider({
  children,
}: StudioOutcomeProviderProps) {
  const [outcomes, setOutcomes] = useState<StudioOutcome[]>([]);

  const addOutcome = useCallback(
    (outcome: Omit<StudioOutcome, "id" | "timestamp">): string => {
      const id = `outcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newOutcome: StudioOutcome = {
        ...outcome,
        id,
        timestamp: new Date(),
      };
      setOutcomes((prev) => [newOutcome, ...prev].slice(0, 10));

      if (outcome.duration) {
        setTimeout(() => {
          setOutcomes((prev) => prev.filter((o) => o.id !== id));
        }, outcome.duration);
      }

      return id;
    },
    [],
  );

  const updateOutcome = useCallback(
    (id: string, updates: Partial<StudioOutcome>) => {
      setOutcomes((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...updates } : o)),
      );
    },
    [],
  );

  const removeOutcome = useCallback((id: string) => {
    setOutcomes((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const clearOutcomes = useCallback(() => {
    setOutcomes([]);
  }, []);

  return (
    <StudioOutcomeContext.Provider
      value={{
        outcomes,
        addOutcome,
        updateOutcome,
        removeOutcome,
        clearOutcomes,
      }}
    >
      {children}
    </StudioOutcomeContext.Provider>
  );
}

const getOutcomeIcon = (type: OutcomeType) => {
  const iconMap: Record<OutcomeType, any> = {
    generation_progress: Wand2,
    generation_complete: Music,
    generation_failed: XCircle,
    style_transfer: Layers,
    ai_suggestions: Wand2,
    mix_applied: Sliders,
    master_applied: Volume2,
    processing_progress: Activity,
    processing_failed: XCircle,
    track_added: Music,
    track_deleted: Trash2,
    track_duplicated: Copy,
    track_bounced: Download,
    plugin_loaded: CheckCircle,
    plugin_error: AlertTriangle,
    preset_applied: CheckCircle,
    preset_saved: CheckCircle,
    collaborator_joined: Users,
    sync_progress: Cloud,
    conflict_resolution: GitBranch,
    session_saved: Cloud,
    export_progress: Download,
    export_complete: CheckCircle,
    export_failed: XCircle,
    undo: Undo,
    redo: Redo,
  };
  return iconMap[type] || Info;
};

const getOutcomeColor = (type: OutcomeType) => {
  if (type.includes("failed") || type === "plugin_error")
    return "from-red-500 to-red-600";
  if (type.includes("progress") || type === "sync_progress")
    return "from-blue-500 to-cyan-500";
  if (
    type.includes("complete") ||
    type.includes("applied") ||
    type.includes("saved") ||
    type === "plugin_loaded"
  )
    return "from-green-500 to-emerald-500";
  if (
    type === "generation_progress" ||
    type === "style_transfer" ||
    type === "ai_suggestions"
  )
    return "from-purple-500 to-pink-500";
  if (type.includes("track")) return "from-amber-500 to-orange-500";
  if (type.includes("collaborator") || type === "conflict_resolution")
    return "from-violet-500 to-purple-500";
  return "from-zinc-500 to-zinc-600";
};

interface OutcomeCardProps {
  outcome: StudioOutcome;
  onDismiss: () => void;
}

function OutcomeCard({ outcome, onDismiss }: OutcomeCardProps) {
  const Icon = getOutcomeIcon(outcome.type);
  const colorClass = getOutcomeColor(outcome.type);
  const isProgress =
    outcome.type.includes("progress") || outcome.progress !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-xl p-4 shadow-2xl min-w-[320px] max-w-[400px]"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            "bg-gradient-to-br",
            colorClass,
          )}
        >
          {isProgress &&
          outcome.progress !== undefined &&
          outcome.progress < 100 ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Icon className="w-5 h-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-semibold text-white text-sm truncate">
              {outcome.title}
            </h4>
            <button
              onClick={onDismiss}
              className="text-zinc-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {outcome.description && (
            <p className="text-xs text-zinc-400 mt-1">{outcome.description}</p>
          )}

          {outcome.progress !== undefined && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Progress</span>
                <span>{Math.round(outcome.progress)}%</span>
              </div>
              <Progress value={outcome.progress} className="h-1.5" />
            </div>
          )}

          {outcome.data?.lufs !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <div className="px-2 py-1 bg-zinc-800 rounded text-xs font-mono text-green-400">
                {outcome.data.lufs.toFixed(1)} LUFS
              </div>
              {outcome.data.truePeak !== undefined && (
                <div className="px-2 py-1 bg-zinc-800 rounded text-xs font-mono text-amber-400">
                  {outcome.data.truePeak.toFixed(1)} dBTP
                </div>
              )}
            </div>
          )}

          {outcome.data?.waveform && (
            <div className="mt-2 h-8 bg-zinc-800 rounded overflow-hidden">
              <div className="h-full flex items-center justify-center gap-px px-2">
                {(outcome.data.waveform as number[])
                  .slice(0, 50)
                  .map((val, i) => (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-green-500 to-emerald-400 rounded-full"
                      style={{ height: `${val * 100}%` }}
                    />
                  ))}
              </div>
            </div>
          )}

          {outcome.data?.previewUrl && (
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs h-8"
              >
                <Play className="w-3 h-3 mr-1" />
                Preview
              </Button>
            </div>
          )}

          {outcome.onAction && outcome.actionLabel && (
            <Button
              size="sm"
              onClick={outcome.onAction}
              className="mt-2 w-full text-xs h-8"
            >
              {outcome.actionLabel}
              <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface StudioOutcomeDisplayProps {
  position?: "top-right" | "bottom-right" | "bottom-left" | "top-left";
  maxVisible?: number;
}

export function StudioOutcomeDisplay({
  position = "bottom-right",
  maxVisible = 5,
}: StudioOutcomeDisplayProps) {
  const { outcomes, removeOutcome } = useStudioOutcome();

  const positionClasses = {
    "top-right": "top-4 right-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-left": "top-4 left-4",
  };

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col gap-2",
        positionClasses[position],
      )}
    >
      <AnimatePresence mode="popLayout">
        {outcomes.slice(0, maxVisible).map((outcome) => (
          <OutcomeCard
            key={outcome.id}
            outcome={outcome}
            onDismiss={() => removeOutcome(outcome.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useStudioOutcomeHelpers() {
  const { addOutcome, updateOutcome, removeOutcome } = useStudioOutcome();
  useToast();

  const showGenerationProgress = useCallback(
    (title: string, progress: number) => {
      return addOutcome({
        type: "generation_progress",
        title,
        description: "AI is generating your music...",
        progress,
      });
    },
    [addOutcome],
  );

  const showGenerationComplete = useCallback(
    (title: string, data?: Record<string, any>) => {
      return addOutcome({
        type: "generation_complete",
        title,
        description: "Your AI-generated music is ready!",
        data,
        duration: 8000,
        actionLabel: "Add to Project",
      });
    },
    [addOutcome],
  );

  const showMixApplied = useCallback(
    (title: string, data?: { lufs?: number; truePeak?: number }) => {
      return addOutcome({
        type: "mix_applied",
        title,
        description: "Mix settings have been applied",
        data,
        duration: 5000,
      });
    },
    [addOutcome],
  );

  const showMasterApplied = useCallback(
    (lufs: number, truePeak: number) => {
      return addOutcome({
        type: "master_applied",
        title: "Master Applied",
        description: "Your track has been mastered",
        data: { lufs, truePeak },
        duration: 6000,
      });
    },
    [addOutcome],
  );

  const showTrackAdded = useCallback(
    (trackName: string) => {
      return addOutcome({
        type: "track_added",
        title: "Track Added",
        description: `"${trackName}" has been added to your project`,
        duration: 3000,
      });
    },
    [addOutcome],
  );

  const showTrackDeleted = useCallback(
    (trackName: string, onUndo?: () => void) => {
      return addOutcome({
        type: "track_deleted",
        title: "Track Deleted",
        description: `"${trackName}" has been removed`,
        duration: 5000,
        actionLabel: onUndo ? "Undo" : undefined,
        onAction: onUndo,
      });
    },
    [addOutcome],
  );

  const showPluginLoaded = useCallback(
    (pluginName: string) => {
      return addOutcome({
        type: "plugin_loaded",
        title: "Plugin Loaded",
        description: `${pluginName} is ready to use`,
        duration: 3000,
      });
    },
    [addOutcome],
  );

  const showPluginError = useCallback(
    (pluginName: string, error: string) => {
      return addOutcome({
        type: "plugin_error",
        title: "Plugin Error",
        description: `Failed to load ${pluginName}: ${error}`,
        duration: 6000,
      });
    },
    [addOutcome],
  );

  const showCollaboratorJoined = useCallback(
    (name: string) => {
      return addOutcome({
        type: "collaborator_joined",
        title: "Collaborator Joined",
        description: `${name} has joined the session`,
        duration: 4000,
      });
    },
    [addOutcome],
  );

  const showExportProgress = useCallback(
    (filename: string, progress: number, format: string) => {
      return addOutcome({
        type: "export_progress",
        title: `Exporting ${filename}`,
        description: `Format: ${format.toUpperCase()}`,
        progress,
      });
    },
    [addOutcome],
  );

  const showExportComplete = useCallback(
    (filename: string, downloadUrl: string) => {
      return addOutcome({
        type: "export_complete",
        title: "Export Complete",
        description: `${filename} is ready for download`,
        duration: 8000,
        actionLabel: "Download",
        onAction: () => window.open(downloadUrl, "_blank"),
      });
    },
    [addOutcome],
  );

  const showUndoAction = useCallback(
    (actionName: string) => {
      return addOutcome({
        type: "undo",
        title: "Undo",
        description: `Reverted: ${actionName}`,
        duration: 2000,
      });
    },
    [addOutcome],
  );

  const showRedoAction = useCallback(
    (actionName: string) => {
      return addOutcome({
        type: "redo",
        title: "Redo",
        description: `Restored: ${actionName}`,
        duration: 2000,
      });
    },
    [addOutcome],
  );

  return {
    showGenerationProgress,
    showGenerationComplete,
    showMixApplied,
    showMasterApplied,
    showTrackAdded,
    showTrackDeleted,
    showPluginLoaded,
    showPluginError,
    showCollaboratorJoined,
    showExportProgress,
    showExportComplete,
    showUndoAction,
    showRedoAction,
    updateOutcome,
    removeOutcome,
  };
}

export default StudioOutcomeDisplay;
