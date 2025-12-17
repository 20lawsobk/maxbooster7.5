import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Info,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface PayoutBalance {
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  currency: string;
}

interface Payout {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  stripePayoutId: string | null;
  status: string;
  requestedAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
  metadata: any;
}

interface AccountVerification {
  verified: boolean;
  accountId?: string;
  requiresOnboarding?: boolean;
  error?: string;
}

/**
 * TODO: Add function documentation
 */
export function PayoutDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [payoutAmount, setPayoutAmount] = useState('');

  // Fetch payout balance
  const {
    data: balance,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useQuery<PayoutBalance>({
    queryKey: ['/api/payouts/balance'],
    enabled: !!user,
    staleTime: 30000, // 30 seconds
  });

  // Fetch payout history
  const { data: payoutHistory, isLoading: historyLoading } = useQuery<{ payouts: Payout[] }>({
    queryKey: ['/api/payouts/history'],
    enabled: !!user,
    staleTime: 60000, // 1 minute
  });

  // Fetch account verification status
  const { data: verification, isLoading: verificationLoading } = useQuery<AccountVerification>({
    queryKey: ['/api/payouts/verify'],
    enabled: !!user,
    staleTime: 60000, // 1 minute
  });

  // Setup Stripe Connect mutation
  const setupStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/payouts/setup', {});
      return response.json();
    },
    onSuccess: (data: unknown) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: unknown) => {
      toast({
        title: 'Setup Failed',
        description: error.message || 'Failed to setup payout account',
        variant: 'destructive',
      });
    },
  });

  // Request instant payout mutation
  const requestPayoutMutation = useMutation({
    mutationFn: async (amount: number) => {
      const response = await apiRequest('POST', '/api/payouts/instant', {
        amount,
        currency: 'usd',
      });
      return response.json();
    },
    onSuccess: (data: unknown) => {
      toast({
        title: 'Payout Initiated!',
        description: data.message || 'Your payout has been initiated successfully.',
      });
      setPayoutAmount('');
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payouts/history'] });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Payout Failed',
        description: error.message || 'Failed to process payout request',
        variant: 'destructive',
      });
    },
  });

  const handleRequestPayout = () => {
    const amount = parseFloat(payoutAmount);

    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid Amount',
        description: 'Please enter a valid payout amount',
        variant: 'destructive',
      });
      return;
    }

    if (balance && amount > balance.availableBalance) {
      toast({
        title: 'Insufficient Balance',
        description: `Available balance: $${balance.availableBalance.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    requestPayoutMutation.mutate(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Please login to view your payouts</p>
        </CardContent>
      </Card>
    );
  }

  // Show Stripe Connect onboarding if needed
  if (verification?.requiresOnboarding) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Setup Instant Payouts
          </CardTitle>
          <CardDescription>
            Connect your bank account to receive instant payouts from marketplace sales
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-semibold text-blue-900">Instant Payouts with Stripe Express</h4>
                <p className="text-sm text-blue-700">
                  Get paid instantly (T+0) from your marketplace sales. Funds typically arrive in
                  your bank account within minutes.
                </p>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>Instant access to your earnings</li>
                  <li>Secure bank account connection via Stripe</li>
                  <li>Track all payouts in one place</li>
                  <li>Automatic balance calculations</li>
                </ul>
              </div>
            </div>
          </div>

          <Button
            onClick={() => setupStripeMutation.mutate()}
            disabled={setupStripeMutation.isPending}
            className="w-full"
            size="lg"
          >
            {setupStripeMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                Connect Bank Account
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            You'll be redirected to Stripe to securely connect your bank account
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show error if verification failed
  if (verification && !verification.verified && verification.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Account Verification Required
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">{verification.error}</p>
          <Button
            onClick={() => setupStripeMutation.mutate()}
            disabled={setupStripeMutation.isPending}
          >
            Complete Verification
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Balance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                ${balanceLoading ? '...' : balance?.availableBalance.toFixed(2) || '0.00'}
              </span>
              <span className="text-muted-foreground">USD</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Ready to withdraw</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                ${balanceLoading ? '...' : balance?.pendingBalance.toFixed(2) || '0.00'}
              </span>
              <span className="text-muted-foreground">USD</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">From recent sales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-green-600">
                ${balanceLoading ? '...' : balance?.totalEarnings.toFixed(2) || '0.00'}
              </span>
              <span className="text-muted-foreground">USD</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">All time</p>
          </CardContent>
        </Card>
      </div>

      {/* Instant Payout Request */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Request Instant Payout
          </CardTitle>
          <CardDescription>
            Withdraw your available balance instantly (T+0 settlement)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payout-amount">Amount (USD)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="payout-amount"
                  type="number"
                  placeholder="0.00"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  className="pl-7"
                  min="0"
                  max={balance?.availableBalance || 0}
                  step="0.01"
                />
              </div>
              <Button
                onClick={handleRequestPayout}
                disabled={
                  requestPayoutMutation.isPending || !payoutAmount || parseFloat(payoutAmount) <= 0
                }
                className="whitespace-nowrap"
              >
                {requestPayoutMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Request Payout
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Available: ${balance?.availableBalance.toFixed(2) || '0.00'}
              </span>
              <Button
                variant="link"
                size="sm"
                onClick={() => setPayoutAmount(balance?.availableBalance.toString() || '0')}
                className="h-auto p-0"
              >
                Use max
              </Button>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            <p className="font-medium">Instant Payout Details:</p>
            <ul className="text-muted-foreground space-y-0.5 ml-4 list-disc">
              <li>Funds arrive in minutes (T+0 settlement)</li>
              <li>No fees for instant payouts</li>
              <li>Available 24/7</li>
              <li>Minimum: $1.00</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Payout History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Payout History</CardTitle>
            <CardDescription>Track all your payout requests</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['/api/payouts/history'] });
              refetchBalance();
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading history...</div>
          ) : payoutHistory && payoutHistory.payouts.length > 0 ? (
            <div className="space-y-4">
              {payoutHistory.payouts.map((payout) => (
                <div
                  key={payout.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        ${parseFloat(payout.amount).toFixed(2)} {payout.currency.toUpperCase()}
                      </span>
                      {getStatusBadge(payout.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Requested{' '}
                      {formatDistanceToNow(new Date(payout.requestedAt), { addSuffix: true })}
                    </p>
                    {payout.completedAt && (
                      <p className="text-xs text-muted-foreground">
                        Completed{' '}
                        {formatDistanceToNow(new Date(payout.completedAt), { addSuffix: true })}
                      </p>
                    )}
                    {payout.failureReason && (
                      <p className="text-xs text-destructive">{payout.failureReason}</p>
                    )}
                  </div>
                  {payout.stripePayoutId && (
                    <Button variant="ghost" size="sm" className="gap-2" asChild>
                      <a
                        href={`https://dashboard.stripe.com/payouts/${payout.stripePayoutId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View in Stripe
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No payouts yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Request your first payout when you have available balance
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
