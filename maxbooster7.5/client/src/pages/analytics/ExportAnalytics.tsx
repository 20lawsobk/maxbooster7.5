import { useState, useCallback, memo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Download,
  FileText,
  FileSpreadsheet,
  File,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Calendar,
  BarChart3,
  DollarSign,
  Users,
  ListMusic,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { DateRangePicker } from '@/components/analytics/DateRangePicker';
import { ExportEmptyState } from '@/components/analytics/AnalyticsEmptyStates';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
}

interface ReportHistory {
  id: string;
  name: string;
  format: 'csv' | 'pdf' | 'xlsx';
  dateRange: string;
  createdAt: string;
  status: 'ready' | 'processing' | 'failed';
  size?: string;
  downloadUrl?: string;
}

const EXPORT_SECTIONS: ExportOption[] = [
  { id: 'streaming', label: 'Streaming Data', description: 'Plays, streams, and listener metrics', icon: BarChart3 },
  { id: 'revenue', label: 'Revenue & Earnings', description: 'Royalties, payouts, and tax info', icon: DollarSign },
  { id: 'audience', label: 'Audience Insights', description: 'Demographics and geographic data', icon: Users },
  { id: 'playlists', label: 'Playlist Tracking', description: 'Placements and performance', icon: ListMusic },
  { id: 'geographic', label: 'Geographic Data', description: 'Country and city breakdown', icon: Globe },
];

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV', description: 'Spreadsheet compatible', icon: FileSpreadsheet },
  { value: 'pdf', label: 'PDF', description: 'Print-ready report', icon: FileText },
  { value: 'xlsx', label: 'Excel', description: 'Full Excel workbook', icon: File },
];

const ExportProgressIndicator = memo(({ 
  progress, 
  status, 
  message 
}: { 
  progress: number; 
  status: 'idle' | 'processing' | 'complete' | 'error';
  message: string;
}) => {
  const statusConfig = {
    idle: { color: 'bg-slate-200', icon: Clock, text: 'Ready to export' },
    processing: { color: 'bg-blue-500', icon: Loader2, text: message },
    complete: { color: 'bg-green-500', icon: CheckCircle, text: 'Export complete!' },
    error: { color: 'bg-red-500', icon: XCircle, text: 'Export failed' },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center",
          status === 'processing' ? 'bg-blue-100 dark:bg-blue-900/30' :
          status === 'complete' ? 'bg-green-100 dark:bg-green-900/30' :
          status === 'error' ? 'bg-red-100 dark:bg-red-900/30' :
          'bg-slate-100 dark:bg-slate-800'
        )}>
          <Icon className={cn(
            "h-5 w-5",
            status === 'processing' && 'animate-spin text-blue-500',
            status === 'complete' && 'text-green-500',
            status === 'error' && 'text-red-500',
            status === 'idle' && 'text-slate-400'
          )} />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm">{config.text}</p>
          {status === 'processing' && (
            <p className="text-xs text-muted-foreground">{progress}% complete</p>
          )}
        </div>
        {status === 'processing' && (
          <Badge variant="outline" className="text-xs">
            Processing...
          </Badge>
        )}
      </div>
      {(status === 'processing' || status === 'complete') && (
        <Progress value={progress} className="h-2" />
      )}
    </motion.div>
  );
});
ExportProgressIndicator.displayName = 'ExportProgressIndicator';

