import { useRef, useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Upload, X, FileAudio, AlertCircle, CheckCircle, RotateCcw, ChevronDown, Music, User, Disc, Tag, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  trackNumber?: number;
  bpm?: number;
  key?: string;
}

interface AudioFile {
  file: File;
  id: string;
  duration?: number;
  waveform?: number[];
  metadata?: AudioMetadata;
  status: 'pending' | 'uploading' | 'processing' | 'analyzing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

interface TrackUploaderProps {
  files: AudioFile[];
  onChange: (files: AudioFile[]) => void;
  maxFiles?: number;
}

export function TrackUploader({ files, onChange, maxFiles = 20 }: TrackUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { toast } = useToast();
  
  const filesRef = useRef(files);
  const onChangeRef = useRef(onChange);
  const maxFilesRef = useRef(maxFiles);
  
  useEffect(() => {
    filesRef.current = files;
    onChangeRef.current = onChange;
    maxFilesRef.current = maxFiles;
  }, [files, onChange, maxFiles]);

  const ALLOWED_FORMATS = ['.wav', '.mp3', '.flac', '.aac', '.ogg', '.m4a'];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FORMATS.includes(ext)) {
      return `Invalid format. Allowed: ${ALLOWED_FORMATS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 100MB`;
    }
    return null;
  }, []);

  const getAudioDuration = useCallback((file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.addEventListener('error', reject);
      audio.src = URL.createObjectURL(file);
    });
  }, []);

  const generateWaveform = useCallback(async (file: File): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          const channelData = audioBuffer.getChannelData(0);
          const samples = 100;
          const blockSize = Math.floor(channelData.length / samples);
          const waveform: number[] = [];
          for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(channelData[i * blockSize + j]);
            }
            waveform.push(sum / blockSize);
          }
          const max = Math.max(...waveform);
          const normalized = waveform.map((v) => v / max);
          audioContext.close();
          resolve(normalized);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const extractMetadataFromFilename = useCallback((filename: string): AudioMetadata => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const patterns = [
      /^(\d+)[\s._-]+(.+)$/,
      /^(.+?)[\s._-]+[-–][\s._-]+(.+)$/,
      /^(.+)$/,
    ];
    let trackNumber: number | undefined;
    let title = nameWithoutExt;
    let artist: string | undefined;
    const match1 = nameWithoutExt.match(/^(\d+)[\s._-]+(.+)$/);
    if (match1) {
      trackNumber = parseInt(match1[1], 10);
      title = match1[2];
    }
    const match2 = title.match(/^(.+?)[\s._-]+[-–][\s._-]+(.+)$/);
    if (match2) {
      artist = match2[1].trim();
      title = match2[2].trim();
    }
    return {
      title: title.replace(/[_-]/g, ' ').trim(),
      artist,
      trackNumber,
    };
  }, []);

  const handleFilesInternal = useCallback(async (fileArray: File[]) => {
    const currentFiles = filesRef.current;
    const currentOnChange = onChangeRef.current;
    const currentMaxFiles = maxFilesRef.current;
    
    if (currentFiles.length + fileArray.length > currentMaxFiles) {
      toast({
        title: 'Too many files',
        description: `Maximum ${currentMaxFiles} tracks allowed`,
        variant: 'destructive',
      });
      return;
    }

    const audioFiles: AudioFile[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);

      if (error) {
        toast({
          title: 'Invalid file',
          description: `${file.name}: ${error}`,
          variant: 'destructive',
        });
        continue;
      }

      const audioFile: AudioFile = {
        file,
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'analyzing',
        progress: 50,
        metadata: extractMetadataFromFilename(file.name),
      };

      audioFiles.push(audioFile);
    }

    currentOnChange([...currentFiles, ...audioFiles]);

    for (const audioFile of audioFiles) {
      try {
        const [duration, waveform] = await Promise.all([
          getAudioDuration(audioFile.file),
          generateWaveform(audioFile.file),
        ]);
        
        const updatedFiles = filesRef.current.map((f) =>
          f.id === audioFile.id
            ? { ...f, duration, waveform, status: 'complete' as const, progress: 100 }
            : f
        );
        onChangeRef.current(updatedFiles);
      } catch (err: unknown) {
        logger.error('Error analyzing audio:', err);
        const updatedFiles = filesRef.current.map((f) =>
          f.id === audioFile.id
            ? { ...f, status: 'complete' as const, progress: 100 }
            : f
        );
        onChangeRef.current(updatedFiles);
      }
    }

    if (audioFiles.length > 0) {
      toast({
        title: 'Files added',
        description: `${audioFiles.length} track(s) added with waveform analysis`,
      });
    }
  }, [toast, validateFile, getAudioDuration, generateWaveform, extractMetadataFromFilename]);

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;
    const fileArray = Array.from(newFiles);
    handleFilesInternal(fileArray);
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!dropZoneRef.current?.contains(document.activeElement) && !isFocused) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      const audioFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file' && item.type.startsWith('audio/')) {
          const file = item.getAsFile();
          if (file) audioFiles.push(file);
        }
      }

      if (audioFiles.length > 0) {
        e.preventDefault();
        handleFilesInternal(audioFiles);
        toast({
          title: `${audioFiles.length} file${audioFiles.length > 1 ? 's' : ''} pasted`,
          description: 'Processing audio files...',
        });
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isFocused, handleFilesInternal, toast]);

  const removeFile = (id: string) => {
    onChange(files.filter((f) => f.id !== id));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const formatDuration = (seconds: number | undefined) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileAudio className="h-5 w-5" />
          Upload Tracks
        </CardTitle>
        <CardDescription>
          Upload audio files in WAV, MP3, FLAC, or AAC format. Maximum 100MB per file.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop Zone */}
        <div
          ref={dropZoneRef}
          className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-all cursor-pointer touch-manipulation ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : isFocused
                ? 'border-primary/70 bg-primary/5 ring-2 ring-primary/20'
                : 'border-muted-foreground/25 hover:border-primary/50 active:bg-muted/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          aria-label="Click or tap to upload audio files. Paste with Ctrl+V."
        >
          <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-muted-foreground" />
          <p className="text-base sm:text-lg font-medium mb-2">Tap to upload audio files</p>
          <p className="text-xs sm:text-sm text-muted-foreground mb-4 hidden sm:block">or drag & drop • paste with Ctrl+V</p>
          <p className="text-xs text-muted-foreground mb-4 sm:hidden">Tap anywhere in this area</p>
          <Button 
            type="button" 
            variant="outline" 
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="min-h-[44px] touch-manipulation"
          >
            <Upload className="h-4 w-4 mr-2" />
            Select Files
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_FORMATS.join(',') + ',audio/*'}
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
            aria-label="Upload audio files"
          />
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-4">
            Accepted formats: {ALLOWED_FORMATS.join(', ')} • Max {maxFiles} tracks
          </p>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Uploaded Tracks ({files.length})</h3>
            </div>

            <div className="space-y-3">
              {files.map((audioFile, index) => (
                <div
                  key={audioFile.id}
                  className="p-3 bg-muted/50 rounded-lg space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                      <span className="text-sm font-medium">{index + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{audioFile.metadata?.title || audioFile.file.name}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatFileSize(audioFile.file.size)}</span>
                        <span>{formatDuration(audioFile.duration)}</span>
                        <span className="capitalize">
                          {audioFile.file.type.split('/')[1] || 'audio'}
                        </span>
                        {audioFile.metadata?.artist && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {audioFile.metadata.artist}
                          </span>
                        )}
                      </div>

                      {audioFile.status === 'uploading' && (
                        <Progress value={audioFile.progress} className="h-1 mt-2" />
                      )}

                      {audioFile.status === 'analyzing' && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Analyzing audio...
                        </div>
                      )}

                      {audioFile.error && (
                        <p className="text-xs text-destructive mt-1">{audioFile.error}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {audioFile.status === 'complete' && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                      {audioFile.status === 'analyzing' && (
                        <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                      )}
                      {audioFile.status === 'error' && (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(audioFile.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {audioFile.waveform && audioFile.waveform.length > 0 && (
                    <div className="h-12 flex items-end gap-[2px] px-2 bg-background/50 rounded">
                      {audioFile.waveform.map((value, i) => (
                        <div
                          key={i}
                          className="flex-1 bg-primary/60 rounded-t transition-all hover:bg-primary"
                          style={{ height: `${Math.max(value * 100, 4)}%` }}
                        />
                      ))}
                    </div>
                  )}

                  {audioFile.metadata && (audioFile.metadata.title || audioFile.metadata.artist) && (
                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between">
                          <span className="flex items-center gap-2">
                            <Tag className="h-3 w-3" />
                            Detected Metadata
                          </span>
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {audioFile.metadata.title && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Title</Label>
                              <p className="truncate">{audioFile.metadata.title}</p>
                            </div>
                          )}
                          {audioFile.metadata.artist && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Artist</Label>
                              <p className="truncate">{audioFile.metadata.artist}</p>
                            </div>
                          )}
                          {audioFile.metadata.album && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Album</Label>
                              <p className="truncate">{audioFile.metadata.album}</p>
                            </div>
                          )}
                          {audioFile.metadata.trackNumber && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Track #</Label>
                              <p>{audioFile.metadata.trackNumber}</p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
