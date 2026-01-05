import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { uploadWithProgress } from '@/lib/queryClient';
import {
  Upload,
  FileAudio,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Music,
  FolderOpen,
} from 'lucide-react';

interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface FileUploadZoneProps {
  projectId: number | null;
  onUploadComplete?: () => void;
  className?: string;
  compact?: boolean;
  externalFiles?: FileList | null;
  onExternalFilesProcessed?: () => void;
}

const ACCEPTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp3',
  'audio/mpeg',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/ogg',
  'audio/webm',
];

const ACCEPTED_EXTENSIONS = ['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg', '.webm'];
const MAX_FILE_SIZE = 500 * 1024 * 1024;

export function FileUploadZone({
  projectId,
  onUploadComplete,
  className,
  compact = false,
  externalFiles,
  onExternalFilesProcessed,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedExternalFilesRef = useRef<FileList | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const validateFile = useCallback((file: File): string | null => {
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      return `Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    return null;
  }, []);

  const uploadFile = useCallback(
    async (uploadingFile: UploadingFile) => {
      const formData = new FormData();
      formData.append('audioFile', uploadingFile.file);
      if (projectId) {
        formData.append('projectId', projectId.toString());
      }

      try {
        setUploadingFiles((prev) =>
          prev.map((f) => (f.id === uploadingFile.id ? { ...f, status: 'uploading' } : f))
        );

        await uploadWithProgress('/api/studio/upload', formData, {
          onProgress: (percent) => {
            setUploadingFiles((prev) =>
              prev.map((f) => (f.id === uploadingFile.id ? { ...f, progress: percent } : f))
            );
          },
          timeout: 300000, // 5 minutes
        });

        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === uploadingFile.id ? { ...f, status: 'success', progress: 100 } : f
          )
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed';
        setUploadingFiles((prev) =>
          prev.map((f) =>
            f.id === uploadingFile.id ? { ...f, status: 'error', error: errorMessage } : f
          )
        );
        throw error;
      }
    },
    [projectId]
  );

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const newUploadingFiles: UploadingFile[] = [];

      for (const file of fileArray) {
        const validationError = validateFile(file);
        if (validationError) {
          toast({
            title: `Cannot upload ${file.name}`,
            description: validationError,
            variant: 'destructive',
          });
          continue;
        }

        const uploadingFile: UploadingFile = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          file,
          progress: 0,
          status: 'pending',
        };
        newUploadingFiles.push(uploadingFile);
      }

      if (newUploadingFiles.length === 0) return;

      setUploadingFiles((prev) => [...prev, ...newUploadingFiles]);

      setUploadingFiles((prev) =>
        prev.map((f) =>
          newUploadingFiles.find((nf) => nf.id === f.id)
            ? { ...f, status: 'uploading' as const }
            : f
        )
      );

      const uploadPromises = newUploadingFiles.map((uploadingFile) =>
        uploadFile(uploadingFile)
          .then(() => ({ success: true }))
          .catch(() => ({ success: false }))
      );

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((r) => r.success).length;
      const errorCount = results.filter((r) => !r.success).length;

      queryClient.invalidateQueries({
        queryKey: ['/api/studio/projects', projectId, 'tracks'],
      });
      queryClient.invalidateQueries({ queryKey: ['/api/studio/recent-files'] });

      if (successCount > 0) {
        toast({
          title: `${successCount} file${successCount > 1 ? 's' : ''} uploaded successfully`,
        });
        onUploadComplete?.();
      }

      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((f) => f.status !== 'success'));
      }, 2000);
    },
    [validateFile, uploadFile, queryClient, projectId, toast, onUploadComplete]
  );

  useEffect(() => {
    if (externalFiles && externalFiles.length > 0 && externalFiles !== processedExternalFilesRef.current) {
      processedExternalFilesRef.current = externalFiles;
      processFiles(externalFiles);
      onExternalFilesProcessed?.();
    }
  }, [externalFiles, processFiles, onExternalFilesProcessed]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        processFiles(files);
      }
    },
    [processFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [processFiles]
  );

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const hasActiveUploads = uploadingFiles.some(
    (f) => f.status === 'pending' || f.status === 'uploading'
  );

  if (compact) {
    return (
      <div className={cn('space-y-2', className)}>
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-4 transition-all duration-200 cursor-pointer',
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
          )}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleBrowseClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,.flac,.ogg,.aiff,.aif,.webm,.aac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/aiff,audio/webm,audio/aac,audio/mp4,audio/*"
            multiple
            onChange={handleFileSelect}
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload audio files"
          />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Drop audio files or click to browse</p>
              <p className="text-xs text-muted-foreground">WAV, MP3, FLAC, AIFF, OGG</p>
            </div>
          </div>
        </div>

        {uploadingFiles.length > 0 && (
          <div className="space-y-1">
            {uploadingFiles.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 p-2 rounded-md bg-muted/50 text-sm"
              >
                {file.status === 'uploading' ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : file.status === 'success' ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : file.status === 'error' ? (
                  <AlertCircle className="h-3 w-3 text-destructive" />
                ) : (
                  <FileAudio className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="flex-1 truncate text-xs">{file.file.name}</span>
                {file.status === 'uploading' && (
                  <span className="text-xs text-muted-foreground">{file.progress}%</span>
                )}
                {(file.status === 'error' || file.status === 'pending') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4"
                    onClick={() => removeFile(file.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3 sm:space-y-4', className)}>
      <div
        className={cn(
          'relative border-2 border-dashed rounded-xl p-4 sm:p-6 md:p-8 transition-all duration-200',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.01] sm:scale-[1.02]'
            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mp3,.flac,.ogg,.aiff,.aif,.webm,.aac,.m4a,audio/mpeg,audio/wav,audio/flac,audio/ogg,audio/aiff,audio/webm,audio/aac,audio/mp4,audio/*"
          multiple
          onChange={handleFileSelect}
          className="sr-only"
          tabIndex={-1}
          aria-label="Upload audio files"
        />

        <div className="flex flex-col items-center justify-center text-center gap-3 sm:gap-4">
          <div
            className={cn(
              'p-3 sm:p-4 rounded-full transition-all duration-200',
              isDragging ? 'bg-primary/20 scale-110' : 'bg-muted'
            )}
          >
            {isDragging ? (
              <Music className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-bounce" />
            ) : (
              <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-base sm:text-lg font-medium">
              {isDragging ? 'Drop your audio files here' : 'Drag & drop audio files'}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground">
              or tap the button below to browse
            </p>
          </div>

          <Button 
            onClick={handleBrowseClick} 
            variant="outline" 
            className="gap-2 h-9 sm:h-10 px-4 sm:px-6 text-sm"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden xs:inline">Browse Files</span>
            <span className="xs:hidden">Browse</span>
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-muted">WAV</span>
            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-muted">MP3</span>
            <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full bg-muted">FLAC</span>
            <span className="hidden sm:inline px-2 py-1 rounded-full bg-muted">AIFF</span>
            <span className="hidden sm:inline px-2 py-1 rounded-full bg-muted">OGG</span>
            <span className="text-muted-foreground/60 text-[9px] sm:text-xs">Max 500MB</span>
          </div>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs sm:text-sm font-medium">
              {hasActiveUploads ? 'Uploading...' : 'Upload Complete'}
            </h4>
            {!hasActiveUploads && uploadingFiles.some((f) => f.status === 'error') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadingFiles([])}
                className="h-6 sm:h-7 text-[10px] sm:text-xs px-2"
              >
                Clear All
              </Button>
            )}
          </div>

          <div className="space-y-1.5 sm:space-y-2 max-h-32 sm:max-h-48 overflow-y-auto">
            {uploadingFiles.map((file) => (
              <div
                key={file.id}
                className={cn(
                  'flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-colors',
                  file.status === 'success'
                    ? 'bg-green-500/10'
                    : file.status === 'error'
                      ? 'bg-destructive/10'
                      : 'bg-muted/50'
                )}
              >
                {file.status === 'uploading' ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-primary flex-shrink-0" />
                ) : file.status === 'success' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500 flex-shrink-0" />
                ) : file.status === 'error' ? (
                  <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive flex-shrink-0" />
                ) : (
                  <FileAudio className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">{file.file.name}</p>
                  {file.status === 'uploading' && (
                    <Progress value={file.progress} className="h-1 mt-1" />
                  )}
                  {file.status === 'error' && file.error && (
                    <p className="text-[10px] sm:text-xs text-destructive mt-0.5 line-clamp-1">{file.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {file.status === 'uploading' && (
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{file.progress}%</span>
                  )}
                  <span className="text-[10px] sm:text-xs text-muted-foreground hidden xs:inline">
                    {(file.file.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                  {(file.status === 'error' || file.status === 'pending') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 sm:h-6 sm:w-6"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
