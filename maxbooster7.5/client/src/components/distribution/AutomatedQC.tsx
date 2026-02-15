import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Volume2,
  Image,
  FileText,
  Hash,
  AlertCircle,
  Wand2,
  RefreshCw,
  Play,
  Pause,
  Music,
  Shield,
  Zap,
  Eye,
  Settings,
  Download,
} from 'lucide-react';

interface QCCheck {
  id: string;
  name: string;
  category: 'audio' | 'metadata' | 'artwork' | 'codes' | 'content';
  status: 'passed' | 'failed' | 'warning' | 'pending' | 'skipped';
  severity: 'critical' | 'major' | 'minor' | 'info';
  message: string;
  details?: string;
  fixable: boolean;
  fixAction?: string;
  value?: string | number;
  expectedValue?: string | number;
}

interface AudioAnalysis {
  peakLevel: number;
  rmsLevel: number;
  lufs: number;
  truePeak: number;
  dynamicRange: number;
  hasClipping: boolean;
  clippingInstances: number;
  silenceStart: number;
  silenceEnd: number;
  sampleRate: number;
  bitDepth: number;
  duration: number;
}

interface MetadataValidation {
  title: { valid: boolean; issue?: string };
  artist: { valid: boolean; issue?: string };
  genre: { valid: boolean; issue?: string };
  language: { valid: boolean; issue?: string };
  copyright: { valid: boolean; issue?: string };
  releaseDate: { valid: boolean; issue?: string };
  isrc: { valid: boolean; issue?: string };
  upc: { valid: boolean; issue?: string };
}

interface ArtworkAnalysis {
  width: number;
  height: number;
  format: string;
  colorSpace: string;
  resolution: number;
  fileSize: number;
  hasText: boolean;
  hasBlur: boolean;
  isSquare: boolean;
  meetsMinSize: boolean;
}

interface QCReport {
  id: string;
  releaseId: string;
  createdAt: string;
  status: 'passed' | 'failed' | 'warning';
  overallScore: number;
  checks: QCCheck[];
  audioAnalysis?: AudioAnalysis;
  metadataValidation?: MetadataValidation;
  artworkAnalysis?: ArtworkAnalysis;
}

