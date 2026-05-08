import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getCsrfTokenFromCookie } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  FileAudio,
  Shield,
  HardDrive,
  FileType,
  AudioWaveform,
  Database,
  Music,
  Zap,
  RefreshCw,
  Info,
} from 'lucide-react';

export type ValidationStatus = 'pending' | 'validating' | 'pass' | 'fail' | 'warning' | 'skipped';

export type ValidationOutcome = 
  | 'audio_valid'
  | 'audio_corrupted'
  | 'unsupported_codec'
  | 'metadata_success'
  | 'metadata_failed'
  | 'waveform_complete'
  | 'waveform_failed'
  | 'validation_passed'
  | 'validation_failed'
  | 'validation_warnings';

export interface ValidationCheck {
  id: string;
  name: string;
  status: ValidationStatus;
  message: string;
  value?: string | number;
  icon?: React.ReactNode;
}

export interface FileValidationResult {
  outcome: ValidationOutcome;
  valid: boolean;
  file: {
    name: string;
    size: number;
    sizeFormatted: string;
    type: string;
  };
  checks: ValidationCheck[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
  };
}

interface FileValidationStatusProps {
  file?: File;
  result?: FileValidationResult;
  onValidate?: () => void;
  onRetry?: () => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

const STATUS_ICONS: Record<ValidationStatus, React.ReactNode> = {
  pending: <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />,
  validating: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
  pass: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  fail: <XCircle className="h-4 w-4 text-destructive" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  skipped: <div className="h-4 w-4 rounded-full bg-muted" />,
};

const CHECK_ICONS: Record<string, React.ReactNode> = {
  'File Size': <HardDrive className="h-4 w-4" />,
  'File Type': <FileType className="h-4 w-4" />,
  'Audio Format': <FileAudio className="h-4 w-4" />,
  'Audio Integrity': <Shield className="h-4 w-4" />,
  'Metadata': <Database className="h-4 w-4" />,
  'Waveform': <AudioWaveform className="h-4 w-4" />,
  'Storage Quota': <HardDrive className="h-4 w-4" />,
  'Audio Playable': <Music className="h-4 w-4" />,
};

const OUTCOME_CONFIG: Record<ValidationOutcome, {
  label: string;
  description: string;
  color: string;
  icon: React.ReactNode;
}> = {
  audio_valid: {
    label: 'Audio Valid',
    description: 'Audio file passed all validation checks',
    color: 'text-green-500',
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  },
  audio_corrupted: {
    label: 'Audio Corrupted',
    description: 'The audio file appears to be corrupted or damaged',
    color: 'text-destructive',
    icon: <XCircle className="h-5 w-5 text-destructive" />,
  },
  unsupported_codec: {
    label: 'Unsupported Codec',
    description: 'The audio codec or format is not supported',
    color: 'text-destructive',
    icon: <XCircle className="h-5 w-5 text-destructive" />,
  },
  metadata_success: {
    label: 'Metadata Extracted',
    description: 'Audio metadata was successfully extracted',
    color: 'text-green-500',
    icon: <Database className="h-5 w-5 text-green-500" />,
  },
  metadata_failed: {
    label: 'Metadata Failed',
    description: 'Could not extract audio metadata',
    color: 'text-amber-500',
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  },
  waveform_complete: {
    label: 'Waveform Generated',
    description: 'Audio waveform was successfully generated',
    color: 'text-green-500',
    icon: <AudioWaveform className="h-5 w-5 text-green-500" />,
  },
  waveform_failed: {
    label: 'Waveform Failed',
    description: 'Could not generate audio waveform',
    color: 'text-amber-500',
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  },
  validation_passed: {
    label: 'Validation Passed',
    description: 'All validation checks passed successfully',
    color: 'text-green-500',
    icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  },
  validation_failed: {
    label: 'Validation Failed',
    description: 'One or more validation checks failed',
    color: 'text-destructive',
    icon: <XCircle className="h-5 w-5 text-destructive" />,
  },
  validation_warnings: {
    label: 'Validation Warnings',
    description: 'Validation passed with some warnings',
    color: 'text-amber-500',
    icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  },
};

export function FileValidationStatus({
  file,
  result,
  onValidate,
  onRetry,
  showDetails = true,
  compact = false,
  className,
}: FileValidationStatusProps) {
  const [showFullDetails, setShowFullDetails] = useState(false);

  const validateMutation = useMutation({
    mutationFn: async (fileToValidate: File) => {
      const formData = new FormData();
      formData.append('file', fileToValidate);
      
      const csrfToken = getCsrfTokenFromCookie();
      const response = await fetch('/api/files/validate', {
        method: 'POST',
        credentials: 'include',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Validation failed');
      }
      
      return response.json();
    },
  });

  const handleValidate = () => {
    if (file) {
      validateMutation.mutate(file);
    }
    onValidate?.();
  };

  const activeResult = result || validateMutation.data;
  const isValidating = validateMutation.isPending;
  const outcomeConfig = activeResult ? OUTCOME_CONFIG[activeResult.outcome] : null;

  if (compact && activeResult) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {activeResult.valid ? (
          <Badge variant="outline" className="text-green-600 border-green-600 gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Valid
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            {activeResult.summary.failed} issue{activeResult.summary.failed > 1 ? 's' : ''}
          </Badge>
        )}
        {activeResult.summary.warnings > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {activeResult.summary.warnings}
          </Badge>
        )}
        {showDetails && (
          <Button variant="ghost" size="sm" onClick={() => setShowFullDetails(true)} className="h-7">
            <Info className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">File Validation</CardTitle>
            </div>
            {activeResult && outcomeConfig && (
              <Badge 
                variant="outline" 
                className={cn('gap-1', outcomeConfig.color)}
              >
                {outcomeConfig.icon}
                {outcomeConfig.label}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {file && !activeResult && !isValidating && (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">
                Validate "{file.name}" before uploading
              </p>
              <Button onClick={handleValidate}>
                <Zap className="h-4 w-4 mr-2" />
                Validate File
              </Button>
            </div>
          )}

          {isValidating && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Validating file...</p>
            </div>
          )}

          {activeResult && (
            <>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <FileAudio className="h-8 w-8 text-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activeResult.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeResult.file.sizeFormatted} · {activeResult.file.type}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Validation Progress</span>
                  <span className="font-medium">
                    {activeResult.summary.passed}/{activeResult.checks.length} passed
                  </span>
                </div>
                <Progress 
                  value={(activeResult.summary.passed / activeResult.checks.length) * 100} 
                  className="h-2" 
                />
              </div>

              {showDetails && (
                <div className="space-y-2">
                  {activeResult.checks.map((check) => (
                    <div
                      key={check.id}
                      className={cn(
                        'flex items-start gap-3 p-2 rounded-lg',
                        check.status === 'fail' && 'bg-destructive/5',
                        check.status === 'warning' && 'bg-amber-500/5',
                        check.status === 'pass' && 'bg-green-500/5'
                      )}
                    >
                      <div className="flex-shrink-0 mt-0.5 text-muted-foreground">
                        {CHECK_ICONS[check.name] || <Shield className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">{check.name}</span>
                          {STATUS_ICONS[check.status]}
                        </div>
                        <p className={cn(
                          'text-xs',
                          check.status === 'fail' ? 'text-destructive' :
                          check.status === 'warning' ? 'text-amber-600' :
                          'text-muted-foreground'
                        )}>
                          {check.message}
                        </p>
                        {check.value && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            {check.value}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeResult.summary.failed > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-destructive">
                        Validation Failed
                      </p>
                      <p className="text-xs text-destructive/80 mt-0.5">
                        {activeResult.summary.failed} check{activeResult.summary.failed > 1 ? 's' : ''} failed. 
                        Please fix the issues before uploading.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeResult.summary.warnings > 0 && activeResult.summary.failed === 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-600">
                        Validation Passed with Warnings
                      </p>
                      <p className="text-xs text-amber-600/80 mt-0.5">
                        The file can be uploaded, but some features may be limited.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeResult.valid && activeResult.summary.warnings === 0 && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-600">
                        Validation Passed
                      </p>
                      <p className="text-xs text-green-600/80 mt-0.5">
                        File is ready for upload.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {onRetry && !activeResult.valid && (
                <Button variant="outline" onClick={onRetry} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-validate
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFullDetails} onOpenChange={setShowFullDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validation Details</DialogTitle>
            <DialogDescription>
              Complete validation results for {activeResult?.file.name}
            </DialogDescription>
          </DialogHeader>
          {activeResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-500">{activeResult.summary.passed}</p>
                  <p className="text-xs text-muted-foreground">Passed</p>
                </div>
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <p className="text-2xl font-bold text-amber-500">{activeResult.summary.warnings}</p>
                  <p className="text-xs text-muted-foreground">Warnings</p>
                </div>
                <div className="p-2 rounded-lg bg-destructive/10">
                  <p className="text-2xl font-bold text-destructive">{activeResult.summary.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeResult.checks.map((check) => (
                  <div key={check.id} className="flex items-center gap-3 p-2 rounded border">
                    {STATUS_ICONS[check.status]}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{check.name}</p>
                      <p className="text-xs text-muted-foreground">{check.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ValidationOutcomeBadge({ outcome }: { outcome: ValidationOutcome }) {
  const config = OUTCOME_CONFIG[outcome];
  return (
    <Badge variant="outline" className={cn('gap-1', config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
