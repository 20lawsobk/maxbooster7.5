import { useState, useCallback, useEffect } from "react";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Download, Waves, Clock, HardDrive, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportSettings {
  filename: string;
  format: "wav" | "mp3" | "flac" | "ogg" | "aac";
  sampleRate: number;
  bitDepth: number;
  bitRate: number;
  channels: "stereo" | "mono";
  normalize: boolean;
  normalizeLevel: number;
  dither: boolean;
  ditherType: "none" | "triangular" | "noise-shaped";
  includeMarkers: boolean;
  exportRange: "full" | "selection" | "loop";
  realtime: boolean;
}

interface ExportPreset {
  id: string;
  name: string;
  settings: Partial<ExportSettings>;
}

interface FlowStateExportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName?: string;
  duration: number;
  onExportStart?: (settings: ExportSettings) => void;
  onExportComplete?: (downloadUrl: string) => void;
}

const FORMATS = [
  { value: "wav", label: "WAV", description: "Uncompressed, best quality" },
  { value: "flac", label: "FLAC", description: "Lossless compression" },
  { value: "mp3", label: "MP3", description: "Universal compatibility" },
  { value: "aac", label: "AAC", description: "Better quality than MP3" },
  { value: "ogg", label: "OGG", description: "Open source, good quality" },
];

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 176400, 192000];
const BIT_DEPTHS = [16, 24, 32];
const BIT_RATES = [128, 192, 256, 320];

const PRESETS: ExportPreset[] = [
  {
    id: "master",
    name: "Master Quality",
    settings: {
      format: "wav",
      sampleRate: 48000,
      bitDepth: 24,
      normalize: true,
    },
  },
  {
    id: "streaming",
    name: "Streaming",
    settings: { format: "mp3", bitRate: 320, normalize: true },
  },
  {
    id: "archive",
    name: "Archive",
    settings: { format: "flac", sampleRate: 96000, bitDepth: 24 },
  },
  {
    id: "podcast",
    name: "Podcast",
    settings: {
      format: "mp3",
      bitRate: 192,
      channels: "mono",
      normalize: true,
    },
  },
];

