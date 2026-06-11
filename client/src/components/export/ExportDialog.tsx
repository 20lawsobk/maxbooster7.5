import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  FileAudio,
  FileSpreadsheet,
  FileText,
  File,
  Settings2,
  Layers,
  Folder,
  Volume2,
  Zap,
  Loader2,
  Database,
  Shield,
  BarChart3,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type AudioFormat = "wav" | "mp3" | "flac" | "aiff" | "ogg" | "aac";
export type DataFormat = "csv" | "pdf" | "xlsx" | "json";
export type ExportType = "audio" | "data";
export type AudioExportType = "mixdown" | "stems" | "tracks";
export type DataExportCategory =
  | "analytics"
  | "royalties"
  | "contracts"
  | "backup";

export interface AudioExportOptions {
  format: AudioFormat;
  sampleRate: number;
  bitDepth: number;
  bitrate: number;
  normalize: boolean;
  dither: boolean;
  exportType: AudioExportType;
  selectedTracks: string[];
  includeEffects: boolean;
  preserveVolumePan: boolean;
  addEffectTail: boolean;
  fileName: string;
}

export interface DataExportOptions {
  format: DataFormat;
  category: DataExportCategory;
  dateRange: { start: Date; end: Date } | null;
  includeCharts: boolean;
  anonymize: boolean;
  compress: boolean;
}

export interface Track {
  id: string;
  name: string;
  type: string;
  color?: string;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type?: ExportType;
  projectId?: string;
  projectName?: string;
  tracks?: Track[];
  onExportStart?: (options: AudioExportOptions | DataExportOptions) => void;
  onExportComplete?: (result: ExportResult) => void;
}

export interface ExportResult {
  success: boolean;
  jobId?: string;
  downloadUrl?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
  estimatedTime?: number;
}

const AUDIO_FORMATS: {
  value: AudioFormat;
  label: string;
  description: string;
  lossless: boolean;
}[] = [
  {
    value: "wav",
    label: "WAV",
    description: "Uncompressed audio",
    lossless: true,
  },
  {
    value: "mp3",
    label: "MP3",
    description: "Compressed (lossy)",
    lossless: false,
  },
  {
    value: "flac",
    label: "FLAC",
    description: "Lossless compression",
    lossless: true,
  },
  {
    value: "aiff",
    label: "AIFF",
    description: "Apple lossless",
    lossless: true,
  },
  {
    value: "ogg",
    label: "OGG",
    description: "Open format (lossy)",
    lossless: false,
  },
  {
    value: "aac",
    label: "AAC",
    description: "Advanced Audio",
    lossless: false,
  },
];

const SAMPLE_RATES = [
  { value: 44100, label: "44.1 kHz", description: "CD Quality" },
  { value: 48000, label: "48 kHz", description: "Video Standard" },
  { value: 96000, label: "96 kHz", description: "High Resolution" },
  { value: 192000, label: "192 kHz", description: "Ultra HD" },
];

const BIT_DEPTHS = [
  { value: 16, label: "16-bit", description: "Standard" },
  { value: 24, label: "24-bit", description: "Professional" },
  { value: 32, label: "32-bit Float", description: "Maximum quality" },
];

const BITRATES = [
  { value: 128, label: "128 kbps", description: "Basic quality" },
  { value: 192, label: "192 kbps", description: "Good quality" },
  { value: 256, label: "256 kbps", description: "High quality" },
  { value: 320, label: "320 kbps", description: "Maximum quality" },
];

const DATA_CATEGORIES: {
  value: DataExportCategory;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: "analytics",
    label: "Analytics",
    description: "Streaming & audience data",
    icon: BarChart3,
  },
  {
    value: "royalties",
    label: "Royalties",
    description: "Earnings & statements",
    icon: DollarSign,
  },
  {
    value: "contracts",
    label: "Contracts",
    description: "Legal documents",
    icon: FileText,
  },
  {
    value: "backup",
    label: "Full Backup",
    description: "GDPR compliant export",
    icon: Database,
  },
];

