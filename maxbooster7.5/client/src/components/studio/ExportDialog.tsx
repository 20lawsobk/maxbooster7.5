import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Folder,
  Clock,
  Zap,
  Monitor,
  Settings2,
  FileAudio,
  Music2,
  Volume2,
} from "lucide-react";

export interface ExtendedExportOptions {
  formats: string[];
  fileName: string;
  exportRange: "song" | "loop" | "selection";
  processingMode: "automatic" | "offline" | "realtime";
  speakerFormat: "original" | "mono" | "stereo" | "split-mono";
  bypassMasterEffects: boolean;
  writeTempoToFile: boolean;
  importToTrack: boolean;
  closeAfterExport: boolean;
  sampleRate: number;
  bitDepth: number;
  bitrate: number;
  normalize: boolean;
  dither: boolean;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportFormat: string;
  setExportFormat: (format: string) => void;
  exportType: string;
  setExportType: (type: string) => void;
  exportSampleRate: number;
  setExportSampleRate: (rate: number) => void;
  exportBitDepth: number;
  setExportBitDepth: (depth: number) => void;
  exportBitrate: number;
  setExportBitrate: (bitrate: number) => void;
  exportNormalize: boolean;
  setExportNormalize: (normalize: boolean) => void;
  exportDither: boolean;
  setExportDither: (dither: boolean) => void;
  onExport: () => void;
  onExtendedExport?: (options: ExtendedExportOptions) => void;
  isExporting: boolean;
  projectName?: string;
  projectDuration?: number;
}

