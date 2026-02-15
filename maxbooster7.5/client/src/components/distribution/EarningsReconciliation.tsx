import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChartCard, SimpleAreaChart, DonutChart } from '@/components/ui/chart-card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Calendar,
  Download,
  Upload,
  CheckCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  FileText,
  FileSpreadsheet,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  AlertCircle,
  CreditCard,
  Banknote,
  Building,
  Globe,
  PieChart,
  History,
  FileCheck,
  AlertTriangle,
  Info,
  ExternalLink,
  Copy,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  SoundCloudIcon,
  DeezerIcon,
} from '@/components/ui/brand-icons';

interface RoyaltyStatement {
  id: string;
  platform: string;
  period: string;
  statementDate: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'processing' | 'imported' | 'error' | 'reconciled';
  totalAmount: number;
  totalStreams: number;
  trackCount: number;
  currency: string;
  importedAt?: string;
  errors?: string[];
}

interface EarningsEntry {
  id: string;
  releaseTitle: string;
  trackTitle: string;
  platform: string;
  period: string;
  streams: number;
  downloads: number;
  earnings: number;
  payRate: number;
  currency: string;
  territory: string;
  type: 'stream' | 'download' | 'sync' | 'mechanical' | 'performance';
}

interface PayoutRecord {
  id: string;
  amount: number;
  currency: string;
  method: 'bank' | 'paypal' | 'wise' | 'payoneer' | 'check';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'returned';
  scheduledDate: string;
  processedDate?: string;
  platforms: string[];
  period: string;
  transactionId?: string;
  bankDetails?: {
    bankName: string;
    accountLast4: string;
  };
  fee?: number;
}

interface ReconciliationSummary {
  totalEarnings: number;
  totalStreams: number;
  totalDownloads: number;
  pendingPayouts: number;
  completedPayouts: number;
  discrepancyAmount: number;
  discrepancyCount: number;
  averagePayRate: number;
}

interface TerritoryBreakdown {
  territory: string;
  earnings: number;
  streams: number;
  percentage: number;
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  spotify: SpotifyIcon,
  'apple-music': AppleMusicIcon,
  'youtube-music': YouTubeIcon,
  'amazon-music': AmazonIcon,
  tidal: TidalIcon,
  soundcloud: SoundCloudIcon,
  deezer: DeezerIcon,
};

const PLATFORM_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  'apple-music': '#FA243C',
  'youtube-music': '#FF0000',
  'amazon-music': '#FF9900',
  tidal: '#000000',
  soundcloud: '#FF3300',
  deezer: '#FEAA2D',
  other: '#666666',
};

const PAYOUT_METHODS = [
  { value: 'bank', label: 'Bank Transfer', icon: Building },
  { value: 'paypal', label: 'PayPal', icon: CreditCard },
  { value: 'wise', label: 'Wise', icon: Globe },
  { value: 'payoneer', label: 'Payoneer', icon: Wallet },
  { value: 'check', label: 'Check', icon: Receipt },
];