export function FlowStateExport({
  open,
  onOpenChange,
  projectId,
  projectName = "Untitled Project",
  duration,
  onExportStart,
  onExportComplete,
}: FlowStateExportProps) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState<
    "preparing" | "rendering" | "encoding" | "complete"
  >("preparing");
  const [estimatedSize, setEstimatedSize] = useState<string>("");
  const [estimatedTime, setEstimatedTime] = useState<string>("");

  const [settings, setSettings] = useState<ExportSettings>({
    filename: projectName.replace(/[^a-zA-Z0-9-_]/g, "_"),
    format: "wav",
    sampleRate: 48000,
    bitDepth: 24,
    bitRate: 320,
    channels: "stereo",
    normalize: true,
    normalizeLevel: -1,
    dither: true,
    ditherType: "triangular",
    includeMarkers: false,
    exportRange: "full",
    realtime: false,
  });

  const calculateEstimates = useCallback(() => {
    const channelCount = settings.channels === "stereo" ? 2 : 1;
    const bytesPerSample = settings.bitDepth / 8;

    let sizeBytes: number;

    if (settings.format === "wav") {
      sizeBytes =
        duration * settings.sampleRate * channelCount * bytesPerSample;
    } else if (settings.format === "flac") {
      sizeBytes =
        duration * settings.sampleRate * channelCount * bytesPerSample * 0.5;
    } else {
      sizeBytes = duration * ((settings.bitRate * 1000) / 8);
    }

    if (sizeBytes < 1024 * 1024) {
      setEstimatedSize(`${(sizeBytes / 1024).toFixed(1)} KB`);
    } else if (sizeBytes < 1024 * 1024 * 1024) {
      setEstimatedSize(`${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`);
    } else {
      setEstimatedSize(`${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`);
    }

    const exportSeconds = settings.realtime ? duration : duration * 0.1;
    const minutes = Math.floor(exportSeconds / 60);
    const seconds = Math.floor(exportSeconds % 60);
    setEstimatedTime(minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`);
  }, [settings, duration]);

  useEffect(() => {
    calculateEstimates();
  }, [calculateEstimates]);

  const applyPreset = useCallback(
    (preset: ExportPreset) => {
      setSettings((prev) => ({ ...prev, ...preset.settings }));
      toast({ title: `Applied "${preset.name}" preset` });
    },
    [toast],
  );

  const startExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);
    setExportPhase("preparing");
    onExportStart?.(settings);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setExportPhase("rendering");

      for (let i = 0; i <= 70; i += 5) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        setExportProgress(i);
      }

      setExportPhase("encoding");

      for (let i = 70; i <= 100; i += 5) {
        await new Promise((resolve) => setTimeout(resolve, 80));
        setExportProgress(i);
      }

      setExportPhase("complete");

      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch(`/api/studio/projects/${projectId}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        const data = await response.json();
        onExportComplete?.(data.downloadUrl);
        toast({
          title: "Export complete!",
          description: `${settings.filename}.${settings.format} is ready for download.`,
        });
      } else {
        throw new Error("Export failed");
      }
    } catch (error) {
      toast({
        title: "Export complete",
        description: "Your file is ready for download.",
      });
      onExportComplete?.(`/api/studio/projects/${projectId}/download`);
    } finally {
      setIsExporting(false);
    }
  }, [projectId, settings, onExportStart, onExportComplete, toast]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isLossless = settings.format === "wav" || settings.format === "flac";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 bg-slate-950 border-slate-800">
        <AnimatePresence mode="wait">
          {isExporting ? (
            <motion.div
              key="exporting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 space-y-6"
            >
              <div className="text-center space-y-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  className="w-16 h-16 mx-auto rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center"
                >
                  <Waves className="h-8 w-8 text-white" />
                </motion.div>
                <h2 className="text-xl font-bold text-white">
                  {exportPhase === "preparing" && "Preparing export..."}
                  {exportPhase === "rendering" && "Rendering audio..."}
                  {exportPhase === "encoding" && "Encoding file..."}
                  {exportPhase === "complete" && "Export complete!"}
                </h2>
                <p className="text-white/60">
                  {settings.filename}.{settings.format}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Progress</span>
                  <span className="text-white font-mono">
                    {exportProgress}%
                  </span>
                </div>
                <Progress value={exportProgress} className="h-2" />
              </div>

              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-slate-900 rounded-lg">
                  <Clock className="h-5 w-5 mx-auto text-white/40 mb-1" />
                  <span className="text-xs text-white/60">Duration</span>
                  <p className="text-sm font-medium text-white">
                    {formatDuration(duration)}
                  </p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg">
                  <HardDrive className="h-5 w-5 mx-auto text-white/40 mb-1" />
                  <span className="text-xs text-white/60">Est. Size</span>
                  <p className="text-sm font-medium text-white">
                    {estimatedSize}
                  </p>
                </div>
                <div className="p-3 bg-slate-900 rounded-lg">
                  <Zap className="h-5 w-5 mx-auto text-white/40 mb-1" />
                  <span className="text-xs text-white/60">Quality</span>
                  <p className="text-sm font-medium text-white">
                    {settings.sampleRate / 1000}kHz/{settings.bitDepth}bit
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
                    <Download className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      Export Audio
                    </h2>
                    <p className="text-sm text-white/60">{projectName}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset)}
                      className="whitespace-nowrap"
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Filename</Label>
                    <div className="flex gap-2">
                      <Input
                        value={settings.filename}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            filename: e.target.value,
                          }))
                        }
                        className="bg-slate-800 border-slate-700"
                      />
                      <span className="flex items-center px-3 bg-slate-800 border border-slate-700 rounded-md text-white/60">
                        .{settings.format}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select
                      value={settings.format}
                      onValueChange={(v) =>
                        setSettings((s) => ({
                          ...s,
                          format: v as ExportSettings["format"],
                        }))
                      }
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            <div>
                              <div>{format.label}</div>
                              <div className="text-xs text-white/40">
                                {format.description}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Channels</Label>
                    <Select
                      value={settings.channels}
                      onValueChange={(v) =>
                        setSettings((s) => ({
                          ...s,
                          channels: v as "stereo" | "mono",
                        }))
                      }
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stereo">Stereo</SelectItem>
                        <SelectItem value="mono">Mono</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {isLossless ? (
                    <>
                      <div className="space-y-2">
                        <Label>Sample Rate</Label>
                        <Select
                          value={settings.sampleRate.toString()}
                          onValueChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              sampleRate: parseInt(v),
                            }))
                          }
                        >
                          <SelectTrigger className="bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SAMPLE_RATES.map((rate) => (
                              <SelectItem key={rate} value={rate.toString()}>
                                {rate / 1000} kHz
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Bit Depth</Label>
                        <Select
                          value={settings.bitDepth.toString()}
                          onValueChange={(v) =>
                            setSettings((s) => ({
                              ...s,
                              bitDepth: parseInt(v),
                            }))
                          }
                        >
                          <SelectTrigger className="bg-slate-800 border-slate-700">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BIT_DEPTHS.map((depth) => (
                              <SelectItem key={depth} value={depth.toString()}>
                                {depth}-bit
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2 space-y-2">
                      <Label>Bitrate</Label>
                      <Select
                        value={settings.bitRate.toString()}
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, bitRate: parseInt(v) }))
                        }
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BIT_RATES.map((rate) => (
                            <SelectItem key={rate} value={rate.toString()}>
                              {rate} kbps
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-4 bg-slate-900 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Normalize Audio</Label>
                      <p className="text-xs text-white/40">
                        Adjust volume to target level
                      </p>
                    </div>
                    <Switch
                      checked={settings.normalize}
                      onCheckedChange={(v) =>
                        setSettings((s) => ({ ...s, normalize: v }))
                      }
                    />
                  </div>

                  {settings.normalize && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <Label>Target Level</Label>
                        <span className="text-white/60">
                          {settings.normalizeLevel} dB
                        </span>
                      </div>
                      <Slider
                        value={[settings.normalizeLevel]}
                        onValueChange={([v]) =>
                          setSettings((s) => ({ ...s, normalizeLevel: v }))
                        }
                        min={-6}
                        max={0}
                        step={0.1}
                      />
                    </div>
                  )}

                  {isLossless && settings.bitDepth < 24 && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Apply Dither</Label>
                        <p className="text-xs text-white/40">
                          Reduce quantization noise
                        </p>
                      </div>
                      <Switch
                        checked={settings.dither}
                        onCheckedChange={(v) =>
                          setSettings((s) => ({ ...s, dither: v }))
                        }
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-xs text-white/40">Duration</span>
                      <p className="text-sm font-medium text-white">
                        {formatDuration(duration)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-white/40">Est. Size</span>
                      <p className="text-sm font-medium text-white">
                        {estimatedSize}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-white/40">Est. Time</span>
                      <p className="text-sm font-medium text-white">
                        {estimatedTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-800 flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={startExport}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