export function ExportDialog({
  open,
  onOpenChange,
  exportFormat,
  setExportFormat,
  exportType,
  setExportType,
  exportSampleRate,
  setExportSampleRate,
  exportBitDepth,
  setExportBitDepth,
  exportBitrate,
  setExportBitrate,
  exportNormalize,
  setExportNormalize,
  exportDither,
  setExportDither,
  onExport,
  onExtendedExport,
  isExporting,
  projectName = "Untitled",
  projectDuration = 0,
}: ExportDialogProps) {
  const [fileName, setFileName] = useState(projectName);
  const [exportRange, setExportRange] = useState<"song" | "loop" | "selection">(
    "song",
  );
  const [processingMode, setProcessingMode] = useState<
    "automatic" | "offline" | "realtime"
  >("automatic");
  const [speakerFormat, setSpeakerFormat] = useState<
    "original" | "mono" | "stereo" | "split-mono"
  >("stereo");
  const [bypassMasterEffects, setBypassMasterEffects] = useState(false);
  const [writeTempoToFile, setWriteTempoToFile] = useState(true);
  const [importToTrack, setImportToTrack] = useState(false);
  const [closeAfterExport, setCloseAfterExport] = useState(true);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([
    exportFormat,
  ]);

  const handleExtendedExport = () => {
    if (onExtendedExport) {
      onExtendedExport({
        formats: selectedFormats,
        fileName,
        exportRange,
        processingMode,
        speakerFormat,
        bypassMasterEffects,
        writeTempoToFile,
        importToTrack,
        closeAfterExport,
        sampleRate: exportSampleRate,
        bitDepth: exportBitDepth,
        bitrate: exportBitrate,
        normalize: exportNormalize,
        dither: exportDither,
      });
    } else {
      onExport();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const toggleFormat = (format: string) => {
    if (selectedFormats.includes(format)) {
      if (selectedFormats.length > 1) {
        setSelectedFormats(selectedFormats.filter((f) => f !== format));
      }
    } else {
      setSelectedFormats([...selectedFormats, format]);
    }
    setExportFormat(format);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#1e1e1e] border-gray-700 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b border-gray-700 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Download className="h-5 w-5 text-blue-400" />
            </div>
            Export Mixdown
            <Badge variant="outline" className="ml-2 text-xs border-gray-600">
              Studio One Style
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Export your project with professional-grade settings
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="grid grid-cols-3 gap-4 p-4 bg-[#252525] rounded-lg border border-gray-700">
            <div className="space-y-2">
              <Label className="text-xs text-gray-400 flex items-center gap-1">
                <Folder className="h-3 w-3" /> File Name
              </Label>
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="bg-[#1a1a1a] border-gray-600 h-9"
                placeholder="Enter file name..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Export Range
              </Label>
              <Select
                value={exportRange}
                onValueChange={(v: "song" | "loop" | "selection") =>
                  setExportRange(v)
                }
              >
                <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-gray-700">
                  <SelectItem value="song">Between Song Start/End</SelectItem>
                  <SelectItem value="loop">Between Loop Markers</SelectItem>
                  <SelectItem value="selection">Selection Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-gray-400">Duration</Label>
              <div className="h-9 flex items-center px-3 bg-[#1a1a1a] border border-gray-600 rounded-md text-sm">
                {formatDuration(projectDuration)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <FileAudio className="h-4 w-4 text-blue-400" />
                Format Selection
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["wav", "mp3", "flac", "ogg", "aiff", "aac"].map((format) => (
                  <button
                    key={format}
                    onClick={() => toggleFormat(format)}
                    className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                      selectedFormats.includes(format)
                        ? "bg-blue-600/30 border-blue-500 text-blue-300"
                        : "bg-[#1a1a1a] border-gray-700 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Select multiple formats for batch export
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Settings2 className="h-4 w-4 text-green-400" />
                Quality Settings
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Sample Rate</Label>
                  <Select
                    value={exportSampleRate.toString()}
                    onValueChange={(v) => setExportSampleRate(parseInt(v))}
                  >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
                      <SelectItem value="44100">44.1 kHz</SelectItem>
                      <SelectItem value="48000">48 kHz</SelectItem>
                      <SelectItem value="96000">96 kHz</SelectItem>
                      <SelectItem value="192000">192 kHz</SelectItem>
                      <SelectItem value="384000">384 kHz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">
                    {selectedFormats.includes("wav") ||
                    selectedFormats.includes("flac")
                      ? "Bit Depth"
                      : "Bitrate"}
                  </Label>
                  {selectedFormats.includes("wav") ||
                  selectedFormats.includes("flac") ? (
                    <Select
                      value={exportBitDepth.toString()}
                      onValueChange={(v) => setExportBitDepth(parseInt(v))}
                    >
                      <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252525] border-gray-700">
                        <SelectItem value="16">16-bit</SelectItem>
                        <SelectItem value="24">24-bit</SelectItem>
                        <SelectItem value="32">32-bit Float</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={exportBitrate.toString()}
                      onValueChange={(v) => setExportBitrate(parseInt(v))}
                    >
                      <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252525] border-gray-700">
                        <SelectItem value="128">128 kbps</SelectItem>
                        <SelectItem value="192">192 kbps</SelectItem>
                        <SelectItem value="256">256 kbps</SelectItem>
                        <SelectItem value="320">320 kbps</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Music2 className="h-4 w-4 text-purple-400" />
                Output Options
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">Export Type</Label>
                  <Select value={exportType} onValueChange={setExportType}>
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
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
                <div className="space-y-1">
                  <Label className="text-xs text-gray-400">
                    Speaker Format
                  </Label>
                  <Select
                    value={speakerFormat}
                    onValueChange={(
                      v: "original" | "mono" | "stereo" | "split-mono",
                    ) => setSpeakerFormat(v)}
                  >
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#252525] border-gray-700">
                      <SelectItem value="original">Original</SelectItem>
                      <SelectItem value="mono">Mono</SelectItem>
                      <SelectItem value="stereo">Stereo</SelectItem>
                      <SelectItem value="split-mono">Split Mono</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Zap className="h-4 w-4 text-yellow-400" />
                Processing
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-400">Processing Mode</Label>
                <Select
                  value={processingMode}
                  onValueChange={(v: "automatic" | "offline" | "realtime") =>
                    setProcessingMode(v)
                  }
                >
                  <SelectTrigger className="bg-[#1a1a1a] border-gray-600 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#252525] border-gray-700">
                    <SelectItem value="automatic">Automatic</SelectItem>
                    <SelectItem value="offline">Offline (Faster)</SelectItem>
                    <SelectItem value="realtime">
                      Realtime (For External Gear)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-500">
                {processingMode === "automatic" &&
                  "Automatically selects best mode based on signal path"}
                {processingMode === "offline" &&
                  "Faster than realtime, no external gear support"}
                {processingMode === "realtime" &&
                  "Required for external instruments/hardware"}
              </p>
            </div>
          </div>

          <Separator className="bg-gray-700" />

          <div className="grid grid-cols-2 gap-x-8 gap-y-2 p-4 bg-[#252525] rounded-lg border border-gray-700">
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={exportNormalize}
                onChange={(e) => setExportNormalize(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              <Volume2 className="h-3.5 w-3.5 text-blue-400" />
              Normalize to -0.1dB
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={exportDither}
                onChange={(e) => setExportDither(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              Apply Dithering
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={bypassMasterEffects}
                onChange={(e) => setBypassMasterEffects(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              Bypass Master Effects
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={writeTempoToFile}
                onChange={(e) => setWriteTempoToFile(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              Write Tempo to Audio File
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={importToTrack}
                onChange={(e) => setImportToTrack(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              Import to Track After Export
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-white text-gray-300">
              <input
                type="checkbox"
                checked={closeAfterExport}
                onChange={(e) => setCloseAfterExport(e.target.checked)}
                className="rounded border-gray-600 bg-[#1a1a1a]"
              />
              Close After Export
            </label>
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-gray-600 hover:bg-gray-800"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleExtendedExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Monitor className="h-4 w-4 mr-2 animate-pulse" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export{" "}
                  {selectedFormats.length > 1
                    ? `${selectedFormats.length} Formats`
                    : selectedFormats[0]?.toUpperCase()}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
