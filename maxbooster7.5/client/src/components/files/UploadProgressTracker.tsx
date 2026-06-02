import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  Pause,
  Play,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  Minimize2,
  Maximize2,
  FileAudio,
  FileImage,
  File,
  Zap,
  XCircle,
  Clock,
  HardDrive,
  Wifi,
  WifiOff,
  Copy,
} from "lucide-react";

export type UploadOutcome =
  | "pending"
  | "validating"
  | "uploading"
  | "processing"
  | "success"
  | "cancelled"
  | "error_network"
  | "error_file_too_large"
  | "error_invalid_type"
  | "error_quota_exceeded"
  | "error_duplicate"
  | "error_corrupted"
  | "error_server";

export interface TrackedUpload {
  id: string;
  file: File;
  progress: number;
  uploadedBytes: number;
  speed: number;
  outcome: UploadOutcome;
  errorMessage?: string;
  errorDetails?: {
    maxSize?: number;
    fileSize?: number;
    allowedTypes?: string[];
    quotaUsed?: number;
    quotaLimit?: number;
    duplicateId?: string;
  };
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  canRetry: boolean;
}

export interface UploadProgressTrackerProps {
  uploads: TrackedUpload[];
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onCancelAll?: () => void;
  onRetryFailed?: () => void;
  onClearCompleted?: () => void;
  className?: string;
  minimizable?: boolean;
  showNetworkStatus?: boolean;
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
  if (speed === 0) return "--";
  const seconds = Math.ceil(remainingBytes / speed);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.startsWith("image/")) return FileImage;
  return File;
}

const OUTCOME_CONFIG: Record<
  UploadOutcome,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
  }