interface AutomatedQCProps {
  releaseId?: string;
  audioFiles?: File[];
  artwork?: File;
  metadata?: Record<string, unknown>;
  onCheckComplete?: (report: QCReport) => void;
  onApplyFix?: (checkId: string, fixAction: string) => void;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  audio: Volume2,
  metadata: FileText,
  artwork: Image,
  codes: Hash,
  content: Shield,
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  passed: { color: 'text-green-500', icon: CheckCircle, label: 'Passed' },
  failed: { color: 'text-red-500', icon: XCircle, label: 'Failed' },
  warning: { color: 'text-yellow-500', icon: AlertTriangle, label: 'Warning' },
  pending: { color: 'text-blue-500', icon: RefreshCw, label: 'Checking...' },
  skipped: { color: 'text-gray-400', icon: Pause, label: 'Skipped' },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  major: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  minor: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export function AutomatedQC({
  releaseId,
  audioFiles = [],
  artwork,
  metadata = {},
  onCheckComplete,
  onApplyFix,
}: AutomatedQCProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoFix, setAutoFix] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: qcReport, isLoading: reportLoading } = useQuery<QCReport>({
    queryKey: ['/api/distribution/qc', releaseId],
    enabled: !!releaseId,
  });

  const runQCMutation = useMutation({
    mutationFn: async () => {
      setIsRunning(true);
      setProgress(0);

      const formData = new FormData();
      if (releaseId) {
        formData.append('releaseId', releaseId);
      }
      audioFiles.forEach((file, index) => {
        formData.append(`audio_${index}`, file);
      });
      if (artwork) {
        formData.append('artwork', artwork);
      }
      formData.append('metadata', JSON.stringify(metadata));

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 500);

      try {
        const response = await apiRequest('POST', '/api/distribution/qc/analyze', formData);
        const result = await response.json();
        clearInterval(progressInterval);
        setProgress(100);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (report) => {
      setIsRunning(false);
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/qc', releaseId] });
      onCheckComplete?.(report);
      toast({
        title: 'QC Check Complete',
        description: `${report.checks.filter((c: QCCheck) => c.status === 'passed').length}/${report.checks.length} checks passed`,
      });
    },
    onError: () => {
      setIsRunning(false);
      toast({
        title: 'QC Check Failed',
        description: 'Unable to complete quality control checks',
        variant: 'destructive',
      });
    },
  });

  const applyFixMutation = useMutation({
    mutationFn: async ({ checkId, fixAction }: { checkId: string; fixAction: string }) => {
      const response = await apiRequest('POST', '/api/distribution/qc/fix', {
        releaseId,
        checkId,
        fixAction,
      });
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/qc', releaseId] });
      onApplyFix?.(variables.checkId, variables.fixAction);
      toast({
        title: 'Fix Applied',
        description: 'The issue has been automatically fixed',
      });
    },
    onError: () => {
      toast({
        title: 'Fix Failed',
        description: 'Unable to apply the fix automatically',
        variant: 'destructive',
      });
    },
  });

  const applyAllFixesMutation = useMutation({
    mutationFn: async () => {
      const fixableChecks = qcReport?.checks.filter((c) => c.fixable && c.status === 'failed') || [];
      for (const check of fixableChecks) {
        if (check.fixAction) {
          await apiRequest('POST', '/api/distribution/qc/fix', {
            releaseId,
            checkId: check.id,
            fixAction: check.fixAction,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/qc', releaseId] });
      toast({
        title: 'All Fixes Applied',
        description: 'All fixable issues have been resolved',
      });
    },
  });

  const report = qcReport;

  const passedCount = report?.checks.filter((c) => c.status === 'passed').length ?? 0;
  const failedCount = report?.checks.filter((c) => c.status === 'failed').length ?? 0;
  const warningCount = report?.checks.filter((c) => c.status === 'warning').length ?? 0;
  const fixableCount = report?.checks.filter((c) => c.fixable && c.status !== 'passed').length ?? 0;

  const getCategoryChecks = (category: string) =>
    report?.checks.filter((c) => c.category === category) ?? [];

  const renderStatusIcon = (status: string) => {
    const config = STATUS_CONFIG[status];
    if (!config) return null;
    const Icon = config.icon;
    return <Icon className={`h-4 w-4 ${config.color}`} />;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Automated Quality Control
            </CardTitle>
            <CardDescription>
              Comprehensive checks for audio quality, metadata, artwork, and compliance
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="auto-fix"
                checked={autoFix}
                onCheckedChange={setAutoFix}
              />
              <Label htmlFor="auto-fix" className="text-sm">Auto-fix</Label>
            </div>
            <Button
              onClick={() => runQCMutation.mutate()}
              disabled={isRunning || runQCMutation.isPending}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run QC Check
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Analyzing...</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {!isRunning && report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">{report.overallScore}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Overall Score</p>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-500">{passedCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Passed</p>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-500">{failedCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Failed</p>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-500">{warningCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Warnings</p>
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-500">{fixableCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Fixable</p>
                </div>
              </Card>
            </div>

            {fixableCount > 0 && (
              <Alert>
                <Wand2 className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>
                    {fixableCount} issue{fixableCount > 1 ? 's' : ''} can be automatically fixed
                  </span>
                  <Button
                    size="sm"
                    onClick={() => applyAllFixesMutation.mutate()}
                    disabled={applyAllFixesMutation.isPending}
                  >
                    <Wand2 className="h-4 w-4 mr-2" />
                    Fix All
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid grid-cols-6 w-full">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="audio">
                  Audio ({getCategoryChecks('audio').length})
                </TabsTrigger>
                <TabsTrigger value="metadata">
                  Metadata ({getCategoryChecks('metadata').length})
                </TabsTrigger>
                <TabsTrigger value="artwork">
                  Artwork ({getCategoryChecks('artwork').length})
                </TabsTrigger>
                <TabsTrigger value="codes">
                  Codes ({getCategoryChecks('codes').length})
                </TabsTrigger>
                <TabsTrigger value="content">
                  Content ({getCategoryChecks('content').length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.checks.map((check) => {
                      const CategoryIcon = CATEGORY_ICONS[check.category] || FileText;
                      return (
                        <TableRow key={check.id}>
                          <TableCell className="font-medium">{check.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1">
                              <CategoryIcon className="h-3 w-3" />
                              {check.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {renderStatusIcon(check.status)}
                              <span className="capitalize">{check.status}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={SEVERITY_STYLES[check.severity]}>
                              {check.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {check.message}
                          </TableCell>
                          <TableCell className="text-right">
                            {check.fixable && check.status !== 'passed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  applyFixMutation.mutate({
                                    checkId: check.id,
                                    fixAction: check.fixAction || '',
                                  })
                                }
                                disabled={applyFixMutation.isPending}
                              >
                                <Wand2 className="h-3 w-3 mr-1" />
                                Fix
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="audio" className="space-y-4">
                {report.audioAnalysis && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Peak Level</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.peakLevel} dB</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Loudness (LUFS)</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.lufs} LUFS</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Dynamic Range</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.dynamicRange} dB</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">True Peak</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.truePeak} dB</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Sample Rate</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.sampleRate / 1000} kHz</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Bit Depth</div>
                      <div className="text-xl font-bold">{report.audioAnalysis.bitDepth}-bit</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Duration</div>
                      <div className="text-xl font-bold">
                        {Math.floor(report.audioAnalysis.duration / 60)}:
                        {String(Math.floor(report.audioAnalysis.duration % 60)).padStart(2, '0')}
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Clipping</div>
                      <div className="text-xl font-bold">
                        {report.audioAnalysis.hasClipping ? (
                          <span className="text-red-500">{report.audioAnalysis.clippingInstances} instances</span>
                        ) : (
                          <span className="text-green-500">None</span>
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                {getCategoryChecks('audio').map((check) => (
                  <Card key={check.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderStatusIcon(check.status)}
                        <div>
                          <h4 className="font-medium">{check.name}</h4>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                      {check.fixable && check.status !== 'passed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyFixMutation.mutate({
                              checkId: check.id,
                              fixAction: check.fixAction || '',
                            })
                          }
                        >
                          <Wand2 className="h-3 w-3 mr-1" />
                          Auto-Fix
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="metadata" className="space-y-4">
                {getCategoryChecks('metadata').map((check) => (
                  <Card key={check.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderStatusIcon(check.status)}
                        <div>
                          <h4 className="font-medium">{check.name}</h4>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                      {check.fixable && check.status !== 'passed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyFixMutation.mutate({
                              checkId: check.id,
                              fixAction: check.fixAction || '',
                            })
                          }
                        >
                          <Wand2 className="h-3 w-3 mr-1" />
                          Auto-Fix
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="artwork" className="space-y-4">
                {report.artworkAnalysis && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Dimensions</div>
                      <div className="text-xl font-bold">
                        {report.artworkAnalysis.width}x{report.artworkAnalysis.height}
                      </div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Format</div>
                      <div className="text-xl font-bold">{report.artworkAnalysis.format}</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">Color Space</div>
                      <div className="text-xl font-bold">{report.artworkAnalysis.colorSpace}</div>
                    </Card>
                    <Card className="p-4">
                      <div className="text-sm text-muted-foreground">File Size</div>
                      <div className="text-xl font-bold">
                        {(report.artworkAnalysis.fileSize / (1024 * 1024)).toFixed(1)} MB
                      </div>
                    </Card>
                  </div>
                )}

                {getCategoryChecks('artwork').map((check) => (
                  <Card key={check.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderStatusIcon(check.status)}
                        <div>
                          <h4 className="font-medium">{check.name}</h4>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                      {check.fixable && check.status !== 'passed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyFixMutation.mutate({
                              checkId: check.id,
                              fixAction: check.fixAction || '',
                            })
                          }
                        >
                          <Wand2 className="h-3 w-3 mr-1" />
                          Auto-Fix
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="codes" className="space-y-4">
                {getCategoryChecks('codes').map((check) => (
                  <Card key={check.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderStatusIcon(check.status)}
                        <div>
                          <h4 className="font-medium">{check.name}</h4>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.value && (
                            <p className="text-xs font-mono bg-muted px-2 py-1 rounded mt-1 inline-block">
                              {check.value}
                            </p>
                          )}
                          {check.details && (
                            <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                      {check.fixable && check.status !== 'passed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            applyFixMutation.mutate({
                              checkId: check.id,
                              fixAction: check.fixAction || '',
                            })
                          }
                        >
                          <Wand2 className="h-3 w-3 mr-1" />
                          Generate
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="content" className="space-y-4">
                {getCategoryChecks('content').map((check) => (
                  <Card key={check.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {renderStatusIcon(check.status)}
                        <div>
                          <h4 className="font-medium">{check.name}</h4>
                          <p className="text-sm text-muted-foreground">{check.message}</p>
                          {check.details && (
                            <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                          )}
                        </div>
                      </div>
                      <Badge className={SEVERITY_STYLES[check.severity]}>
                        {check.severity}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Last checked: {new Date(report.createdAt).toLocaleString()}
              </p>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Report
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
