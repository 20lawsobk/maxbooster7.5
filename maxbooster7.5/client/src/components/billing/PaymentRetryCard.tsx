import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { 
  RefreshCw, 
  CreditCard, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  ArrowRight
} from 'lucide-react';

interface PaymentRetryCardProps {
  subscriptionStatus: string;
  lastPaymentError?: {
    code: string;
    message: string;
    declineCode?: string;
  } | null;
  nextRetryAt?: string | null;
  retryAttempts?: number;
  maxRetries?: number;
  gracePeriodEndsAt?: string | null;
  onUpdatePaymentMethod?: () => void;
  onSuccess?: () => void;
}

export default function PaymentRetryCard({
  subscriptionStatus,
  lastPaymentError,
  nextRetryAt,
  retryAttempts = 0,
  maxRetries = 4,
  gracePeriodEndsAt,
  onUpdatePaymentMethod,
  onSuccess,
}: PaymentRetryCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<'success' | 'failed' | 'requires_action' | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  const retriesRemaining = maxRetries - retryAttempts;
  const retriesExhausted = retriesRemaining <= 0;
  const progressPercent = Math.max(0, ((maxRetries - retryAttempts) / maxRetries) * 100);

  const handleRetryPayment = async () => {
    setIsRetrying(true);
    setRetryResult(null);

    try {
      const response = await apiRequest('POST', '/api/billing/retry-payment');
      const data = await response.json();

      if (data.success || data.code === 'PAYMENT_SUCCESS' || data.code === 'ALREADY_PAID') {
        setRetryResult('success');
        queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/grace-period-status'] });

        toast({
          title: 'Payment Successful!',
          description: 'Your subscription is now active.',
        });

        onSuccess?.();
      } else if (data.code === 'REQUIRES_3D_SECURE') {
        setRetryResult('requires_action');
        setClientSecret(data.clientSecret);

        toast({
          title: 'Additional Verification Required',
          description: 'Please complete the 3D Secure authentication.',
        });
      } else {
        throw data;
      }
    } catch (error: any) {
      const errorData = error.body || error;
      setRetryResult('failed');

      toast({
        title: 'Payment Failed',
        description: errorData.message || 'Please update your payment method and try again.',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeUntil = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    if (diff <= 0) return 'now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    return 'soon';
  };

  if (subscriptionStatus !== 'past_due' && subscriptionStatus !== 'unpaid') {
    return null;
  }

  return (
    <Card className="border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/50">
              <CreditCard className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <CardTitle className="text-lg">Payment Required</CardTitle>
              <CardDescription>
                Your last payment was unsuccessful
              </CardDescription>
            </div>
          </div>
          <Badge variant="destructive">
            {subscriptionStatus === 'past_due' ? 'Past Due' : 'Unpaid'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {lastPaymentError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {lastPaymentError.message}
            </AlertDescription>
          </Alert>
        )}

        {retryResult === 'success' && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950/30">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              Payment successful! Your subscription is now active.
            </AlertDescription>
          </Alert>
        )}

        {retryResult === 'requires_action' && clientSecret && (
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
            <AlertTriangle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-700 dark:text-blue-400">
              Your bank requires additional verification. Please complete 3D Secure authentication.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Retry attempts remaining</span>
            <span className="font-medium">
              {retriesRemaining} of {maxRetries}
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {nextRetryAt && !retriesExhausted && (
          <div className="flex items-center gap-2 text-sm bg-muted/50 rounded-lg p-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              Next automatic retry: <strong>{getTimeUntil(nextRetryAt)}</strong>
              <span className="text-muted-foreground ml-1">({formatDate(nextRetryAt)})</span>
            </span>
          </div>
        )}

        {gracePeriodEndsAt && (
          <div className="flex items-center gap-2 text-sm bg-red-100 dark:bg-red-900/30 rounded-lg p-3 text-red-700 dark:text-red-400">
            <Calendar className="h-4 w-4" />
            <span>
              Access ends: <strong>{formatDate(gracePeriodEndsAt)}</strong>
            </span>
          </div>
        )}

        {retriesExhausted && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              All automatic retries have been exhausted. Please update your payment method to continue.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex gap-3">
        <Button
          onClick={handleRetryPayment}
          disabled={isRetrying || retriesExhausted || retryResult === 'success'}
          className="flex-1"
        >
          {isRetrying ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Payment Now
            </>
          )}
        </Button>
        
        {onUpdatePaymentMethod && (
          <Button variant="outline" onClick={onUpdatePaymentMethod} className="flex-1">
            <CreditCard className="h-4 w-4 mr-2" />
            Update Card
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
