// @ts-nocheck
import { useState, useEffect, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Pause,
  Play,
  X,
  RefreshCw,
  MoreVertical,
  FolderOpen,
  Archive,
  FileAudio,
  FileText,
  FileSpreadsheet,
  File,
  Clock,
  HardDrive,
  Wifi,
  WifiOff,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "complete"
  | "failed"
  | "cancelled";

export interface DownloadItem {
  id: string;
  name: string;
  url: string;
  fileType: "audio" | "document" | "spreadsheet" | "archive" | "other";
  format: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed?: number;
  startTime?: Date;
  completedTime?: Date;
  error?: string;
  canResume?: boolean;
  retryCount?: number;
  localPath?: string;
}

interface DownloadManagerProps {
  downloads: DownloadItem[];
  onStart?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onClearCompleted?: () => void;
  onClearAll?: () => void;
  onOpenFile?: (id: string, path: string) => void;
  onOpenFolder?: (id: string, path: string) => void;
  maxConcurrent?: number;
  className?: string;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  audio: FileAudio,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  archive: Archive,
  other: File,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatEta(bytes: number, speed: number): string {
  if (speed === 0) return "∞";
  const seconds = bytes / speed;
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.ceil((seconds % 3600) / 60)}m`;
}

const DownloadItemRow = memo(function DownloadItemRow({
  item,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFile,
  onOpenFolder,
}: {
  item: DownloadItem;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onRemove?: (id: string) => void;
  onOpenFile?: (id: string, path: string) => void;
  onOpenFolder?: (id: string, path: string) => void;
}) {
  const FileIcon = FILE_ICONS[item.fileType] || File;
  const isActive = item.status === "downloading";
  const isPaused = item.status === "paused";
  const isComplete = item.status === "complete";
  const isFailed = item.status === "failed";

  const remainingBytes = item.totalBytes - item.downloadedBytes;
  const eta =
    isActive && item.speed ? formatEta(remainingBytes, item.speed) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        "flex items-center gap-4 p-4 rounded-lg border transition-all",
        isComplete && "bg-green-950/20 border-green-900/30",
        isFailed && "bg-red-950/20 border-red-900/30",
        isActive && "bg-blue-950/20 border-blue-900/30",
        isPaused && "bg-amber-950/20 border-amber-900/30",
        !isComplete &&
          !isFailed &&
          !isActive &&
          !isPaused &&
          "bg-zinc-900 border-zinc-800",
      )}
    >
      <div
        className={cn(
          "w-12 h-12 rounded-lg flex items-center justify-center shrink-0",
          isComplete
            ? "bg-green-500/20"
            : isFailed
              ? "bg-red-500/20"
              : isActive
                ? "bg-blue-500/20"
                : "bg-zinc-800",
        )}
      >
        {isActive ? (
          <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
        ) : isComplete ? (
          <CheckCircle2 className="h-6 w-6 text-green-400" />
        ) : isFailed ? (
          <XCircle className="h-6 w-6 text-red-400" />
        ) : isPaused ? (
          <Pause className="h-6 w-6 text-amber-400" />
        ) : (
          <FileIcon className="h-6 w-6 text-zinc-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium truncate">{item.name}</span>
          <Badge variant="outline" className="text-[10px] uppercase shrink-0">
            {item.format}
          </Badge>
        </div>

        {(isActive || isPaused) && (
          <div className="space-y-1.5">
            <Progress value={item.progress} className="h-1.5" />
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>
                {formatBytes(item.downloadedBytes)} /{" "}
                {formatBytes(item.totalBytes)}
              </span>
              <div className="flex items-center gap-3">
                {item.speed && isActive && (
                  <span className="flex items-center gap-1">
                    <Wifi className="h-3 w-3" />
                    {formatSpeed(item.speed)}
                  </span>
                )}
                {eta && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {eta}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {formatBytes(item.totalBytes)}
            </span>
            {item.completedTime && (
              <span>
                Downloaded {new Date(item.completedTime).toLocaleTimeString()}
              </span>
            )}
          </div>
        )}

        {isFailed && (
          <div className="flex items-center gap-2 text-xs text-red-400 mt-1">
            <AlertTriangle className="h-3 w-3" />
            <span>{item.error || "Download failed"}</span>
            {item.retryCount !== undefined && item.retryCount > 0 && (
              <span className="text-zinc-500">({item.retryCount} retries)</span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {isActive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onPause?.(item.id)}
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}

        {isPaused && item.canResume && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onResume?.(item.id)}
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {(isActive || isPaused || item.status === "pending") && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
            onClick={() => onCancel?.(item.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {isFailed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => onRetry?.(item.id)}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}

        {isComplete && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700"
            onClick={() =>
              item.localPath && onOpenFile?.(item.id, item.localPath)
            }
          >
            <Download className="h-4 w-4 mr-1" />
            Open
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="bg-zinc-900 border-zinc-700"
          >
            {isComplete && item.localPath && (
              <>
                <DropdownMenuItem
                  onClick={() => onOpenFile?.(item.id, item.localPath!)}
                  className="gap-2"
                >
                  <File className="h-4 w-4" />
                  Open File
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onOpenFolder?.(item.id, item.localPath!)}
                  className="gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  Show in Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700" />
              </>
            )}
            {isFailed && (
              <DropdownMenuItem
                onClick={() => onRetry?.(item.id)}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Download
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => onRemove?.(item.id)}
              className="gap-2 text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
});

export function DownloadManager({
  downloads,
  _onStart,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onClearCompleted,
  onClearAll,
  onOpenFile,
  onOpenFolder,
  maxConcurrent = 3,
  className,
}: DownloadManagerProps) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast({
        title: "Connection Restored",
        description: "Downloads will resume automatically",
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast({
        variant: "destructive",
        title: "Connection Lost",
        description: "Downloads have been paused",
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [toast]);

  const activeDownloads = downloads.filter((d) => d.status === "downloading");
  const pendingDownloads = downloads.filter((d) => d.status === "pending");
  const pausedDownloads = downloads.filter((d) => d.status === "paused");
  const completedDownloads = downloads.filter((d) => d.status === "complete");
  const failedDownloads = downloads.filter((d) => d.status === "failed");

  const totalProgress =
    downloads.length > 0
      ? downloads.reduce(
          (sum, d) => sum + (d.status === "complete" ? 100 : d.progress),
          0,
        ) / downloads.length
      : 0;

  const totalSpeed = activeDownloads.reduce(
    (sum, d) => sum + (d.speed || 0),
    0,
  );

  if (downloads.length === 0) {
    return (
      <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4">
            <Download className="h-8 w-8 text-zinc-600" />
          </div>
          <h3 className="font-medium text-zinc-400">No Downloads</h3>
          <p className="text-sm text-zinc-600 mt-1">
            Your download queue is empty
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-400" />
              Download Manager
            </CardTitle>
            <CardDescription className="mt-1">
              {activeDownloads.length} active · {pendingDownloads.length} queued
              · {completedDownloads.length} completed
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="h-3 w-3" />
                Offline
              </Badge>
            )}
            {activeDownloads.length > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Wifi className="h-3 w-3" />
                {formatSpeed(totalSpeed)}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="border-zinc-700">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-zinc-900 border-zinc-700"
              >
                <DropdownMenuItem onClick={onClearCompleted} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Clear Completed
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-zinc-700" />
                <DropdownMenuItem
                  onClick={onClearAll}
                  className="gap-2 text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {downloads.length > 0 && (
          <div className="space-y-1 mt-3">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Overall Progress</span>
              <span>{totalProgress.toFixed(0)}%</span>
            </div>
            <Progress value={totalProgress} className="h-1.5" />
          </div>
        )}
      </CardHeader>

      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {activeDownloads.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Downloading ({activeDownloads.length}/{maxConcurrent})
                  </h4>
                  {activeDownloads.map((item) => (
                    <DownloadItemRow
                      key={item.id}
                      item={item}
                      onPause={onPause}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              )}

              {pausedDownloads.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Paused ({pausedDownloads.length})
                  </h4>
                  {pausedDownloads.map((item) => (
                    <DownloadItemRow
                      key={item.id}
                      item={item}
                      onResume={onResume}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              )}

              {pendingDownloads.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Queued ({pendingDownloads.length})
                  </h4>
                  {pendingDownloads.map((item) => (
                    <DownloadItemRow
                      key={item.id}
                      item={item}
                      onCancel={onCancel}
                    />
                  ))}
                </div>
              )}

              {failedDownloads.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-red-500 uppercase tracking-wider">
                    Failed ({failedDownloads.length})
                  </h4>
                  {failedDownloads.map((item) => (
                    <DownloadItemRow
                      key={item.id}
                      item={item}
                      onRetry={onRetry}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              )}

              {completedDownloads.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-green-500 uppercase tracking-wider">
                    Completed ({completedDownloads.length})
                  </h4>
                  {completedDownloads.map((item) => (
                    <DownloadItemRow
                      key={item.id}
                      item={item}
                      onRemove={onRemove}
                      onOpenFile={onOpenFile}
                      onOpenFolder={onOpenFolder}
                    />
                  ))}
                </div>
              )}
            </div>
          </AnimatePresence>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default DownloadManager;
