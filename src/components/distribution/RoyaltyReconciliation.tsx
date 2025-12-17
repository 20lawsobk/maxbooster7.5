import { useState } from 'react';
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
  PieChart,
  Calendar,
  Download,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Users,
  Globe,
  CreditCard,
  Banknote,
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Receipt,
  Split,
  AlertCircle,
} from 'lucide-react';
import {
  SpotifyIcon,
  AppleMusicIcon,
  YouTubeIcon,
  AmazonIcon,
  TidalIcon,
  SoundCloudIcon,
} from '@/components/ui/brand-icons';

interface PlatformEarnings {
  platform: string;
  earnings: number;
  streams: number;
  previousEarnings: number;
  previousStreams: number;
  growth: number;
  payRate: number;
  currency: string;
}

interface StreamDiscrepancy {
  id: string;
  platform: string;
  releaseTitle: string;
  trackTitle: string;
  reportedStreams: number;
  expectedStreams: number;
  difference: number;
  differencePercent: number;
  potentialLoss: number;
  status: 'pending' | 'investigating' | 'resolved' | 'disputed';
  reportedAt: string;
  resolvedAt?: string;
}

interface SplitPayment {
  id: string;
  collaboratorName: string;
  collaboratorEmail: string;
  role: string;
  percentage: number;
  totalEarnings: number;
  paidAmount: number;
  pendingAmount: number;
  lastPayoutDate?: string;
  status: 'current' | 'pending' | 'overdue';
}

interface TaxDocument {
  id: string;
  type: '1099' | 'W-9' | 'W-8BEN' | 'invoice' | 'statement';
  year: number;
  period?: string;
  status: 'available' | 'generating' | 'pending';
  generatedAt?: string;
  downloadUrl?: string;
}

interface PayoutSchedule {
  id: string;
  amount: number;
  currency: string;
  scheduledDate: string;
  method: 'bank' | 'paypal' | 'wise' | 'payoneer';
  status: 'scheduled' | 'processing' | 'completed' | 'failed';
  platforms: string[];
  period: string;
}

interface CurrencyRate {
  from: string;
  to: string;
  rate: number;
  updatedAt: string;
}

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  spotify: SpotifyIcon,
  'apple-music': AppleMusicIcon,
  'youtube-music': YouTubeIcon,
  'amazon-music': AmazonIcon,
  tidal: TidalIcon,
  soundcloud: SoundCloudIcon,
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

