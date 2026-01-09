import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Upload, X, FileAudio, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface AudioFile {
  file: File;
  id: string;
  duration?: number;
  waveform?: number[];
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
  error?: string;
}

interface TrackUploaderProps {
  files: AudioFile[];
  onChange: (files: AudioFile[]) => void;
  maxFiles?: number;
}

/**
 * TODO: Add function documentation
 */
export function TrackUploader({ files, onChange, maxFiles = 20 }: TrackUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const ALLOWED_FORMATS = ['.wav', '.mp3', '.flac', '.aac', '.ogg', '.m4a'];
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FORMATS.includes(ext)) {
      return `Invalid format. Allowed: ${ALLOWED_FORMATS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: 100MB`;
    }
    return null;
  };

  const handleFiles = async (newFiles: FileList | null) => {
    if (!newFiles) return;

    const fileArray = Array.from(newFiles);

    if (files.length + fileArray.length > maxFiles) {
      toast({
        title: 'Too many files',
        description: `Maximum ${maxFiles} tracks allowed`,
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
        status: 'complete',
        progress: 100,
      };

      // Extract audio duration
      try {
        const duration = await getAudioDuration(file);
        audioFile.duration = duration;
      } catch (err: unknown) {
        logger.error('Error getting audio duration:', err);
      }

      audioFiles.push(audioFile);
    }

    onChange([...files, ...audioFiles]);

    toast({
      title: 'Files added',
      description: `${audioFiles.length} track(s) ready for upload`,
    });
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.addEventListener('loadedmetadata', () => {
        resolve(audio.duration);
      });
      audio.addEventListener('error', reject);
      audio.src = URL.createObjectURL(file);
    });
  };

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
          className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center transition-colors cursor-pointer touch-manipulation ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50 active:bg-muted/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
          aria-label="Click or tap to upload audio files"
        >
          <Upload className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-muted-foreground" />
          <p className="text-base sm:text-lg font-medium mb-2">Tap to upload audio files</p>
          <p className="text-xs sm:text-sm text-muted-foreground mb-4 hidden sm:block">or drag & drop files here</p>
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

            <div className="space-y-2">
              {files.map((audioFile, index) => (
                <div
                  key={audioFile.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                    <span className="text-sm font-medium">{index + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{audioFile.file.name}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatFileSize(audioFile.file.size)}</span>
                      <span>{formatDuration(audioFile.duration)}</span>
                      <span className="capitalize">
                        {audioFile.file.type.split('/')[1] || 'audio'}
                      </span>
                    </div>

                    {audioFile.status === 'uploading' && (
                      <Progress value={audioFile.progress} className="h-1 mt-2" />
                    )}

                    {audioFile.error && (
                      <p className="text-xs text-destructive mt-1">{audioFile.error}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {audioFile.status === 'complete' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
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
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
