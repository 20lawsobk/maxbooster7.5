import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { Shield, Loader2, CheckCircle, XCircle, AlertTriangle, ExternalLink } from 'lucide-react';

type ThreeDSecureStatus = 'idle' | 'authenticating' | 'success' | 'failed' | 'cancelled';

interface ThreeDSecureError {
  message: string;
  code?: string;
  declineCode?: string;
  retryable?: boolean;
}

interface ThreeDSecureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientSecret: string | null;
  paymentIntentId?: string;
  onSuccess?: () => void;
  onFailure?: (error: ThreeDSecureError) => void;
  onCancel?: () => void;
}

export default function ThreeDSecureModal({
  open,
  onOpenChange,
  clientSecret,
  paymentIntentId,
  onSuccess,
  onFailure,
  onCancel,
}: ThreeDSecureModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ThreeDSecureStatus>('idle');
  const [error, setError] = useState<ThreeDSecureError | null>(null);
  const [loading, setLoading] = useState(false);

  const resetState = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && clientSecret) {
      setStatus('authenticating');
    } else if (!open) {
      resetState();
    }
  }, [open, clientSecret, resetState]);

  const handleConfirm3DS = async () => {
    if (!paymentIntentId) {
      setError({ message: 'Missing payment information', retryable: false });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/billing/3ds/confirm', {
        paymentIntentId,
      });

      const data = await response.json();

      if (data.success || data.status === 'succeeded') {
        setStatus('success');
        queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
        queryClient.invalidateQueries({ queryKey: ['/api/billing/grace-period-status'] });

        toast({
          title: 'Payment Successful',
          description: 'Your payment has been processed successfully.',
        });

        setTimeout(() => {
          onSuccess?.();
          onOpenChange(false);
        }, 1500);
      } else if (data.code === 'REQUIRES_3D_SECURE' || data.code === 'REQUIRES_ACTION') {
        setError({
          message: 'Additional authentication required. Please complete verification in the popup.',
          code: data.code,
          retryable: true,
        });
      } else {
        throw data;
      }
    } catch (err) {
      const errorData = err.body || err;
      setStatus('failed');
      setError({
        message: errorData.message || '3D Secure authentication failed',
        code: errorData.code,
        declineCode: errorData.declineCode,
        retryable: errorData.retryable ?? true,
      });

      toast({
        title: 'Authentication Failed',
        description: errorData.message || 'Please try again or use a different card.',
        variant: 'destructive',
      });

      onFailure?.(errorData);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setStatus('cancelled');
    onCancel?.();
    onOpenChange(false);
  };

  const renderStatusIcon = () => {
    switch (status) {
      case 'authenticating':
        return <Loader2 className="h-16 w-16 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="h-16 w-16 text-green-500" />;
      case 'failed':
        return <XCircle className="h-16 w-16 text-red-500" />;
      case 'cancelled':
        return <AlertTriangle className="h-16 w-16 text-yellow-500" />;
      default:
        return <Shield className="h-16 w-16 text-blue-500" />;
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'success':
        return (
          <div className="py-8 text-center">
            {renderStatusIcon()}
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mt-4 mb-2">
              Authentication Successful!
            </h3>
            <p className="text-muted-foreground">
              Your payment has been verified and processed.
            </p>
          </div>
        );

      case 'failed':
        return (
          <div className="py-6 space-y-4">
            <div className="text-center">
              {renderStatusIcon()}
              <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 mt-4 mb-2">
                Authentication Failed
              </h3>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  <p>{error.message}</p>
                  {error.declineCode && (
                    <p className="text-sm mt-1">Decline code: {error.declineCode}</p>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-center gap-3 pt-4">
              {error?.retryable && (
                <Button onClick={handleConfirm3DS} disabled={loading}>
                  Try Again
                </Button>
              )}
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </div>
        );

      case 'authenticating':
      default:
        return (
          <div className="py-6 space-y-6">
            <div className="text-center">
              {renderStatusIcon()}
              <h3 className="text-lg font-semibold mt-4 mb-2">
                Additional Verification Required
              </h3>
              <p className="text-muted-foreground text-sm">
                Your bank requires additional verification to complete this payment.
                This helps protect you from unauthorized transactions.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Secure 3D authentication</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ExternalLink className="h-4 w-4 text-blue-500" />
                <span>You may be redirected to your bank's verification page</span>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={handleConfirm3DS} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Complete Verification'
                )}
              </Button>
              <Button variant="outline" onClick={handleCancel} disabled={loading}>
                Cancel
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            3D Secure Authentication
          </DialogTitle>
          <DialogDescription>
            Complete the verification to process your payment
          </DialogDescription>
        </DialogHeader>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