const ReportHistoryItem = memo(({ 
  report, 
  onDownload 
}: { 
  report: ReportHistory;
  onDownload: (report: ReportHistory) => void;
}) => {
  const formatIcons = {
    csv: FileSpreadsheet,
    pdf: FileText,
    xlsx: File,
  };
  const Icon = formatIcons[report.format];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 p-4 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <Icon className="h-5 w-5 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{report.name}</p>
          <Badge variant="outline" className="text-xs uppercase">
            {report.format}
          </Badge>
          {report.status === 'processing' && (
            <Badge className="text-xs bg-blue-100 text-blue-800">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Processing
            </Badge>
          )}
          {report.status === 'failed' && (
            <Badge variant="destructive" className="text-xs">
              Failed
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {report.dateRange}
          </span>
          <span>Created {report.createdAt}</span>
          {report.size && <span>{report.size}</span>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={report.status !== 'ready'}
        onClick={() => onDownload(report)}
      >
        <Download className="h-4 w-4 mr-2" />
        Download
      </Button>
    </motion.div>
  );
});
ReportHistoryItem.displayName = 'ReportHistoryItem';

interface ExportAnalyticsProps {
  timeRange?: string;
  onTimeRangeChange?: (range: string) => void;
}

export function ExportAnalytics({
  timeRange = '30d',
  onTimeRangeChange,
}: ExportAnalyticsProps) {
  const { toast } = useToast();
  const [selectedSections, setSelectedSections] = useState<string[]>(['streaming', 'revenue']);
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf' | 'xlsx'>('csv');
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [progressMessage, setProgressMessage] = useState('');

  const [reportHistory] = useState<ReportHistory[]>([
    { id: '1', name: 'Monthly Analytics Report', format: 'pdf', dateRange: 'Jan 1-31, 2025', createdAt: 'Feb 1, 2025', status: 'ready', size: '2.4 MB', downloadUrl: '#' },
    { id: '2', name: 'Streaming Data Export', format: 'csv', dateRange: 'Dec 1-31, 2024', createdAt: 'Jan 2, 2025', status: 'ready', size: '856 KB', downloadUrl: '#' },
    { id: '3', name: 'Revenue Summary Q4 2024', format: 'xlsx', dateRange: 'Oct 1 - Dec 31, 2024', createdAt: 'Jan 5, 2025', status: 'ready', size: '1.2 MB', downloadUrl: '#' },
  ]);

  const exportMutation = useMutation({
    mutationFn: async () => {
      setExportStatus('processing');
      setExportProgress(0);
      setProgressMessage('Preparing export...');

      const progressSteps = [
        { progress: 10, message: 'Gathering streaming data...' },
        { progress: 30, message: 'Compiling revenue metrics...' },
        { progress: 50, message: 'Processing audience insights...' },
        { progress: 70, message: 'Generating report...' },
        { progress: 90, message: 'Finalizing export...' },
        { progress: 100, message: 'Export complete!' },
      ];

      for (const step of progressSteps) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setExportProgress(step.progress);
        setProgressMessage(step.message);
      }

      const response = await apiRequest('POST', '/api/analytics/export', {
        format: exportFormat,
        sections: selectedSections,
        filters: { timeRange },
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      setExportStatus('complete');
      toast({
        title: 'Export Ready',
        description: 'Your analytics report is ready to download.',
      });

      if (data.downloadUrl) {
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = `analytics-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
        link.click();
      }

      setTimeout(() => {
        setExportStatus('idle');
        setExportProgress(0);
      }, 3000);
    },
    onError: (error) => {
      setExportStatus('error');
      toast({
        variant: 'destructive',
        title: 'Export Failed',
        description: 'There was an error generating your report. Please try again.',
      });

      setTimeout(() => {
        setExportStatus('idle');
        setExportProgress(0);
      }, 3000);
    },
  });

  const handleSectionToggle = useCallback((sectionId: string) => {
    setSelectedSections(prev => 
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  }, []);

  const handleDownload = useCallback((report: ReportHistory) => {
    if (report.downloadUrl) {
      window.open(report.downloadUrl, '_blank');
    }
  }, []);

  const canExport = selectedSections.length > 0 && exportStatus !== 'processing';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Analytics
          </h2>
          <p className="text-sm text-muted-foreground">Download your analytics data in various formats</p>
        </div>
        <DateRangePicker value={timeRange} onChange={onTimeRangeChange || (() => {})} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Data to Export</CardTitle>
              <CardDescription>Choose which analytics sections to include in your report</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                {EXPORT_SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const isSelected = selectedSections.includes(section.id);
                  
                  return (
                    <motion.div
                      key={section.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleSectionToggle(section.id)}
                      className={cn(
                        "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all",
                        isSelected 
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleSectionToggle(section.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className={cn(
                            "h-4 w-4",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )} />
                          <span className="font-medium text-sm">{section.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Export Format</CardTitle>
              <CardDescription>Choose your preferred file format</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={exportFormat}
                onValueChange={(v) => setExportFormat(v as any)}
                className="grid grid-cols-3 gap-4"
              >
                {FORMAT_OPTIONS.map((format) => {
                  const Icon = format.icon;
                  return (
                    <Label
                      key={format.value}
                      htmlFor={format.value}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-lg border cursor-pointer transition-all",
                        exportFormat === format.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300"
                      )}
                    >
                      <RadioGroupItem value={format.value} id={format.value} className="sr-only" />
                      <Icon className={cn(
                        "h-8 w-8",
                        exportFormat === format.value ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className="font-medium">{format.label}</span>
                      <span className="text-xs text-muted-foreground text-center">{format.description}</span>
                    </Label>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {exportStatus !== 'idle' && (
            <ExportProgressIndicator
              progress={exportProgress}
              status={exportStatus}
              message={progressMessage}
            />
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" disabled={exportStatus === 'processing'}>
              Schedule Export
            </Button>
            <Button
              onClick={() => exportMutation.mutate()}
              disabled={!canExport}
              className="bg-gradient-to-r from-blue-600 to-cyan-600"
            >
              {exportStatus === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Export Report
                </>
              )}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Reports</CardTitle>
            <CardDescription>Previously generated reports</CardDescription>
          </CardHeader>
          <CardContent>
            {reportHistory.length === 0 ? (
              <ExportEmptyState />
            ) : (
              <div className="space-y-3">
                {reportHistory.map((report) => (
                  <ReportHistoryItem
                    key={report.id}
                    report={report}
                    onDownload={handleDownload}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200 text-sm">Export Limits</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Free accounts can export up to 3 reports per month. Upgrade to Pro for unlimited exports 
                and additional formats including detailed Excel workbooks with charts.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExportAnalytics;
