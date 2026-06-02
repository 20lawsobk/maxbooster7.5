import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileValidator, type ValidationResult } from "./FileValidator";
import {
  Upload,
  FileAudio,
  FileImage,
  FileVideo,
  File,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Cloud,
  Zap,
  Eye,
} from "lucide-react";

export interface UploadFile {
  id: string;
  file: File;
  progress: number;
  uploadedBytes: number;
  speed: number;
  status:
    | "pending"
    | "validating"
    | "uploading"
    | "paused"
    | "processing"
    | "success"
    | "error"
    | "cancelled";
  error?: string;
  previewUrl?: string;
  chunks?: ChunkInfo[];
  currentChunk?: number;
  retryCount: number;
}

interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  uploaded: boolean;
}

export interface FileUploaderProps {
  onUploadComplete?: (files: UploadFile[]) => void;
  onFileAdded?: (file: UploadFile) => void;
  onError?: (error: string, file: UploadFile) => void;
  uploadEndpoint?: string;
  maxFileSize?: number;
  maxFiles?: number;
  acceptedTypes?: string[];
  enableChunkedUpload?: boolean;
  chunkSize?: number;
  className?: string;
  compact?: boolean;
  showPreview?: boolean;
  category?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_RETRIES = 3;

const FILE_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  audio: FileAudio,
  image: FileImage,
  video: FileVideo,
  default: File,
};

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("audio/")) return FILE_ICONS.audio;
  if (mimeType.startsWith("image/")) return FILE_ICONS.image;
  if (mimeType.startsWith("video/")) return FILE_ICONS.video;
  return FILE_ICONS.default;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatETA(remainingBytes: number, speed: number): string {
  if (speed === 0) return "Calculating...";
  const seconds = Math.ceil(remainingBytes / speed);
  if (seconds < 60) return `${seconds}s remaining`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes}m remaining`;
}

export function FileUploader({
  onUploadComplete,
  onFileAdded,
  onError,
  uploadEndpoint = "/api/storage/upload",
  maxFileSize = 500 * 1024 * 1024,
  maxFiles = 10,
  acceptedTypes = [
    "audio/*",
    "image/*",
    ".wav",
    ".mp3",
    ".flac",
    ".aiff",
    ".ogg",
  ],
  enableChunkedUpload = true,
  chunkSize = CHUNK_SIZE,
  className,
  compact = false,
  showPreview = true,
  category = "files",
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const uploadStartTimeRef = useRef<Map<string, number>>(new Map());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const generateFileId = () =>
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const createChunks = (file: File): ChunkInfo[] => {
    const chunks: ChunkInfo[] = [];
    let start = 0;
    let index = 0;
    while (start < file.size) {
      const end = Math.min(start + chunkSize, file.size);
      chunks.push({ index, start, end, uploaded: false });
      start = end;
      index++;
    }
    return chunks;
  };

  const updateFile = useCallback((id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
  }, []);

  const createPreviewUrl = async (file: File): Promise<string | undefined> => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    if (file.type.startsWith("audio/")) {
      return URL.createObjectURL(file);
    }
    return undefined;
  };

  const uploadChunk = async (
    uploadFile: UploadFile,
    chunk: ChunkInfo,
    abortController: AbortController,
  ): Promise<boolean> => {
    const formData = new FormData();
    const blob = uploadFile.file.slice(chunk.start, chunk.end);
    formData.append("chunk", blob);
    formData.append("chunkIndex", chunk.index.toString());
    formData.append("totalChunks", (uploadFile.chunks?.length || 1).toString());
    formData.append("fileId", uploadFile.id);
    formData.append("fileName", uploadFile.file.name);
    formData.append("fileSize", uploadFile.file.size.toString());
    formData.append("mimeType", uploadFile.file.type);
    formData.append("category", category);

    const response = await apiRequest(
      "POST",
      `${uploadEndpoint}/chunk`,
      formData,
      {
        signal: abortController.signal,
      },
    );

    return true;
  };

  const uploadWhole = async (
    uploadFile: UploadFile,
    abortController: AbortController,
    onProgress: (loaded: number) => void,
  ): Promise<boolean> => {
    const formData = new FormData();
    formData.append("file", uploadFile.file);
    formData.append("fileId", uploadFile.id);
    formData.append("category", category);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded);
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true);
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || "Upload failed"));
          } catch {
            reject(new Error("Upload failed"));
          }
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Network error")));
      xhr.addEventListener("abort", () =>
        reject(new Error("Upload cancelled")),
      );

      abortController.signal.addEventListener("abort", () => xhr.abort());

      xhr.open("POST", uploadEndpoint);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  const startUpload = useCallback(
    async (uploadFile: UploadFile) => {
      const abortController = new AbortController();
      abortControllersRef.current.set(uploadFile.id, abortController);
      uploadStartTimeRef.current.set(uploadFile.id, Date.now());

      try {
        updateFile(uploadFile.id, { status: "uploading" });

        const useChunked =
          enableChunkedUpload && uploadFile.file.size > chunkSize;

        if (useChunked) {
          const chunks = uploadFile.chunks || createChunks(uploadFile.file);
          updateFile(uploadFile.id, { chunks });

          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk.uploaded) continue;

            const currentFile = files.find((f) => f.id === uploadFile.id);
            if (
              currentFile?.status === "paused" ||
              currentFile?.status === "cancelled"
            ) {
              return;
            }

            await uploadChunk(uploadFile, chunk, abortController);

            const uploadedBytes = chunk.end;
            const elapsed =
              (Date.now() -
                (uploadStartTimeRef.current.get(uploadFile.id) || Date.now())) /
              1000;
            const speed = elapsed > 0 ? uploadedBytes / elapsed : 0;
            const progress = Math.round(
              (uploadedBytes / uploadFile.file.size) * 100,
            );

            const updatedChunks = chunks.map((c, idx) =>
              idx <= i ? { ...c, uploaded: true } : c,
            );

            updateFile(uploadFile.id, {
              progress,
              uploadedBytes,
              speed,
              currentChunk: i + 1,
              chunks: updatedChunks,
            });
          }
        } else {
          await uploadWhole(uploadFile, abortController, (loaded) => {
            const elapsed =
              (Date.now() -
                (uploadStartTimeRef.current.get(uploadFile.id) || Date.now())) /
              1000;
            const speed = elapsed > 0 ? loaded / elapsed : 0;
            const progress = Math.round((loaded / uploadFile.file.size) * 100);
            updateFile(uploadFile.id, {
              progress,
              uploadedBytes: loaded,
              speed,
            });
          });
        }

        updateFile(uploadFile.id, { status: "processing" });

        await new Promise((resolve) => setTimeout(resolve, 500));

        updateFile(uploadFile.id, { status: "success", progress: 100 });

        toast({
          title: "Upload Complete",
          description: `${uploadFile.file.name} uploaded successfully`,
        });

        onUploadComplete?.([uploadFile]);
      } catch (error) {
        if (error instanceof Error && error.message === "Upload cancelled") {
          updateFile(uploadFile.id, { status: "cancelled" });
          return;
        }

        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        updateFile(uploadFile.id, {
          status: "error",
          error: errorMessage,
          retryCount: uploadFile.retryCount + 1,
        });

        onError?.(errorMessage, uploadFile);

        toast({
          title: "Upload Failed",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        abortControllersRef.current.delete(uploadFile.id);
        uploadStartTimeRef.current.delete(uploadFile.id);
      }
    },
    [
      enableChunkedUpload,
      chunkSize,
      category,
      uploadEndpoint,
      files,
      updateFile,
      toast,
      onUploadComplete,
      onError,
    ],
  );

  const pauseUpload = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
      }
      updateFile(id, { status: "paused" });
      toast({ title: "Upload Paused", description: "Upload has been paused" });
    },
    [updateFile, toast],
  );

  const resumeUpload = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file) {
        startUpload(file);
      }
    },
    [files, startUpload],
  );

  const cancelUpload = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
      }
      updateFile(id, { status: "cancelled" });

      setTimeout(() => {
        setFiles((prev) => prev.filter((f) => f.id !== id));
      }, 1000);

      toast({
        title: "Upload Cancelled",
        description: "Upload has been cancelled and cleaned up",
      });
    },
    [updateFile, toast],
  );

  const retryUpload = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file && file.retryCount < MAX_RETRIES) {
        updateFile(id, {
          status: "pending",
          error: undefined,
          progress: 0,
          uploadedBytes: 0,
        });
        startUpload({
          ...file,
          status: "pending",
          error: undefined,
          progress: 0,
          uploadedBytes: 0,
        });
      } else {
        toast({
          title: "Max Retries Reached",
          description: "Please try uploading the file again",
          variant: "destructive",
        });
      }
    },
    [files, updateFile, startUpload, toast],
  );

  const removeFile = useCallback(
    (id: string) => {
      const file = files.find((f) => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      setFiles((prev) => prev.filter((f) => f.id !== id));
    },
    [files],
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const fileArray = Array.from(fileList);
      const currentCount = files.length;

      if (currentCount + fileArray.length > maxFiles) {
        toast({
          title: "Too Many Files",
          description: `Maximum ${maxFiles} files allowed`,
          variant: "destructive",
        });
        return;
      }

      for (const file of fileArray) {
        const validation = FileValidator.validate(file, {
          maxSize: maxFileSize,
          allowedTypes: acceptedTypes,
        });

        if (!validation.valid) {
          toast({
            title: `Cannot upload ${file.name}`,
            description: validation.errors.join(", "),
            variant: "destructive",
          });
          continue;
        }

        const previewUrl = showPreview
          ? await createPreviewUrl(file)
          : undefined;

        const uploadFile: UploadFile = {
          id: generateFileId(),
          file,
          progress: 0,
          uploadedBytes: 0,
          speed: 0,
          status: "pending",
          previewUrl,
          retryCount: 0,
        };

        setFiles((prev) => [...prev, uploadFile]);
        onFileAdded?.(uploadFile);
        startUpload(uploadFile);
      }
    },
    [
      files.length,
      maxFiles,
      maxFileSize,
      acceptedTypes,
      showPreview,
      toast,
      onFileAdded,
      startUpload,
    ],
  );

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
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [processFiles],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    return () => {
      abortControllersRef.current.forEach((controller) => controller.abort());
      files.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, []);

  const activeUploads = files.filter((f) =>
    ["uploading", "pending", "validating"].includes(f.status),
  );
  const completedUploads = files.filter((f) => f.status === "success");
  const failedUploads = files.filter((f) => f.status === "error");

  if (compact) {
    return (
      <div className={cn("space-y-2", className)}>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-4 transition-all duration-200 cursor-pointer",
            isDragging
              ? "border-primary bg-primary/10"
              : "border-muted-foreground/25 hover:border-primary/50",
          )}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleClick();
          }}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(",")}
            multiple
            onChange={handleFileSelect}
            className="sr-only"
          />
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-primary/10">
              <Upload className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                Drop files or click to upload
              </p>
              <p className="text-xs text-muted-foreground">
                Max {formatBytes(maxFileSize)}
              </p>
            </div>
          </div>
        </div>

        {files.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {files.map((file) => (
              <FileUploadItem
                key={file.id}
                file={file}
                compact
                onPause={pauseUpload}
                onResume={resumeUpload}
                onCancel={cancelUpload}
                onRetry={retryUpload}
                onRemove={removeFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer",
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
          isFocused && "ring-2 ring-primary/20",
        )}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedTypes.join(",")}
          multiple
          onChange={handleFileSelect}
          className="sr-only"
        />

        <div className="flex flex-col items-center justify-center text-center gap-4">
          <div
            className={cn(
              "p-4 rounded-full transition-all duration-200",
              isDragging ? "bg-primary/20 scale-110" : "bg-muted",
            )}
          >
            {isDragging ? (
              <Cloud className="h-8 w-8 text-primary animate-bounce" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
          </div>

          <div className="space-y-1">
            <p className="text-lg font-medium">
              {isDragging
                ? "Drop your files here"
                : "Drag & drop files to upload"}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to browse from your device
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">WAV</Badge>
            <Badge variant="secondary">MP3</Badge>
            <Badge variant="secondary">FLAC</Badge>
            <Badge variant="secondary">AIFF</Badge>
            <Badge variant="secondary">Images</Badge>
            <span className="text-muted-foreground/60">
              Max {formatBytes(maxFileSize)}
            </span>
          </div>

          {enableChunkedUpload && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" />
              <span>Chunked upload enabled for large files</span>
            </div>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {activeUploads.length > 0 ? (
                  <span>
                    Uploading {activeUploads.length} file
                    {activeUploads.length > 1 ? "s" : ""}...
                  </span>
                ) : completedUploads.length > 0 ? (
                  <span className="text-green-600">
                    {completedUploads.length} file
                    {completedUploads.length > 1 ? "s" : ""} uploaded
                  </span>
                ) : null}
              </div>
              {files.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles([])}
                  className="text-xs"
                >
                  Clear All
                </Button>
              )}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {files.map((file) => (
                <FileUploadItem
                  key={file.id}
                  file={file}
                  showPreview={showPreview}
                  onPause={pauseUpload}
                  onResume={resumeUpload}
                  onCancel={cancelUpload}
                  onRetry={retryUpload}
                  onRemove={removeFile}
                />
              ))}
            </div>

            {failedUploads.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    failedUploads.forEach((f) => retryUpload(f.id))
                  }
                  className="text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry All Failed ({failedUploads.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface FileUploadItemProps {
  file: UploadFile;
  compact?: boolean;
  showPreview?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function FileUploadItem({
  file,
  compact = false,
  showPreview = false,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
}: FileUploadItemProps) {
  const Icon = getFileIcon(file.file.type);
  const remainingBytes = file.file.size - file.uploadedBytes;

  const statusConfig = {
    pending: {
      icon: <Loader2 className="h-4 w-4 animate-pulse text-muted-foreground" />,
      text: "Queued",
      color: "bg-muted",
    },
    validating: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
      text: "Validating...",
      color: "bg-amber-500/10",
    },
    uploading: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
      text: `${file.progress}%`,
      color: "bg-primary/10",
    },
    paused: {
      icon: <Pause className="h-4 w-4 text-muted-foreground" />,
      text: "Paused",
      color: "bg-muted",
    },
    processing: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
      text: "Processing...",
      color: "bg-amber-500/10",
    },
    success: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      text: "Complete",
      color: "bg-green-500/10",
    },
    error: {
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      text: "Failed",
      color: "bg-destructive/10",
    },
    cancelled: {
      icon: <X className="h-4 w-4 text-muted-foreground" />,
      text: "Cancelled",
      color: "bg-muted",
    },
  };

  const config = statusConfig[file.status];

  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 p-2 rounded-md text-sm",
          config.color,
        )}
      >
        {config.icon}
        <span className="flex-1 truncate text-xs font-medium">
          {file.file.name}
        </span>
        {file.status === "uploading" && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {file.progress}%
          </span>
        )}
        {file.status === "uploading" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onPause(file.id)}
          >
            <Pause className="h-3 w-3" />
          </Button>
        )}
        {file.status === "paused" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onResume(file.id)}
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
        {file.status === "error" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onRetry(file.id)}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {["pending", "uploading", "paused", "error"].includes(file.status) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => onCancel(file.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-all",
        file.status === "error"
          ? "border-destructive/50 bg-destructive/5"
          : file.status === "success"
            ? "border-green-500/50 bg-green-500/5"
            : "border-border bg-card",
      )}
    >
      {showPreview && file.previewUrl && file.file.type.startsWith("image/") ? (
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
          <img
            src={file.previewUrl}
            alt={`${file.file.name} preview`}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className={cn("p-2 rounded-lg flex-shrink-0", config.color)}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{file.file.name}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {config.icon}
            <span
              className={cn(
                "text-xs font-medium",
                file.status === "error" && "text-destructive",
                file.status === "success" && "text-green-600",
              )}
            >
              {config.text}
            </span>
          </div>
        </div>

        {(file.status === "uploading" || file.status === "paused") && (
          <>
            <Progress value={file.progress} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatBytes(file.uploadedBytes)} /{" "}
                {formatBytes(file.file.size)}
              </span>
              <div className="flex items-center gap-2">
                {file.status === "uploading" && file.speed > 0 && (
                  <>
                    <span>{formatSpeed(file.speed)}</span>
                    <span>·</span>
                    <span>{formatETA(remainingBytes, file.speed)}</span>
                  </>
                )}
                <span className="tabular-nums">{file.progress}%</span>
              </div>
            </div>
            {file.chunks && file.currentChunk && (
              <p className="text-xs text-muted-foreground">
                Chunk {file.currentChunk} of {file.chunks.length}
              </p>
            )}
          </>
        )}

        {file.status === "pending" && (
          <p className="text-xs text-muted-foreground">
            {formatBytes(file.file.size)} - Waiting to upload
          </p>
        )}

        {file.status === "processing" && (
          <p className="text-xs text-amber-600">Server processing file...</p>
        )}

        {file.status === "success" && (
          <p className="text-xs text-green-600">
            {formatBytes(file.file.size)} uploaded successfully
          </p>
        )}

        {file.status === "error" && file.error && (
          <p className="text-xs text-destructive">{file.error}</p>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {showPreview && file.previewUrl && file.status === "success" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Preview"
          >
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {file.status === "uploading" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPause(file.id)}
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {file.status === "paused" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onResume(file.id)}
            title="Resume"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}
        {file.status === "error" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-primary/10"
            onClick={() => onRetry(file.id)}
            title="Retry"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
        {["pending", "uploading", "paused", "error", "cancelled"].includes(
          file.status,
        ) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onCancel(file.id)}
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        {file.status === "success" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onRemove(file.id)}
            title="Remove"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
