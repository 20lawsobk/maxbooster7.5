// @ts-nocheck
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Copy, Trash2, Download, Music, Mic, Drum, Guitar, Piano, Waves, Loader2, AlertTriangle, Undo, Volume2, Layers, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Track {
  id: string;
  name: string;
  type: "audio" | "midi" | "aux" | "bus" | "folder";
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

interface TrackOutcome {
  type: "added" | "deleted" | "duplicated" | "bounced";
  track: Track;
  timestamp: Date;
  canUndo: boolean;
}

interface TrackManagementProps {
  tracks: Track[];
  onAddTrack: (track: Omit<Track, "id">) => Promise<Track>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onDuplicateTrack: (trackId: string) => Promise<Track>;
  onBounceTrack: (trackId: string, options: BounceOptions) => Promise<string>;
  onUndo: (outcome: TrackOutcome) => Promise<void>;
  className?: string;
}

interface BounceOptions {
  format: "wav" | "mp3" | "flac";
  normalize: boolean;
  includeEffects: boolean;
  startTime?: number;
  endTime?: number;
}

const TRACK_TYPES = [
  {
    id: "audio",
    name: "Audio",
    icon: Waves,
    description: "Record or import audio",
  },
  {
    id: "midi",
    name: "MIDI",
    icon: Piano,
    description: "Virtual instruments & MIDI",
  },
  {
    id: "aux",
    name: "Aux",
    icon: Volume2,
    description: "Send effects & buses",
  },
  {
    id: "bus",
    name: "Bus",
    icon: Layers,
    description: "Group tracks together",
  },
  {
    id: "folder",
    name: "Folder",
    icon: FolderPlus,
    description: "Organize tracks",
  },
];

const TRACK_PRESETS = [
  { name: "Vocals", type: "audio", color: "#f43f5e", icon: Mic },
  { name: "Drums", type: "audio", color: "#f97316", icon: Drum },
  { name: "Bass", type: "audio", color: "#8b5cf6", icon: Music },
  { name: "Guitar", type: "audio", color: "#22c55e", icon: Guitar },
  { name: "Synth", type: "midi", color: "#06b6d4", icon: Piano },
  { name: "Pad", type: "midi", color: "#6366f1", icon: Waves },
];

const COLORS = [
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

export function TrackManagementOutcomes({
  _tracks,
  onAddTrack,
  onDeleteTrack,
  onDuplicateTrack,
  onBounceTrack,
  onUndo,
  className,
}: TrackManagementProps) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBounceDialog, setShowBounceDialog] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [recentOutcomes, setRecentOutcomes] = useState<TrackOutcome[]>([]);

  const [newTrack, setNewTrack] = useState({
    name: "",
    type: "audio" as Track["type"],
    color: COLORS[0],
  });

  const [bounceOptions, setBounceOptions] = useState<BounceOptions>({
    format: "wav",
    normalize: true,
    includeEffects: true,
  });

  const handleAddTrack = useCallback(async () => {
    if (!newTrack.name.trim()) return;

    setIsProcessing(true);
    try {
      const track = await onAddTrack({
        name: newTrack.name,
        type: newTrack.type,
        color: newTrack.color,
        volume: 1,
        pan: 0,
        mute: false,
        solo: false,
      });

      const outcome: TrackOutcome = {
        type: "added",
        track,
        timestamp: new Date(),
        canUndo: true,
      };
      setRecentOutcomes((prev) => [outcome, ...prev].slice(0, 5));

      toast({
        title: "Track Added",
        description: (
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: track.color }}
            />
            <span>"{track.name}" has been added to your project</span>
          </div>
        ),
      });

      setShowAddDialog(false);
      setNewTrack({ name: "", type: "audio", color: COLORS[0] });
    } catch (error) {
      toast({
        title: "Failed to Add Track",
        description: "An error occurred while adding the track",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [newTrack, onAddTrack, toast]);

  const handleDeleteTrack = useCallback(async () => {
    if (!selectedTrack) return;

    setIsProcessing(true);
    try {
      await onDeleteTrack(selectedTrack.id);

      const outcome: TrackOutcome = {
        type: "deleted",
        track: selectedTrack,
        timestamp: new Date(),
        canUndo: true,
      };
      setRecentOutcomes((prev) => [outcome, ...prev].slice(0, 5));

      toast({
        title: "Track Deleted",
        description: (
          <div className="flex items-center justify-between w-full">
            <span>"{selectedTrack.name}" has been removed</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => onUndo(outcome)}
            >
              <Undo className="w-3 h-3 mr-1" />
              Undo
            </Button>
          </div>
        ),
      });

      setShowDeleteDialog(false);
      setSelectedTrack(null);
    } catch (error) {
      toast({
        title: "Failed to Delete Track",
        description: "An error occurred while deleting the track",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTrack, onDeleteTrack, onUndo, toast]);

  useCallback(
    async (track: Track) => {
      setIsProcessing(true);
      try {
        const duplicated = await onDuplicateTrack(track.id);

        const outcome: TrackOutcome = {
          type: "duplicated",
          track: duplicated,
          timestamp: new Date(),
          canUndo: true,
        };
        setRecentOutcomes((prev) => [outcome, ...prev].slice(0, 5));

        toast({
          title: "Track Duplicated",
          description: (
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-green-400" />
              <span>
                "{track.name}" duplicated as "{duplicated.name}"
              </span>
            </div>
          ),
        });
      } catch (error) {
        toast({
          title: "Failed to Duplicate Track",
          description: "An error occurred while duplicating the track",
          variant: "destructive",
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [onDuplicateTrack, toast],
  );

  const handleBounceTrack = useCallback(async () => {
    if (!selectedTrack) return;

    setIsProcessing(true);
    setBounceProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setBounceProgress((p) => Math.min(p + 5, 95));
      }, 200);

      const downloadUrl = await onBounceTrack(selectedTrack.id, bounceOptions);

      clearInterval(progressInterval);
      setBounceProgress(100);

      const outcome: TrackOutcome = {
        type: "bounced",
        track: selectedTrack,
        timestamp: new Date(),
        canUndo: false,
      };
      setRecentOutcomes((prev) => [outcome, ...prev].slice(0, 5));

      toast({
        title: "Track Bounced",
        description: (
          <div className="flex items-center justify-between w-full">
            <span>"{selectedTrack.name}" exported successfully</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs"
              onClick={() => window.open(downloadUrl, "_blank")}
            >
              <Download className="w-3 h-3 mr-1" />
              Download
            </Button>
          </div>
        ),
      });

      setShowBounceDialog(false);
      setSelectedTrack(null);
    } catch (error) {
      toast({
        title: "Bounce Failed",
        description: "An error occurred while bouncing the track",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setBounceProgress(0);
    }
  }, [selectedTrack, bounceOptions, onBounceTrack, toast]);

  const handleTrackSelect = (track: Track) => {
    setSelectedTrack(track);
    setShowDeleteDialog(true);
  });

  ((track: Track) => {
    setSelectedTrack(track);
    setShowBounceDialog(true);
  });

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-gradient-to-r from-green-600 to-emerald-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Track
        </Button>
      </div>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-400" />
              Add New Track
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Track Name</Label>
              <Input
                value={newTrack.name}
                onChange={(e) =>
                  setNewTrack((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="Enter track name..."
                className="bg-zinc-900 border-zinc-700"
              />
            </div>

            <div className="space-y-2">
              <Label>Track Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRACK_TYPES.map((type) => {
                  const Icon = type.icon;
                  return (
                    <button
                      key={type.id}
                      onClick={() =>
                        setNewTrack((s) => ({
                          ...s,
                          type: type.id as Track["type"],
                        }))
                      }
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        newTrack.type === type.id
                          ? "border-green-500 bg-green-500/10"
                          : "border-zinc-700 hover:border-zinc-600",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-zinc-400" />
                        <span className="font-medium text-sm">{type.name}</span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        {type.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quick Presets</Label>
              <div className="flex flex-wrap gap-2">
                {TRACK_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={preset.name}
                      onClick={() =>
                        setNewTrack({
                          name: preset.name,
                          type: preset.type as Track["type"],
                          color: preset.color,
                        })
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: preset.color }}
                      />
                      <Icon className="w-3 h-3" />
                      <span className="text-xs">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTrack((s) => ({ ...s, color }))}
                    className={cn(
                      "w-8 h-8 rounded-lg transition-transform",
                      newTrack.color === color && "scale-110 ring-2 ring-white",
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddTrack}
              disabled={!newTrack.name.trim() || isProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Track
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Delete Track
            </DialogTitle>
          </DialogHeader>

          {selectedTrack && (
            <div className="py-4">
              <p className="text-zinc-300">
                Are you sure you want to delete "{selectedTrack.name}"?
              </p>
              <p className="text-sm text-zinc-500 mt-2">
                This action can be undone within the next few minutes.
              </p>

              <div className="mt-4 p-3 bg-zinc-900 rounded-lg flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: selectedTrack.color }}
                />
                <div>
                  <div className="font-medium text-sm">
                    {selectedTrack.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {selectedTrack.type} track
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteTrack}
              disabled={isProcessing}
              variant="destructive"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Track
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBounceDialog} onOpenChange={setShowBounceDialog}>
        <DialogContent className="max-w-md bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="w-5 h-5 text-blue-400" />
              Bounce Track
            </DialogTitle>
          </DialogHeader>

          {selectedTrack && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-zinc-900 rounded-lg flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: selectedTrack.color }}
                />
                <div>
                  <div className="font-medium text-sm">
                    {selectedTrack.name}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Export as audio file
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Format</Label>
                <Select
                  value={bounceOptions.format}
                  onValueChange={(v) =>
                    setBounceOptions((s) => ({
                      ...s,
                      format: v as "wav" | "mp3" | "flac",
                    }))
                  }
                >
                  <SelectTrigger className="bg-zinc-900 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wav">WAV (Uncompressed)</SelectItem>
                    <SelectItem value="mp3">MP3 (320kbps)</SelectItem>
                    <SelectItem value="flac">FLAC (Lossless)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Normalize</Label>
                  <input
                    type="checkbox"
                    checked={bounceOptions.normalize}
                    onChange={(e) =>
                      setBounceOptions((s) => ({
                        ...s,
                        normalize: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Include Effects</Label>
                  <input
                    type="checkbox"
                    checked={bounceOptions.includeEffects}
                    onChange={(e) =>
                      setBounceOptions((s) => ({
                        ...s,
                        includeEffects: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                </div>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Bouncing...</span>
                    <span className="font-mono">{bounceProgress}%</span>
                  </div>
                  <Progress value={bounceProgress} className="h-2" />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBounceDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBounceTrack}
              disabled={isProcessing}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Bounce
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {recentOutcomes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-3 bg-zinc-900/50 rounded-lg space-y-2"
          >
            <h4 className="text-xs font-medium text-zinc-500 uppercase">
              Recent Actions
            </h4>
            {recentOutcomes.slice(0, 3).map((outcome, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {outcome.type === "added" && (
                  <Plus className="w-3 h-3 text-green-400" />
                )}
                {outcome.type === "deleted" && (
                  <Trash2 className="w-3 h-3 text-red-400" />
                )}
                {outcome.type === "duplicated" && (
                  <Copy className="w-3 h-3 text-blue-400" />
                )}
                {outcome.type === "bounced" && (
                  <Download className="w-3 h-3 text-purple-400" />
                )}
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: outcome.track.color }}
                />
                <span className="text-zinc-400">{outcome.track.name}</span>
                <span className="text-zinc-600 ml-auto text-xs">
                  {outcome.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TrackManagementOutcomes;
