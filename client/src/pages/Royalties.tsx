import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  Download,
  Calendar,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Music,
  Play,
  RefreshCw,
  Banknote,
  PieChart,
  Shield,
  Scale,
  FileText,
  Zap,
  Copyright,
  Calculator,
  Receipt,
  BarChart3,
  Plus,
  Wallet,
} from 'lucide-react';
import { useRequireSubscription } from '@/hooks/useRequireAuth';
import { useToast } from '@/hooks/use-toast';
import { useAnalyticsInvalidation } from '@/hooks/useAnalyticsInvalidation';
import { isUnauthorizedError } from '@/lib/authUtils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  SplitVisualizationPieChart,
  PayoutHistoryTimeline,
  TaxFormWizard,
  StatementDateRangePicker,
  DisputeTracker,
  useRoyaltyOutcome,
  type PayoutHistoryItem,
  type StatementPeriod,
  type Dispute,
  type TaxFormData,
} from '@/components/royalties';

interface Royalty {
  id: string;
  platform: string;
  amount: number;
  currency: string;
  period: string;
  streams: number;
  payoutStatus: string;
  payoutDate?: string;
  releaseTitle?: string;
  beatTitle?: string;
}

interface PlatformBreakdown {
  platform: string;
  icon?: string;
  amount: number;
  streams: number;
  percentage: number;
}

interface TopTrack {
  id?: string;
  title: string;
  streams: number;
  earnings: number;
  rpm: number;
}

interface RoyaltySplit {
  id: string;
  avatar?: string;
  name: string;
  role: string;
  email: string;
  percentage: number;
}

