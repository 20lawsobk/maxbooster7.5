import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Download, Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface StemExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

interface Track {
  id: string;
  name: string;
  trackType: string;
  color?: string;
}

interface StemExport {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  zipArchiveUrl?: string;
  errorMessage?: string;
}

/**
 * TODO: Add function documentation
 */
export function StemExportDialog({ open, onOpenChange, projectId }: StemExportDialogProps) {
  const { toast } = useToast();
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3' | 'flac'>('wav');
  const [sampleRate, setSampleRate] = useState(48000);
  const [bitDepth, setBitDepth] = useState(24);
  const [bitrate, setBitrate] = useState(320);
  const [normalize, setNormalize] = useState(true);
  const [includeEffects, setIncludeEffects] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<StemExport | null>(null);

  const { data: tracks = [], isLoading: isLoadingTracks } = useQuery<Track[]>({
    queryKey: ['/api/studio/projects', projectId, 'tracks'],
    enabled: !!projectId && open,
  });

  useEffect(() => {
    if (open && tracks.length > 0) {
      const allTrackIds = new Set(tracks.map((t) => t.id));
      setSelectedTracks(allTrackIds);
    }
  }, [open, tracks]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    if (exportJobId) {
      pollInterval = setInterval(async () => {
        try {
          const res = await apiRequest('GET', `/api/studio/stem-exports/${exportJobId}`);
          const data = await res.json();
          setExportStatus(data);

          if (data.status === 'completed' || data.status === 'failed') {
            if (pollInterval) clearInterval(pollInterval);
            setIsExporting(false);

            if (data.status === 'completed') {
              toast({
                title: 'Export completed!',
                description: 'Your stems are ready to download.',
              });
            } else if (data.status === 'failed') {
              toast({
                title: 'Export failed',
                description: data.errorMessage || 'An error occurred during export.',
                variant: 'destructive',
              });
            }
          }
        } catch (error: unknown) {
          logger.error('Error polling export status:', error);
          if (pollInterval) clearInterval(pollInterval);
          setIsExporting(false);
        }
      }, 500);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [exportJobId, toast]);

  const handleToggleTrack = (trackId: string) => {
    setSelectedTracks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(trackId)) {
        newSet.delete(trackId);
      } else {
        newSet.add(trackId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const allTrackIds = new Set(tracks.map((t) => t.id));
    setSelectedTracks(allTrackIds);
  };

  const handleDeselectAll = () => {
    setSelectedTracks(new Set());
  };

  const handleExport = async () => {
    if (!projectId) {
      toast({ title: 'No project selected', variant: 'destructive' });
      return;
    }

    if (selectedTracks.size === 0) {
      toast({ title: 'Please select at least one track', variant: 'destructive' });
      return;
    }

    setIsExporting(true);
    setExportStatus(null);

    try {
      const res = await apiRequest('POST', `/api/studio/projects/${projectId}/export-stems`, {
        trackIds: Array.from(selectedTracks),
        exportFormat,
        sampleRate: exportFormat === 'wav' ? sampleRate : undefined,
        bitDepth: exportFormat === 'wav' ? bitDepth : undefined,
        normalize,
        includeEffects,
      });

      const data = await res.json();
      setExportJobId(data.jobId);
    } catch (error: unknown) {
      logger.error('Error starting stem export:', error);
      toast({
        title: 'Export failed',
        description: 'Failed to start stem export. Please try again.',
        variant: 'destructive',
      });
      setIsExporting(false);
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      setExportJobId(null);
      setExportStatus(null);
      onOpenChange(false);
    }
  };

  const handleDownload = () => {
    if (exportStatus?.zipArchiveUrl) {
      window.open(exportStatus.zipArchiveUrl, '_blank');
    }
  };

  const getFormatDescription = () => {
    switch (exportFormat) {
      case 'wav':
        return `WAV ${sampleRate / 1000}kHz / ${bitDepth}-bit (Lossless)`;
      case 'mp3':
        return `MP3 ${bitrate}kbps`;
      case 'flac':
        return 'FLAC (Lossless Compression)';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-[#252525] border-gray-700 text-white max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-green-400" />
            Export Stems
          </DialogTitle>
          <DialogDescription>
            Select tracks and configure export settings for individual stems
          </DialogDescription>
        </DialogHeader>

        {isExporting && exportStatus ? (
          <div className="space-y-4 py-6">
            <div className="text-center space-y-4">
              {exportStatus.status === 'completed' ? (
                <>
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold">Export Complete!</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Your stems have been exported successfully
                    </p>
                  </div>
                  <Button
                    onClick={handleDownload}
                    className="bg-green-600 hover:bg-green-700 gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download Stems
                  </Button>
                </>
              ) : exportStatus.status === 'failed' ? (
                <>
                  <AlertCircle className="h-16 w-16 text-red-500 mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold">Export Failed</h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {exportStatus.errorMessage || 'An error occurred during export'}
                    </p>
                  </div>
                  <Button onClick={handleClose} variant="outline" className="border-gray-600">
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Loader2 className="h-16 w-16 text-green-400 mx-auto animate-spin" />
                  <div>
                    <h3 className="text-lg font-semibold">
                      {exportStatus.status === 'pending' ? 'Preparing...' : 'Exporting Stems...'}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      Processing {selectedTracks.size} track{selectedTracks.size !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Progress value={exportStatus.progress} className="h-2" />
                    <p className="text-sm text-gray-400">{exportStatus.progress}% complete</p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Select Tracks to Export</Label>
                <div className="space-x-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                    className="text-xs h-7"
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                    className="text-xs h-7"
                  >
                    Deselect All
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-48 border border-gray-700 rounded-md p-3 bg-[#1a1a1a]">
                {isLoadingTracks ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : tracks.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    No tracks found in this project
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tracks.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center space-x-2 p-2 rounded hover:bg-[#2a2a2a] cursor-pointer"
                        onClick={() => handleToggleTrack(track.id)}
                      >
                        <Checkbox
                          checked={selectedTracks.has(track.id)}
                          onCheckedChange={() => handleToggleTrack(track.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex items-center gap-2 flex-1">
                          {track.color && (
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: track.color }}
                            />
                          )}
                          <span className="text-sm">{track.name}</span>
                          <span className="text-xs text-gray-500 ml-auto">{track.trackType}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-gray-400 mt-1">
                {selectedTracks.size} track{selectedTracks.size !== 1 ? 's' : ''} selected
              </p>
            </div>

            <Separator className="bg-gray-700" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Export Format</Label>
                <Select value={exportFormat} onValueChange={(v: unknown) => setExportFormat(v)}>
                  <SelectTrigger className="bg-[#1a1a1a] border-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#252525] border-gray-700">
                    <SelectItem value="wav">WAV (Lossless)</SelectItem>
                    <SelectItem value="mp3">MP3</SelectItem>
                    <SelectItem value="flac">FLAC (Lossless)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-400">{getFormatDescription()}</p>
              </div>

              {exportFormat === 'wav' ? (
                <>
                  <div className="space-y-2">
                    <Label>Sample Rate</Label>
                    <Select
                      value={sampleRate.toString()}
                      onValueChange={(v) => setSampleRate(parseInt(v))}
                    >
                      <SelectTrigger className="bg-[#1a1a1a] border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252525] border-gray-700">
                        <SelectItem value="44100">44.1 kHz</SelectItem>
                        <SelectItem value="48000">48 kHz</SelectItem>
                        <SelectItem value="96000">96 kHz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bit Depth</Label>
                    <Select
                      value={bitDepth.toString()}
                      onValueChange={(v) => setBitDepth(parseInt(v))}
                    >
                      <SelectTrigger className="bg-[#1a1a1a] border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#252525] border-gray-700">
                        <SelectItem value="16">16-bit</SelectItem>
                        <SelectItem value="24">24-bit</SelectItem>
                        <SelectItem value="32">32-bit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Bitrate</Label>
                  <Select value={bitrate.toString()} onValueChange={(v) => setBitrate(parseInt(v))}>
                    <SelectTrigger className="bg-[#1a1a1a] border-gray-700">
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

            <Separator className="bg-gray-700" />

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="normalize"
                  checked={normalize}
                  onCheckedChange={(checked) => setNormalize(checked as boolean)}
                />
                <Label htmlFor="normalize" className="cursor-pointer">
                  Normalize audio levels
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeEffects"
                  checked={includeEffects}
                  onCheckedChange={(checked) => setIncludeEffects(checked as boolean)}
                />
                <Label htmlFor="includeEffects" className="cursor-pointer">
                  Include track effects and processing
                </Label>
              </div>
            </div>

            <Separator className="bg-gray-700" />

            <div className="pt-2 space-y-1 text-xs text-gray-400">
              <p>• Each track will be exported as a separate file</p>
              <p>• Files will be packaged in a ZIP archive</p>
              <p>• Original track names will be preserved</p>
            </div>

            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleExport}
              disabled={selectedTracks.size === 0 || isLoadingTracks}
            >
              Export {selectedTracks.size} Stem{selectedTracks.size !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
