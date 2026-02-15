import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  CreditCard, 
  RefreshCw, 
  Shield, 
  Clock, 
  XCircle,
  Ban,
  Wifi,
  HelpCircle,
  ChevronRight,
  Loader2
} from 'lucide-react';

type DeclineReason = 
  | 'insufficient_funds'
  | 'card_declined'
  | 'expired_card'
  | 'incorrect_cvc'
  | 'fraud_suspected'
  | 'processing_error'
  | 'network_error'
  | 'authentication_required'
  | 'card_not_supported'
  | 'generic_decline'
  | 'unknown';

interface PaymentFailure {
  code: string;
  message: string;
  declineCode?: string;
  retryable: boolean;
  lastAttempt?: string;
  attemptCount?: number;
}

interface PaymentFailureHandlerProps {
  failure: PaymentFailure;
  onRetry?: () => void;
  onUpdatePaymentMethod?: () => void;
  onContactSupport?: () => void;
  onDismiss?: () => void;
  isRetrying?: boolean;
}

const getDeclineReason = (code: string, declineCode?: string): DeclineReason => {
  if (declineCode === 'insufficient_funds') return 'insufficient_funds';
  if (declineCode === 'expired_card' || code === 'CARD_EXPIRED') return 'expired_card';
  if (declineCode === 'incorrect_cvc' || code === 'CARD_VALIDATION_ERROR') return 'incorrect_cvc';
  if (declineCode === 'fraudulent' || declineCode === 'stolen_card' || declineCode === 'lost_card') return 'fraud_suspected';
  if (code === 'REQUIRES_3D_SECURE') return 'authentication_required';
  if (declineCode === 'processing_error') return 'processing_error';
  if (code === 'NETWORK_ERROR') return 'network_error';
  if (declineCode === 'card_not_supported') return 'card_not_supported';
  if (code === 'PAYMENT_DECLINED' || declineCode === 'generic_decline') return 'generic_decline';
  return 'unknown';
};

const declineReasonConfig: Record<DeclineReason, {
  icon: React.ReactNode;
  title: string;
  description: string;
  actions: ('retry' | 'update_card' | 'support')[];
  severity: 'warning' | 'error' | 'info';
}> = {
  insufficient_funds: {
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Insufficient Funds',
    description: 'Your card doesn\'t have enough available credit. Please try a different card or add funds to your account.',
    actions: ['update_card', 'retry'],
    severity: 'warning',
  },
  expired_card: {
    icon: <Clock className="h-5 w-5" />,
    title: 'Card Expired',
    description: 'The card on file has expired. Please update your payment method with a valid card.',
    actions: ['update_card'],
    severity: 'error',
  },
  incorrect_cvc: {
    icon: <XCircle className="h-5 w-5" />,
    title: 'Invalid Card Details',
    description: 'The card security code (CVC) was incorrect. Please update your payment method.',
    actions: ['update_card'],
    severity: 'error',
  },
  fraud_suspected: {
    icon: <Shield className="h-5 w-5" />,
    title: 'Transaction Blocked',
    description: 'This transaction was flagged by your bank\'s fraud protection. Please contact your bank or try a different card.',
    actions: ['update_card', 'support'],
    severity: 'error',
  },
  authentication_required: {
    icon: <Shield className="h-5 w-5" />,
    title: 'Authentication Required',
    description: 'Your bank requires additional verification. Please complete 3D Secure authentication.',
    actions: ['retry'],
    severity: 'info',
  },
  processing_error: {
    icon: <RefreshCw className="h-5 w-5" />,
    title: 'Processing Error',
    description: 'There was a temporary issue processing your payment. This usually resolves itself.',
    actions: ['retry', 'support'],
    severity: 'warning',
  },
  network_error: {
    icon: <Wifi className="h-5 w-5" />,
    title: 'Connection Error',
    description: 'We couldn\'t connect to the payment processor. Please check your connection and try again.',
    actions: ['retry'],
    severity: 'warning',
  },
  card_not_supported: {
    icon: <Ban className="h-5 w-5" />,
    title: 'Card Not Supported',
    description: 'This type of card is not supported. Please try a different Visa, Mastercard, or American Express.',
    actions: ['update_card'],
    severity: 'error',
  },
  generic_decline: {
    icon: <CreditCard className="h-5 w-5" />,
    title: 'Card Declined',
    description: 'Your card was declined. Please contact your bank for details or try a different card.',
    actions: ['update_card', 'retry', 'support'],
    severity: 'warning',
  },
  unknown: {
    icon: <HelpCircle className="h-5 w-5" />,
    title: 'Payment Failed',
    description: 'Something went wrong with your payment. Please try again or contact support.',
    actions: ['retry', 'update_card', 'support'],
    severity: 'warning',
  },
};

export default function PaymentFailureHandler({
  failure,
  onRetry,
  onUpdatePaymentMethod,
  onContactSupport,
  onDismiss,
  isRetrying = false,
}: PaymentFailureHandlerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const reason = getDeclineReason(failure.code, failure.declineCode);
  const config = declineReasonConfig[reason];

  const getSeverityStyles = () => {
    switch (config.severity) {
      case 'error':
        return 'border-red-500/50 bg-red-50 dark:bg-red-950/30';
      case 'warning':
        return 'border-orange-500/50 bg-orange-50 dark:bg-orange-950/30';
      case 'info':
        return 'border-blue-500/50 bg-blue-50 dark:bg-blue-950/30';
    }
  };

  const getIconColor = () => {
    switch (config.severity) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warning':
        return 'text-orange-600 dark:text-orange-400';
      case 'info':
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  return (
    <Card className={`${getSeverityStyles()}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`${getIconColor()}`}>
              {config.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{config.title}</CardTitle>
              {failure.attemptCount && failure.attemptCount > 1 && (
                <Badge variant="outline" className="mt-1">
                  Attempt {failure.attemptCount}
                </Badge>
              )}
            </div>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{config.description}</p>

        <div className="flex flex-wrap gap-2">
          {config.actions.includes('retry') && onRetry && failure.retryable && (
            <Button onClick={onRetry} disabled={isRetrying} size="sm">
              {isRetrying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </>
              )}
            </Button>
          )}
          {config.actions.includes('update_card') && onUpdatePaymentMethod && (
            <Button onClick={onUpdatePaymentMethod} variant="outline" size="sm">
              <CreditCard className="h-4 w-4 mr-2" />
              Update Card
            </Button>
          )}
          {config.actions.includes('support') && onContactSupport && (
            <Button onClick={onContactSupport} variant="ghost" size="sm">
              <HelpCircle className="h-4 w-4 mr-2" />
              Contact Support
            </Button>
          )}
        </div>

        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${showDetails ? 'rotate-90' : ''}`} />
          {showDetails ? 'Hide details' : 'Show technical details'}
        </button>

        {showDetails && (
          <div className="bg-muted/50 rounded-md p-3 text-xs font-mono space-y-1">
            <p>Code: {failure.code}</p>
            {failure.declineCode && <p>Decline code: {failure.declineCode}</p>}
            {failure.lastAttempt && (
              <p>Last attempt: {new Date(failure.lastAttempt).toLocaleString()}</p>
            )}
            <p>Retryable: {failure.retryable ? 'Yes' : 'No'}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
