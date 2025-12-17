import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Download } from 'lucide-react';

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
  isExporting: boolean;
}

/**
 * TODO: Add function documentation
 */
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
  isExporting,
}: ExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#252525] border-gray-700 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-green-400" />
            Export Audio
          </DialogTitle>
          <DialogDescription>
            Configure export settings for your audio project
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Export Type</Label>
              <Select value={exportType} onValueChange={setExportType}>
                <SelectTrigger
                  className="bg-[#1a1a1a] border-gray-700"
                  data-testid="select-export-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-gray-700">
                  <SelectItem value="mixdown">Mixdown (Stereo Master)</SelectItem>
                  <SelectItem value="stems">Stems (Individual Tracks)</SelectItem>
                  <SelectItem value="tracks">Selected Tracks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Audio Format</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger
                  className="bg-[#1a1a1a] border-gray-700"
                  data-testid="select-export-format"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-gray-700">
                  <SelectItem value="wav">WAV (Lossless)</SelectItem>
                  <SelectItem value="mp3">MP3</SelectItem>
                  <SelectItem value="flac">FLAC (Lossless)</SelectItem>
                  <SelectItem value="ogg">OGG Vorbis</SelectItem>
                  <SelectItem value="aac">AAC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sample Rate</Label>
              <Select
                value={exportSampleRate.toString()}
                onValueChange={(v) => setExportSampleRate(parseInt(v))}
              >
                <SelectTrigger
                  className="bg-[#1a1a1a] border-gray-700"
                  data-testid="select-sample-rate"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#252525] border-gray-700">
                  <SelectItem value="44100">44.1 kHz</SelectItem>
                  <SelectItem value="48000">48 kHz</SelectItem>
                  <SelectItem value="96000">96 kHz</SelectItem>
                  <SelectItem value="192000">192 kHz</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {exportFormat === 'wav' ? (
              <div className="space-y-2">
                <Label>Bit Depth</Label>
                <Select
                  value={exportBitDepth.toString()}
                  onValueChange={(v) => setExportBitDepth(parseInt(v))}
                >
                  <SelectTrigger
                    className="bg-[#1a1a1a] border-gray-700"
                    data-testid="select-bit-depth"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#252525] border-gray-700">
                    <SelectItem value="16">16-bit</SelectItem>
                    <SelectItem value="24">24-bit</SelectItem>
                    <SelectItem value="32">32-bit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Bitrate</Label>
                <Select
                  value={exportBitrate.toString()}
                  onValueChange={(v) => setExportBitrate(parseInt(v))}
                >
                  <SelectTrigger
                    className="bg-[#1a1a1a] border-gray-700"
                    data-testid="select-bitrate"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#252525] border-gray-700">
                    <SelectItem value="128">128 kbps</SelectItem>
                    <SelectItem value="192">192 kbps</SelectItem>
                    <SelectItem value="256">256 kbps</SelectItem>
                    <SelectItem value="320">320 kbps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="normalize"
                checked={exportNormalize}
                onChange={(e) => setExportNormalize(e.target.checked)}
                className="rounded border-gray-600"
                data-testid="checkbox-normalize"
              />
              <Label htmlFor="normalize" className="cursor-pointer">
                Normalize to -0.1dB
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="dither"
                checked={exportDither}
                onChange={(e) => setExportDither(e.target.checked)}
                className="rounded border-gray-600"
                data-testid="checkbox-dither"
              />
              <Label htmlFor="dither" className="cursor-pointer">
                Apply dithering (for bit depth reduction)
              </Label>
            </div>
          </div>

          <div className="pt-2 space-y-1 text-xs text-gray-400">
            <p>• Mixdown: All tracks mixed into stereo master</p>
            <p>• Stems: Each track exported as separate file</p>
            <p>• Tracks: Only export selected tracks</p>
          </div>

          <Button
            className="w-full bg-green-600 hover:bg-green-700"
            onClick={onExport}
            disabled={isExporting}
            data-testid="button-confirm-export"
          >
            {isExporting ? 'Exporting...' : `Export as ${exportFormat.toUpperCase()}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