export function ExportDialog({
  open,
  onOpenChange,
  type = "audio",
  projectId,
  projectName = "Untitled Project",
  tracks = [],
  onExportStart,
  onExportComplete,
}: ExportDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ExportType>(type);

  const [audioOptions, setAudioOptions] = useState<AudioExportOptions>({
    format: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    bitrate: 320,
    normalize: true,
    dither: false,
    exportType: "mixdown",
    selectedTracks: [],
    includeEffects: true,
    preserveVolumePan: true,
    addEffectTail: false,
    fileName: projectName,
  });

  const [dataOptions, setDataOptions] = useState<DataExportOptions>({
    format: "csv",
    category: "analytics",
    dateRange: null,
    includeCharts: true,
    anonymize: false,
    compress: false,
  });

  useEffect(() => {
    if (tracks.length > 0) {
      setAudioOptions((prev) => ({
        ...prev,
        selectedTracks: tracks.map((t) => t.id),
      }));
    }
  }, [tracks]);

  useEffect(() => {
    setAudioOptions((prev) => ({ ...prev, fileName: projectName }));
  }, [projectName]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const endpoint =
        activeTab === "audio"
          ? `/api/export/audio/${projectId}`
          : "/api/export/data";

      const options = activeTab === "audio" ? audioOptions : dataOptions;
      const response = await apiRequest("POST", endpoint, options);
      return response.json();
    },
    onSuccess: (data: ExportResult) => {
      if (data.success) {
        toast({
          title: "Export Started",
          description: data.estimatedTime
            ? `Estimated time: ${Math.ceil(data.estimatedTime / 60)} minutes`
            : "Your export is being prepared",
        });
        onExportComplete?.(data);
        onOpenChange(false);
      } else {
        toast({
          variant: "destructive",
          title: "Export Failed",
          description: data.error || "An error occurred during export",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "Failed to start export",
      });
    },
  });

  const handleExport = useCallback(() => {
    const options = activeTab === "audio" ? audioOptions : dataOptions;
    onExportStart?.(options);
    exportMutation.mutate();
  }, [activeTab, audioOptions, dataOptions, onExportStart, exportMutation]);

  const toggleTrack = useCallback((trackId: string) => {
    setAudioOptions((prev) => ({
      ...prev,
      selectedTracks: prev.selectedTracks.includes(trackId)
        ? prev.selectedTracks.filter((id) => id !== trackId)
        : [...prev.selectedTracks, trackId],
    }));
  }, []);

  const selectAllTracks = useCallback(() => {
    setAudioOptions((prev) => ({
      ...prev,
      selectedTracks: tracks.map((t) => t.id),
    }));
  }, [tracks]);

  const deselectAllTracks = useCallback(() => {
    setAudioOptions((prev) => ({
      ...prev,
      selectedTracks: [],
    }));
  }, []);

  const isLosslessFormat = AUDIO_FORMATS.find(
    (f) => f.value === audioOptions.format,
  )?.lossless;
  const canExport =
    activeTab === "audio"
      ? audioOptions.exportType === "mixdown" ||
        audioOptions.selectedTracks.length > 0
      : true;

  const getEstimatedFileSize = useCallback(() => {
    if (activeTab !== "audio") return null;
    const duration = 180;
    const channels = 2;
    let sizeBytes = 0;

    if (isLosslessFormat) {
      sizeBytes =
        duration *
        audioOptions.sampleRate *
        channels *
        (audioOptions.bitDepth / 8);
      if (audioOptions.format === "flac") sizeBytes *= 0.6;
    } else {
      sizeBytes = duration * ((audioOptions.bitrate * 1000) / 8);
    }

    if (audioOptions.exportType === "stems") {
      sizeBytes *= audioOptions.selectedTracks.length || 1;
    }

    const sizeMB = sizeBytes / (1024 * 1024);
    return sizeMB < 1
      ? `${(sizeMB * 1024).toFixed(0)} KB`
      : `${sizeMB.toFixed(1)} MB`;
  }, [activeTab, audioOptions, isLosslessFormat]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="border-b border-zinc-800 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg">
              <Download className="h-5 w-5 text-blue-400" />
            </div>
            Export
            <Badge variant="outline" className="ml-2 text-xs border-zinc-700">
              Max Booster Pro
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Export your {activeTab === "audio" ? "audio files" : "data"} with
            professional-grade options
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as ExportType)}
          className="flex-1"
        >
          <TabsList className="grid w-full grid-cols-2 bg-zinc-900">
            <TabsTrigger
              value="audio"
              className="gap-2 data-[state=active]:bg-zinc-800"
            >
              <FileAudio className="h-4 w-4" />
              Audio Export
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="gap-2 data-[state=active]:bg-zinc-800"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Data Export
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[500px] pr-4">
            <TabsContent value="audio" className="mt-4 space-y-6">
              <div className="grid grid-cols-3 gap-4 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 flex items-center gap-1">
                    <Folder className="h-3 w-3" /> File Name
                  </Label>
                  <Input
                    value={audioOptions.fileName}
                    onChange={(e) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        fileName: e.target.value,
                      }))
                    }
                    className="bg-zinc-800 border-zinc-700 h-9"
                    placeholder="Enter file name..."
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400 flex items-center gap-1">
                    <Layers className="h-3 w-3" /> Export Type
                  </Label>
                  <Select
                    value={audioOptions.exportType}
                    onValueChange={(v) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        exportType: v as AudioExportType,
                      }))
                    }
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-700">
                      <SelectItem value="mixdown">
                        Mixdown (Stereo Master)
                      </SelectItem>
                      <SelectItem value="stems">
                        Stems (Individual Tracks)
                      </SelectItem>
                      <SelectItem value="tracks">
                        Selected Tracks Only
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-400">
                    Estimated Size
                  </Label>
                  <div className="h-9 flex items-center px-3 bg-zinc-800 border border-zinc-700 rounded-md text-sm">
                    {getEstimatedFileSize() || "—"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <FileAudio className="h-4 w-4 text-blue-400" />
                    Format Selection
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {AUDIO_FORMATS.map((format) => (
                      <button
                        key={format.value}
                        onClick={() =>
                          setAudioOptions((prev) => ({
                            ...prev,
                            format: format.value,
                          }))
                        }
                        className={cn(
                          "p-3 rounded-lg border text-left transition-all",
                          audioOptions.format === format.value
                            ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
                            : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">
                            {format.label}
                          </span>
                          {format.lossless && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Lossless
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-500">
                          {format.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <Settings2 className="h-4 w-4 text-green-400" />
                    Quality Settings
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">
                        Sample Rate
                      </Label>
                      <Select
                        value={audioOptions.sampleRate.toString()}
                        onValueChange={(v) =>
                          setAudioOptions((prev) => ({
                            ...prev,
                            sampleRate: parseInt(v),
                          }))
                        }
                      >
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-700">
                          {SAMPLE_RATES.map((rate) => (
                            <SelectItem
                              key={rate.value}
                              value={rate.value.toString()}
                            >
                              {rate.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-zinc-400">
                        {isLosslessFormat ? "Bit Depth" : "Bitrate"}
                      </Label>
                      {isLosslessFormat ? (
                        <Select
                          value={audioOptions.bitDepth.toString()}
                          onValueChange={(v) =>
                            setAudioOptions((prev) => ({
                              ...prev,
                              bitDepth: parseInt(v),
                            }))
                          }
                        >
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            {BIT_DEPTHS.map((depth) => (
                              <SelectItem
                                key={depth.value}
                                value={depth.value.toString()}
                              >
                                {depth.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select
                          value={audioOptions.bitrate.toString()}
                          onValueChange={(v) =>
                            setAudioOptions((prev) => ({
                              ...prev,
                              bitrate: parseInt(v),
                            }))
                          }
                        >
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-zinc-900 border-zinc-700">
                            {BITRATES.map((rate) => (
                              <SelectItem
                                key={rate.value}
                                value={rate.value.toString()}
                              >
                                {rate.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(audioOptions.exportType === "stems" ||
                audioOptions.exportType === "tracks") &&
                tracks.length > 0 && (
                  <>
                    <Separator className="bg-zinc-800" />
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">
                          Select Tracks to Export
                        </Label>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={selectAllTracks}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={deselectAllTracks}
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                        {tracks.map((track) => (
                          <div
                            key={track.id}
                            onClick={() => toggleTrack(track.id)}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all",
                              audioOptions.selectedTracks.includes(track.id)
                                ? "bg-zinc-800 ring-1 ring-blue-500/50"
                                : "hover:bg-zinc-800/50 opacity-50",
                            )}
                          >
                            <Checkbox
                              checked={audioOptions.selectedTracks.includes(
                                track.id,
                              )}
                            />
                            {track.color && (
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: track.color }}
                              />
                            )}
                            <span className="text-sm truncate">
                              {track.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] ml-auto"
                            >
                              {track.type}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-500">
                        {audioOptions.selectedTracks.length} of {tracks.length}{" "}
                        tracks selected
                      </p>
                    </div>
                  </>
                )}

              <Separator className="bg-zinc-800" />

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300 flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-blue-400" />
                    Normalize to -0.1dB
                  </span>
                  <Switch
                    checked={audioOptions.normalize}
                    onCheckedChange={(checked) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        normalize: checked,
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300">Apply Dithering</span>
                  <Switch
                    checked={audioOptions.dither}
                    onCheckedChange={(checked) =>
                      setAudioOptions((prev) => ({ ...prev, dither: checked }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-400" />
                    Include Insert Effects
                  </span>
                  <Switch
                    checked={audioOptions.includeEffects}
                    onCheckedChange={(checked) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        includeEffects: checked,
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300">
                    Preserve Volume/Pan
                  </span>
                  <Switch
                    checked={audioOptions.preserveVolumePan}
                    onCheckedChange={(checked) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        preserveVolumePan: checked,
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300">
                    Add Effect Tail (2s)
                  </span>
                  <Switch
                    checked={audioOptions.addEffectTail}
                    onCheckedChange={(checked) =>
                      setAudioOptions((prev) => ({
                        ...prev,
                        addEffectTail: checked,
                      }))
                    }
                  />
                </label>
              </div>
            </TabsContent>

            <TabsContent value="data" className="mt-4 space-y-6">
              <div className="space-y-4">
                <Label className="text-sm font-medium">Data Category</Label>
                <div className="grid grid-cols-2 gap-3">
                  {DATA_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    return (
                      <div
                        key={category.value}
                        onClick={() =>
                          setDataOptions((prev) => ({
                            ...prev,
                            category: category.value,
                          }))
                        }
                        className={cn(
                          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                          dataOptions.category === category.value
                            ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
                            : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                        )}
                      >
                        <div
                          className={cn(
                            "p-2 rounded-lg",
                            dataOptions.category === category.value
                              ? "bg-blue-500/20"
                              : "bg-zinc-800",
                          )}
                        >
                          <Icon className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">
                            {category.label}
                          </div>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {category.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="space-y-4">
                <Label className="text-sm font-medium">Export Format</Label>
                <RadioGroup
                  value={dataOptions.format}
                  onValueChange={(v) =>
                    setDataOptions((prev) => ({
                      ...prev,
                      format: v as DataFormat,
                    }))
                  }
                  className="grid grid-cols-4 gap-3"
                >
                  {[
                    { value: "csv", label: "CSV", icon: FileSpreadsheet },
                    { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
                    { value: "pdf", label: "PDF", icon: FileText },
                    { value: "json", label: "JSON", icon: File },
                  ].map((format) => {
                    const Icon = format.icon;
                    return (
                      <Label
                        key={format.value}
                        htmlFor={format.value}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-all",
                          dataOptions.format === format.value
                            ? "bg-blue-600/20 border-blue-500 ring-1 ring-blue-500"
                            : "bg-zinc-900 border-zinc-700 hover:border-zinc-600",
                        )}
                      >
                        <RadioGroupItem
                          value={format.value}
                          id={format.value}
                          className="sr-only"
                        />
                        <Icon
                          className={cn(
                            "h-8 w-8",
                            dataOptions.format === format.value
                              ? "text-blue-400"
                              : "text-zinc-500",
                          )}
                        />
                        <span className="font-medium text-sm">
                          {format.label}
                        </span>
                      </Label>
                    );
                  })}
                </RadioGroup>
              </div>

              <Separator className="bg-zinc-800" />

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
                {dataOptions.format === "pdf" && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-zinc-300">
                      Include Charts & Graphs
                    </span>
                    <Switch
                      checked={dataOptions.includeCharts}
                      onCheckedChange={(checked) =>
                        setDataOptions((prev) => ({
                          ...prev,
                          includeCharts: checked,
                        }))
                      }
                    />
                  </label>
                )}
                {dataOptions.category === "backup" && (
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-sm text-zinc-300 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-400" />
                      Anonymize Personal Data
                    </span>
                    <Switch
                      checked={dataOptions.anonymize}
                      onCheckedChange={(checked) =>
                        setDataOptions((prev) => ({
                          ...prev,
                          anonymize: checked,
                        }))
                      }
                    />
                  </label>
                )}
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm text-zinc-300">Compress as ZIP</span>
                  <Switch
                    checked={dataOptions.compress}
                    onCheckedChange={(checked) =>
                      setDataOptions((prev) => ({ ...prev, compress: checked }))
                    }
                  />
                </label>
              </div>

              {dataOptions.category === "backup" && (
                <div className="p-4 bg-amber-950/30 border border-amber-900/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-400 text-sm">
                        GDPR Compliance
                      </p>
                      <p className="text-xs text-amber-300/80 mt-1">
                        This export includes all your personal data in
                        compliance with GDPR Article 20. The export may take
                        several minutes to prepare.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex gap-3 pt-4 border-t border-zinc-800">
          <Button
            variant="outline"
            className="flex-1 border-zinc-700 hover:bg-zinc-800"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
            onClick={handleExport}
            disabled={!canExport || exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Export...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export{" "}
                {activeTab === "audio"
                  ? audioOptions.format.toUpperCase()
                  : dataOptions.format.toUpperCase()}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ExportDialog;
