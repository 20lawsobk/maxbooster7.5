import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Download, FileAudio, Check, Layers, Music, Mic2, Drum, Guitar, Piano, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ExportTrack {
  id: string;
  name: string;
  type: "audio" | "midi" | "bus" | "master";
  icon: "vocals" | "drums" | "bass" | "keys" | "guitar" | "synth" | "master";
  color: string;
  selected: boolean;
  isMuted: boolean;
}

interface ExportPreset {
  id: string;
  name: string;
  description: string;
  outputs: ExportOutput[];
}

interface ExportOutput {
  id: string;
  name: string;
  type: "master" | "stems" | "instrumental" | "acapella" | "custom";
  format: "wav" | "mp3" | "flac" | "aac";
  sampleRate: number;
  bitDepth: number;
  normalize: boolean;
  includedTracks: string[];
  excludedTracks: string[];
}

interface ExportProgress {
  outputId: string;
  progress: number;
  status: "pending" | "processing" | "complete" | "error";
  fileName?: string;
}

interface FlowStateBatchExportProps {
  projectName?: string;
  tracks?: ExportTrack[];
  onExport?: (outputs: ExportOutput[]) => void;
  className?: string;
}

const TRACK_ICONS: Record<string, React.ReactNode> = {
  vocals: <Mic2 className="w-4 h-4" />,
  drums: <Drum className="w-4 h-4" />,
  bass: <Music className="w-4 h-4" />,
  keys: <Piano className="w-4 h-4" />,
  guitar: <Guitar className="w-4 h-4" />,
  synth: <Layers className="w-4 h-4" />,
  master: <FileAudio className="w-4 h-4" />,
};

const DEFAULT_TRACKS: ExportTrack[] = [
  {
    id: "t1",
    name: "Lead Vocals",
    type: "audio",
    icon: "vocals",
    color: "bg-pink-500",
    selected: true,
    isMuted: false,
  },
  {
    id: "t2",
    name: "Backing Vocals",
    type: "audio",
    icon: "vocals",
    color: "bg-pink-400",
    selected: true,
    isMuted: false,
  },
  {
    id: "t3",
    name: "Drums",
    type: "midi",
    icon: "drums",
    color: "bg-orange-500",
    selected: true,
    isMuted: false,
  },
  {
    id: "t4",
    name: "Bass",
    type: "midi",
    icon: "bass",
    color: "bg-purple-500",
    selected: true,
    isMuted: false,
  },
  {
    id: "t5",
    name: "Keys",
    type: "midi",
    icon: "keys",
    color: "bg-blue-500",
    selected: true,
    isMuted: false,
  },
  {
    id: "t6",
    name: "Synth Lead",
    type: "midi",
    icon: "synth",
    color: "bg-cyan-500",
    selected: true,
    isMuted: false,
  },
  {
    id: "t7",
    name: "Guitar",
    type: "audio",
    icon: "guitar",
    color: "bg-amber-500",
    selected: true,
    isMuted: false,
  },
];

const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "distribution",
    name: "Distribution Package",
    description: "Master, stems, instrumental, and acapella for distribution",
    outputs: [
      {
        id: "o1",
        name: "Master",
        type: "master",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: [],
      },
      {
        id: "o2",
        name: "Instrumental",
        type: "instrumental",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: ["vocals"],
      },
      {
        id: "o3",
        name: "Acapella",
        type: "acapella",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["vocals"],
        excludedTracks: [],
      },
      {
        id: "o4",
        name: "Stems",
        type: "stems",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 24,
        normalize: false,
        includedTracks: ["all"],
        excludedTracks: [],
      },
    ],
  },
  {
    id: "streaming",
    name: "Streaming Ready",
    description: "Optimized for Spotify, Apple Music, etc.",
    outputs: [
      {
        id: "o1",
        name: "Master (Streaming)",
        type: "master",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 16,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: [],
      },
      {
        id: "o2",
        name: "Radio Edit",
        type: "master",
        format: "mp3",
        sampleRate: 44100,
        bitDepth: 16,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: [],
      },
    ],
  },
  {
    id: "sync",
    name: "Sync Licensing",
    description: "Full package for film/TV sync licensing",
    outputs: [
      {
        id: "o1",
        name: "Full Mix",
        type: "master",
        format: "wav",
        sampleRate: 48000,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: [],
      },
      {
        id: "o2",
        name: "TV Mix (No Vocals)",
        type: "instrumental",
        format: "wav",
        sampleRate: 48000,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: ["vocals"],
      },
      {
        id: "o3",
        name: "Stems Package",
        type: "stems",
        format: "wav",
        sampleRate: 48000,
        bitDepth: 24,
        normalize: false,
        includedTracks: ["all"],
        excludedTracks: [],
      },
      {
        id: "o4",
        name: "Underscore (No Drums)",
        type: "custom",
        format: "wav",
        sampleRate: 48000,
        bitDepth: 24,
        normalize: true,
        includedTracks: ["all"],
        excludedTracks: ["drums"],
      },
    ],
  },
  {
    id: "remix",
    name: "Remix Package",
    description: "Individual stems for remixers",
    outputs: [
      {
        id: "o1",
        name: "All Stems",
        type: "stems",
        format: "wav",
        sampleRate: 44100,
        bitDepth: 24,
        normalize: false,
        includedTracks: ["all"],
        excludedTracks: [],
      },
    ],
  },
];

