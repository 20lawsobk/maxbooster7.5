import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Download,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BulkPost {
  platform: string;
  content: string;
  mediaUrls?: string[];
  scheduledAt?: string;
  socialAccountId?: string;
  campaignId?: string;
}

interface ValidationError {
  index: number;
  field: string;
  message: string;
}

interface BatchStatus {
  batchId: string;
  status: string;
  totalPosts: number;
  processedPosts: number;
  successfulPosts: number;
  failedPosts: number;
  statusBreakdown: Record<string, number>;
  posts: Array<{
    id: string;
    platform: string;
    status: string;
    scheduledAt: string;
    publishedAt?: string;
    error?: string;
  }>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * TODO: Add function documentation
 */
export function BulkScheduler() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPosts, setParsedPosts] = useState<BulkPost[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<
    Array<{ index: number; message: string }>
  >([]);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: batches, refetch: refetchBatches } = useQuery({
    queryKey: ['/api/social/bulk/batches'],
    refetchInterval: 5000,
  });

  const { data: currentBatch, refetch: refetchCurrentBatch } = useQuery({
    queryKey: ['/api/social/bulk/status', currentBatchId],
    enabled: !!currentBatchId,
    refetchInterval: currentBatchId ? 2000 : false,
  });

  const validateMutation = useMutation({
    mutationFn: async (posts: BulkPost[]) => {
      const res = await fetch('/api/social/bulk/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ posts }),
      });
      if (!res.ok) throw new Error('Validation failed');
      return res.json();
    },
    onSuccess: (data) => {
      setValidationErrors(data.errors || []);
      setValidationWarnings(data.warnings || []);

      if (data.valid) {
        toast({
          title: 'Validation Passed',
          description: `${data.totalPosts} posts are ready to schedule`,
        });
      } else {
        toast({
          title: 'Validation Issues Found',
          description: `${data.errors.length} errors need to be fixed`,
          variant: 'destructive',
        });
      }
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (posts: BulkPost[]) => {
      const res = await fetch('/api/social/bulk/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ posts }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Scheduling failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setCurrentBatchId(data.batchId);
      setParsedPosts([]);
      setSelectedFile(null);
      setValidationErrors([]);
      setValidationWarnings([]);

      toast({
        title: 'Batch Scheduled',
        description: `${data.totalPosts} posts are being processed`,
      });

      refetchBatches();
    },
    onError: (error: Error) => {
      toast({
        title: 'Scheduling Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const res = await fetch(`/api/social/bulk/${batchId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Cancellation failed');
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Batch Cancelled',
        description: 'Scheduled posts have been cancelled',
      });
      setCurrentBatchId(null);
      refetchBatches();
    },
  });

  const parseCSV = useCallback(
    (file: File) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter((line) => line.trim());

        const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
        const posts: BulkPost[] = [];

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((v) => v.trim());
          const post: BulkPost = {
            platform: '',
            content: '',
          };

          headers.forEach((header, index) => {
            const value = values[index];

            switch (header) {
              case 'platform':
                post.platform = value;
                break;
              case 'content':
                post.content = value;
                break;
              case 'mediaurls':
              case 'media_urls':
                post.mediaUrls = value ? value.split('|') : [];
                break;
              case 'scheduledat':
              case 'scheduled_at':
                post.scheduledAt = value;
                break;
              case 'socialaccountid':
              case 'social_account_id':
                post.socialAccountId = value;
                break;
              case 'campaignid':
              case 'campaign_id':
                post.campaignId = value;
                break;
            }
          });

          if (post.platform && post.content) {
            posts.push(post);
          }
        }

        setParsedPosts(posts);
        toast({
          title: 'CSV Parsed',
          description: `${posts.length} posts loaded from CSV`,
        });
      };

      reader.readAsText(file);
    },
    [toast]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      parseCSV(file);
    }
  };

  const downloadTemplate = () => {
    const template =
      'platform,content,media_urls,scheduled_at,social_account_id,campaign_id\ntwitter,"Check out our new track!","","2025-01-01T12:00:00Z","",""';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-schedule-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Bulk Social Media Scheduler</CardTitle>
          <CardDescription>
            Upload CSV to schedule up to 500 posts across multiple platforms
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-accent/5 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">CSV file (MAX. 500 posts)</p>
                </div>
                <input type="file" className="hidden" accept=".csv" onChange={handleFileSelect} />
              </label>
              {selectedFile && (
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>{selectedFile.name}</span>
                  <Badge variant="outline">{parsedPosts.length} posts</Badge>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Download Template
              </Button>
              <Button
                onClick={() => validateMutation.mutate(parsedPosts)}
                disabled={parsedPosts.length === 0 || validateMutation.isPending}
              >
                {validateMutation.isPending ? 'Validating...' : 'Validate Posts'}
              </Button>
              <Button
                onClick={() => scheduleMutation.mutate(parsedPosts)}
                disabled={
                  parsedPosts.length === 0 ||
                  validationErrors.length > 0 ||
                  scheduleMutation.isPending
                }
                className="bg-primary"
              >
                {scheduleMutation.isPending ? 'Scheduling...' : 'Schedule All'}
              </Button>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{validationErrors.length} validation errors found:</strong>
                <ul className="mt-2 space-y-1">
                  {validationErrors.slice(0, 5).map((error, idx) => (
                    <li key={idx} className="text-sm">
                      Row {error.index + 1} - {error.field}: {error.message}
                    </li>
                  ))}
                  {validationErrors.length > 5 && (
                    <li className="text-sm">...and {validationErrors.length - 5} more</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {validationWarnings.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{validationWarnings.length} warnings:</strong>
                <ul className="mt-2 space-y-1">
                  {validationWarnings.slice(0, 3).map((warning, idx) => (
                    <li key={idx} className="text-sm">
                      Row {warning.index + 1}: {warning.message}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {currentBatch && (
        <Card className="bg-card/50 border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current Batch Progress</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => refetchCurrentBatch()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => cancelMutation.mutate(currentBatch.batchId)}
                  disabled={
                    currentBatch.status === 'completed' || currentBatch.status === 'cancelled'
                  }
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
            <CardDescription>Batch ID: {currentBatch.batchId}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>
                  {currentBatch.processedPosts} / {currentBatch.totalPosts}
                </span>
              </div>
              <Progress
                value={(currentBatch.processedPosts / currentBatch.totalPosts) * 100}
                className="h-2"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{currentBatch.successfulPosts}</div>
                  <div className="text-xs text-muted-foreground">Successful</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold">{currentBatch.failedPosts}</div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">
                    {currentBatch.totalPosts - currentBatch.processedPosts}
                  </div>
                  <div className="text-xs text-muted-foreground">Pending</div>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Status: <Badge>{currentBatch.status}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle>Recent Batches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {batches?.batches?.map((batch: unknown) => (
              <div
                key={batch.id}
                className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-accent/5 cursor-pointer"
                onClick={() => setCurrentBatchId(batch.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={batch.status === 'completed' ? 'default' : 'outline'}>
                      {batch.status}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(batch.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm">
                    {batch.successfulPosts} / {batch.totalPosts} posts successful
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{batch.totalPosts} posts</div>
                  <div className="text-xs text-muted-foreground">
                    {batch.failedPosts > 0 && `${batch.failedPosts} failed`}
                  </div>
                </div>
              </div>
            ))}
            {(!batches?.batches || batches.batches.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                No batches yet. Upload a CSV to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