> = {
  pending: {
    label: "Queued",
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  validating: {
    label: "Validating...",
    icon: <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  uploading: {
    label: "Uploading",
    icon: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  processing: {
    label: "Processing...",
    icon: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  success: {
    label: "Complete",
    icon: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  cancelled: {
    label: "Cancelled",
    icon: <X className="h-4 w-4 text-muted-foreground" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  error_network: {
    label: "Network Error",
    icon: <WifiOff className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_file_too_large: {
    label: "File Too Large",
    icon: <AlertTriangle className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_invalid_type: {
    label: "Invalid Type",
    icon: <XCircle className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_quota_exceeded: {
    label: "Storage Full",
    icon: <HardDrive className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_duplicate: {
    label: "Duplicate File",
    icon: <Copy className="h-4 w-4 text-amber-500" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  error_corrupted: {
    label: "File Corrupted",
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_server: {
    label: "Server Error",
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
};

export function UploadProgressTracker({
  uploads,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onCancelAll,
  onRetryFailed,
  onClearCompleted,
  className,
  minimizable = true,
  showNetworkStatus = true,
}: UploadProgressTrackerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const activeUploads = uploads.filter((u) =>
    ["uploading", "validating", "processing", "pending"].includes(u.outcome),
  );
  const completedUploads = uploads.filter((u) => u.outcome === "success");
  const failedUploads = uploads.filter((u) => u.outcome.startsWith("error_"));
  const cancelledUploads = uploads.filter((u) => u.outcome === "cancelled");

  const totalSize = uploads.reduce((sum, u) => sum + u.file.size, 0);
  const uploadedSize = uploads.reduce((sum, u) => sum + u.uploadedBytes, 0);
  const overallProgress =
    totalSize > 0 ? Math.round((uploadedSize / totalSize) * 100) : 0;
  const averageSpeed = activeUploads.reduce((sum, u) => sum + u.speed, 0);
  const remainingBytes = activeUploads.reduce(
    (sum, u) => sum + (u.file.size - u.uploadedBytes),
    0,
  );

  if (uploads.length === 0) return null;

  return (
    <Card
      className={cn("fixed bottom-4 right-4 w-96 shadow-lg z-50", className)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Uploads</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {uploads.length}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {showNetworkStatus && (
              <div
                className={cn(
                  "p-1",
                  isOnline ? "text-green-500" : "text-destructive",
                )}
              >
                {isOnline ? (
                  <Wifi className="h-4 w-4" />
                ) : (
                  <WifiOff className="h-4 w-4" />
                )}
              </div>
            )}
            {minimizable && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {completedUploads.length}/{uploads.length} complete
            </span>
            <span className="font-medium tabular-nums">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-1.5" />
          {activeUploads.length > 0 && averageSpeed > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                {formatSpeed(averageSpeed)}
              </span>
              <span>~{formatETA(remainingBytes, averageSpeed)} remaining</span>
            </div>
          )}
        </div>
      </CardHeader>

      {!isMinimized && (
        <CardContent className="pt-2 pb-3">
          <div className="flex items-center gap-1 mb-2">
            {activeUploads.length > 0 && onCancelAll && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancelAll}
                className="h-7 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Cancel All
              </Button>
            )}
            {failedUploads.length > 0 && onRetryFailed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRetryFailed}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry Failed
              </Button>
            )}
            {completedUploads.length > 0 && onClearCompleted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCompleted}
                className="h-7 text-xs ml-auto"
              >
                Clear Complete
              </Button>
            )}
          </div>

          <ScrollArea className="h-64">
            <div className="space-y-2">
              {uploads.map((upload) => (
                <UploadItem
                  key={upload.id}
                  upload={upload}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </ScrollArea>

          {!isOnline && activeUploads.length > 0 && (
            <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-destructive flex-shrink-0" />
              <p className="text-xs text-destructive">
                You're offline. Uploads will resume when connection is restored.
              </p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

interface UploadItemProps {
  upload: TrackedUpload;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
}

function UploadItem({
  upload,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
}: UploadItemProps) {
  const config = OUTCOME_CONFIG[upload.outcome];
  const Icon = getFileIcon(upload.file.type);
  const remainingBytes = upload.file.size - upload.uploadedBytes;
  const isError = upload.outcome.startsWith("error_");
  const isActive = [
    "uploading",
    "validating",
    "processing",
    "pending",
  ].includes(upload.outcome);

  return (
    <div
      className={cn(
        "p-2 rounded-lg border transition-all",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : upload.outcome === "success"
            ? "border-green-500/30 bg-green-500/5"
            : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn("p-1.5 rounded", config.bgColor)}>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{upload.file.name}</p>
            {config.icon}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{formatBytes(upload.file.size)}</span>
            {upload.outcome === "uploading" && upload.speed > 0 && (
              <>
                <span>·</span>
                <span>{formatSpeed(upload.speed)}</span>
                <span>·</span>
                <span>{formatETA(remainingBytes, upload.speed)}</span>
              </>
            )}
          </div>

          {(upload.outcome === "uploading" ||
            upload.outcome === "processing") && (
            <Progress value={upload.progress} className="h-1 mt-1.5" />
          )}

          {isError && upload.errorMessage && (
            <p className="text-xs text-destructive mt-1 line-clamp-2">
              {upload.errorMessage}
            </p>
          )}

          {upload.outcome === "error_file_too_large" && upload.errorDetails && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Max: {formatBytes(upload.errorDetails.maxSize || 0)}
            </p>
          )}

          {upload.outcome === "error_invalid_type" &&
            upload.errorDetails?.allowedTypes && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Allowed:{" "}
                {upload.errorDetails.allowedTypes.slice(0, 3).join(", ")}...
              </p>
            )}

          {upload.outcome === "error_quota_exceeded" && upload.errorDetails && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatBytes(upload.errorDetails.quotaUsed || 0)} /{" "}
              {formatBytes(upload.errorDetails.quotaLimit || 0)} used
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {upload.outcome === "uploading" && onPause && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onPause(upload.id)}
            >
              <Pause className="h-3 w-3" />
            </Button>
          )}
          {upload.outcome === "pending" && onResume && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onResume(upload.id)}
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          {isError && upload.canRetry && onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRetry(upload.id)}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          {(isActive || isError) && onCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onCancel(upload.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
          {(upload.outcome === "success" || upload.outcome === "cancelled") &&
            onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRemove(upload.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}

export function UploadOutcomeBadge({ outcome }: { outcome: UploadOutcome }) {
  const config = OUTCOME_CONFIG[outcome];
  return (
    <Badge variant="outline" className={cn("gap-1", config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