export function RoyaltyReconciliation() {
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30d');
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [isTaxDocOpen, setIsTaxDocOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: platformEarnings = [], isLoading: earningsLoading } = useQuery<PlatformEarnings[]>({
    queryKey: ['/api/distribution/royalties/platforms', dateRange],
  });

  const { data: discrepancies = [], isLoading: discrepanciesLoading } = useQuery<StreamDiscrepancy[]>({
    queryKey: ['/api/distribution/royalties/discrepancies'],
  });

  const { data: splitPayments = [], isLoading: splitsLoading } = useQuery<SplitPayment[]>({
    queryKey: ['/api/distribution/royalties/splits'],
  });

  const { data: taxDocuments = [], isLoading: taxDocsLoading } = useQuery<TaxDocument[]>({
    queryKey: ['/api/distribution/royalties/tax-documents'],
  });

  const { data: payoutSchedule = [], isLoading: payoutsLoading } = useQuery<PayoutSchedule[]>({
    queryKey: ['/api/distribution/royalties/payouts'],
  });

  const { data: currencyRates = [], isLoading: ratesLoading } = useQuery<CurrencyRate[]>({
    queryKey: ['/api/distribution/royalties/currency-rates'],
  });

  const requestPayoutMutation = useMutation({
    mutationFn: async (data: { amount: number; method: string }) => {
      const response = await apiRequest('POST', '/api/distribution/royalties/payout', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/royalties/payouts'] });
      setIsPayoutOpen(false);
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

  const generateTaxDocMutation = useMutation({
    mutationFn: async (data: { type: string; year: number }) => {
      const response = await apiRequest('POST', '/api/distribution/royalties/tax-document', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/royalties/tax-documents'] });
      setIsTaxDocOpen(false);
      toast({
        title: 'Document Requested',
        description: 'Your tax document is being generated',
      });
    },
  });

  const reportDiscrepancyMutation = useMutation({
    mutationFn: async (discrepancyId: string) => {
      const response = await apiRequest(
        'POST',
        `/api/distribution/royalties/discrepancies/${discrepancyId}/dispute`
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/distribution/royalties/discrepancies'] });
      toast({
        title: 'Dispute Submitted',
        description: 'The discrepancy has been reported for investigation',
      });
    },
  });

  const mockPlatformEarnings: PlatformEarnings[] = platformEarnings.length ? platformEarnings : [
    {
      platform: 'spotify',
      earnings: 4532.45,
      streams: 1245678,
      previousEarnings: 4012.32,
      previousStreams: 1102345,
      growth: 12.96,
      payRate: 0.00364,
      currency: 'USD',
    },
    {
      platform: 'apple-music',
      earnings: 2876.12,
      streams: 456789,
      previousEarnings: 2654.87,
      previousStreams: 423456,
      growth: 8.34,
      payRate: 0.0063,
      currency: 'USD',
    },
    {
      platform: 'youtube-music',
      earnings: 1234.56,
      streams: 2345678,
      previousEarnings: 1456.78,
      previousStreams: 2567890,
      growth: -15.25,
      payRate: 0.00053,
      currency: 'USD',
    },
    {
      platform: 'amazon-music',
      earnings: 876.34,
      streams: 234567,
      previousEarnings: 765.43,
      previousStreams: 198765,
      growth: 14.49,
      payRate: 0.00374,
      currency: 'USD',
    },
    {
      platform: 'tidal',
      earnings: 543.21,
      streams: 45678,
      previousEarnings: 498.76,
      previousStreams: 42345,
      growth: 8.91,
      payRate: 0.0119,
      currency: 'USD',
    },
    {
      platform: 'soundcloud',
      earnings: 123.45,
      streams: 34567,
      previousEarnings: 145.67,
      previousStreams: 39876,
      growth: -15.25,
      payRate: 0.00357,
      currency: 'USD',
    },
  ];

  const mockDiscrepancies: StreamDiscrepancy[] = discrepancies.length ? discrepancies : [
    {
      id: '1',
      platform: 'spotify',
      releaseTitle: 'Midnight Dreams',
      trackTitle: 'Starlight',
      reportedStreams: 45678,
      expectedStreams: 52345,
      difference: -6667,
      differencePercent: -12.74,
      potentialLoss: 24.27,
      status: 'investigating',
      reportedAt: '2024-01-15T10:00:00Z',
    },
    {
      id: '2',
      platform: 'apple-music',
      releaseTitle: 'Summer Vibes',
      trackTitle: 'Beach Party',
      reportedStreams: 12345,
      expectedStreams: 15678,
      difference: -3333,
      differencePercent: -21.26,
      potentialLoss: 21.0,
      status: 'pending',
      reportedAt: '2024-01-20T14:00:00Z',
    },
    {
      id: '3',
      platform: 'youtube-music',
      releaseTitle: 'Urban Stories',
      trackTitle: 'City Lights',
      reportedStreams: 234567,
      expectedStreams: 234567,
      difference: 0,
      differencePercent: 0,
      potentialLoss: 0,
      status: 'resolved',
      reportedAt: '2024-01-10T09:00:00Z',
      resolvedAt: '2024-01-18T16:00:00Z',
    },
  ];

  const mockSplitPayments: SplitPayment[] = splitPayments.length ? splitPayments : [
    {
      id: '1',
      collaboratorName: 'Jane Smith',
      collaboratorEmail: 'jane@example.com',
      role: 'Producer',
      percentage: 25,
      totalEarnings: 2546.53,
      paidAmount: 2000.0,
      pendingAmount: 546.53,
      lastPayoutDate: '2024-01-01T00:00:00Z',
      status: 'pending',
    },
    {
      id: '2',
      collaboratorName: 'Mike Johnson',
      collaboratorEmail: 'mike@example.com',
      role: 'Songwriter',
      percentage: 15,
      totalEarnings: 1527.92,
      paidAmount: 1527.92,
      pendingAmount: 0,
      lastPayoutDate: '2024-01-15T00:00:00Z',
      status: 'current',
    },
    {
      id: '3',
      collaboratorName: 'Sarah Williams',
      collaboratorEmail: 'sarah@example.com',
      role: 'Featured Artist',
      percentage: 10,
      totalEarnings: 1018.61,
      paidAmount: 500.0,
      pendingAmount: 518.61,
      lastPayoutDate: '2023-12-01T00:00:00Z',
      status: 'overdue',
    },
  ];

  const mockTaxDocuments: TaxDocument[] = taxDocuments.length ? taxDocuments : [
    {
      id: '1',
      type: '1099',
      year: 2023,
      status: 'available',
      generatedAt: '2024-01-31T00:00:00Z',
      downloadUrl: '/api/documents/1099-2023.pdf',
    },
    {
      id: '2',
      type: 'statement',
      year: 2024,
      period: 'January',
      status: 'available',
      generatedAt: '2024-02-01T00:00:00Z',
      downloadUrl: '/api/documents/statement-2024-01.pdf',
    },
    {
      id: '3',
      type: 'W-9',
      year: 2024,
      status: 'pending',
    },
  ];

  const mockPayoutSchedule: PayoutSchedule[] = payoutSchedule.length ? payoutSchedule : [
    {
      id: '1',
      amount: 5432.10,
      currency: 'USD',
      scheduledDate: '2024-02-15T00:00:00Z',
      method: 'bank',
      status: 'scheduled',
      platforms: ['spotify', 'apple-music', 'amazon-music'],
      period: 'January 2024',
    },
    {
      id: '2',
      amount: 3210.45,
      currency: 'USD',
      scheduledDate: '2024-01-15T00:00:00Z',
      method: 'bank',
      status: 'completed',
      platforms: ['spotify', 'apple-music', 'youtube-music'],
      period: 'December 2023',
    },
  ];

  const mockCurrencyRates: CurrencyRate[] = currencyRates.length ? currencyRates : [
    { from: 'USD', to: 'EUR', rate: 0.92, updatedAt: new Date().toISOString() },
    { from: 'USD', to: 'GBP', rate: 0.79, updatedAt: new Date().toISOString() },
    { from: 'USD', to: 'CAD', rate: 1.35, updatedAt: new Date().toISOString() },
    { from: 'USD', to: 'AUD', rate: 1.53, updatedAt: new Date().toISOString() },
    { from: 'USD', to: 'JPY', rate: 148.5, updatedAt: new Date().toISOString() },
  ];

  const totalEarnings = mockPlatformEarnings.reduce((sum, p) => sum + p.earnings, 0);
  const totalStreams = mockPlatformEarnings.reduce((sum, p) => sum + p.streams, 0);
  const totalPreviousEarnings = mockPlatformEarnings.reduce((sum, p) => sum + p.previousEarnings, 0);
  const earningsGrowth = ((totalEarnings - totalPreviousEarnings) / totalPreviousEarnings) * 100;
  const pendingDiscrepancies = mockDiscrepancies.filter((d) => d.status !== 'resolved').length;
  const totalPendingSplits = mockSplitPayments.reduce((sum, s) => sum + s.pendingAmount, 0);
  const nextPayout = mockPayoutSchedule.find((p) => p.status === 'scheduled');

  const earningsTrendData = [
    { label: 'Oct', value: 7234 },
    { label: 'Nov', value: 8456 },
    { label: 'Dec', value: 9123 },
    { label: 'Jan', value: totalEarnings },
  ];

  const platformDonutData = mockPlatformEarnings.map((p) => ({
    label: p.platform,
    value: p.earnings,
    color: PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.other,
  }));

  const convertCurrency = (amount: number, to: string): number => {
    if (to === 'USD') return amount;
    const rate = mockCurrencyRates.find((r) => r.to === to)?.rate || 1;
    return amount * rate;
  };

  const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { className: string; icon: React.ElementType }> = {
      pending: { className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: Clock },
      investigating: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Search },
      resolved: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      disputed: { className: 'bg-orange-500/10 text-orange-500 border-orange-500/20', icon: AlertTriangle },
      current: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      overdue: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertCircle },
      scheduled: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: Calendar },
      processing: { className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', icon: RefreshCw },
      completed: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: CheckCircle },
      failed: { className: 'bg-red-500/10 text-red-500 border-red-500/20', icon: AlertCircle },
      available: { className: 'bg-green-500/10 text-green-500 border-green-500/20', icon: Download },
      generating: { className: 'bg-blue-500/10 text-blue-500 border-blue-500/20', icon: RefreshCw },
    };
    const config = styles[status] || styles.pending;
    const Icon = config.icon;
    return (
      <Badge className={`gap-1 ${config.className}`}>
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const getPlatformIcon = (platform: string) => {
    const Icon = PLATFORM_ICONS[platform];
    return Icon ? <Icon className="h-4 w-4" /> : null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Royalty Reconciliation
            </CardTitle>
            <CardDescription>
              Track earnings, verify streams, manage splits, and schedule payouts
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
            <Select value={selectedCurrency} onValueChange={setSelectedCurrency}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="CAD">CAD</SelectItem>
                <SelectItem value="AUD">AUD</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setIsPayoutOpen(true)}>
              <Wallet className="h-4 w-4 mr-2" />
              Request Payout
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(convertCurrency(totalEarnings, selectedCurrency), selectedCurrency)}
                </p>
              </div>
              <div
                className={`flex items-center gap-1 text-sm ${
                  earningsGrowth >= 0 ? 'text-green-500' : 'text-red-500'
                }`}
              >
                {earningsGrowth >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {Math.abs(earningsGrowth).toFixed(1)}%
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Streams</p>
              <p className="text-2xl font-bold">{totalStreams.toLocaleString()}</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Pending Payouts</p>
              <p className="text-2xl font-bold text-yellow-500">
                {formatCurrency(convertCurrency(totalPendingSplits, selectedCurrency), selectedCurrency)}
              </p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Discrepancies</p>
              <p className="text-2xl font-bold text-orange-500">{pendingDiscrepancies}</p>
            </div>
          </Card>
          <Card className="p-4">
            <div>
              <p className="text-sm text-muted-foreground">Next Payout</p>
              <p className="text-2xl font-bold">
                {nextPayout
                  ? formatCurrency(convertCurrency(nextPayout.amount, selectedCurrency), selectedCurrency)
                  : '-'}
              </p>
              {nextPayout && (
                <p className="text-xs text-muted-foreground">
                  {new Date(nextPayout.scheduledDate).toLocaleDateString()}
                </p>
              )}
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
                centerValue={`${((mockPlatformEarnings[0]?.earnings / totalEarnings) * 100).toFixed(0)}%`}
                centerLabel="Spotify"
              />
              <div className="flex-1 space-y-2">
                {mockPlatformEarnings.slice(0, 4).map((p) => (
                  <div key={p.platform} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: PLATFORM_COLORS[p.platform] }}
                      />
                      {getPlatformIcon(p.platform)}
                      <span className="text-sm capitalize">{p.platform.replace('-', ' ')}</span>
                    </div>
                    <span className="text-sm font-medium">
                      {formatCurrency(p.earnings)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Platform Earnings
            </TabsTrigger>
            <TabsTrigger value="discrepancies" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Discrepancies
            </TabsTrigger>
            <TabsTrigger value="splits" className="gap-2">
              <Split className="h-4 w-4" />
              Splits
            </TabsTrigger>
            <TabsTrigger value="payouts" className="gap-2">
              <Banknote className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="taxes" className="gap-2">
              <FileText className="h-4 w-4" />
              Tax Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Streams</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead className="text-right">Pay Rate</TableHead>
                  <TableHead className="text-right">Growth</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockPlatformEarnings.map((platform) => (
                  <TableRow key={platform.platform}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: PLATFORM_COLORS[platform.platform] }}
                        />
                        {getPlatformIcon(platform.platform)}
                        <span className="font-medium capitalize">
                          {platform.platform.replace('-', ' ')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {platform.streams.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(convertCurrency(platform.earnings, selectedCurrency), selectedCurrency)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ${platform.payRate.toFixed(5)}/stream
                    </TableCell>
                    <TableCell className="text-right">
                      <div
                        className={`flex items-center justify-end gap-1 ${
                          platform.growth >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {platform.growth >= 0 ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <TrendingDown className="h-4 w-4" />
                        )}
                        {Math.abs(platform.growth).toFixed(1)}%
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="discrepancies" className="space-y-4">
            {pendingDiscrepancies > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {pendingDiscrepancies} discrepanc{pendingDiscrepancies > 1 ? 'ies' : 'y'} detected.
                  Potential loss: {formatCurrency(
                    mockDiscrepancies
                      .filter((d) => d.status !== 'resolved')
                      .reduce((sum, d) => sum + d.potentialLoss, 0)
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Track</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-right">Reported</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="text-right">Est. Loss</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockDiscrepancies.map((discrepancy) => (
                  <TableRow key={discrepancy.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{discrepancy.trackTitle}</p>
                        <p className="text-sm text-muted-foreground">{discrepancy.releaseTitle}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPlatformIcon(discrepancy.platform)}
                        <span className="capitalize">{discrepancy.platform.replace('-', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {discrepancy.reportedStreams.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {discrepancy.expectedStreams.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          discrepancy.difference < 0 ? 'text-red-500' : 'text-green-500'
                        }
                      >
                        {discrepancy.difference.toLocaleString()} ({discrepancy.differencePercent.toFixed(1)}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(discrepancy.potentialLoss)}
                    </TableCell>
                    <TableCell>{getStatusBadge(discrepancy.status)}</TableCell>
                    <TableCell className="text-right">
                      {discrepancy.status === 'pending' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reportDiscrepancyMutation.mutate(discrepancy.id)}
                        >
                          Dispute
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="splits" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Collaborator Payments</h3>
                <p className="text-sm text-muted-foreground">
                  Total pending: {formatCurrency(totalPendingSplits)}
                </p>
              </div>
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Manage Collaborators
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collaborator</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Split %</TableHead>
                  <TableHead className="text-right">Total Earned</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockSplitPayments.map((split) => (
                  <TableRow key={split.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{split.collaboratorName}</p>
                        <p className="text-sm text-muted-foreground">{split.collaboratorEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{split.role}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{split.percentage}%</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(split.totalEarnings)}
                    </TableCell>
                    <TableCell className="text-right text-green-500">
                      {formatCurrency(split.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right text-yellow-500">
                      {formatCurrency(split.pendingAmount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(split.status)}</TableCell>
                    <TableCell className="text-right">
                      {split.pendingAmount > 0 && (
                        <Button variant="outline" size="sm">
                          <CreditCard className="h-4 w-4 mr-2" />
                          Pay Now
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Payout Schedule</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your earnings withdrawals
                </p>
              </div>
              <Button onClick={() => setIsPayoutOpen(true)}>
                <Wallet className="h-4 w-4 mr-2" />
                Request Payout
              </Button>
            </div>

            {mockPayoutSchedule.map((payout) => (
              <Card key={payout.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        payout.status === 'completed'
                          ? 'bg-green-500/10 text-green-500'
                          : payout.status === 'scheduled'
                            ? 'bg-blue-500/10 text-blue-500'
                            : 'bg-yellow-500/10 text-yellow-500'
                      }`}
                    >
                      {payout.status === 'completed' ? (
                        <CheckCircle className="h-6 w-6" />
                      ) : (
                        <Calendar className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-lg">
                        {formatCurrency(convertCurrency(payout.amount, selectedCurrency), selectedCurrency)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {payout.period} • {payout.method.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(payout.status)}
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(payout.scheduledDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {payout.platforms.map((p) => (
                    <Badge key={p} variant="outline" className="gap-1">
                      {getPlatformIcon(p)}
                      {p}
                    </Badge>
                  ))}
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="taxes" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Tax Documents</h3>
                <p className="text-sm text-muted-foreground">
                  Download tax forms and earnings statements
                </p>
              </div>
              <Button onClick={() => setIsTaxDocOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Generate Document
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockTaxDocuments.map((doc) => (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">{doc.type.toUpperCase()}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.year}
                          {doc.period ? ` - ${doc.period}` : ''}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                  {doc.status === 'available' && (
                    <Button variant="outline" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  )}
                  {doc.status === 'generating' && (
                    <Button variant="outline" className="w-full" disabled>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </Button>
                  )}
                  {doc.status === 'pending' && (
                    <Button variant="outline" className="w-full">
                      Complete Form
                    </Button>
                  )}
                </Card>
              ))}
            </div>

            <Card className="p-4 bg-muted/50">
              <div className="flex items-center gap-3">
                <Calculator className="h-8 w-8 text-primary" />
                <div>
                  <h4 className="font-medium">Currency Conversion</h4>
                  <p className="text-sm text-muted-foreground">
                    Current rates as of {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
                {mockCurrencyRates.map((rate) => (
                  <div key={rate.to} className="text-center p-2 bg-background rounded-lg">
                    <p className="text-lg font-bold">{rate.rate.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">
                      USD → {rate.to}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isPayoutOpen} onOpenChange={setIsPayoutOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request Payout</DialogTitle>
              <DialogDescription>
                Withdraw your earnings to your preferred payment method
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Available Balance</Label>
                <div className="text-3xl font-bold text-primary">
                  {formatCurrency(totalEarnings)}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Withdrawal Amount</Label>
                <Input type="number" placeholder="Enter amount" />
                <p className="text-xs text-muted-foreground">
                  Minimum withdrawal: $50.00
                </p>
              </div>

              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select defaultValue="bank">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Transfer (ACH)</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="wise">Wise</SelectItem>
                    <SelectItem value="payoneer">Payoneer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <Clock className="h-4 w-4" />
                <AlertDescription>
                  Payouts are typically processed within 3-5 business days
                </AlertDescription>
              </Alert>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPayoutOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  requestPayoutMutation.mutate({ amount: totalEarnings, method: 'bank' })
                }
                disabled={requestPayoutMutation.isPending}
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

        <Dialog open={isTaxDocOpen} onOpenChange={setIsTaxDocOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Tax Document</DialogTitle>
              <DialogDescription>
                Generate tax forms and earnings statements
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select defaultValue="statement">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1099">1099-MISC (US)</SelectItem>
                    <SelectItem value="statement">Earnings Statement</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Year</Label>
                <Select defaultValue="2024">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2023">2023</SelectItem>
                    <SelectItem value="2022">2022</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Period (Optional)</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Full Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Full Year</SelectItem>
                    <SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem>
                    <SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem>
                    <SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem>
                    <SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsTaxDocOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  generateTaxDocMutation.mutate({ type: 'statement', year: 2024 })
                }
                disabled={generateTaxDocMutation.isPending}
              >
                {generateTaxDocMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate Document
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