interface PaymentMethod {
  id: string;
  type: string;
  accountNumber: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface PayoutSettings {
  minimumPayoutAmount: number;
  payoutFrequency: string;
  taxFormCompleted: boolean;
  taxCountry: string | null;
  taxId: string | null;
}

interface PublishingWork {
  id: string;
  trackTitle: string;
  iswc?: string;
  isrc?: string;
  upc?: string;
  proName: string;
  proRegistrationId?: string;
  publisherName?: string;
  writerSplit: number;
  publishingSplit: number;
  copyrightYear: number;
  coWriters?: string;
  status: 'pending' | 'registered' | 'rejected';
}

interface PublishingStats {
  totalWorks: number;
  pendingCount: number;
  proIncome: number;
  avgPublishingSplit: number;
}

function ComingSoonRoyalties() {
  return (
    <AppLayout>
      <div className="min-h-[80vh] flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full bg-gradient-to-br from-gray-900 to-gray-800 border-gray-700">
          <CardContent className="p-12 text-center">
            <div className="mb-8">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center">
                <DollarSign className="w-12 h-12 text-white" />
              </div>
              <Badge variant="outline" className="mb-4 text-green-400 border-green-400">
                <Clock className="w-3 h-3 mr-1" />
                Extended Testing
              </Badge>
              <h1 className="text-4xl font-bold text-white mb-4">Royalties</h1>
              <p className="text-xl text-gray-400 mb-2">Coming Soon</p>
              <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-green-400">
                <Calendar className="w-6 h-6" />
                March 1st, 2026
              </div>
            </div>
            <p className="text-gray-400 mb-8 max-w-md mx-auto">
              We're conducting extended testing on our royalty tracking and payout 
              systems to ensure accurate earnings reporting and timely payments.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Secure Payouts</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <TrendingUp className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Real-time Tracking</p>
              </div>
              <div className="p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                <PieChart className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Detailed Analytics</p>
              </div>
            </div>
            <p className="text-sm text-gray-500">Thank you for your patience while we perfect this feature.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

export default function Royalties() {
  const { user, isLoading: authLoading } = useRequireSubscription();
  const { toast } = useToast();
  const { invalidateOnRevenueChange } = useAnalyticsInvalidation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const setupStatus = params.get('setup');
    if (setupStatus === 'complete') {
      toast({
        title: 'Bank Account Connected!',
        description: 'Your bank account has been successfully connected for payouts.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (setupStatus === 'refresh') {
      toast({
        title: 'Connection Incomplete',
        description: 'Your bank account setup was not completed. Please try again.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [toast]);

  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [isAddPaymentDialogOpen, setIsAddPaymentDialogOpen] = useState(false);
  const [isTaxInfoDialogOpen, setIsTaxInfoDialogOpen] = useState(false);
  const [taxCountry, setTaxCountry] = useState('');
  const [taxId, setTaxId] = useState('');
  const [isEditSplitDialogOpen, setIsEditSplitDialogOpen] = useState(false);
  const [editingSplit, setEditingSplit] = useState<RoyaltySplit | null>(null);
  const [isAddCollaboratorDialogOpen, setIsAddCollaboratorDialogOpen] = useState(false);
  const [newCollaboratorName, setNewCollaboratorName] = useState('');
  const [newCollaboratorEmail, setNewCollaboratorEmail] = useState('');
  const [newCollaboratorRole, setNewCollaboratorRole] = useState('');
  const [newCollaboratorPercentage, setNewCollaboratorPercentage] = useState('');

  // Fetch royalties data
  const { data: royaltiesResponse, isLoading, isError } = useQuery<{ data: Royalty[]; pagination: any }>({
    queryKey: ['/api/royalties', { period: selectedPeriod, platform: selectedPlatform }],
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const royalties = royaltiesResponse?.data ?? [];

  // Fetch additional data
  const { data: platformBreakdown = [], isLoading: platformLoading } = useQuery<
    PlatformBreakdown[]
  >({
    queryKey: ['/api/royalties/platform-breakdown', { period: selectedPeriod }],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: topTracks = [], isLoading: tracksLoading } = useQuery<TopTrack[]>({
    queryKey: ['/api/royalties/top-tracks', { period: selectedPeriod }],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: paymentMethods = [], isLoading: paymentsLoading } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/royalties/payment-methods'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: payoutSettings, isLoading: payoutSettingsLoading } = useQuery<PayoutSettings>({
    queryKey: ['/api/royalties/payout-settings'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: splits = [], isLoading: splitsLoading } = useQuery<RoyaltySplit[]>({
    queryKey: ['/api/royalties/splits'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const { data: payoutHistoryData, isLoading: payoutHistoryLoading } = useQuery<{ payouts: PayoutHistoryItem[] }>({
    queryKey: ['/api/payouts/history'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const payoutHistory = payoutHistoryData?.payouts ?? [];

  const { data: statementsData, isLoading: statementsLoading } = useQuery<{ statements: StatementPeriod[] }>({
    queryKey: ['/api/payouts/statements'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const statements = statementsData?.statements ?? [];

  const { data: disputesData, isLoading: disputesLoading } = useQuery<{ disputes: Dispute[] }>({
    queryKey: ['/api/payouts/disputes'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const disputes = disputesData?.disputes ?? [];

  const { data: taxFormsData, isLoading: taxFormsLoading } = useQuery<{ forms: any[] }>({
    queryKey: ['/api/payouts/tax-forms'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const taxForms = taxFormsData?.forms ?? [];

  const [selectedStatement, setSelectedStatement] = useState<StatementPeriod | null>(null);
  const { showOutcome } = useRoyaltyOutcome();
  const [isRegisterWorkDialogOpen, setIsRegisterWorkDialogOpen] = useState(false);

  // Publishing Queries
  const { data: publishingWorks = [], isLoading: publishingLoading } = useQuery<PublishingWork[]>({
    queryKey: ['/api/publishing'],
    enabled: !!user,
  });

  const { data: publishingStats } = useQuery<PublishingStats>({
    queryKey: ['/api/publishing/stats'],
    enabled: !!user,
  });

  const registerWorkMutation = useMutation({
    mutationFn: async (data: Partial<PublishingWork>) => {
      const response = await apiRequest('POST', '/api/publishing', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Work Registered', description: 'Your work has been submitted for registration' });
      setIsRegisterWorkDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/publishing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/publishing/stats'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Registration Failed',
        description: error.message || 'Failed to register work',
        variant: 'destructive',
      });
    },
  });

  // Mutations
  const exportRoyaltiesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/royalties/export', {
        period: selectedPeriod,
        platform: selectedPlatform,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.open(data.url, '_blank');
      }
      toast({ title: 'Report Exported', description: 'Your royalty report has been generated' });
    },
  });

  const requestPayoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/royalties/request-payout', {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payout Requested', description: 'Your payout request has been submitted' });
      queryClient.invalidateQueries({ queryKey: ['/api/royalties'] });
      invalidateOnRevenueChange();
    },
  });

  const addPaymentMethodMutation = useMutation({
    mutationFn: async (data: { type: string; accountNumber: string }) => {
      const response = await apiRequest('POST', '/api/royalties/payment-methods', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payment Method Added', description: 'New payment method has been added' });
      setIsAddPaymentDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/payment-methods'] });
    },
  });

  const updatePayoutSettingsMutation = useMutation({
    mutationFn: async (data: { minimumPayoutAmount?: number; payoutFrequency?: string }) => {
      const response = await apiRequest('PUT', '/api/royalties/payout-settings', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Settings Updated', description: 'Payout settings have been saved' });
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/payout-settings'] });
    },
  });

  const updateTaxInfoMutation = useMutation({
    mutationFn: async (data: { taxCountry: string; taxId: string }) => {
      const response = await apiRequest('PUT', '/api/royalties/tax-info', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Tax Info Updated', description: 'Tax information has been saved' });
      setIsTaxInfoDialogOpen(false);
      setTaxCountry('');
      setTaxId('');
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/payout-settings'] });
    },
  });

  const connectStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/royalties/connect-stripe', {});
      return response.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url; // Redirect to Stripe onboarding
      } else {
        toast({
          title: 'Bank Account Connected',
          description: 'Your bank account is already connected',
        });
      }
    },
    onError: (error: unknown) => {
      toast({
        title: 'Connection Failed',
        description: error.message || 'Failed to connect bank account',
        variant: 'destructive',
      });
    },
  });

  const removeSplitMutation = useMutation({
    mutationFn: async (splitId: string) => {
      const response = await apiRequest('DELETE', `/api/royalties/splits/${splitId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Collaborator Removed', description: 'The collaborator has been removed' });
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/splits'] });
      invalidateOnRevenueChange();
    },
    onError: () => {
      toast({
        title: 'Remove Failed',
        description: 'Failed to remove collaborator',
        variant: 'destructive',
      });
    },
  });

  const addCollaboratorMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; role: string; percentage: number }) => {
      const response = await apiRequest('POST', '/api/royalties/splits', data);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Collaborator Added', description: 'The collaborator has been added successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/splits'] });
      invalidateOnRevenueChange();
      setIsAddCollaboratorDialogOpen(false);
      setNewCollaboratorName('');
      setNewCollaboratorEmail('');
      setNewCollaboratorRole('');
      setNewCollaboratorPercentage('');
    },
    onError: () => {
      toast({
        title: 'Add Failed',
        description: 'Failed to add collaborator',
        variant: 'destructive',
      });
    },
  });

  const updateSplitMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; email?: string; role?: string; percentage?: number }) => {
      const { id, ...updateData } = data;
      const response = await apiRequest('PUT', `/api/royalties/splits/${id}`, updateData);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Collaborator Updated', description: 'The collaborator has been updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/royalties/splits'] });
      invalidateOnRevenueChange();
      setIsEditSplitDialogOpen(false);
      setEditingSplit(null);
    },
    onError: () => {
      toast({
        title: 'Update Failed',
        description: 'Failed to update collaborator',
        variant: 'destructive',
      });
    },
  });

  const submitTaxFormMutation = useMutation({
    mutationFn: async (formData: TaxFormData) => {
      const response = await apiRequest('POST', '/api/payouts/tax-form/submit', formData);
      return response.json();
    },
    onSuccess: (data) => {
      showOutcome('tax_form_submitted', { formType: data.formType || 'tax form' });
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/tax-forms'] });
    },
    onError: () => {
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit tax form',
        variant: 'destructive',
      });
    },
  });

  const fileDisputeMutation = useMutation({
    mutationFn: async (data: { type: string; subject: string; description: string; amount?: number; period?: string }) => {
      const response = await apiRequest('POST', '/api/payouts/disputes', data);
      return response.json();
    },
    onSuccess: (data) => {
      showOutcome('dispute_filed', { disputeId: data.disputeId, reviewDays: 5 });
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/disputes'] });
    },
    onError: () => {
      toast({
        title: 'Filing Failed',
        description: 'Failed to file dispute',
        variant: 'destructive',
      });
    },
  });

  const submitEvidenceMutation = useMutation({
    mutationFn: async ({ disputeId, evidence }: { disputeId: string; evidence: { description: string; files?: File[] } }) => {
      const response = await apiRequest('POST', `/api/payouts/disputes/${disputeId}/evidence`, evidence);
      return response.json();
    },
    onSuccess: () => {
      showOutcome('dispute_evidence_submitted', {});
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/disputes'] });
    },
    onError: () => {
      toast({
        title: 'Submission Failed',
        description: 'Failed to submit evidence',
        variant: 'destructive',
      });
    },
  });

  const sendDisputeMessageMutation = useMutation({
    mutationFn: async ({ disputeId, message }: { disputeId: string; message: string }) => {
      const response = await apiRequest('POST', `/api/payouts/disputes/${disputeId}/message`, { message });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/disputes'] });
    },
    onError: () => {
      toast({
        title: 'Send Failed',
        description: 'Failed to send message',
        variant: 'destructive',
      });
    },
  });

  const generateStatementMutation = useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: Date; endDate: Date }) => {
      const response = await apiRequest('POST', '/api/payouts/statements/generate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      return response.json();
    },
    onSuccess: (data) => {
      showOutcome('statement_generated', { period: data.statement?.label });
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/statements'] });
      if (data.statement) {
        setSelectedStatement(data.statement);
      }
    },
    onError: () => {
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate statement',
        variant: 'destructive',
      });
    },
  });

  const retryPayoutMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const response = await apiRequest('POST', `/api/payouts/retry/${payoutId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Payout Retry', description: 'Payout retry initiated successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/history'] });
    },
    onError: () => {
      toast({
        title: 'Retry Failed',
        description: 'Failed to retry payout',
        variant: 'destructive',
      });
    },
  });

  // Handler functions
  const handleDownloadStatement = (statementId: string) => {
    window.open(`/api/royalties/download-statement/${statementId}`, '_blank');
    toast({ title: 'Downloading Statement', description: 'Your statement is being downloaded' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-accent/20 text-accent">
            <CheckCircle className="w-3 h-3 mr-1" />
            Paid
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-secondary/20 text-secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-primary/20 text-primary">
            <TrendingUp className="w-3 h-3 mr-1" />
            Processing
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-destructive/20 text-destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalEarnings = royalties.reduce(
    (sum: number, royalty: Royalty) => sum + royalty.amount,
    0
  );
  const pendingPayouts = royalties.filter((r: Royalty) => r.payoutStatus === 'pending');
  const totalPending = pendingPayouts.reduce((sum: number, r: Royalty) => sum + r.amount, 0);
  const paidRoyalties = royalties.filter((r: Royalty) => r.payoutStatus === 'paid');
  const totalStreams = royalties.reduce(
    (sum: number, royalty: Royalty) => sum + royalty.streams,
    0
  );
  const avgRPM = totalStreams > 0 ? totalEarnings / (totalStreams / 1000) : 0;

  const recentPayouts = royalties
    .filter((r: Royalty) => r.payoutStatus === 'paid' && r.payoutDate)
    .sort(
      (a: Royalty, b: Royalty) =>
        new Date(b.payoutDate!).getTime() - new Date(a.payoutDate!).getTime()
    )
    .slice(0, 4);

  if (!user) return null;

  if (user.role !== 'admin') {
    return <ComingSoonRoyalties />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Failed to load data. Please try again later.</p>
      </div>
    );
  }

  return (
    <AppLayout>
      {(authLoading || isLoading) ? (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            <p className="text-muted-foreground">Loading Royalties...</p>
          </div>
        </div>
      ) : (
      <div className="p-6 space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="text-3xl font-bold gradient-text mb-2"
              data-testid="text-royalties-title"
            >
              Royalty Management
            </h1>
            <p className="text-muted-foreground">
              Track your earnings and manage payouts across all platforms
            </p>
          </div>
          <div className="flex space-x-4">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-48" data-testid="select-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current" data-testid="option-period-current">
                  Current Month
                </SelectItem>
                <SelectItem value="last" data-testid="option-period-last">
                  Last Month
                </SelectItem>
                <SelectItem value="quarter" data-testid="option-period-quarter">
                  This Quarter
                </SelectItem>
                <SelectItem value="year" data-testid="option-period-year">
                  This Year
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              data-testid="button-export-royalties"
              onClick={() => exportRoyaltiesMutation.mutate()}
              disabled={exportRoyaltiesMutation.isPending}
            >
              <Download className="w-4 h-4 mr-2" />
              {exportRoyaltiesMutation.isPending ? 'Exporting...' : 'Export Report'}
            </Button>

            {!user?.stripeConnectedAccountId && (
              <Button
                variant="outline"
                data-testid="button-connect-bank-account"
                onClick={() => connectStripeMutation.mutate()}
                disabled={connectStripeMutation.isPending}
              >
                <DollarSign className="w-4 h-4 mr-2" />
                {connectStripeMutation.isPending ? 'Connecting...' : 'Connect Bank Account'}
              </Button>
            )}

            <Button
              data-testid="button-request-payout"
              onClick={() => requestPayoutMutation.mutate()}
              disabled={requestPayoutMutation.isPending || totalEarnings === 0}
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {requestPayoutMutation.isPending ? 'Requesting...' : 'Request Payout'}
            </Button>
          </div>
        </div>

        {/* Earnings Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="glassmorphism" data-testid="card-total-earnings">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Earnings</p>
                  <p className="text-2xl font-bold">${totalEarnings.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {totalEarnings > 0 ? 'Total across all platforms' : 'No earnings yet'}
                  </p>
                </div>
                <div className="p-3 bg-primary/10 rounded-full">
                  <DollarSign className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glassmorphism" data-testid="card-pending-payouts">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Payouts</p>
                  <p className="text-2xl font-bold">${totalPending.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {pendingPayouts.length} {pendingPayouts.length === 1 ? 'payout' : 'payouts'}
                  </p>
                </div>
                <div className="p-3 bg-secondary/10 rounded-full">
                  <Clock className="w-6 h-6 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glassmorphism" data-testid="card-total-streams">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Streams</p>
                  <p className="text-2xl font-bold">{totalStreams.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">
                    {totalStreams > 0 ? 'Across all platforms' : 'Start streaming to earn'}
                  </p>
                </div>
                <div className="p-3 bg-accent/10 rounded-full">
                  <Play className="w-6 h-6 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glassmorphism" data-testid="card-avg-rpm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg. RPM</p>
                  <p className="text-2xl font-bold">${avgRPM.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">Revenue per 1K streams</p>
                </div>
                <div className="p-3 bg-primary/10 rounded-full">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
            <TabsTrigger 
              value="overview" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-overview"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger 
              value="payouts" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-payouts"
            >
              <Zap className="w-4 h-4 mr-1" />
              Payouts
            </TabsTrigger>
            <TabsTrigger 
              value="statements" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-statements"
            >
              Statements
            </TabsTrigger>
            <TabsTrigger 
              value="splits" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-splits"
            >
              Collaborators
            </TabsTrigger>
            <TabsTrigger 
              value="publishing" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-publishing"
            >
              <Copyright className="w-4 h-4 mr-1" />
              Publishing
            </TabsTrigger>
            <TabsTrigger 
              value="disputes" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-disputes"
            >
              <Scale className="w-4 h-4 mr-1" />
              Disputes
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-settings"
            >
              Settings
            </TabsTrigger>
            <TabsTrigger 
              value="tax-intelligence" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              data-testid="tab-tax-intelligence"
            >
              <Calculator className="w-3 h-3 mr-1" />
              Tax & Revenue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Platform Breakdown */}
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Earnings by Platform</CardTitle>
                </CardHeader>
                <CardContent>
                  {platformLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                    </div>
                  ) : platformBreakdown.length > 0 ? (
                    <div className="space-y-4">
                      {platformBreakdown.map((platform: PlatformBreakdown) => (
                        <div key={platform.platform} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span>{platform.icon || '🎵'}</span>
                              <span className="font-medium">{platform.platform}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-medium">${platform.amount || 0}</span>
                              <p className="text-xs text-muted-foreground">
                                {platform.streams || 0}
                              </p>
                            </div>
                          </div>
                          <div className="w-full bg-muted/20 rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full"
                              style={{ width: `${platform.percentage || 0}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground py-8 text-center">
                      No platform data available
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Recent Payouts */}
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Recent Payouts</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentPayouts.length > 0 ? (
                    <div className="space-y-3">
                      {recentPayouts.map((payout: Royalty, index: number) => (
                        <div
                          key={payout.id}
                          className="flex items-center justify-between p-3 bg-muted/20 rounded"
                          data-testid={`payout-${index}`}
                        >
                          <div>
                            <p className="font-medium">${payout.amount.toLocaleString()}</p>
                            <p className="text-sm text-muted-foreground">
                              {payout.platform} • {payout.payoutDate}
                            </p>
                          </div>
                          {getStatusBadge(payout.payoutStatus)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground py-8 text-center">No recent payouts</p>
                  )}
                </CardContent>
              </Card>

              {/* Top Earning Tracks */}
              <Card className="glassmorphism lg:col-span-2">
                <CardHeader>
                  <CardTitle>Top Earning Tracks</CardTitle>
                </CardHeader>
                <CardContent>
                  {tracksLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-8 h-8 animate-spin" />
                    </div>
                  ) : topTracks.length > 0 ? (
                    <div className="space-y-4">
                      {topTracks.map((track: TopTrack, index: number) => (
                        <div
                          key={track.id || index}
                          className="flex items-center justify-between p-3 bg-muted/20 rounded"
                          data-testid={`top-earning-track-${index}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded flex items-center justify-center text-xs font-bold text-white">
                              {index + 1}
                            </div>
                            <div>
                              <p className="font-medium">{track.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {track.streams} streams
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">${track.earnings}</p>
                            <p className="text-sm text-muted-foreground">${track.rpm} RPM</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground py-8 text-center">
                      No track data available
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PayoutHistoryTimeline
                payouts={payoutHistory.map((p: any) => ({
                  ...p,
                  requestedAt: new Date(p.requestedAt),
                  completedAt: p.completedAt ? new Date(p.completedAt) : undefined,
                  estimatedArrival: p.estimatedArrival ? new Date(p.estimatedArrival) : undefined,
                }))}
                isLoading={payoutHistoryLoading}
                onRetry={(payoutId) => retryPayoutMutation.mutate(payoutId)}
                onViewDetails={(payoutId) => {
                  window.open(`/api/payouts/status/${payoutId}`, '_blank');
                }}
                showInstantPayoutInfo={true}
                instantPayoutFeePercentage={1.5}
              />

              <TaxFormWizard
                currentFormType={taxForms[0]?.formType || null}
                currentStatus={taxForms[0]?.status || 'not_started'}
                rejectionReason={taxForms[0]?.rejectionReason}
                onSubmit={async (formData) => {
                  await submitTaxFormMutation.mutateAsync(formData);
                }}
                isUSPerson={payoutSettings?.taxCountry === 'United States'}
              />
            </div>
          </TabsContent>

          <TabsContent value="statements" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <StatementDateRangePicker
                  statements={statements.map((s: any) => ({
                    ...s,
                    startDate: new Date(s.startDate),
                    endDate: new Date(s.endDate),
                  }))}
                  selectedPeriod={selectedStatement}
                  onPeriodSelect={(period) => {
                    setSelectedStatement(period);
                    showOutcome('statement_period_selected', {
                      startDate: period.startDate.toLocaleDateString(),
                      endDate: period.endDate.toLocaleDateString(),
                    });
                  }}
                  onDownload={(period) => {
                    handleDownloadStatement(period.id);
                    showOutcome('statement_downloaded', { period: period.label });
                  }}
                  onGenerate={(startDate, endDate) => {
                    generateStatementMutation.mutate({ startDate, endDate });
                  }}
                  isLoading={statementsLoading || generateStatementMutation.isPending}
                />
              </div>

              <div className="lg:col-span-2">
                {/* Monthly Statements Table */}
                <Card className="glassmorphism">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Royalty Statements</CardTitle>
                  <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                    <SelectTrigger className="w-48" data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" data-testid="option-platform-all">
                        All Platforms
                      </SelectItem>
                      <SelectItem value="spotify" data-testid="option-platform-spotify">
                        Spotify
                      </SelectItem>
                      <SelectItem value="apple" data-testid="option-platform-apple">
                        Apple Music
                      </SelectItem>
                      <SelectItem value="youtube" data-testid="option-platform-youtube">
                        YouTube Music
                      </SelectItem>
                      <SelectItem value="amazon" data-testid="option-platform-amazon">
                        Amazon Music
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-3">Period</th>
                        <th className="text-left p-3">Platform</th>
                        <th className="text-right p-3">Streams</th>
                        <th className="text-right p-3">Earnings</th>
                        <th className="text-right p-3">Status</th>
                        <th className="text-right p-3">Payout Date</th>
                        <th className="text-right p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {royalties.length > 0 ? (
                        royalties.map((royalty: Royalty, index: number) => (
                          <tr
                            key={royalty.id}
                            className="border-b border-border/50"
                            data-testid={`statement-${index}`}
                          >
                            <td className="p-3">{royalty.period}</td>
                            <td className="p-3">{royalty.platform}</td>
                            <td className="text-right p-3">{royalty.streams.toLocaleString()}</td>
                            <td className="text-right p-3 font-medium">
                              ${royalty.amount.toFixed(2)}
                            </td>
                            <td className="text-right p-3">
                              {getStatusBadge(royalty.payoutStatus)}
                            </td>
                            <td className="text-right p-3">{royalty.payoutDate || 'TBD'}</td>
                            <td className="text-right p-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-download-statement-${index}`}
                                onClick={() => handleDownloadStatement(royalty.id)}
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-muted-foreground">
                            No statements available
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="splits" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SplitVisualizationPieChart
                participants={splits.map((s: RoyaltySplit) => ({
                  id: s.id,
                  name: s.name,
                  role: s.role,
                  email: s.email,
                  percentage: s.percentage,
                  avatar: s.avatar,
                  status: 'accepted' as const,
                }))}
                totalAmount={totalEarnings}
                currency="USD"
                showLegend={true}
                showValidation={true}
                onParticipantClick={(participant) => {
                  const split = splits.find((s) => s.id === participant.id);
                  if (split) {
                    setEditingSplit(split);
                    setIsEditSplitDialogOpen(true);
                  }
                }}
              />

              {/* Royalty Splits Management */}
              <Card className="glassmorphism">
                <CardHeader>
                  <CardTitle>Manage Collaborators</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Current Collaborators */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Current Collaborators</h3>
                    {splitsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                    ) : splits.length > 0 ? (
                      <div className="space-y-3">
                        {splits.map((collaborator: RoyaltySplit, index: number) => (
                          <div
                            key={collaborator.id || index}
                            className="flex items-center justify-between p-4 bg-muted/20 rounded-lg"
                            data-testid={`collaborator-${index}`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                                <span className="text-lg">{collaborator.avatar || '👤'}</span>
                              </div>
                              <div>
                                <p className="font-medium">{collaborator.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {collaborator.role} • {collaborator.email}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-lg">{collaborator.percentage}%</p>
                              <div className="flex space-x-2 mt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`button-edit-split-${index}`}
                                  onClick={() => {
                                    setEditingSplit(collaborator);
                                    setIsEditSplitDialogOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`button-remove-split-${index}`}
                                  onClick={() => removeSplitMutation.mutate(collaborator.id)}
                                  disabled={removeSplitMutation.isPending}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground py-8 text-center">No collaborators yet</p>
                    )}
                  </div>

                  {/* Add New Collaborator */}
                  <div className="p-4 border-2 border-dashed border-muted rounded-lg text-center">
                    <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-muted-foreground mb-4">
                      Add a new collaborator to share royalties
                    </p>
                    <Button
                      data-testid="button-add-collaborator"
                      onClick={() => setIsAddCollaboratorDialogOpen(true)}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Add Collaborator
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          <TabsContent value="publishing" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="glassmorphism">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Total Works Registered</CardTitle>
                  <Music className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{publishingStats?.totalWorks || 0}</div>
                </CardContent>
              </Card>
              <Card className="glassmorphism">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Pending Registration</CardTitle>
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{publishingStats?.pendingCount || 0}</div>
                </CardContent>
              </Card>
              <Card className="glassmorphism">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">PRO Income</CardTitle>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${(publishingStats?.proIncome || 0).toLocaleString()}</div>
                </CardContent>
              </Card>
              <Card className="glassmorphism">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">Publishing Split</CardTitle>
                  <PieChart className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{publishingStats?.avgPublishingSplit || 0}%</div>
                </CardContent>
              </Card>
            </div>

            <Card className="glassmorphism">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Registered Works</CardTitle>
                <Button onClick={() => setIsRegisterWorkDialogOpen(true)} data-testid="button-register-work">
                  <Plus className="w-4 h-4 mr-2" />
                  Register New Work
                </Button>
              </CardHeader>
              <CardContent>
                {publishingLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  </div>
                ) : publishingWorks.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-border/50">
                          <th className="p-3 font-medium">Title</th>
                          <th className="p-3 font-medium">ISWC</th>
                          <th className="p-3 font-medium">ISRC</th>
                          <th className="p-3 font-medium">PRO</th>
                          <th className="p-3 font-medium">Writer Split</th>
                          <th className="p-3 font-medium">Publisher</th>
                          <th className="p-3 font-medium text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {publishingWorks.map((work) => (
                          <tr key={work.id} className="border-b border-border/50">
                            <td className="p-3 font-medium">{work.trackTitle}</td>
                            <td className="p-3">{work.iswc || '—'}</td>
                            <td className="p-3">{work.isrc || '—'}</td>
                            <td className="p-3">{work.proName}</td>
                            <td className="p-3">{work.writerSplit}%</td>
                            <td className="p-3">{work.publisherName || '—'}</td>
                            <td className="p-3 text-right">
                              <Badge 
                                className={
                                  work.status === 'registered' ? 'bg-green-500/20 text-green-500' :
                                  work.status === 'rejected' ? 'bg-red-500/20 text-red-500' :
                                  'bg-yellow-500/20 text-yellow-500'
                                }
                              >
                                {work.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No works registered"
                    description="Register your musical works to start tracking publishing royalties."
                    icon={<Copyright className="w-12 h-12" />}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="disputes" className="space-y-6">
            <DisputeTracker
              disputes={disputes.map((d: any) => ({
                ...d,
                createdAt: new Date(d.createdAt),
                updatedAt: new Date(d.updatedAt),
                messages: d.messages?.map((m: any) => ({
                  ...m,
                  timestamp: new Date(m.timestamp),
                })) || [],
              }))}
              isLoading={disputesLoading}
              onFileDispute={async (data) => {
                await fileDisputeMutation.mutateAsync(data as any);
              }}
              onSubmitEvidence={async (disputeId, evidence) => {
                await submitEvidenceMutation.mutateAsync({ disputeId, evidence });
              }}
              onSendMessage={async (disputeId, message) => {
                await sendDisputeMessageMutation.mutateAsync({ disputeId, message });
              }}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            {/* Payout Settings */}
            <Card className="glassmorphism">
              <CardHeader>
                <CardTitle>Payout Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Payment Methods */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
                    {paymentsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                    ) : paymentMethods.length > 0 ? (
                      <div className="space-y-3">
                        {paymentMethods.map((method: PaymentMethod) => (
                          <div
                            key={method.id}
                            className="flex items-center justify-between p-4 bg-muted/20 rounded-lg"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                                <DollarSign className="w-5 h-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{method.type}</p>
                                <p className="text-sm text-muted-foreground">
                                  {method.accountNumber} •{' '}
                                  {method.isPrimary ? 'Primary' : 'Secondary'}
                                </p>
                              </div>
                            </div>
                            {method.isActive && (
                              <Badge className="bg-accent/20 text-accent">Active</Badge>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          className="w-full"
                          data-testid="button-add-payment-method"
                          onClick={() => setIsAddPaymentDialogOpen(true)}
                        >
                          Add Payment Method
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-muted-foreground py-8 text-center">No payment methods</p>
                        <Button
                          variant="outline"
                          className="w-full"
                          data-testid="button-add-payment-method"
                          onClick={() => setIsAddPaymentDialogOpen(true)}
                        >
                          Add Payment Method
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Payout Preferences */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Payout Preferences</h3>
                    {payoutSettingsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <RefreshCw className="w-8 h-8 animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Minimum Payout Amount</p>
                            <p className="text-sm text-muted-foreground">
                              Set the minimum amount for automatic payouts
                            </p>
                          </div>
                          <Select
                            value={payoutSettings?.minimumPayoutAmount?.toString() || '100'}
                            onValueChange={(value) => {
                              updatePayoutSettingsMutation.mutate({
                                minimumPayoutAmount: parseInt(value),
                              });
                            }}
                            data-testid="select-min-payout"
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="50" data-testid="option-min-payout-50">
                                $50
                              </SelectItem>
                              <SelectItem value="100" data-testid="option-min-payout-100">
                                $100
                              </SelectItem>
                              <SelectItem value="250" data-testid="option-min-payout-250">
                                $250
                              </SelectItem>
                              <SelectItem value="500" data-testid="option-min-payout-500">
                                $500
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Payout Frequency</p>
                            <p className="text-sm text-muted-foreground">
                              How often you want to receive payouts
                            </p>
                          </div>
                          <Select
                            value={payoutSettings?.payoutFrequency || 'monthly'}
                            onValueChange={(value) => {
                              updatePayoutSettingsMutation.mutate({ payoutFrequency: value });
                            }}
                            data-testid="select-payout-frequency"
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly" data-testid="option-frequency-weekly">
                                Weekly
                              </SelectItem>
                              <SelectItem value="monthly" data-testid="option-frequency-monthly">
                                Monthly
                              </SelectItem>
                              <SelectItem
                                value="quarterly"
                                data-testid="option-frequency-quarterly"
                              >
                                Quarterly
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tax Information */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Tax Information</h3>
                    <div className="p-4 bg-muted/20 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-medium">Tax Forms</p>
                        {payoutSettings?.taxFormCompleted ? (
                          <Badge className="bg-accent/20 text-accent">Completed</Badge>
                        ) : (
                          <Badge variant="outline">Required</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        Please complete your tax information to ensure proper reporting and
                        compliance.
                      </p>
                      {payoutSettings?.taxCountry && (
                        <p className="text-sm mb-4">
                          <span className="font-medium">Country:</span> {payoutSettings.taxCountry}
                        </p>
                      )}
                      <Button
                        data-testid="button-update-tax-info"
                        onClick={() => {
                          setTaxCountry(payoutSettings?.taxCountry || '');
                          setTaxId(payoutSettings?.taxId || '');
                          setIsTaxInfoDialogOpen(true);
                        }}
                      >
                        Update Tax Information
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tax-intelligence" className="space-y-6">
            <TaxIntelligenceContent />
          </TabsContent>
        </Tabs>

        {/* Tax Information Dialog */}
        <Dialog open={isTaxInfoDialogOpen} onOpenChange={setIsTaxInfoDialogOpen}>
          <DialogContent data-testid="dialog-tax-info">
            <DialogHeader>
              <DialogTitle>Update Tax Information</DialogTitle>
              <DialogDescription>
                Please provide your tax information for compliance and reporting purposes.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tax-country">Country</Label>
                <Input
                  id="tax-country"
                  placeholder="e.g., United States"
                  value={taxCountry}
                  onChange={(e) => setTaxCountry(e.target.value)}
                  data-testid="input-tax-country"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tax-id">Tax ID / SSN / EIN</Label>
                <Input
                  id="tax-id"
                  placeholder="e.g., 123-45-6789"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  data-testid="input-tax-id"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsTaxInfoDialogOpen(false)}
                data-testid="button-cancel-tax-info"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (taxCountry && taxId) {
                    updateTaxInfoMutation.mutate({ taxCountry, taxId });
                  } else {
                    toast({
                      title: 'Missing Information',
                      description: 'Please fill in all required fields',
                      variant: 'destructive',
                    });
                  }
                }}
                disabled={updateTaxInfoMutation.isPending}
                data-testid="button-save-tax-info"
              >
                {updateTaxInfoMutation.isPending ? 'Saving...' : 'Save Tax Information'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Collaborator Dialog */}
        <Dialog open={isAddCollaboratorDialogOpen} onOpenChange={(open) => {
          setIsAddCollaboratorDialogOpen(open);
          if (!open) {
            setNewCollaboratorName('');
            setNewCollaboratorEmail('');
            setNewCollaboratorRole('');
            setNewCollaboratorPercentage('');
          }
        }}>
          <DialogContent data-testid="dialog-add-collaborator">
            <DialogHeader>
              <DialogTitle>Add Collaborator</DialogTitle>
              <DialogDescription>
                Add a new collaborator to share royalties with.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="collaborator-name">Name</Label>
                <Input
                  id="collaborator-name"
                  placeholder="Collaborator name"
                  value={newCollaboratorName}
                  onChange={(e) => setNewCollaboratorName(e.target.value)}
                  data-testid="input-collaborator-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaborator-email">Email</Label>
                <Input
                  id="collaborator-email"
                  type="email"
                  placeholder="collaborator@example.com"
                  value={newCollaboratorEmail}
                  onChange={(e) => setNewCollaboratorEmail(e.target.value)}
                  data-testid="input-collaborator-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaborator-role">Role</Label>
                <Input
                  id="collaborator-role"
                  placeholder="e.g., Producer, Songwriter"
                  value={newCollaboratorRole}
                  onChange={(e) => setNewCollaboratorRole(e.target.value)}
                  data-testid="input-collaborator-role"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaborator-percentage">Split Percentage (%)</Label>
                <Input
                  id="collaborator-percentage"
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g., 25"
                  value={newCollaboratorPercentage}
                  onChange={(e) => setNewCollaboratorPercentage(e.target.value)}
                  data-testid="input-collaborator-percentage"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddCollaboratorDialogOpen(false);
                  setNewCollaboratorName('');
                  setNewCollaboratorEmail('');
                  setNewCollaboratorRole('');
                  setNewCollaboratorPercentage('');
                }}
                data-testid="button-cancel-add-collaborator"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const percentage = parseFloat(newCollaboratorPercentage);
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  
                  if (!newCollaboratorName.trim()) {
                    toast({ title: 'Missing Name', description: 'Please enter a name', variant: 'destructive' });
                    return;
                  }
                  if (!newCollaboratorEmail.trim() || !emailRegex.test(newCollaboratorEmail)) {
                    toast({ title: 'Invalid Email', description: 'Please enter a valid email address', variant: 'destructive' });
                    return;
                  }
                  if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                    toast({ title: 'Invalid Percentage', description: 'Percentage must be between 0 and 100', variant: 'destructive' });
                    return;
                  }
                  
                  addCollaboratorMutation.mutate({
                    name: newCollaboratorName.trim(),
                    email: newCollaboratorEmail.trim(),
                    role: newCollaboratorRole.trim() || 'Collaborator',
                    percentage,
                  });
                }}
                disabled={(() => {
                  if (addCollaboratorMutation.isPending) return true;
                  if (!newCollaboratorName.trim()) return true;
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!newCollaboratorEmail.trim() || !emailRegex.test(newCollaboratorEmail.trim())) return true;
                  const trimmedPct = newCollaboratorPercentage.trim();
                  if (trimmedPct === '') return true;
                  const pct = parseFloat(trimmedPct);
                  if (isNaN(pct) || pct < 0 || pct > 100) return true;
                  return false;
                })()}
                data-testid="button-save-collaborator"
              >
                {addCollaboratorMutation.isPending ? 'Adding...' : 'Add Collaborator'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Split Dialog */}
        <Dialog open={isEditSplitDialogOpen} onOpenChange={(open) => {
          setIsEditSplitDialogOpen(open);
          if (!open) {
            setEditingSplit(null);
          }
        }}>
          <DialogContent data-testid="dialog-edit-split">
            <DialogHeader>
              <DialogTitle>Edit Collaborator</DialogTitle>
              <DialogDescription>
                Update collaborator details and split percentage.
              </DialogDescription>
            </DialogHeader>

            {editingSplit && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name</Label>
                  <Input
                    id="edit-name"
                    value={editingSplit.name}
                    onChange={(e) => setEditingSplit({ ...editingSplit, name: e.target.value })}
                    data-testid="input-edit-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editingSplit.email}
                    onChange={(e) => setEditingSplit({ ...editingSplit, email: e.target.value })}
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Input
                    id="edit-role"
                    value={editingSplit.role}
                    onChange={(e) => setEditingSplit({ ...editingSplit, role: e.target.value })}
                    data-testid="input-edit-role"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-percentage">Split Percentage (%)</Label>
                  <Input
                    id="edit-percentage"
                    type="number"
                    min="0"
                    max="100"
                    value={editingSplit.percentage === 0 ? '0' : editingSplit.percentage || ''}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      const num = val === '' ? NaN : parseFloat(val);
                      setEditingSplit({ ...editingSplit, percentage: num });
                    }}
                    data-testid="input-edit-percentage"
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditSplitDialogOpen(false);
                  setEditingSplit(null);
                }}
                data-testid="button-cancel-edit-split"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!editingSplit) return;
                  
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  
                  if (!editingSplit.name?.trim()) {
                    toast({ title: 'Missing Name', description: 'Please enter a name', variant: 'destructive' });
                    return;
                  }
                  if (!editingSplit.email?.trim() || !emailRegex.test(editingSplit.email)) {
                    toast({ title: 'Invalid Email', description: 'Please enter a valid email address', variant: 'destructive' });
                    return;
                  }
                  if (typeof editingSplit.percentage !== 'number' || isNaN(editingSplit.percentage) || editingSplit.percentage < 0 || editingSplit.percentage > 100) {
                    toast({ title: 'Invalid Percentage', description: 'Percentage must be between 0 and 100', variant: 'destructive' });
                    return;
                  }
                  
                  updateSplitMutation.mutate({
                    id: editingSplit.id,
                    name: editingSplit.name.trim(),
                    email: editingSplit.email.trim(),
                    role: editingSplit.role?.trim() || 'Collaborator',
                    percentage: editingSplit.percentage,
                  });
                }}
                disabled={(() => {
                  if (updateSplitMutation.isPending) return true;
                  if (!editingSplit) return true;
                  if (!editingSplit.name?.trim()) return true;
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!editingSplit.email?.trim() || !emailRegex.test(editingSplit.email.trim())) return true;
                  if (typeof editingSplit.percentage !== 'number' || isNaN(editingSplit.percentage) || editingSplit.percentage < 0 || editingSplit.percentage > 100) return true;
                  return false;
                })()}
                data-testid="button-save-edit-split"
              >
                {updateSplitMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Register New Work Dialog */}
        <Dialog open={isRegisterWorkDialogOpen} onOpenChange={setIsRegisterWorkDialogOpen}>
          <DialogContent className="max-w-2xl bg-gray-900 border-gray-800 text-white" data-testid="dialog-register-work">
            <DialogHeader>
              <DialogTitle>Register New Work</DialogTitle>
              <DialogDescription className="text-gray-400">
                Register your musical work for publishing rights and royalty tracking.
              </DialogDescription>
            </DialogHeader>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const data = Object.fromEntries(formData.entries());
                registerWorkMutation.mutate({
                  trackTitle: data.trackTitle as string,
                  iswc: data.iswc as string,
                  isrc: data.isrc as string,
                  upc: data.upc as string,
                  proName: data.proName as string,
                  proRegistrationId: data.proRegistrationId as string,
                  publisherName: data.publisherName as string,
                  writerSplit: parseFloat(data.writerSplit as string),
                  publishingSplit: 100 - parseFloat(data.writerSplit as string),
                  copyrightYear: parseInt(data.copyrightYear as string),
                  coWriters: data.coWriters as string,
                  status: 'pending'
                });
              }}
              className="space-y-4 py-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trackTitle">Track Title (Required)</Label>
                  <Input id="trackTitle" name="trackTitle" required className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="copyrightYear">Copyright Year</Label>
                  <Input id="copyrightYear" name="copyrightYear" type="number" defaultValue={new Date().getFullYear()} className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="iswc">ISWC (Optional)</Label>
                  <Input id="iswc" name="iswc" placeholder="T-123.456.789-C" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isrc">ISRC (Optional)</Label>
                  <Input id="isrc" name="isrc" placeholder="US-ABC-12-34567" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="upc">UPC (Optional)</Label>
                  <Input id="upc" name="upc" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proName">PRO Name</Label>
                  <Select name="proName" defaultValue="ASCAP">
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800 text-white">
                      <SelectItem value="ASCAP">ASCAP</SelectItem>
                      <SelectItem value="BMI">BMI</SelectItem>
                      <SelectItem value="SESAC">SESAC</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="proRegistrationId">PRO Registration ID</Label>
                  <Input id="proRegistrationId" name="proRegistrationId" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisherName">Publisher Name</Label>
                  <Input id="publisherName" name="publisherName" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="writerSplit">Writer Split % (0-100)</Label>
                  <Input id="writerSplit" name="writerSplit" type="number" min="0" max="100" defaultValue="100" className="bg-gray-800 border-gray-700" />
                </div>
                <div className="space-y-2">
                  <Label>Publishing Split % (Auto)</Label>
                  <div className="p-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-400 italic">
                    Calculated as 100 - Writer Split
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="coWriters">Co-Writers (Names and Splits)</Label>
                <textarea 
                  id="coWriters" 
                  name="coWriters" 
                  className="w-full h-24 p-2 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                  placeholder="e.g. John Doe (25%), Jane Smith (25%)"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsRegisterWorkDialogOpen(false)} className="border-gray-700 text-gray-400">
                  Cancel
                </Button>
                <Button type="submit" disabled={registerWorkMutation.isPending}>
                  {registerWorkMutation.isPending ? 'Registering...' : 'Register Work'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      )}
    </AppLayout>
  );
}

// ============================================================================
// TAX & REVENUE INTELLIGENCE CONTENT
// ============================================================================

function TaxIntelligenceContent() {
  const { data: royaltyData } = useQuery<any>({ queryKey: ['/api/royalties/statements'] });
  const { data: payoutsData } = useQuery<any>({ queryKey: ['/api/payouts'] });
  const { data: publishingData } = useQuery<any[]>({ queryKey: ['/api/publishing'] });
  const { data: forecastData } = useQuery<any>({ queryKey: ['/api/royalties/forecast'] });

  const currentYear = new Date().getFullYear();
  const quarters = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];

  const revenueStreams = [
    { source: 'Streaming Royalties', description: 'Spotify, Apple Music, YouTube, Tidal, etc.', taxType: '1099-MISC / Self-Employment', deductible: false },
    { source: 'Publishing Royalties', description: 'PRO income, sync fees, mechanical royalties', taxType: '1099-MISC', deductible: false },
    { source: 'Live Performance', description: 'Show guarantees, door deals, tickets', taxType: 'Business Income', deductible: false },
    { source: 'Merchandise Sales', description: 'Clothing, accessories, digital goods', taxType: 'Business Income', deductible: false },
    { source: 'Sync Licensing', description: 'TV, film, ad placements', taxType: '1099-MISC', deductible: false },
    { source: 'Beat Sales', description: 'Exclusive and non-exclusive beat licenses', taxType: 'Business Income', deductible: false },
  ];

  const deductions = [
    { item: 'Recording Studio Costs', description: 'Studio time, session musicians, engineer fees' },
    { item: 'Music Production Equipment', description: 'DAWs, plugins, hardware, microphones, cables' },
    { item: 'Distribution & Platform Fees', description: 'DistroKid, TuneCore, publishing admin fees' },
    { item: 'Marketing & Promotion', description: 'Content creation, photography, graphic design' },
    { item: 'Travel & Transportation', description: 'Tour travel, show mileage (IRS rate × miles)' },
    { item: 'Professional Services', description: 'Manager commissions, attorney fees, accountant' },
    { item: 'Home Studio Deduction', description: 'Portion of rent/mortgage if studio is primary workspace' },
    { item: 'Instrument Repairs & Maintenance', description: 'Repair costs, string replacements, etc.' },
    { item: 'Wardrobe & Styling', description: 'Stage outfits and performance-specific clothing' },
    { item: 'Software Subscriptions', description: 'DAW subscriptions, plugins, cloud storage' },
  ];

  const quarterlyEstimate = [15, 15, 15, 15]; // estimated % by quarter

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Revenue Streams', value: revenueStreams.length, icon: <DollarSign className="w-5 h-5 text-green-500" />, color: 'text-green-600' },
          { label: 'Tax Deductions', value: deductions.length, icon: <Receipt className="w-5 h-5 text-blue-500" />, color: 'text-blue-600' },
          { label: 'Tax Year', value: currentYear, icon: <Calculator className="w-5 h-5 text-purple-500" />, color: 'text-purple-600' },
          { label: 'Self-Employment Rate', value: '15.3%', icon: <BarChart3 className="w-5 h-5 text-orange-500" />, color: 'text-orange-600' },
        ].map((s, i) => (
          <Card key={i}><CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">{s.icon}</div>
            <div><p className="text-xs text-gray-500">{s.label}</p><p className={`text-xl font-bold ${s.color}`}>{s.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="w-5 h-5 text-green-600" />Music Revenue Streams ({currentYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {revenueStreams.map((stream, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">{stream.source}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{stream.description}</p>
                    </div>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">{stream.taxType}</Badge>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg">
              <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">⚠️ Important: As an independent artist, you likely file as self-employed. All music income is subject to both income tax AND self-employment tax (15.3%).</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Receipt className="w-5 h-5 text-blue-600" />Tax Deductions Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deductions.map((d, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{d.item}</p>
                    <p className="text-xs text-gray-500">{d.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-5 h-5 text-purple-600" />Quarterly Tax Estimated Payment Schedule ({currentYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">If you expect to owe $1,000+ in taxes, the IRS requires quarterly estimated payments. Missing them results in penalties.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quarters.map((q, i) => {
              const deadlines = ['April 15', 'June 15', 'September 15', 'January 15'];
              return (
                <div key={i} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg text-center">
                  <p className="text-xs text-gray-500 mb-1">{q}</p>
                  <p className="font-semibold text-sm">Due {deadlines[i]}</p>
                  <Badge variant="outline" className="text-xs mt-2">{quarterlyEstimate[i]}% of annual</Badge>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200"><span className="font-semibold">Pro tip:</span> Set aside 25–30% of every royalty payment and gig fee into a separate savings account earmarked for taxes. This covers self-employment tax + federal income tax for most artists.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">📋 End-of-Year Tax Preparation Checklist</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              '✅ Collect all 1099 forms from streaming platforms and labels',
              '✅ Export payout history from DistroKid / TuneCore / CDBaby',
              '✅ Download PRO earnings statements (ASCAP/BMI/SESAC)',
              '✅ Gather all receipts for deductible expenses',
              '✅ Calculate total business mileage for shows and sessions',
              '✅ Document home studio square footage for home office deduction',
              '✅ List all equipment purchases (potential Section 179 deduction)',
              '✅ Confirm any international income for foreign tax forms',
              '✅ Review split sheet agreements for co-writer deductions',
              '✅ Calculate net profit / loss for Schedule C filing',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">{item}</div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4 text-center">This is educational information. Always consult a licensed CPA or tax professional for personalized tax advice.</p>
        </CardContent>
      </Card>
    </div>
  );
}
