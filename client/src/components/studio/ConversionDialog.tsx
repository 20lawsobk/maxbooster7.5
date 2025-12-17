import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Download, X, RefreshCw, FileAudio, Check, Loader2, Plus, AlertCircle } from 'lucide-react';

interface ConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  availableFiles?: Array<{
    path: string;
    name: string;
    size?: number;
  }>;
}

interface Conversion {
  id: string;
  sourceFilePath: string;
  targetFormat: string;
  qualityPreset: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  outputFilePath?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

const FORMAT_OPTIONS = [
  { value: 'wav', label: 'WAV (Lossless)', description: 'Uncompressed audio' },
  { value: 'flac', label: 'FLAC (Lossless)', description: 'Compressed lossless' },
  { value: 'mp3', label: 'MP3', description: 'Universal compatibility' },
  { value: 'aac', label: 'AAC', description: 'Better quality than MP3' },
  { value: 'm4a', label: 'M4A (AAC)', description: 'Apple devices' },
  { value: 'ogg', label: 'OGG Vorbis', description: 'Open source' },
];

const QUALITY_OPTIONS = [
  {
    value: 'low',
    label: 'Low',
    description: '128 kbps / 44.1 kHz',
    formats: ['mp3', 'aac', 'm4a', 'ogg'],
  },
  {
    value: 'medium',
    label: 'Medium',
    description: '192 kbps / 44.1 kHz',
    formats: ['mp3', 'aac', 'm4a', 'ogg'],
  },
  {
    value: 'high',
    label: 'High',
    description: '320 kbps / 48 kHz',
    formats: ['mp3', 'aac', 'm4a', 'ogg'],
  },
  {
    value: 'lossless',
    label: 'Lossless',
    description: '48 kHz uncompressed',
    formats: ['wav', 'flac'],
  },
];

/**
 * TODO: Add function documentation
 */
export function ConversionDialog({
  open,
  onOpenChange,
  projectId,
  availableFiles = [],
}: ConversionDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [targetFormat, setTargetFormat] = useState<string>('mp3');
  const [qualityPreset, setQualityPreset] = useState<string>('high');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Fetch conversion history
  const { data: conversions = [], isLoading: conversionsLoading } = useQuery<Conversion[]>({
    queryKey: projectId ? ['/api/studio/conversions', projectId] : ['/api/studio/conversions'],
    queryFn: projectId
      ? async () => {
          const response = await fetch(`/api/studio/conversions?projectId=${projectId}`);
          if (!response.ok) throw new Error('Failed to fetch conversions');
          return response.json();
        }
      : undefined,
    refetchInterval: (query) => {
      // Poll every 1 second if there are active conversions
      const data = query.state.data;
      const hasActive =
        Array.isArray(data) &&
        data.some((c) => c.status === 'pending' || c.status === 'processing');
      return hasActive ? 1000 : false;
    },
    enabled: open,
  });

  // Create conversion mutation
  const createConversion = useMutation({
    mutationFn: async (data: {
      sourceFilePath: string;
      targetFormat: string;
      qualityPreset: string;
    }) => {
      return await apiRequest('/api/studio/conversions', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          projectId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/conversions'] });
      toast({
        title: 'Conversion started',
        description: 'Your file is being converted in the background.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Conversion failed',
        description: error.message || 'Failed to start conversion',
        variant: 'destructive',
      });
    },
  });

  // Cancel conversion mutation
  const cancelConversion = useMutation({
    mutationFn: async (conversionId: string) => {
      return await apiRequest(`/api/studio/conversions/${conversionId}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/conversions'] });
      toast({
        title: 'Conversion cancelled',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Cancellation failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle file selection toggle
  const toggleFileSelection = (filePath: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(filePath)) {
      newSelection.delete(filePath);
    } else {
      newSelection.add(filePath);
    }
    setSelectedFiles(newSelection);
  };

  // Handle select all/none
  const selectAll = () => {
    setSelectedFiles(new Set(availableFiles.map((f) => f.path)));
  };

  const selectNone = () => {
    setSelectedFiles(new Set());
  };

  // Start conversions
  const handleConvert = async () => {
    if (selectedFiles.size === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select at least one file to convert.',
        variant: 'destructive',
      });
      return;
    }

    // Create conversion for each selected file
    for (const filePath of selectedFiles) {
      await createConversion.mutateAsync({
        sourceFilePath: filePath,
        targetFormat,
        qualityPreset,
      });
    }

    // Clear selection after conversion
    setSelectedFiles(new Set());
  };

  // Download file
  const handleDownload = (conversionId: string, filename: string) => {
    const downloadUrl = `/api/studio/conversions/${conversionId}/download`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add to project (create clip from converted file)
  const addToProject = useMutation({
    mutationFn: async (data: { outputFilePath: string; name: string }) => {
      // Create a new audio clip from the converted file
      return await apiRequest('/api/studio/clips/audio', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          name: data.name,
          filePath: data.outputFilePath,
          startTime: 0,
          duration: 0, // Will be calculated by backend
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/studio/projects', projectId, 'clips'] });
      toast({
        title: 'Added to project',
        description: 'Converted file has been added as a clip.',
      });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Failed to add to project',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Filter quality options based on selected format
  const availableQualityOptions = QUALITY_OPTIONS.filter((option) =>
    option.formats.includes(targetFormat)
  );

  // Auto-adjust quality preset when format changes
  useEffect(() => {
    if (!availableQualityOptions.some((opt) => opt.value === qualityPreset)) {
      setQualityPreset(availableQualityOptions[0]?.value || 'high');
    }
  }, [targetFormat, qualityPreset, availableQualityOptions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        data-testid="dialog-conversion"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-conversion-title">Audio Format Conversion</DialogTitle>
          <DialogDescription data-testid="text-conversion-description">
            Convert audio files to different formats with various quality presets
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Conversion Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-format" data-testid="label-target-format">
                Target Format
              </Label>
              <Select value={targetFormat} onValueChange={setTargetFormat}>
                <SelectTrigger id="target-format" data-testid="select-target-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent data-testid="select-content-format">
                  {FORMAT_OPTIONS.map((format) => (
                    <SelectItem
                      key={format.value}
                      value={format.value}
                      data-testid={`option-format-${format.value}`}
                    >
                      <div>
                        <div className="font-medium">{format.label}</div>
                        <div className="text-xs text-muted-foreground">{format.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality-preset" data-testid="label-quality-preset">
                Quality Preset
              </Label>
              <Select value={qualityPreset} onValueChange={setQualityPreset}>
                <SelectTrigger id="quality-preset" data-testid="select-quality-preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent data-testid="select-content-quality">
                  {availableQualityOptions.map((quality) => (
                    <SelectItem
                      key={quality.value}
                      value={quality.value}
                      data-testid={`option-quality-${quality.value}`}
                    >
                      <div>
                        <div className="font-medium">{quality.label}</div>
                        <div className="text-xs text-muted-foreground">{quality.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* File Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label data-testid="label-select-files">Select Files to Convert</Label>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  data-testid="button-select-all"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectNone}
                  data-testid="button-select-none"
                >
                  Clear
                </Button>
              </div>
            </div>
            <ScrollArea className="h-40 border rounded-md p-4" data-testid="scroll-file-list">
              {availableFiles.length === 0 ? (
                <div className="text-center text-muted-foreground py-8" data-testid="text-no-files">
                  No audio files available in this project
                </div>
              ) : (
                <div className="space-y-2">
                  {availableFiles.map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                      onClick={() => toggleFileSelection(file.path)}
                      data-testid={`file-item-${file.path}`}
                    >
                      <Checkbox
                        checked={selectedFiles.has(file.path)}
                        onCheckedChange={() => toggleFileSelection(file.path)}
                        data-testid={`checkbox-file-${file.path}`}
                      />
                      <FileAudio className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-sm" data-testid={`text-filename-${file.path}`}>
                        {file.name}
                      </span>
                      {file.size && (
                        <span
                          className="text-xs text-muted-foreground"
                          data-testid={`text-filesize-${file.path}`}
                        >
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <Button
            onClick={handleConvert}
            disabled={selectedFiles.size === 0 || createConversion.isPending}
            className="w-full"
            data-testid="button-start-conversion"
          >
            {createConversion.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting Conversion...
              </>
            ) : (
              <>
                Convert{' '}
                {selectedFiles.size > 0 &&
                  `(${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''})`}
              </>
            )}
          </Button>

          <Separator />

          {/* Conversion Queue */}
          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <Label data-testid="label-conversion-queue">Conversion Queue</Label>
            <ScrollArea
              className="flex-1 border rounded-md p-4"
              data-testid="scroll-conversion-queue"
            >
              {conversionsLoading ? (
                <div
                  className="flex items-center justify-center py-8"
                  data-testid="loading-conversions"
                >
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : conversions.length === 0 ? (
                <div
                  className="text-center text-muted-foreground py-8"
                  data-testid="text-no-conversions"
                >
                  No conversions yet
                </div>
              ) : (
                <div className="space-y-3">
                  {conversions.map((conversion) => (
                    <div
                      key={conversion.id}
                      className="border rounded-md p-3 space-y-2"
                      data-testid={`conversion-item-${conversion.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm font-medium truncate"
                            data-testid={`text-conversion-source-${conversion.id}`}
                          >
                            {conversion.sourceFilePath.split('/').pop()}
                          </div>
                          <div
                            className="text-xs text-muted-foreground"
                            data-testid={`text-conversion-format-${conversion.id}`}
                          >
                            {conversion.targetFormat.toUpperCase()} · {conversion.qualityPreset}
                          </div>
                        </div>
                        <Badge
                          variant={
                            conversion.status === 'completed'
                              ? 'default'
                              : conversion.status === 'failed'
                                ? 'destructive'
                                : conversion.status === 'cancelled'
                                  ? 'secondary'
                                  : 'outline'
                          }
                          data-testid={`badge-status-${conversion.id}`}
                        >
                          {conversion.status}
                        </Badge>
                      </div>

                      {(conversion.status === 'pending' || conversion.status === 'processing') && (
                        <div className="space-y-1">
                          <Progress
                            value={conversion.progress}
                            data-testid={`progress-${conversion.id}`}
                          />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span data-testid={`text-progress-${conversion.id}`}>
                              {conversion.progress}%
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cancelConversion.mutate(conversion.id)}
                              data-testid={`button-cancel-${conversion.id}`}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}

                      {conversion.status === 'completed' && conversion.outputFilePath && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleDownload(
                                conversion.id,
                                conversion.outputFilePath!.split('/').pop() || 'converted.mp3'
                              )
                            }
                            data-testid={`button-download-${conversion.id}`}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            Download
                          </Button>
                          {projectId && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                addToProject.mutate({
                                  outputFilePath: conversion.outputFilePath!,
                                  name: conversion.outputFilePath!.split('/').pop() || 'converted',
                                })
                              }
                              data-testid={`button-add-to-project-${conversion.id}`}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add to Project
                            </Button>
                          )}
                        </div>
                      )}

                      {conversion.status === 'failed' && conversion.errorMessage && (
                        <div
                          className="flex items-start gap-2 text-xs text-destructive"
                          data-testid={`error-message-${conversion.id}`}
                        >
                          <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{conversion.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