export function FlowStateBatchExport({
  projectName = "My Project",
  tracks = DEFAULT_TRACKS,
  onExport,
  className,
}: FlowStateBatchExportProps) {
  const { toast } = useToast();
  const [exportTracks, setExportTracks] = useState<ExportTrack[]>(tracks);
  const [selectedPreset, setSelectedPreset] = useState<string>("distribution");
  const [customOutputs, setCustomOutputs] = useState<ExportOutput[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress[]>([]);
  const [outputFolder, setOutputFolder] = useState(`${projectName}_exports`);
  const [createSubfolders, setCreateSubfolders] = useState(true);
  const [addTimestamp, setAddTimestamp] = useState(false);
  const [zipOutput, setZipOutput] = useState(false);

  const currentPreset = EXPORT_PRESETS.find((p) => p.id === selectedPreset);
  const outputs =
    customOutputs.length > 0 ? customOutputs : currentPreset?.outputs || [];

  const toggleTrack = (trackId: string) => {
    setExportTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, selected: !t.selected } : t)),
    );
  };

  const selectAllTracks = () => {
    setExportTracks((prev) => prev.map((t) => ({ ...t, selected: true })));
  };

  const deselectAllTracks = () => {
    setExportTracks((prev) => prev.map((t) => ({ ...t, selected: false })));
  };

  const startExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(
      outputs.map((o) => ({
        outputId: o.id,
        progress: 0,
        status: "pending",
      })),
    );

    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i];

      setExportProgress((prev) =>
        prev.map((p) =>
          p.outputId === output.id ? { ...p, status: "processing" } : p,
        ),
      );

      const duration = output.type === "stems" ? 3000 : 1500;
      const steps = 20;

      for (let step = 0; step <= steps; step++) {
        await new Promise((resolve) => setTimeout(resolve, duration / steps));
        setExportProgress((prev) =>
          prev.map((p) =>
            p.outputId === output.id
              ? { ...p, progress: (step / steps) * 100 }
              : p,
          ),
        );
      }

      const fileName =
        output.type === "stems"
          ? `${outputFolder}/Stems/`
          : `${outputFolder}/${projectName}_${output.name}.${output.format}`;

      setExportProgress((prev) =>
        prev.map((p) =>
          p.outputId === output.id ? { ...p, status: "complete", fileName } : p,
        ),
      );
    }

    setIsExporting(false);
    onExport?.(outputs);
    toast({
      title: "Export complete",
      description: `${outputs.length} files exported to ${outputFolder}/`,
    });
  }, [outputs, outputFolder, projectName, onExport, toast]);

  const getOutputDescription = (output: ExportOutput): string => {
    switch (output.type) {
      case "master":
        return "Full mix with all tracks";
      case "stems":
        return "Individual track exports";
      case "instrumental":
        return "Mix without vocals";
      case "acapella":
        return "Vocals only";
      case "custom":
        return "Custom track selection";
      default:
        return "";
    }
  };

  const completedCount = exportProgress.filter(
    (p) => p.status === "complete",
  ).length;

  return (
    <div
      className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-lg">
            <Download className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="font-semibold">Batch Export</h2>
            <p className="text-xs text-zinc-500">
              Export multiple formats at once
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isExporting ? (
            <Badge variant="secondary" className="animate-pulse">
              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
              Exporting {completedCount}/{outputs.length}
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-blue-400 border-blue-400/30"
            >
              {outputs.length} outputs configured
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Tracks & Presets */}
        <div className="w-72 border-r border-zinc-800 flex flex-col overflow-hidden">
          {/* Preset Selection */}
          <div className="p-4 border-b border-zinc-800">
            <Label className="text-sm mb-2 block">Export Preset</Label>
            <Select value={selectedPreset} onValueChange={setSelectedPreset}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPORT_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentPreset && (
              <p className="text-xs text-zinc-500 mt-2">
                {currentPreset.description}
              </p>
            )}
          </div>

          {/* Track Selection */}
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm">Include Tracks</Label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={selectAllTracks}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={deselectAllTracks}
                >
                  None
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {exportTracks.map((track) => (
                <div
                  key={track.id}
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg transition-colors",
                    track.selected
                      ? "bg-zinc-900"
                      : "bg-transparent opacity-50",
                  )}
                >
                  <Checkbox
                    checked={track.selected}
                    onCheckedChange={() => toggleTrack(track.id)}
                  />
                  <div
                    className={cn(
                      "w-6 h-6 rounded flex items-center justify-center",
                      track.color,
                    )}
                  >
                    {TRACK_ICONS[track.icon]}
                  </div>
                  <span className="text-sm flex-1 truncate">{track.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {track.type}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Output Settings */}
          <div className="p-4 border-t border-zinc-800 space-y-3">
            <div className="space-y-2">
              <Label className="text-sm">Output Folder</Label>
              <Input
                value={outputFolder}
                onChange={(e) => setOutputFolder(e.target.value)}
                className="bg-zinc-900 border-zinc-700"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Create Subfolders</Label>
              <Switch
                checked={createSubfolders}
                onCheckedChange={setCreateSubfolders}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">Add Timestamp</Label>
              <Switch
                checked={addTimestamp}
                onCheckedChange={setAddTimestamp}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-zinc-400">ZIP Output</Label>
              <Switch checked={zipOutput} onCheckedChange={setZipOutput} />
            </div>
          </div>
        </div>

        {/* Right Panel - Export Preview & Progress */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Output List */}
          <div className="flex-1 overflow-auto p-4">
            <h3 className="font-medium mb-4">
              Export Outputs ({outputs.length})
            </h3>

            <div className="space-y-3">
              {outputs.map((output, idx) => {
                const progress = exportProgress.find(
                  (p) => p.outputId === output.id,
                );

                return (
                  <motion.div
                    key={output.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "bg-zinc-900 border-zinc-800 p-4",
                        progress?.status === "complete" &&
                          "border-green-500/30 bg-green-500/5",
                        progress?.status === "processing" &&
                          "border-blue-500/30 bg-blue-500/5",
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              output.type === "master"
                                ? "bg-blue-500"
                                : output.type === "stems"
                                  ? "bg-purple-500"
                                  : output.type === "instrumental"
                                    ? "bg-green-500"
                                    : output.type === "acapella"
                                      ? "bg-pink-500"
                                      : "bg-zinc-500",
                            )}
                          >
                            {output.type === "stems" ? (
                              <Layers className="w-5 h-5" />
                            ) : (
                              <FileAudio className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium">{output.name}</h4>
                            <p className="text-xs text-zinc-500">
                              {getOutputDescription(output)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {progress?.status === "complete" ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              <Check className="w-3 h-3 mr-1" />
                              Complete
                            </Badge>
                          ) : progress?.status === "processing" ? (
                            <Badge className="bg-blue-500/20 text-blue-400 animate-pulse">
                              <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              Exporting
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Pending</Badge>
                          )}
                        </div>
                      </div>

                      {/* Format Details */}
                      <div className="flex flex-wrap gap-2 mb-3">
                        <Badge variant="outline">
                          {output.format.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">
                          {output.sampleRate / 1000}kHz
                        </Badge>
                        <Badge variant="outline">{output.bitDepth}-bit</Badge>
                        {output.normalize && (
                          <Badge variant="outline">Normalized</Badge>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {progress && progress.status !== "pending" && (
                        <div className="space-y-2">
                          <Progress value={progress.progress} className="h-2" />
                          {progress.fileName && (
                            <p className="text-xs text-zinc-500 truncate">
                              {progress.fileName}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Stem List */}
                      {output.type === "stems" && (
                        <Accordion type="single" collapsible className="mt-3">
                          <AccordionItem
                            value="stems"
                            className="border-zinc-800"
                          >
                            <AccordionTrigger className="text-sm py-2">
                              Individual Stems (
                              {exportTracks.filter((t) => t.selected).length})
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-1 text-xs text-zinc-400">
                                {exportTracks
                                  .filter((t) => t.selected)
                                  .map((track) => (
                                    <div
                                      key={track.id}
                                      className="flex items-center gap-2"
                                    >
                                      <div
                                        className={cn(
                                          "w-2 h-2 rounded-full",
                                          track.color,
                                        )}
                                      />
                                      <span>
                                        {projectName}_{track.name}.
                                        {output.format}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Export Button */}
          <div className="border-t border-zinc-800 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-zinc-400">
                <span className="font-medium text-white">{outputs.length}</span>{" "}
                files will be exported
                {zipOutput && " (zipped)"}
              </div>
              {exportProgress.length > 0 && (
                <div className="text-sm text-zinc-400">
                  {completedCount}/{outputs.length} complete
                </div>
              )}
            </div>

            <Button
              className="w-full bg-blue-500 hover:bg-blue-600 h-12 text-lg"
              onClick={startExport}
              disabled={isExporting || outputs.length === 0}
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Export All ({outputs.length} files)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateBatchExport;
