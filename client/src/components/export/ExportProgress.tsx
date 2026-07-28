import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileAudio,
  Pause,
  Play,
  X,
  RefreshCw,
  AlertCircle,
  Zap,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ExportStatus =
  | "queued"
  | "preparing"
  | "processing"
  | "encoding"
  | "uploading"
  | "complete"
  | "failed"
  | "cancelled"
  | "paused";

export interface ExportJob {
  id: string;
  name: string;
  type: "audio" | "data" | "stems" | "batch";
  format: string;
  status: ExportStatus;
  progress: number;
  stage?: string;
  startTime?: Date;
  estimatedEndTime?: Date;
  completedTime?: Date;
  fileSize?: number;
  downloadUrl?: string;
  error?: string;
  retryCount?: number;
  canRetry?: boolean;
  canPause?: boolean;
}

interface ExportProgressProps {
  job: ExportJob;
  onCancel?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onDownload?: (jobId: string, downloadUrl: string) => void;
  onDismiss?: (jobId: string) => void;
  className?: string;
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  ExportStatus,
  {
    color: string;
    bgColor: string;
    icon: React.ElementType;
    label: string;
    animated?: boolean;
  }
> = {
  queued: {
    color: "text-zinc-400",
    bgColor: "bg-zinc-800",
    icon: Clock,
    label: "Queued",
  },
  preparing: {
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    icon: Loader2,
    label: "Preparing",
    animated: true,
  },
  processing: {
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
    icon: Zap,
    label: "Processing",
    animated: true,
  },
  encoding: {
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
    icon: Loader2,
    label: "Encoding",
    animated: true,
  },
  uploading: {
    color: "text-cyan-400",
    bgColor: "bg-cyan-900/30",
    icon: Loader2,
    label: "Uploading",
    animated: true,
  },
  complete: {
    color: "text-green-400",
    bgColor: "bg-green-900/30",
    icon: CheckCircle2,
    label: "Complete",
  },
  failed: {
    color: "text-red-400",
    bgColor: "bg-red-900/30",
    icon: XCircle,
    label: "Failed",
  },
  cancelled: {
    color: "text-zinc-500",
    bgColor: "bg-zinc-800",
    icon: X,
    label: "Cancelled",
  },
  paused: {
    color: "text-amber-400",
    bgColor: "bg-amber-900/30",
    icon: Pause,
    label: "Paused",
  },
};

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const ExportProgressItem = memo(function ExportProgressItem({
  job,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onDownload,
  onDismiss,
  className,
  compact = false,
}: ExportProgressProps) {
  const [eta, setEta] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<string | null>(null);

  const config = STATUS_CONFIG[job.status];
  const Icon = config.icon;
  const isActive = [
    "preparing",
    "processing",
    "encoding",
    "uploading",
  ].includes(job.status);

  useEffect(() => {
    if (!isActive || !job.startTime) return;

    const updateTimes = () => {
      const now = new Date();
      const start = new Date(job.startTime!);
      const elapsedSeconds = (now.getTime() - start.getTime()) / 1000;
      setElapsed(formatTime(elapsedSeconds));

      if (job.progress > 0) {
        const estimatedTotal = elapsedSeconds / (job.progress / 100);
        const remaining = estimatedTotal - elapsedSeconds;
        setEta(formatTime(remaining));
      }
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, [isActive, job.startTime, job.progress]);

  const handleDownload = useCallback(() => {
    if (job.downloadUrl) {
      onDownload?.(job.id, job.downloadUrl);
    }
  }, [job.id, job.downloadUrl, onDownload]);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border",
          config.bgColor,
          "border-zinc-800",
          className,
        )}
      >
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            config.bgColor,
          )}
        >
          <Icon
            className={cn(
              "h-4 w-4",
              config.color,
              config.animated && "animate-spin",
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{job.name}</span>
            <Badge variant="outline" className="text-[10px] uppercase">
              {job.format}
            </Badge>
          </div>
          {isActive && <Progress value={job.progress} className="h-1 mt-1.5" />}
        </div>
        <div className="flex items-center gap-1">
          {isActive && eta && (
            <span className="text-xs text-zinc-500">{eta}</span>
          )}
          {job.status === "complete" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={handleDownload}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "rounded-lg border overflow-hidden",
        config.bgColor,
        "border-zinc-800",
        className,
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                job.status === "complete"
                  ? "bg-green-500/20"
                  : job.status === "failed"
                    ? "bg-red-500/20"
                    : "bg-zinc-800",
              )}
            >
              <Icon
                className={cn(
                  "h-6 w-6",
                  config.color,
                  config.animated && "animate-spin",
                )}
              />
            </div>
            <div>
              <h4 className="font-medium">{job.name}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs uppercase">
                  {job.format}
                </Badge>
                <Badge
                  variant="secondary"
                  className={cn("text-xs", config.color)}
                >
                  {config.label}
                </Badge>
                {job.type === "stems" && (
                  <Badge variant="secondary" className="text-xs">
                    Stems
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isActive && job.canPause && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() =>
                  job.status === "paused"
                    ? onResume?.(job.id)
                    : onPause?.(job.id)
                }
              >
                {job.status === "paused" ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
            )}
            {(isActive || job.status === "queued") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                onClick={() => onCancel?.(job.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {(job.status === "complete" ||
              job.status === "failed" ||
              job.status === "cancelled") && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => onDismiss?.(job.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>{job.stage || "Processing..."}</span>
              <span>{job.progress.toFixed(0)}%</span>
            </div>
            <Progress value={job.progress} className="h-2" />
            <div className="flex items-center justify-between text-xs text-zinc-500">
              {elapsed && <span>Elapsed: {elapsed}</span>}
              {eta && <span>ETA: {eta}</span>}
            </div>
          </div>
        )}

        {job.status === "complete" && (
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-zinc-800">
            <div className="flex items-center gap-4 text-xs text-zinc-400">
              {job.fileSize && (
                <span className="flex items-center gap-1">
                  <HardDrive className="h-3 w-3" />
                  {formatFileSize(job.fileSize)}
                </span>
              )}
              {job.completedTime && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(job.completedTime).toLocaleTimeString()}
                </span>
              )}
            </div>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleDownload}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        )}

        {job.status === "failed" && (
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-2 p-3 bg-red-950/50 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-400">Export Failed</p>
                <p className="text-xs text-red-300/80 mt-0.5">
                  {job.error || "An unexpected error occurred"}
                </p>
              </div>
            </div>
            {job.canRetry && (
              <Button
                size="sm"
                variant="outline"
                className="w-full border-red-700 text-red-400 hover:bg-red-950"
                onClick={() => onRetry?.(job.id)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry Export
                {job.retryCount && job.retryCount > 0 && (
                  <span className="ml-1 text-xs">
                    ({job.retryCount} attempts)
                  </span>
                )}
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

interface ExportProgressPanelProps {
  jobs: ExportJob[];
  onCancel?: (jobId: string) => void;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onDownload?: (jobId: string, downloadUrl: string) => void;
  onDismiss?: (jobId: string) => void;
  onClearCompleted?: () => void;
  className?: string;
}

export function ExportProgressPanel({
  jobs,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onDownload,
  onDismiss,
  onClearCompleted,
  className,
}: ExportProgressPanelProps) {
  const activeJobs = jobs.filter((j) =>
    [
      "queued",
      "preparing",
      "processing",
      "encoding",
      "uploading",
      "paused",
    ].includes(j.status),
  );
  const completedJobs = jobs.filter((j) => j.status === "complete");
  jobs.filter((j) => j.status === "failed");

  const totalProgress =
    activeJobs.length > 0
      ? activeJobs.reduce((sum, j) => sum + j.progress, 0) / activeJobs.length
      : 0;

  if (jobs.length === 0) {
    return null;
  }

  return (
    <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileAudio className="h-5 w-5 text-blue-400" />
            Export Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeJobs.length > 0 && (
              <Badge variant="secondary" className="animate-pulse">
                {activeJobs.length} Active
              </Badge>
            )}
            {completedJobs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={onClearCompleted}
              >
                Clear Completed
              </Button>
            )}
          </div>
        </div>
        {activeJobs.length > 0 && (
          <div className="space-y-1 mt-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>Overall Progress</span>
              <span>{totalProgress.toFixed(0)}%</span>
            </div>
            <Progress value={totalProgress} className="h-1.5" />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 max-h-96 overflow-y-auto">
        <AnimatePresence mode="popLayout">
          {jobs.map((job) => (
            <ExportProgressItem
              key={job.id}
              job={job}
              onCancel={onCancel}
              onPause={onPause}
              onResume={onResume}
              onRetry={onRetry}
              onDownload={onDownload}
              onDismiss={onDismiss}
            />
          ))}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

export default ExportProgressPanel;
