import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  FileAudio,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Pause,
  Play,
} from 'lucide-react';

export interface UploadItemData {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: 'queued' | 'uploading' | 'processing' | 'success' | 'error' | 'paused';
  error?: string;
  uploadedBytes?: number;
}

interface UploadItemProps {
  item: UploadItemData;
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  compact?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatProgress(uploaded: number, total: number): string {
  return `${formatFileSize(uploaded)} / ${formatFileSize(total)}`;
}

export function UploadItem({
  item,
  onCancel,
  onRetry,
  onPause,
  onResume,
  compact = false,
}: UploadItemProps) {
  const { id, fileName, fileSize, progress, status, error, uploadedBytes = 0 } = item;

  const statusIcon = {
    queued: <Loader2 className="h-4 w-4 text-muted-foreground animate-pulse" />,
    uploading: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    processing: <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />,
    success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <AlertCircle className="h-4 w-4 text-destructive" />,
    paused: <Pause className="h-4 w-4 text-muted-foreground" />,
  };

  const statusText = {
    queued: 'Queued',
    uploading: `${progress}%`,
    processing: 'Processing...',
    success: 'Complete',
    error: error || 'Failed',
    paused: 'Paused',
  };

  const statusColor = {
    queued: 'bg-muted',
    uploading: 'bg-primary/10',
    processing: 'bg-amber-500/10',
    success: 'bg-green-500/10',
    error: 'bg-destructive/10',
    paused: 'bg-muted',
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 p-2 rounded-md text-sm transition-colors',
          statusColor[status]
        )}
      >
        {statusIcon[status]}
        <span className="flex-1 truncate text-xs font-medium">{fileName}</span>
        {status === 'uploading' && (
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        )}
        {(status === 'error' || status === 'queued') && onCancel && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-destructive/20"
            onClick={() => onCancel(id)}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
        {status === 'error' && onRetry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:bg-primary/20"
            onClick={() => onRetry(id)}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 p-3 sm:p-4 rounded-lg border transition-all',
        status === 'error' ? 'border-destructive/50 bg-destructive/5' : 'border-border bg-card',
        status === 'success' && 'border-green-500/50 bg-green-500/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 p-2 rounded-lg',
            status === 'success'
              ? 'bg-green-500/10'
              : status === 'error'
                ? 'bg-destructive/10'
                : 'bg-primary/10'
          )}
        >
          <FileAudio className="h-5 w-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-sm truncate">{fileName}</p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {statusIcon[status]}
              <span
                className={cn(
                  'text-xs font-medium',
                  status === 'error' && 'text-destructive',
                  status === 'success' && 'text-green-600'
                )}
              >
                {statusText[status]}
              </span>
            </div>
          </div>

          {(status === 'uploading' || status === 'paused') && (
            <>
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatProgress(uploadedBytes, fileSize)}</span>
                <span className="tabular-nums">{progress}%</span>
              </div>
            </>
          )}

          {status === 'queued' && (
            <p className="text-xs text-muted-foreground">
              {formatFileSize(fileSize)} - Waiting to upload
            </p>
          )}

          {status === 'processing' && (
            <p className="text-xs text-amber-600">Server processing file...</p>
          )}

          {status === 'success' && (
            <p className="text-xs text-green-600">{formatFileSize(fileSize)} uploaded</p>
          )}

          {status === 'error' && error && (
            <p className="text-xs text-destructive truncate">{error}</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {status === 'uploading' && onPause && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPause(id)}
              title="Pause upload"
            >
              <Pause className="h-4 w-4" />
            </Button>
          )}
          {status === 'paused' && onResume && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onResume(id)}
              title="Resume upload"
            >
              <Play className="h-4 w-4" />
            </Button>
          )}
          {status === 'error' && onRetry && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-primary/10"
              onClick={() => onRetry(id)}
              title="Retry upload"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {(status === 'queued' || status === 'uploading' || status === 'error' || status === 'paused') &&
            onCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onCancel(id)}
                title="Cancel upload"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}

interface UploadListProps {
  items: UploadItemData[];
  onCancel?: (id: string) => void;
  onRetry?: (id: string) => void;
  onCancelAll?: () => void;
  compact?: boolean;
  className?: string;
}

export function UploadList({
  items,
  onCancel,
  onRetry,
  onCancelAll,
  compact = false,
  className,
}: UploadListProps) {
  if (items.length === 0) return null;

  const activeUploads = items.filter((i) => i.status === 'uploading' || i.status === 'queued');
  const completedUploads = items.filter((i) => i.status === 'success');
  const errorUploads = items.filter((i) => i.status === 'error');

  const totalSize = items.reduce((sum, i) => sum + i.fileSize, 0);
  const uploadedSize = items.reduce((sum, i) => sum + (i.uploadedBytes || 0), 0);
  const overallProgress = totalSize > 0 ? Math.round((uploadedSize / totalSize) * 100) : 0;

  return (
    <div className={cn('space-y-3', className)}>
      {items.length > 1 && !compact && (
        <div className="flex items-center justify-between px-1">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium">{items.length} files</span>
            {activeUploads.length > 0 && (
              <span className="ml-2">
                ({completedUploads.length}/{items.length} complete)
              </span>
            )}
          </div>
          {activeUploads.length > 0 && onCancelAll && (
            <Button variant="ghost" size="sm" onClick={onCancelAll} className="h-7 text-xs">
              Cancel All
            </Button>
          )}
        </div>
      )}

      {items.length > 1 && activeUploads.length > 0 && !compact && (
        <div className="space-y-1 px-1">
          <Progress value={overallProgress} className="h-1.5" />
          <p className="text-xs text-muted-foreground text-right tabular-nums">
            {formatFileSize(uploadedSize)} / {formatFileSize(totalSize)} ({overallProgress}%)
          </p>
        </div>
      )}

      <div className={cn('space-y-2', compact && 'space-y-1')}>
        {items.map((item) => (
          <UploadItem
            key={item.id}
            item={item}
            onCancel={onCancel}
            onRetry={onRetry}
            compact={compact}
          />
        ))}
      </div>

      {errorUploads.length > 0 && onRetry && !compact && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => errorUploads.forEach((i) => onRetry(i.id))}
            className="text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Retry Failed ({errorUploads.length})
          </Button>
        </div>
      )}
    </div>
  );
}
