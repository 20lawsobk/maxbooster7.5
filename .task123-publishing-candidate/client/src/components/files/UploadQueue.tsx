// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Pause, Play, X, RotateCcw, CheckCircle2, AlertCircle, Loader2, ListOrdered, Trash2, FileAudio, ChevronDown, ChevronUp, Zap } from "lucide-react";

export interface QueuedFile {
  id: string;
  file: File;
  progress: number;
  uploadedBytes: number;
  speed: number;
  status:
    | "queued"
    | "uploading"
    | "paused"
    | "processing"
    | "success"
    | "error"
    | "cancelled";
  error?: string;
  priority: number;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
}

export interface UploadQueueProps {
  files: QueuedFile[];
  maxConcurrent?: number;
  onUpload: (file: QueuedFile) => Promise<void>;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPriorityChange?: (id: string, direction: "up" | "down") => void;
  className?: string;
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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function UploadQueue({
  files,
  maxConcurrent = 3,
  onUpload,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  _onClear,
  onPriorityChange,
  className,
}: UploadQueueProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const { toast } = useToast();

  const activeUploads = files.filter((f) => f.status === "uploading");
  const queuedFiles = files
    .filter((f) => f.status === "queued")
    .sort((a, b) => b.priority - a.priority);
  const completedFiles = files.filter((f) => f.status === "success");
  const failedFiles = files.filter((f) => f.status === "error");
  const pausedFiles = files.filter((f) => f.status === "paused");

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0);
  const uploadedSize = files.reduce((sum, f) => sum + f.uploadedBytes, 0);
  const overallProgress =
    totalSize > 0 ? Math.round((uploadedSize / (totalSize || 1)) * 100) : 0;
  const averageSpeed = activeUploads.reduce((sum, f) => sum + f.speed, 0);
  const remainingBytes = totalSize - uploadedSize;
  const estimatedTime = averageSpeed > 0 ? remainingBytes / averageSpeed : 0;

  useEffect(() => {
    if (isPaused) return;

    const canStart = maxConcurrent - activeUploads.length;
    if (canStart > 0 && queuedFiles.length > 0) {
      const filesToStart = queuedFiles.slice(0, canStart);
      filesToStart.forEach((file) => onUpload(file));
    }
  }, [
    files,
    maxConcurrent,
    isPaused,
    activeUploads.length,
    queuedFiles,
    onUpload,
  ]);

  const handlePauseAll = useCallback(() => {
    setIsPaused(true);
    activeUploads.forEach((f) => onPause(f.id));
    toast({
      title: "Queue Paused",
      description: "All uploads have been paused",
    });
  }, [activeUploads, onPause, toast]);

  const handleResumeAll = useCallback(() => {
    setIsPaused(false);
    pausedFiles.forEach((f) => onResume(f.id));
    toast({ title: "Queue Resumed", description: "Uploads will continue" });
  }, [pausedFiles, onResume, toast]);

  const handleCancelAll = useCallback(() => {
    files
      .filter((f) => ["queued", "uploading", "paused"].includes(f.status))
      .forEach((f) => onCancel(f.id));
    toast({
      title: "Queue Cancelled",
      description: "All pending uploads have been cancelled",
    });
  }, [files, onCancel, toast]);

  const handleRetryAll = useCallback(() => {
    failedFiles.forEach((f) => onRetry(f.id));
    toast({
      title: "Retrying Failed Uploads",
      description: `Retrying ${failedFiles.length} failed upload${failedFiles.length > 1 ? "s" : ""}`,
    });
  }, [failedFiles, onRetry, toast]);

  const handleClearCompleted = useCallback(() => {
    completedFiles.forEach((f) => onRemove(f.id));
    toast({
      title: "Cleared",
      description: "Completed uploads have been cleared",
    });
  }, [completedFiles, onRemove, toast]);

  if (files.length === 0) {
    return null;
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListOrdered className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Upload Queue</CardTitle>
            <Badge variant="secondary" className="ml-2">
              {files.length} file{files.length > 1 ? "s" : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <div className="space-y-2 mt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {completedFiles.length} of {files.length} complete
            </span>
            <span className="font-medium tabular-nums">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {formatBytes(uploadedSize)} / {formatBytes(totalSize)}
            </span>
            {averageSpeed > 0 && (
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {formatSpeed(averageSpeed)}
                {estimatedTime > 0 &&
                  ` · ~${formatDuration(estimatedTime * 1000)} remaining`}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-2">
          <div className="flex items-center gap-2 mb-3">
            {isPaused || pausedFiles.length > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResumeAll}
                className="flex-1"
              >
                <Play className="h-4 w-4 mr-1" />
                Resume All
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePauseAll}
                className="flex-1"
                disabled={activeUploads.length === 0}
              >
                <Pause className="h-4 w-4 mr-1" />
                Pause All
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelAll}
              className="flex-1"
              disabled={queuedFiles.length === 0 && activeUploads.length === 0}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel All
            </Button>

            {failedFiles.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleRetryAll}>
                <RotateCcw className="h-4 w-4 mr-1" />
                Retry ({failedFiles.length})
              </Button>
            )}