export function EarningsReconciliation() {
  const [activeTab, setActiveTab] = useState('statements');
  const [dateRange, setDateRange] = useState('30d');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedStatement, setSelectedStatement] = useState<RoyaltyStatement | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<PayoutRecord | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('bank');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: statements = [], isLoading: statementsLoading } = useQuery<RoyaltyStatement[]>({
    queryKey: ['/api/distribution/earnings/statements', dateRange],
  });

  const { data: earnings = [], isLoading: earningsLoading } = useQuery<EarningsEntry[]>({
    queryKey: ['/api/distribution/earnings/entries', dateRange, selectedPlatform],
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery<PayoutRecord[]>({
    queryKey: ['/api/distribution/earnings/payouts'],
  });

  const { data: summary } = useQuery<ReconciliationSummary>({
    queryKey: ['/api/distribution/earnings/summary', dateRange],
  });

  const { data: territoryData = [] } = useQuery<TerritoryBreakdown[]>({
    queryKey: ['/api/distribution/earnings/territories', dateRange],
  });

  const importStatementMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('statement', file);
      const response = await apiRequest('POST', '/api/distribution/earnings/import', formData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/earnings/statements'] });
      setIsImportOpen(false);
      toast({
        title: 'Statement Imported',
        description: 'Your royalty statement is being processed',
      });
    },
    onError: () => {
      toast({
        title: 'Import Failed',
        description: 'Unable to import royalty statement',
        variant: 'destructive',
      });
    },
  });

  const requestPayoutMutation = useMutation({
    mutationFn: async (data: { amount: number; method: string }) => {
      const response = await apiRequest('POST', '/api/distribution/earnings/payout', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/earnings/payouts'] });
      setIsPayoutOpen(false);
      setPayoutAmount('');
      toast({
        title: 'Payout Requested',
        description: 'Your payout request has been submitted',
      });
    },
    onError: () => {
      toast({
        title: 'Request Failed',
        description: 'Unable to request payout',
        variant: 'destructive',
      });
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async (statementId: string) => {
      const response = await apiRequest(
        'POST',
        `/api/distribution/earnings/statements/${statementId}/reconcile`
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/earnings/statements'] });
      toast({
        title: 'Reconciliation Complete',
        description: 'Statement has been reconciled with your earnings',
      });
    },
  });

  const dormantSummary: ReconciliationSummary = summary || {
    totalEarnings: 0,
    totalStreams: 0,
    totalDownloads: 0,
    pendingPayouts: 0,
    completedPayouts: 0,
    discrepancyAmount: 0,
    discrepancyCount: 0,
    averagePayRate: 0,
  };

  const earningsTrendData = dormantSummary.totalEarnings > 0 ? [
    { label: 'Current', value: dormantSummary.totalEarnings },
  ] : [];

  const platformDonutData = earnings.length > 0 ? 
    Object.entries(
      earnings.reduce((acc: Record<string, number>, e) => {
        acc[e.platform] = (acc[e.platform] || 0) + e.earnings;
        return acc;
      }, {})
    ).map(([platform, value]) => ({
      label: platform,
      value,
      color: PLATFORM_COLORS[platform] || PLATFORM_COLORS.other,
    })) : [];

  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; icon: React.ElementType }> = {
      pending: { className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Clock },
      processing: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: RefreshCw },
      imported: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: FileCheck },
      reconciled: { className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', icon: CheckCircle },
      completed: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      error: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertCircle },
      failed: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertCircle },
      returned: { className: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertTriangle },
    };
    const config = styles[status] || styles.pending;
    const Icon = config.icon;
    return (
      <Badge className={`gap-1 ${config.className}`}>
        <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {status}
      </Badge>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const Icon = PLATFORM_ICONS[platform];
    return Icon ? <Icon className="h-4 w-4" /> : null;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      importStatementMutation.mutate(file);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Transaction ID copied to clipboard',
    });
  };

  const filteredEarnings = earnings.filter((entry) => {
    const matchesSearch =
      entry.releaseTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.trackTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = selectedPlatform === 'all' || entry.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  const availableBalance = dormantSummary.totalEarnings - dormantSummary.pendingPayouts;
  const minimumPayout = 25;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Earnings Reconciliation
            </CardTitle>
            <CardDescription>
              Import royalty statements, track earnings, and manage payouts
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
                <SelectItem value="1y">Last year</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Import Statement
            </Button>
            <Button onClick={() => setIsPayoutOpen(true)} disabled={availableBalance < minimumPayout}>
              <Wallet className="h-4 w-4 mr-2" />
              Request Payout
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-2xl font-bold">{formatCurrency(dormantSummary.totalEarnings)}</p>
              </div>
              <div className="flex items-center gap-1 text-sm text-green-500">
                <ArrowUpRight className="h-4 w-4" />
                12.4%
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Streams</p>
              <p className="text-2xl font-bold">{formatNumber(dormantSummary.totalStreams)}</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Avg Pay Rate</p>
              <p className="text-2xl font-bold">${dormantSummary.averagePayRate.toFixed(5)}</p>
              <p className="text-xs text-muted-foreground">per stream</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-green-500">{formatCurrency(availableBalance)}</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Pending Payouts</p>
              <p className="text-2xl font-bold text-yellow-500">
                {formatCurrency(dormantSummary.pendingPayouts)}
              </p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Discrepancies</p>
              <p className="text-2xl font-bold text-orange-500">{dormantSummary.discrepancyCount}</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(dormantSummary.discrepancyAmount)} unmatched
              </p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ChartCard title="Earnings Trend" subtitle="Last 4 months">
            <SimpleAreaChart data={earningsTrendData} color="emerald" height={200} />
          </ChartCard>
          <ChartCard title="Platform Breakdown" subtitle="Revenue distribution">
            <div className="flex items-center gap-6">
              <DonutChart
                data={platformDonutData}
                size={140}
                thickness={20}
                centerValue={`${((platformDonutData[0]?.value / dormantSummary.totalEarnings) * 100).toFixed(0)}%`}
                centerLabel="Spotify"
              />
              <div className="flex-1 space-y-2">
                {platformDonutData.slice(0, 4).map((p) => (
                  <div key={p.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="text-sm">{p.label}</span>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(p.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="statements" className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Statements
            </TabsTrigger>
            <TabsTrigger value="earnings" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <Banknote className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="territories" className="gap-2">
              <Globe className="h-4 w-4" />
              Territories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="statements" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search statements..."
                  className="pl-10"
                />
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="spotify">Spotify</SelectItem>
                  <SelectItem value="apple-music">Apple Music</SelectItem>
                  <SelectItem value="youtube-music">YouTube Music</SelectItem>
                  <SelectItem value="amazon-music">Amazon Music</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Streams</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((statement) => (
                  <TableRow key={statement.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(statement.platform)}
                        <span className="capitalize">{statement.platform.replace('-', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>{statement.period}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{statement.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(statement.fileSize)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {statement.totalAmount > 0 ? formatCurrency(statement.totalAmount) : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      {statement.totalStreams > 0 ? formatNumber(statement.totalStreams) : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(statement.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {statement.importedAt
                        ? new Date(statement.importedAt).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {statement.status === 'imported' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reconcileMutation.mutate(statement.id)}
                            disabled={reconcileMutation.isPending}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Reconcile
                          </Button>
                        )}
                        {statement.status === 'error' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedStatement(statement);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <AlertCircle className="h-4 w-4 mr-1" />
                            View Errors
                          </Button>
                        )}
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {statements.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No statements imported yet</p>
                <p className="text-sm mt-1">Import your first royalty statement to get started</p>
                <Button className="mt-4" onClick={() => setIsImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Import Statement
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="earnings" className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search releases or tracks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Platforms</SelectItem>
                  <SelectItem value="spotify">Spotify</SelectItem>
                  <SelectItem value="apple-music">Apple Music</SelectItem>
                  <SelectItem value="youtube-music">YouTube Music</SelectItem>
                  <SelectItem value="amazon-music">Amazon Music</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Release / Track</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Territory</TableHead>
                  <TableHead className="text-right">Streams</TableHead>
                  <TableHead className="text-right">Pay Rate</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEarnings.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{entry.trackTitle}</p>
                        <p className="text-sm text-muted-foreground">{entry.releaseTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(entry.platform)}
                        <span className="capitalize">{entry.platform.replace('-', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>{entry.territory}</TableCell>
                    <TableCell className="text-right">
                      {formatNumber(entry.streams)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      ${entry.payRate.toFixed(5)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(entry.earnings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-4">
            {payouts.map((payout) => (
              <Card key={payout.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        {(() => {
                          const method = PAYOUT_METHODS.find((m) => m.value === payout.method);
                          const Icon = method?.icon || Wallet;
                          return <Icon className="h-6 w-6 text-primary" />;
                        })()}
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{formatCurrency(payout.amount)}</p>
                        <p className="text-sm text-muted-foreground">
                          {PAYOUT_METHODS.find((m) => m.value === payout.method)?.label} • {payout.period}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {payout.platforms.map((platform) => (
                        <Badge key={platform} variant="outline" className="gap-1">
                          {getPlatformIcon(platform)}
                          <span className="capitalize">{platform.replace('-', ' ')}</span>
                        </Badge>
                      ))}
                    </div>
                    {payout.bankDetails && (
                      <p className="text-sm text-muted-foreground">
                        {payout.bankDetails.bankName} ••••{payout.bankDetails.accountLast4}
                      </p>
                    )}
                    {payout.transactionId && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">
                          {payout.transactionId}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(payout.transactionId!)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="text-right space-y-2">
                    {getStatusBadge(payout.status)}
                    <div className="text-sm text-muted-foreground">
                      {payout.status === 'completed' && payout.processedDate ? (
                        <p>Completed {new Date(payout.processedDate).toLocaleDateString()}</p>
                      ) : (
                        <p>Scheduled {new Date(payout.scheduledDate).toLocaleDateString()}</p>
                      )}
                    </div>
                    {payout.fee !== undefined && (
                      <p className="text-xs text-muted-foreground">Fee: {formatCurrency(payout.fee)}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {payouts.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Banknote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No payouts yet</p>
                <p className="text-sm mt-1">
                  Request your first payout when you reach the minimum balance of {formatCurrency(minimumPayout)}
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="territories" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Territories by Earnings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {territoryData.map((territory, index) => (
                    <div key={territory.territory} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 bg-muted rounded-full flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="font-medium">{territory.territory}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(territory.earnings)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Progress value={territory.percentage} className="h-2 flex-1" />
                        <span className="text-sm text-muted-foreground w-12 text-right">
                          {territory.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Territory Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <DonutChart
                    data={territoryData.map((t) => ({
                      label: t.territory,
                      value: t.earnings,
                      color: `hsl(${territoryData.indexOf(t) * 60}, 70%, 50%)`,
                    }))}
                    size={200}
                    thickness={30}
                    centerValue={territoryData.length.toString()}
                    centerLabel="Territories"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {territoryData.slice(0, 4).map((t, i) => (
                      <div key={t.territory} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: `hsl(${i * 60}, 70%, 50%)` }}
                        />
                        <span className="text-sm truncate">{t.territory}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Territory</TableHead>
                  <TableHead className="text-right">Streams</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {territoryData.map((territory) => (
                  <TableRow key={territory.territory}>
                    <TableCell className="font-medium">{territory.territory}</TableCell>
                    <TableCell className="text-right">{formatNumber(territory.streams)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(territory.earnings)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{territory.percentage.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>

        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Import Royalty Statement</DialogTitle>
              <DialogDescription>
                Upload CSV or Excel files from your DSP royalty reports
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium mb-2">Click to upload or drag and drop</p>
                <p className="text-sm text-muted-foreground">
                  CSV, XLSX, XLS files (max 50MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                />
              </div>

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Supported formats: Spotify, Apple Music, YouTube Music, Amazon Music, 
                  Tidal, and most other DSP royalty exports.
                </AlertDescription>
              </Alert>

              {importStatementMutation.isPending && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Importing...</span>
                  </div>
                  <Progress value={60} className="h-2" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsImportOpen(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Request Payout</DialogTitle>
              <DialogDescription>
                Available balance: {formatCurrency(availableBalance)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="pl-7"
                    min={minimumPayout}
                    max={availableBalance}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum: {formatCurrency(minimumPayout)} • Maximum: {formatCurrency(availableBalance)}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payout Method</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYOUT_METHODS.map((method) => {
                    const Icon = method.icon;
                    return (
                      <div
                        key={method.value}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          payoutMethod === method.value
                            ? 'border-primary bg-primary/10'
                            : 'border-muted hover:border-primary/50'
                        }`}
                        onClick={() => setPayoutMethod(method.value)}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-sm font-medium">{method.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Payouts are typically processed within 3-5 business days.
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPayoutOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  requestPayoutMutation.mutate({
                    amount: parseFloat(payoutAmount),
                    method: payoutMethod,
                  })
                }
                disabled={
                  !payoutAmount ||
                  parseFloat(payoutAmount) < minimumPayout ||
                  parseFloat(payoutAmount) > availableBalance ||
                  requestPayoutMutation.isPending
                }
              >
                {requestPayoutMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4 mr-2" />
                    Request Payout
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Statement Import Errors</DialogTitle>
              <DialogDescription>
                {selectedStatement?.fileName}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {selectedStatement?.errors?.map((error, index) => (
                <Alert key={index} variant="destructive" className="mb-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ))}
              <p className="text-sm text-muted-foreground mt-4">
                Please fix these issues and re-import the statement, or contact support if you need help.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                Close
              </Button>
              <Button onClick={() => setIsImportOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Re-import
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
