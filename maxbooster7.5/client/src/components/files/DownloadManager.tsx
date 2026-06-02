import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Download,
  Pause,
  Play,
  X,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileAudio,
  FileImage,
  File,
  Minimize2,
  Maximize2,
  Zap,
  FolderOpen,
  ExternalLink,
} from "lucide-react";

export type DownloadOutcome =
  | "pending"
  | "preparing"
  | "downloading"
  | "paused"
  | "complete"
  | "cancelled"
  | "error_network"
  | "error_not_found"
  | "error_server";

export interface DownloadItem {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  downloadUrl?: string;
  progress: number;
  downloadedBytes: number;
  speed: number;
  outcome: DownloadOutcome;
  errorMessage?: string;
  startedAt?: number;
  completedAt?: number;
  canRetry: boolean;
}

interface DownloadManagerProps {
  downloads: DownloadItem[];
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onClearCompleted?: () => void;
  onOpenFolder?: (id: string) => void;
  className?: string;
  minimizable?: boolean;
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
  DownloadOutcome,
  {
    label: string;
    icon: React.ReactNode;
    color: string;
    bgColor: string;
  }
> = {
  pending: {
    label: "Queued",
    icon: <Loader2 className="h-4 w-4 text-muted-foreground animate-pulse" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  preparing: {
    label: "Preparing...",
    icon: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  downloading: {
    label: "Downloading",
    icon: <Download className="h-4 w-4 text-primary animate-bounce" />,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  paused: {
    label: "Paused",
    icon: <Pause className="h-4 w-4 text-muted-foreground" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
  complete: {
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
    icon: <AlertCircle className="h-4 w-4 text-destructive" />,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  error_not_found: {
    label: "File Not Found",
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

export function DownloadManager({
  downloads,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onClearCompleted,
  onOpenFolder,
  className,
  minimizable = true,
}: DownloadManagerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const { toast } = useToast();

  const activeDownloads = downloads.filter((d) =>
    ["downloading", "preparing", "pending"].includes(d.outcome),
  );
  const completedDownloads = downloads.filter((d) => d.outcome === "complete");
  const failedDownloads = downloads.filter((d) =>
    d.outcome.startsWith("error_"),
  );
  const pausedDownloads = downloads.filter((d) => d.outcome === "paused");

  const totalSize = downloads.reduce((sum, d) => sum + d.fileSize, 0);
  const downloadedSize = downloads.reduce(
    (sum, d) => sum + d.downloadedBytes,
    0,
  );
  const overallProgress =
    totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;
  const averageSpeed = activeDownloads.reduce((sum, d) => sum + d.speed, 0);
  const remainingBytes = activeDownloads.reduce(
    (sum, d) => sum + (d.fileSize - d.downloadedBytes),
    0,
  );

  useEffect(() => {
    const newlyCompleted = downloads.filter(
      (d) =>
        d.outcome === "complete" &&
        d.completedAt &&
        Date.now() - d.completedAt < 1000,
    );

    if (newlyCompleted.length > 0) {
      toast({
        title: "Download Complete",
        description:
          newlyCompleted.length === 1
            ? `"${newlyCompleted[0].fileName}" has been downloaded`
            : `${newlyCompleted.length} files have been downloaded`,
      });
    }
  }, [downloads, toast]);

  if (downloads.length === 0) return null;

  return (
    <Card
      className={cn("fixed bottom-4 left-4 w-96 shadow-lg z-50", className)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Downloads</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {downloads.length}
            </Badge>
          </div>
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

        <div className="space-y-1 mt-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {completedDownloads.length}/{downloads.length} complete
            </span>
            <span className="font-medium tabular-nums">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-1.5" />
          {activeDownloads.length > 0 && averageSpeed > 0 && (
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
            {failedDownloads.length > 0 && onRetry && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => failedDownloads.forEach((d) => onRetry(d.id))}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Retry Failed
              </Button>
            )}
            {completedDownloads.length > 0 && onClearCompleted && (
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
              {downloads.map((download) => (
                <DownloadItem
                  key={download.id}
                  download={download}
                  onPause={onPause}
                  onResume={onResume}
                  onCancel={onCancel}
                  onRetry={onRetry}
                  onRemove={onRemove}
                  onOpenFolder={onOpenFolder}
                />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}

interface DownloadItemComponentProps {
  download: DownloadItem;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onOpenFolder?: (id: string) => void;
}

function DownloadItem({
  download,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFolder,
}: DownloadItemComponentProps) {
  const config = OUTCOME_CONFIG[download.outcome];
  const Icon = getFileIcon(download.fileType);
  const remainingBytes = download.fileSize - download.downloadedBytes;
  const isError = download.outcome.startsWith("error_");
  const isActive = ["downloading", "preparing", "pending"].includes(
    download.outcome,
  );

  return (
    <div
      className={cn(
        "p-2 rounded-lg border transition-all",
        isError
          ? "border-destructive/30 bg-destructive/5"
          : download.outcome === "complete"
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
            <p className="text-sm font-medium truncate">{download.fileName}</p>
            {config.icon}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>
              {formatBytes(download.downloadedBytes)} /{" "}
              {formatBytes(download.fileSize)}
            </span>
            {download.outcome === "downloading" && download.speed > 0 && (
              <>
                <span>·</span>
                <span>{formatSpeed(download.speed)}</span>
                <span>·</span>
                <span>{formatETA(remainingBytes, download.speed)}</span>
              </>
            )}
          </div>

          {(download.outcome === "downloading" ||
            download.outcome === "paused") && (
            <Progress value={download.progress} className="h-1 mt-1.5" />
          )}

          {isError && download.errorMessage && (
            <p className="text-xs text-destructive mt-1 line-clamp-2">
              {download.errorMessage}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {download.outcome === "downloading" && onPause && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onPause(download.id)}
            >
              <Pause className="h-3 w-3" />
            </Button>
          )}
          {download.outcome === "paused" && onResume && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onResume(download.id)}
            >
              <Play className="h-3 w-3" />
            </Button>
          )}
          {isError && download.canRetry && onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRetry(download.id)}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          )}
          {download.outcome === "complete" && onOpenFolder && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onOpenFolder(download.id)}
            >
              <FolderOpen className="h-3 w-3" />
            </Button>
          )}
          {(isActive || isError || download.outcome === "paused") &&
            onCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onCancel(download.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          {(download.outcome === "complete" ||
            download.outcome === "cancelled") &&
            onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onRemove(download.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}

export function useDownloadManager() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const { toast } = useToast();

  const startDownload = useCallback(
    async (
      fileId: string,
      fileName: string,
      fileSize: number,
      fileType: string,
    ) => {
      const downloadId = `download-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newDownload: DownloadItem = {
        id: downloadId,
        fileId,
        fileName,
        fileSize,
        fileType,
        progress: 0,
        downloadedBytes: 0,
        speed: 0,
        outcome: "preparing",
        startedAt: Date.now(),
        canRetry: true,
      };

      setDownloads((prev) => [...prev, newDownload]);

      try {
        const response = await fetch(`/api/files/${fileId}/download`);

        if (!response.ok) {
          throw new Error(
            response.status === 404 ? "File not found" : "Download failed",
          );
        }

        const data = await response.json();

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId
              ? {
                  ...d,
                  outcome: "downloading" as const,
                  downloadUrl: data.downloadUrl,
                }
              : d,
          ),
        );

        const link = document.createElement("a");
        link.href = data.downloadUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId
              ? {
                  ...d,
                  outcome: "complete" as const,
                  progress: 100,
                  downloadedBytes: fileSize,
                  completedAt: Date.now(),
                }
              : d,
          ),
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Download failed";
        const outcome: DownloadOutcome = errorMessage.includes("not found")
          ? "error_not_found"
          : "error_network";

        setDownloads((prev) =>
          prev.map((d) =>
            d.id === downloadId ? { ...d, outcome, errorMessage } : d,
          ),
        );

        toast({
          title: "Download Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }

      return downloadId;
    },
    [toast],
  );

  const pauseDownload = useCallback((id: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === id ? { ...d, outcome: "paused" as const } : d)),
    );
  }, []);

  const resumeDownload = useCallback((id: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, outcome: "downloading" as const } : d,
      ),
    );
  }, []);

  const cancelDownload = useCallback((id: string) => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.id === id ? { ...d, outcome: "cancelled" as const } : d,
      ),
    );
  }, []);

  const retryDownload = useCallback(
    (id: string) => {
      const download = downloads.find((d) => d.id === id);
      if (download) {
        startDownload(
          download.fileId,
          download.fileName,
          download.fileSize,
          download.fileType,
        );
        setDownloads((prev) => prev.filter((d) => d.id !== id));
      }
    },
    [downloads, startDownload],
  );

  const removeDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.outcome !== "complete"));
  }, []);

  return {
    downloads,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    clearCompleted,
  };
}

export function DownloadOutcomeBadge({
  outcome,
}: {
  outcome: DownloadOutcome;
}) {
  const config = OUTCOME_CONFIG[outcome];
  return (
    <Badge variant="outline" className={cn("gap-1", config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
