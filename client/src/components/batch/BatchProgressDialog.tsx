import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  X,
  RefreshCw,
  FileText,
} from 'lucide-react';
import type { BulkActionStatus, BulkActionProgress, BulkActionResult } from '@/hooks/useBulkAction';

export interface BatchProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: BulkActionStatus;
  progress: BulkActionProgress;
  result: BulkActionResult | null;
  title?: string;
  description?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  showDetails?: boolean;
}

export function BatchProgressDialog({
  open,
  onOpenChange,
  status,
  progress,
  result,
  title = 'Processing...',
  description,
  onCancel,
  onRetry,
  onClose,
  showDetails = true,
}: BatchProgressDialogProps) {
  const [showErrors, setShowErrors] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    if (status !== 'processing') {
      setElapsedTime(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-8 w-8 animate-spin text-primary" />;
      case 'completed':
        return <CheckCircle2 className="h-8 w-8 text-green-500" />;
      case 'failed':
        return <XCircle className="h-8 w-8 text-destructive" />;
      case 'partial':
        return <AlertTriangle className="h-8 w-8 text-amber-500" />;
      default:
        return null;
    }
  };

  const getStatusTitle = () => {
    switch (status) {
      case 'processing':
        return title;
      case 'completed':
        return 'Operation Complete';
      case 'failed':
        return 'Operation Failed';
      case 'partial':
        return 'Completed with Errors';
      default:
        return title;
    }
  };

  const getStatusDescription = () => {
    if (description) return description;
    
    switch (status) {
      case 'processing':
        return progress.currentItem 
          ? `Processing: ${progress.currentItem}`
          : `Processing ${progress.current} of ${progress.total} items...`;
      case 'completed':
        return result 
          ? `Successfully processed ${result.totalSucceeded} item${result.totalSucceeded !== 1 ? 's' : ''}`
          : 'All items processed successfully';
      case 'failed':
        return result?.failed?.[0]?.error || 'An error occurred while processing';
      case 'partial':
        return result 
          ? `${result.totalSucceeded} succeeded, ${result.totalFailed} failed`
          : 'Some items failed to process';
      default:
        return '';
    }
  };

  const handleClose = () => {
    onClose?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {getStatusIcon()}
            <span>{getStatusTitle()}</span>
          </DialogTitle>
          <DialogDescription>{getStatusDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {status === 'processing' && (
            <>
              <Progress value={progress.percentage} className="h-2" />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {progress.current} / {progress.total} items
                </span>
                <span>{progress.percentage}%</span>
              </div>
              {elapsedTime > 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  Elapsed: {formatTime(elapsedTime)}
                </p>
              )}
            </>
          )}

          {(status === 'completed' || status === 'partial') && result && (
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">
                  {result.totalSucceeded}
                </div>
                <div className="text-xs text-muted-foreground">Succeeded</div>
              </div>
              {result.totalFailed > 0 && (
                <>
                  <div className="h-8 w-px bg-border" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">
                      {result.totalFailed}
                    </div>
                    <div className="text-xs text-muted-foreground">Failed</div>
                  </div>
                </>
              )}
            </div>
          )}

          {showDetails && result && result.failed.length > 0 && (
            <Collapsible open={showErrors} onOpenChange={setShowErrors}>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <FileText className="h-4 w-4" />
                  View {result.failed.length} error{result.failed.length !== 1 ? 's' : ''}
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      showErrors && 'rotate-180'
                    )}
                  />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="h-40 mt-2 rounded border">
                  <div className="p-2 space-y-2">
                    {result.failed.map((failure, index) => (
                      <div
                        key={failure.id || index}
                        className="flex items-start gap-2 p-2 bg-destructive/5 rounded text-sm"
                      >
                        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium">{failure.id}</p>
                          <p className="text-muted-foreground text-xs">
                            {failure.error}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <DialogFooter>
          {status === 'processing' && onCancel && (
            <Button variant="outline" onClick={onCancel}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
          {(status === 'failed' || status === 'partial') && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Failed
            </Button>
          )}
          {status !== 'processing' && (
            <Button onClick={handleClose}>
              {status === 'completed' ? 'Done' : 'Close'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useBatchProgressDialog() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BulkActionStatus>('idle');
  const [progress, setProgress] = useState<BulkActionProgress>({
    current: 0,
    total: 0,
    percentage: 0,
  });
  const [result, setResult] = useState<BulkActionResult | null>(null);

  const start = (total: number) => {
    setStatus('processing');
    setProgress({ current: 0, total, percentage: 0 });
    setResult(null);
    setOpen(true);
  };

  const updateProgress = (current: number, currentItem?: string) => {
    setProgress((prev) => ({
      ...prev,
      current,
      currentItem,
      percentage: prev.total > 0 ? Math.round((current / prev.total) * 100) : 0,
    }));
  };

  const complete = (operationResult: BulkActionResult) => {
    setResult(operationResult);
    setStatus(
      operationResult.totalFailed === 0
        ? 'completed'
        : operationResult.totalSucceeded > 0
        ? 'partial'
        : 'failed'
    );
    setProgress((prev) => ({
      ...prev,
      current: prev.total,
      percentage: 100,
    }));
  };

  const fail = (error: string) => {
    setStatus('failed');
    setResult({
      success: [],
      failed: [{ id: 'operation', error }],
      totalRequested: progress.total,
      totalSucceeded: 0,
      totalFailed: progress.total,
    });
  };

  const reset = () => {
    setOpen(false);
    setStatus('idle');
    setProgress({ current: 0, total: 0, percentage: 0 });
    setResult(null);
  };

  return {
    open,
    setOpen,
    status,
    progress,
    result,
    start,
    updateProgress,
    complete,
    fail,
    reset,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      status,
      progress,
      result,
    },
  };
}
