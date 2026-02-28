import { useState, useCallback, memo, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  Archive,
  FileAudio,
  FileText,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Pause,
  Play,
  X,
  RefreshCw,
  Settings2,
  Mail,
  HardDrive,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { FormatSelector, AUDIO_FORMATS, BulkFormatSelector, type BulkFormatConfig, type AudioFormat } from './FormatSelector';
import { QualitySelector, type AudioQualitySettings } from './QualitySelector';

export type BulkExportStatus = 'pending' | 'preparing' | 'processing' | 'complete' | 'partial' | 'failed' | 'cancelled';

export interface BulkExportItem {
  id: string;
  name: string;
  type: 'audio' | 'document' | 'analytics' | 'report';
  format?: string;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'skipped';
  progress: number;
  fileSize?: number;
  error?: string;
  downloadUrl?: string;
}

export interface BulkExportJob {
  id: string;
  name: string;
  status: BulkExportStatus;
  items: BulkExportItem[];
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  startTime?: Date;
  estimatedEndTime?: Date;
  completedTime?: Date;
  zipUrl?: string;
  totalSize?: number;
  emailNotification?: boolean;
}

interface BulkExportManagerProps {
  items: BulkExportItem[];
  onExportStart?: (job: BulkExportJob) => void;
  onExportComplete?: (job: BulkExportJob) => void;
  projectId?: string;
  projectName?: string;
  className?: string;
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  audio: FileAudio,
  document: FileText,
  analytics: FileSpreadsheet,
  report: FileText,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

const BulkExportItemRow = memo(function BulkExportItemRow({
  item,
  isSelected,
  onToggle,
  showStatus = false,
}: {
  item: BulkExportItem;
  isSelected: boolean;
  onToggle: () => void;
  showStatus?: boolean;
}) {
  const Icon = TYPE_ICONS[item.type] || FileText;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
        isSelected ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700",
        item.status === 'complete' && showStatus && "border-green-900/30",
        item.status === 'failed' && showStatus && "border-red-900/30"
      )}
      onClick={onToggle}
    >
      <Checkbox checked={isSelected} onChange={onToggle} />
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
        item.status === 'complete' ? "bg-green-500/20" :
        item.status === 'failed' ? "bg-red-500/20" :
        item.status === 'processing' ? "bg-blue-500/20" :
        "bg-zinc-800"
      )}>
        {item.status === 'processing' ? (
          <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
        ) : item.status === 'complete' ? (
          <CheckCircle2 className="h-5 w-5 text-green-400" />
        ) : item.status === 'failed' ? (
          <XCircle className="h-5 w-5 text-red-400" />
        ) : (
          <Icon className="h-5 w-5 text-zinc-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.name}</span>
          {item.format && (
            <Badge variant="outline" className="text-[10px] uppercase shrink-0">
              {item.format}
            </Badge>
          )}
        </div>
        {showStatus && item.status === 'processing' && (
          <Progress value={item.progress} className="h-1 mt-1.5" />
        )}
        {showStatus && item.status === 'failed' && item.error && (
          <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
        )}
        {item.fileSize && item.status === 'complete' && (
          <p className="text-xs text-zinc-500 mt-0.5">{formatBytes(item.fileSize)}</p>
        )}
      </div>

      {showStatus && item.status === 'complete' && item.downloadUrl && (
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
          <Download className="h-4 w-4" />
        </Button>
      )}
    </motion.div>
  );
});