            {completedFiles.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearCompleted}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {activeUploads.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Uploading ({activeUploads.length}/{maxConcurrent})
                  </div>
                  {activeUploads.map((file) => (
                    <QueueItem
                      key={file.id}
                      file={file}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onRemove={onRemove}
                      onPriorityChange={onPriorityChange}
                    />
                  ))}
                </div>
              )}

              {pausedFiles.length > 0 && (
                <div className="space-y-2">
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Pause className="h-3 w-3" />
                    Paused ({pausedFiles.length})
                  </div>
                  {pausedFiles.map((file) => (
                    <QueueItem
                      key={file.id}
                      file={file}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onRemove={onRemove}
                      onPriorityChange={onPriorityChange}
                    />
                  ))}
                </div>
              )}

              {queuedFiles.length > 0 && (
                <div className="space-y-2">
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <ListOrdered className="h-3 w-3" />
                    Queued ({queuedFiles.length})
                  </div>
                  {queuedFiles.map((file, index) => (
                    <QueueItem
                      key={file.id}
                      file={file}
                      position={index + 1}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onRemove={onRemove}
                      onPriorityChange={onPriorityChange}
                      canMoveUp={index > 0}
                      canMoveDown={index < queuedFiles.length - 1}
                    />
                  ))}
                </div>
              )}

              {failedFiles.length > 0 && (
                <div className="space-y-2">
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-xs font-medium text-destructive uppercase tracking-wider">
                    <AlertCircle className="h-3 w-3" />
                    Failed ({failedFiles.length})
                  </div>
                  {failedFiles.map((file) => (
                    <QueueItem
                      key={file.id}
                      file={file}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onRemove={onRemove}
                      onPriorityChange={onPriorityChange}
                    />
                  ))}
                </div>
              )}

              {completedFiles.length > 0 && (
                <div className="space-y-2">
                  <Separator className="my-2" />
                  <div className="flex items-center gap-2 text-xs font-medium text-green-600 uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" />
                    Completed ({completedFiles.length})
                  </div>
                  {completedFiles.map((file) => (
                    <QueueItem
                      key={file.id}
                      file={file}
                      onPause={onPause}
                      onResume={onResume}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onRemove={onRemove}
                      onPriorityChange={onPriorityChange}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

interface QueueItemProps {
  file: QueuedFile;
  position?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onPriorityChange?: (id: string, direction: "up" | "down") => void;
}

function QueueItem({
  file,
  position,
  canMoveUp,
  canMoveDown,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onPriorityChange,
}: QueueItemProps) {
  const statusConfig = {
    queued: {
      icon: <ListOrdered className="h-4 w-4 text-muted-foreground" />,
      color: "bg-muted",
    },
    uploading: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
      color: "bg-primary/10",
    },
    paused: {
      icon: <Pause className="h-4 w-4 text-muted-foreground" />,
      color: "bg-muted",
    },
    processing: {
      icon: <Loader2 className="h-4 w-4 animate-spin text-amber-500" />,
      color: "bg-amber-500/10",
    },
    success: {
      icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
      color: "bg-green-500/10",
    },
    error: {
      icon: <AlertCircle className="h-4 w-4 text-destructive" />,
      color: "bg-destructive/10",
    },
    cancelled: {
      icon: <X className="h-4 w-4 text-muted-foreground" />,
      color: "bg-muted",
    },
  };

  const config = statusConfig[file.status];

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded-lg border transition-all",
        file.status === "error"
          ? "border-destructive/30"
          : file.status === "success"
            ? "border-green-500/30"
            : "border-border",
      )}
    >
      {position && (
        <div className="flex flex-col items-center gap-0.5">
          {onPriorityChange && canMoveUp && (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => onPriorityChange(file.id, "up")}
            >
              <ChevronUp className="h-3 w-3" />
            </Button>
          )}
          <span className="text-xs text-muted-foreground font-medium w-4 text-center">
            {position}
          </span>
          {onPriorityChange && canMoveDown && (
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4"
              onClick={() => onPriorityChange(file.id, "down")}
            >
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      <div className={cn("p-1.5 rounded", config.color)}>
        <FileAudio className="h-4 w-4 text-primary" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatBytes(file.file.size)}</span>
          {file.status === "uploading" && file.speed > 0 && (
            <>
              <span>·</span>
              <span>{formatSpeed(file.speed)}</span>
            </>
          )}
          {file.status === "error" && file.error && (
            <>
              <span>·</span>
              <span className="text-destructive truncate">{file.error}</span>
            </>
          )}
        </div>
        {(file.status === "uploading" || file.status === "paused") && (
          <Progress value={file.progress} className="h-1 mt-1" />
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {config.icon}

        {file.status === "uploading" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPause(file.id)}
          >
            <Pause className="h-3 w-3" />
          </Button>
        )}
        {file.status === "paused" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onResume(file.id)}
          >
            <Play className="h-3 w-3" />
          </Button>
        )}
        {file.status === "error" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRetry(file.id)}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
        {["queued", "uploading", "paused", "error"].includes(file.status) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onCancel(file.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {file.status === "success" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onRemove(file.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
