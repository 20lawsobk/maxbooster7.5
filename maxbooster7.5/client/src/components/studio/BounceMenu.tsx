import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  ChevronDown,
  FileAudio,
  Wand2,
  Snowflake,
  Flame,
  Copy,
  Scissors,
  Merge,
  Download,
  Loader2,
} from "lucide-react";

interface BounceMenuProps {
  selectedClipIds?: string[];
  selectedTrackId?: string | null;
  projectId?: string;
  onBounceSelection?: (options: BounceOptions) => void;
  onBounceToNewTrack?: (options: BounceOptions) => void;
  onTransformToRendered?: (trackId: string) => void;
  onMixdownSelection?: (options: BounceOptions) => void;
  onExportSelection?: (options: BounceOptions) => void;
  disabled?: boolean;
}

interface BounceOptions {
  includeInsertEffects: boolean;
  includeSendEffects: boolean;
  includeAutomation: boolean;
  tailLength: number;
  normalize: boolean;
  bitDepth: number;
  sampleRate: number;
}

export function BounceMenu({
  selectedClipIds = [],
  selectedTrackId,
  projectId,
  onBounceSelection,
  onBounceToNewTrack,
  onTransformToRendered,
  onMixdownSelection,
  onExportSelection,
  disabled = false,
}: BounceMenuProps) {
  const [showBounceDialog, setShowBounceDialog] = useState(false);
  const [bounceMode, setBounceMode] = useState<
    "selection" | "newTrack" | "mixdown" | "export"
  >("selection");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [options, setOptions] = useState<BounceOptions>({
    includeInsertEffects: true,
    includeSendEffects: false,
    includeAutomation: true,
    tailLength: 0,
    normalize: false,
    bitDepth: 24,
    sampleRate: 48000,
  });

  const hasSelection = selectedClipIds.length > 0;
  const hasTrack = !!selectedTrackId;

  const handleBounce = async () => {
    setIsProcessing(true);
    setProgress(0);

    const progressInterval = setInterval(() => {
      setProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      switch (bounceMode) {
        case "selection":
          await onBounceSelection?.(options);
          break;
        case "newTrack":
          await onBounceToNewTrack?.(options);
          break;
        case "mixdown":
          await onMixdownSelection?.(options);
          break;
        case "export":
          await onExportSelection?.(options);
          break;
      }
      setProgress(100);
    } finally {
      clearInterval(progressInterval);
      setTimeout(() => {
        setIsProcessing(false);
        setShowBounceDialog(false);
        setProgress(0);
      }, 500);
    }
  };

  const openBounceDialog = (
    mode: "selection" | "newTrack" | "mixdown" | "export",
  ) => {
    setBounceMode(mode);
    setShowBounceDialog(true);
  };

  const getModeTitle = () => {
    switch (bounceMode) {
      case "selection":
        return "Bounce Selection";
      case "newTrack":
        return "Bounce to New Track";
      case "mixdown":
        return "Mixdown Selection";
      case "export":
        return "Export Selection";
    }
  };

  const getModeDescription = () => {
    switch (bounceMode) {
      case "selection":
        return "Combines selected events on track, replacing originals with rendered audio";
      case "newTrack":
        return "Creates a new audio track with all insert effects rendered";
      case "mixdown":
        return "Mixes selected events from multiple tracks into a single stereo file";
      case "export":
        return "Exports selected events as separate files without placing them in the song";
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-gray-300 hover:text-white hover:bg-gray-700"
            disabled={disabled}
          >
            <Layers className="h-4 w-4" />
            Bounce
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 bg-[#252525] border-gray-700 text-white">
          <DropdownMenuLabel className="text-gray-400 text-xs">
            Audio Rendering
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-700" />

          <DropdownMenuItem
            onClick={() => openBounceDialog("selection")}
            disabled={!hasSelection}
            className="gap-2 hover:bg-gray-700 focus:bg-gray-700"
          >
            <Merge className="h-4 w-4 text-blue-400" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                Bounce Selection
                <Badge
                  variant="outline"
                  className="text-[10px] ml-2 border-gray-600"
                >
                  Ctrl+B
                </Badge>
              </div>
              <p className="text-[10px] text-gray-500">
                Combine events, replace originals
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openBounceDialog("newTrack")}
            disabled={!hasTrack}
            className="gap-2 hover:bg-gray-700 focus:bg-gray-700"
          >
            <Copy className="h-4 w-4 text-green-400" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                Bounce to New Track
                <Badge
                  variant="outline"
                  className="text-[10px] ml-2 border-gray-600"
                >
                  Ctrl+Alt+B
                </Badge>
              </div>
              <p className="text-[10px] text-gray-500">
                Render with effects to new track
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-gray-700" />

          <DropdownMenuItem
            onClick={() => openBounceDialog("mixdown")}
            disabled={!hasSelection}
            className="gap-2 hover:bg-gray-700 focus:bg-gray-700"
          >
            <FileAudio className="h-4 w-4 text-purple-400" />
            <div className="flex-1">
              <div>Mixdown Selection</div>
              <p className="text-[10px] text-gray-500">
                Mix multiple tracks to single file
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => openBounceDialog("export")}
            disabled={!hasSelection}
            className="gap-2 hover:bg-gray-700 focus:bg-gray-700"
          >
            <Download className="h-4 w-4 text-orange-400" />
            <div className="flex-1">
              <div>Export Selection</div>
              <p className="text-[10px] text-gray-500">
                Export without placing in song
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-gray-700" />

          <DropdownMenuLabel className="text-gray-400 text-xs">
            Track Rendering
          </DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() =>
              selectedTrackId && onTransformToRendered?.(selectedTrackId)
            }
            disabled={!hasTrack}
            className="gap-2 hover:bg-gray-700 focus:bg-gray-700"
          >
            <Snowflake className="h-4 w-4 text-cyan-400" />
            <div className="flex-1">
              <div>Transform to Rendered Audio</div>
              <p className="text-[10px] text-gray-500">
                Freeze track (reversible)
              </p>
            </div>
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2 hover:bg-gray-700 focus:bg-gray-700">
              <Wand2 className="h-4 w-4 text-yellow-400" />
              <div className="flex-1">
                <div>Quick Transform Options</div>
              </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-[#252525] border-gray-700 text-white">
              <DropdownMenuItem className="gap-2 hover:bg-gray-700 focus:bg-gray-700">
                <Flame className="h-4 w-4 text-red-400" />
                Unfreeze Track
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 hover:bg-gray-700 focus:bg-gray-700">
                <Scissors className="h-4 w-4 text-blue-400" />
                Render Event FX
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showBounceDialog} onOpenChange={setShowBounceDialog}>
        <DialogContent className="bg-[#1e1e1e] border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-400" />
              {getModeTitle()}
              <Badge variant="outline" className="ml-2 text-xs border-gray-600">
                Studio One Style
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {getModeDescription()}
            </DialogDescription>
          </DialogHeader>

          {isProcessing ? (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
              </div>
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-center text-sm text-gray-400">
                  {progress < 100 ? "Rendering audio..." : "Complete!"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              <div className="space-y-4 p-4 bg-[#252525] rounded-lg border border-gray-700">
                <div className="text-sm font-medium text-gray-300 mb-3">
                  Processing Options
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer hover:text-white text-gray-300">
                    <Checkbox
                      checked={options.includeInsertEffects}
                      onCheckedChange={(checked) =>
                        setOptions({
                          ...options,
                          includeInsertEffects: checked as boolean,
                        })
                      }
                    />
                    Include Insert Effects
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer hover:text-white text-gray-300">
                    <Checkbox
                      checked={options.includeSendEffects}
                      onCheckedChange={(checked) =>
                        setOptions({
                          ...options,
                          includeSendEffects: checked as boolean,
                        })
                      }
                    />
                    Include Send Effects
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer hover:text-white text-gray-300">
                    <Checkbox
                      checked={options.includeAutomation}
                      onCheckedChange={(checked) =>
                        setOptions({
                          ...options,
                          includeAutomation: checked as boolean,
                        })
                      }
                    />
                    Include Automation
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer hover:text-white text-gray-300">
                    <Checkbox
                      checked={options.normalize}
                      onCheckedChange={(checked) =>
                        setOptions({
                          ...options,
                          normalize: checked as boolean,
                        })
                      }
                    />
                    Normalize Output
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">
                    Tail Length (ms)
                  </Label>
                  <Select
                    value={options.tailLength.toString()}
                    onValueChange={(v) =>
                      setOptions({ ...options, tailLength: parseInt(v) })
                    }
                  >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
                      <SelectItem value="0">No Tail</SelectItem>
                      <SelectItem value="500">500 ms</SelectItem>
                      <SelectItem value="1000">1000 ms</SelectItem>
                      <SelectItem value="2000">2000 ms</SelectItem>
                      <SelectItem value="5000">5000 ms</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-gray-500">
                    For reverb/delay tails
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Bit Depth</Label>
                  <Select
                    value={options.bitDepth.toString()}
                    onValueChange={(v) =>
                      setOptions({ ...options, bitDepth: parseInt(v) })
                    }
                  >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
                      <SelectItem value="16">16-bit</SelectItem>
                      <SelectItem value="24">24-bit</SelectItem>
                      <SelectItem value="32">32-bit Float</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-gray-600 hover:bg-gray-800"
                  onClick={() => setShowBounceDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={handleBounce}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  {getModeTitle()}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