const BulkExportProgress = memo(function BulkExportProgress({
  job,
  onCancel,
  onRetryFailed,
  onDownload,
  onDismiss,
}: {
  job: BulkExportJob;
  onCancel?: () => void;
  onRetryFailed?: () => void;
  onDownload?: (url: string) => void;
  onDismiss?: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const isActive = ['preparing', 'processing'].includes(job.status);
  const hasFailures = job.failedItems > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "rounded-lg border overflow-hidden",
        job.status === 'complete' ? "bg-green-950/20 border-green-900/30" :
        job.status === 'partial' ? "bg-amber-950/20 border-amber-900/30" :
        job.status === 'failed' ? "bg-red-950/20 border-red-900/30" :
        "bg-zinc-900 border-zinc-800"
      )}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center",
              job.status === 'complete' ? 'bg-green-500/20' :
              job.status === 'partial' ? 'bg-amber-500/20' :
              job.status === 'failed' ? 'bg-red-500/20' :
              'bg-blue-500/20'
            )}>
              {isActive ? (
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
              ) : job.status === 'complete' ? (
                <Archive className="h-6 w-6 text-green-400" />
              ) : job.status === 'partial' ? (
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              ) : job.status === 'failed' ? (
                <XCircle className="h-6 w-6 text-red-400" />
              ) : (
                <Archive className="h-6 w-6 text-zinc-400" />
              )}
            </div>
            <div>
              <h4 className="font-medium">{job.name}</h4>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs">
                  {job.completedItems}/{job.totalItems} files
                </Badge>
                {hasFailures && (
                  <Badge variant="destructive" className="text-xs">
                    {job.failedItems} failed
                  </Badge>
                )}
                {job.totalSize && job.status === 'complete' && (
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatBytes(job.totalSize)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {isActive && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                onClick={onCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {['complete', 'partial', 'failed', 'cancelled'].includes(job.status) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={onDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {isActive && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                {job.status === 'preparing' ? 'Preparing files...' : 'Processing...'}
              </span>
              <span>{job.progress.toFixed(0)}%</span>
            </div>
            <Progress value={job.progress} className="h-2" />
          </div>
        )}

        {(job.status === 'complete' || job.status === 'partial') && job.zipUrl && (
          <div className="flex items-center gap-2 mt-3">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => onDownload?.(job.zipUrl!)}
            >
              <Download className="h-4 w-4 mr-2" />
              Download ZIP
            </Button>
            {job.emailNotification && (
              <Badge variant="outline" className="text-xs gap-1">
                <Mail className="h-3 w-3" />
                Email sent
              </Badge>
            )}
          </div>
        )}

        {job.status === 'partial' && hasFailures && onRetryFailed && (
          <Button
            variant="outline"
            className="w-full mt-2 border-amber-700 text-amber-400 hover:bg-amber-950"
            onClick={onRetryFailed}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Failed ({job.failedItems})
          </Button>
        )}

        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showDetails ? 'Hide details' : 'Show details'}
        </button>

        <AnimatePresence>
          {showDetails && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 pt-3 border-t border-zinc-800"
            >
              <ScrollArea className="h-48">
                <div className="space-y-2">
                  {job.items.map((item) => (
                    <BulkExportItemRow
                      key={item.id}
                      item={item}
                      isSelected={false}
                      onToggle={() => {}}
                      showStatus
                    />
                  ))}
                </div>
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});

export function BulkExportManager({
  items,
  onExportStart,
  onExportComplete,
  projectId,
  projectName = 'Bulk Export',
  className,
}: BulkExportManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(items.map(i => i.id)));
  const [showSettings, setShowSettings] = useState(false);
  const [currentJob, setCurrentJob] = useState<BulkExportJob | null>(null);
  const [formatConfig, setFormatConfig] = useState<BulkFormatConfig>({
    useUnifiedFormat: true,
    format: 'wav',
    zipCompression: true,
  });
  const [qualitySettings, setQualitySettings] = useState<AudioQualitySettings>({
    sampleRate: 48000,
    bitDepth: 24,
    bitrate: 320,
    channels: 'stereo',
  });
  const [emailNotification, setEmailNotification] = useState(true);

  const selectedItems = useMemo(() => 
    items.filter(item => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const estimatedSize = useMemo(() => {
    const avgSizePerItem = 10 * 1024 * 1024;
    const total = selectedItems.length * avgSizePerItem;
    return formatBytes(total);
  }, [selectedItems]);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(i => i.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exportMutation = useMutation({
    mutationFn: async () => {
      const jobId = `bulk-${Date.now()}`;
      const job: BulkExportJob = {
        id: jobId,
        name: `${projectName} - ${selectedItems.length} files`,
        status: 'preparing',
        items: selectedItems.map(item => ({
          ...item,
          status: 'pending' as const,
          progress: 0,
          format: formatConfig.useUnifiedFormat ? formatConfig.format : item.format,
        })),
        totalItems: selectedItems.length,
        completedItems: 0,
        failedItems: 0,
        progress: 0,
        startTime: new Date(),
        emailNotification,
      };

      setCurrentJob(job);
      onExportStart?.(job);

      const response = await apiRequest('POST', '/api/export/bulk', {
        items: selectedItems.map(item => ({
          id: item.id,
          type: item.type,
          format: formatConfig.useUnifiedFormat ? formatConfig.format : item.format,
        })),
        settings: {
          format: formatConfig,
          quality: qualitySettings,
          emailNotification,
          projectId,
        },
      });

      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        const job: BulkExportJob = {
          ...currentJob!,
          id: data.jobId,
          status: data.status || 'processing',
        };
        setCurrentJob(job);
        
        toast({
          title: 'Bulk Export Started',
          description: `Exporting ${selectedItems.length} files...`,
        });

        setTimeout(() => pollJobProgress(data.jobId), 1000);
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: error.message,
      });
      setCurrentJob(prev => prev ? { ...prev, status: 'failed' } : null);
    },
  });

  const pollJobProgress = (jobId: string) => {
    const totalItems = selectedItems.length;
    let pollCount = 0;
    const MAX_POLLS = 120;

    const interval = setInterval(async () => {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        clearInterval(interval);
        setCurrentJob(prev => prev ? { ...prev, status: 'failed' } : null);
        toast({ variant: 'destructive', title: 'Export Timeout', description: 'Export job timed out. Please try again.' });
        return;
      }

      try {
        const response = await fetch(`/api/export/jobs/${jobId}`, { credentials: 'include' });
        if (!response.ok) {
          if (response.status === 404) {
            clearInterval(interval);
            return;
          }
          return;
        }

        const serverJob = await response.json();
        const progress: number = serverJob.progress || 0;
        const serverStatus: string = serverJob.status || 'processing';
        const completedItems = Math.floor((progress / 100) * totalItems);

        const isDone = ['complete', 'failed', 'cancelled', 'partial'].includes(serverStatus);

        if (isDone) {
          clearInterval(interval);
        }

        setCurrentJob(prev => {
          if (!prev) return null;

          const updatedItems = prev.items.map((item, idx) => {
            if (idx < completedItems) {
              return {
                ...item,
                status: 'complete' as const,
                progress: 100,
                downloadUrl: `/api/export/download/${item.id}`,
              };
            }
            if (idx === completedItems && !isDone) {
              return { ...item, status: 'processing' as const, progress: progress % (100 / Math.max(totalItems, 1)) * totalItems };
            }
            return item;
          });

          const failedItems = serverJob.failedItems || 0;
          const successItems = updatedItems.filter(i => i.status === 'complete').length;

          const finalStatus: BulkExportJob['status'] = isDone
            ? (serverStatus === 'complete' ? 'complete' : serverStatus === 'cancelled' ? 'cancelled' : failedItems > 0 && failedItems < totalItems ? 'partial' : 'failed')
            : (serverStatus as BulkExportJob['status']);

          const job: BulkExportJob = {
            ...prev,
            items: updatedItems,
            status: finalStatus,
            progress,
            completedItems: successItems,
            failedItems,
            ...(isDone ? {
              completedTime: new Date(),
              zipUrl: serverJob.downloadUrl || `/api/export/download/zip/${jobId}`,
              totalSize: serverJob.fileSize || 0,
            } : {}),
          };

          if (isDone) {
            onExportComplete?.(job);
          }

          return job;
        });
      } catch {
      }
    }, 2000);
  };

  const handleExport = useCallback(() => {
    if (selectedItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Items Selected',
        description: 'Please select at least one item to export',
      });
      return;
    }
    exportMutation.mutate();
  }, [selectedItems, exportMutation, toast]);

  const handleDownload = useCallback((url: string) => {
    window.open(url, '_blank');
  }, []);

  const handleRetryFailed = useCallback(() => {
    if (!currentJob) return;
    
    const failedItems = currentJob.items.filter(i => i.status === 'failed');
    setSelectedIds(new Set(failedItems.map(i => i.id)));
    setCurrentJob(null);
    
    toast({
      title: 'Retry Failed Items',
      description: `${failedItems.length} items selected for retry`,
    });
  }, [currentJob, toast]);

  return (
    <Card className={cn("bg-zinc-950 border-zinc-800", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-400" />
              Bulk Export
            </CardTitle>
            <CardDescription className="mt-1">
              {selectedIds.size} of {items.length} items selected · Est. {estimatedSize}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700"
              onClick={() => setShowSettings(true)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
            Deselect All
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {currentJob && (
          <BulkExportProgress
            job={currentJob}
            onCancel={() => setCurrentJob(prev => prev ? { ...prev, status: 'cancelled' } : null)}
            onRetryFailed={handleRetryFailed}
            onDownload={handleDownload}
            onDismiss={() => setCurrentJob(null)}
          />
        )}

        {!currentJob && (
          <>
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {items.map((item) => (
                  <BulkExportItemRow
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    onToggle={() => toggleItem(item.id)}
                  />
                ))}
              </div>
            </ScrollArea>

            <Separator className="bg-zinc-800" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={emailNotification}
                    onCheckedChange={(checked) => setEmailNotification(!!checked)}
                  />
                  <Mail className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-300">Email when complete</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={formatConfig.zipCompression}
                    onCheckedChange={(checked) => setFormatConfig(prev => ({ ...prev, zipCompression: !!checked }))}
                  />
                  <Archive className="h-4 w-4 text-zinc-400" />
                  <span className="text-zinc-300">ZIP bundle</span>
                </label>
              </div>
              <Button
                onClick={handleExport}
                disabled={selectedIds.size === 0 || exportMutation.isPending}
                className="bg-gradient-to-r from-purple-600 to-blue-600"
              >
                {exportMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export {selectedIds.size} Items
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export Settings</DialogTitle>
            <DialogDescription>
              Configure format and quality for bulk export
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <BulkFormatSelector
              value={formatConfig}
              onChange={setFormatConfig}
              itemCount={selectedIds.size}
            />

            {formatConfig.useUnifiedFormat && (
              <>
                <Separator className="bg-zinc-800" />
                <QualitySelector
                  quality={qualitySettings}
                  onQualityChange={setQualitySettings}
                  isLossless={AUDIO_FORMATS.find(f => f.value === formatConfig.format)?.lossless || false}
                />
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-zinc-700" onClick={() => setShowSettings(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowSettings(false)}>
              Apply Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default BulkExportManager;
