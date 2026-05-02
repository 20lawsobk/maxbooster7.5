import { useState, useEffect, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe, StripeError } from '@stripe/stripe-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Check, ArrowLeft, Shield, CreditCard, AlertTriangle, RefreshCw, ServerCrash, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const stripePromise = STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null;

interface BillingError {
  message: string;
  code?: string;
  retryable?: boolean;
  suggestedAction?: string;
}

const getPaymentErrorMessage = (error: StripeError | BillingError): { message: string; canRetry: boolean } => {
  const errorCode = (error as Record<string, unknown>).code || (error as StripeError).type;
  
  switch (errorCode) {
    case 'card_declined':
    case 'PAYMENT_DECLINED':
      return { message: 'Your card was declined. Please try a different payment method.', canRetry: true };
    case 'incorrect_cvc':
    case 'CARD_VALIDATION_ERROR':
      return { message: 'Your card information is incorrect. Please check and try again.', canRetry: true };
    case 'expired_card':
    case 'CARD_EXPIRED':
      return { message: 'Your card has expired. Please use a different payment method.', canRetry: true };
    case 'insufficient_funds':
    case 'INSUFFICIENT_FUNDS':
      return { message: 'Insufficient funds. Please try a different payment method.', canRetry: true };
    case 'authentication_required':
    case 'REQUIRES_3D_SECURE':
      return { message: 'Additional authentication is required. Please complete the verification.', canRetry: true };
    case 'processing_error':
      return { message: 'An error occurred while processing your payment. Please try again.', canRetry: true };
    case 'STRIPE_NOT_CONFIGURED':
      return { message: 'Payment service is temporarily unavailable. Please try again later.', canRetry: false };
    case 'RATE_LIMITED':
      return { message: 'Too many requests. Please wait a moment and try again.', canRetry: true };
    default:
      return { message: error.message || 'An unexpected error occurred.', canRetry: (error as BillingError).retryable ?? true };
  }
};

const plans = {
  monthly: {
    id: 'monthly',
    name: 'Monthly Plan',
    price: 49,
    period: 'month',
    priceId: 'price_monthly_49', // This would be set from Stripe dashboard
    description: 'Perfect for getting started',
    features: [
      'All AI Tools & Studio Access',
      'Up to 5 Active Projects',
      'Basic Analytics Dashboard',
      'Social Media Management',
      'Email Support',
      'Cloud Storage (10GB)',
      'Basic Distribution',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly Plan',
    price: 39,
    originalPrice: 49,
    period: 'month',
    priceId: 'price_yearly_468', // This would be set from Stripe dashboard (39*12)
    description: 'Best value for serious artists',
    features: [
      'Everything in Monthly',
      'Unlimited Active Projects',
      'Advanced Analytics & Insights',
      'Priority Social Media Tools',
      'Advanced Distribution Network',
      'Priority Email & Chat Support',
      'Cloud Storage (100GB)',
      'Advanced AI Mastering',
      'Royalty Analytics',
      'Custom Branding',
    ],
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime Plan',
    price: 699,
    period: 'once',
    priceId: 'price_lifetime_699', // This would be set from Stripe dashboard
    description: 'Complete access forever',
    features: [
      'Everything in Yearly',
      'Lifetime Access - No Recurring Fees',
      'Unlimited Everything',
      'White-label Options',
      'API Access',
      'Premium Support (Phone & Video)',
      'Unlimited Cloud Storage',
      'Early Access to New Features',
      'Personal Account Manager',
      'Custom Integrations',
    ],
  },
};

const SubscribeForm = ({ plan, onRetry }: { plan: Record<string, unknown>; onRetry?: () => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    if (!stripe || !elements) {
      setPaymentError({ message: 'Payment system is not ready. Please wait a moment.', canRetry: true });
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard?payment=success`,
        },
        redirect: 'if_required',
      });

      if (error) {
        const errorInfo = getPaymentErrorMessage(error);
        setPaymentError(errorInfo);
        setRetryCount(prev => prev + 1);
        
        toast({
          title: 'Payment Failed',
          description: errorInfo.message,
          variant: 'destructive',
        });
      } else if (paymentIntent?.status === 'succeeded') {
        toast({
          title: 'Payment Successful!',
          description: `Welcome to Max Booster ${plan.name}!`,
        });
        navigate('/dashboard?payment=success');
      } else if (paymentIntent?.status === 'processing') {
        toast({
          title: 'Payment Processing',
          description: 'Your payment is being processed. You will be notified once complete.',
        });
        navigate('/dashboard?payment=processing');
      } else if (paymentIntent?.status === 'requires_action') {
        toast({
          title: 'Additional Verification Required',
          description: 'Please complete the verification in the popup window.',
        });
      }
    } catch (err) {
      const errorInfo = getPaymentErrorMessage(err);
      setPaymentError(errorInfo);
      toast({
        title: 'Payment Error',
        description: errorInfo.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRetry = () => {
    setPaymentError(null);
    if (onRetry) {
      onRetry();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {paymentError && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Payment Failed</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{paymentError.message}</p>
            {paymentError.canRetry && retryCount < 3 && (
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleRetry}
                className="mt-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Try Again
              </Button>
            )}
            {retryCount >= 3 && (
              <p className="text-sm text-muted-foreground mt-2">
                Multiple payment attempts failed. Please try a different payment method or{' '}
                <Link href="/contact" className="underline">contact support</Link>.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
        <PaymentElement 
          options={{
            layout: 'tabs',
            paymentMethodOrder: ['card', 'apple_pay', 'google_pay'],
          }}
        />
      </div>

      <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
        <Shield className="h-4 w-4" />
        <span>Your payment information is secure and encrypted</span>
      </div>

      <Button
        type="submit"
        className="w-full py-3 text-lg gradient-bg"
        disabled={!stripe || isProcessing}
        data-testid="button-submit-payment"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing Payment...
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5 mr-2" />
            {plan.period === 'once'
              ? `Pay $${plan.price} Once`
              : `Subscribe for $${plan.price}/${plan.period}`}
          </>
        )}
      </Button>

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        By subscribing, you agree to our Terms of Service and Privacy Policy.
        {plan.period !== 'once' && ' You can cancel anytime.'}
      </p>
    </form>
  );
};

const StripeUnavailableFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
    <Card className="max-w-md">
      <CardContent className="p-8 text-center">
        <ServerCrash className="h-16 w-16 text-orange-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Payment Service Unavailable</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Our payment processing service is temporarily unavailable. This is usually resolved within a few minutes.
        </p>
        <div className="space-y-3">
          <Button onClick={() => window.location.reload()} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Link href="/pricing">
            <Button variant="outline" className="w-full">
              Back to Pricing
            </Button>
          </Link>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-6">
          If this issue persists, please contact support at support@maxbooster.com
        </p>
      </CardContent>
    </Card>
  </div>
);

export default function Subscribe() {
  const { tier } = useParams();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [setupError, setSetupError] = useState<BillingError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const plan = plans[tier as keyof typeof plans];

  const createSubscription = useCallback(async () => {
    if (!plan) return;
    
    setIsLoading(true);
    setSetupError(null);
    
    try {
      const response = await apiRequest('POST', '/api/create-subscription', {
        planName: plan.id,
      });
      const data = await response.json();
      
      if (data.code === 'STRIPE_NOT_CONFIGURED') {
        setSetupError({
          message: 'Payment service is temporarily unavailable.',
          code: 'STRIPE_NOT_CONFIGURED',
          retryable: false,
        });
        return;
      }
      
      setClientSecret(data.clientSecret);
    } catch (error) {
      const errorData = error.body || error;
      
      if (errorData.code === 'STRIPE_NOT_CONFIGURED' || error.status === 503) {
        setSetupError({
          message: 'Payment service is temporarily unavailable. Please try again later.',
          code: 'STRIPE_NOT_CONFIGURED',
          retryable: false,
        });
      } else {
        setSetupError({
          message: errorData.message || 'Failed to setup payment. Please try again.',
          code: errorData.code || 'SETUP_FAILED',
          retryable: errorData.retryable ?? true,
        });
        
        toast({
          title: 'Setup Failed',
          description: errorData.message || 'Failed to setup payment. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [plan, toast]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!plan) {
      navigate('/pricing');
      return;
    }

    createSubscription();
  }, [user, plan, navigate, createSubscription]);

  const handleRetry = useCallback(() => {
    setRetryCount(prev => prev + 1);
    createSubscription();
  }, [createSubscription]);

  if (!stripePromise) {
    return <StripeUnavailableFallback />;
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Plan Not Found</h1>
            <p className="text-gray-600 mb-6">
              The subscription plan you're looking for doesn't exist.
            </p>
            <Link href="/pricing">
              <Button>View Available Plans</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Setting up your subscription...
            </h2>
            <p className="text-gray-600">Please wait while we prepare your payment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (setupError) {
    if (setupError.code === 'STRIPE_NOT_CONFIGURED') {
      return <StripeUnavailableFallback />;
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Setup Error</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{setupError.message}</p>
            <div className="space-y-3">
              {setupError.retryable && retryCount < 3 && (
                <Button onClick={handleRetry} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              )}
              <Link href="/pricing">
                <Button variant="outline" className="w-full">Back to Pricing</Button>
              </Link>
            </div>
            {retryCount >= 3 && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                Multiple attempts failed. Please try again later or contact support.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Setup Error</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              We couldn't set up your subscription. Please try again.
            </p>
            <div className="space-y-3">
              <Button onClick={handleRetry} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
              <Link href="/pricing">
                <Button variant="outline" className="w-full">Back to Pricing</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/pricing">
              <Button variant="ghost" className="flex items-center space-x-2">
                <ArrowLeft className="h-4 w-4" />
                <Logo size="sm" />
              </Button>
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Signed in as <span className="font-medium">{user.username}</span>
              </span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Plan Details */}
          <div>
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-3">
                  <Badge className="bg-primary/10 text-primary">Subscribe</Badge>
                  {plan.id === 'yearly' && (
                    <Badge className="bg-green-100 text-green-800">Most Popular</Badge>
                  )}
                </div>
                <CardTitle className="text-2xl">{plan.name}</CardTitle>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold text-gray-900">${plan.price}</span>
                  <span className="text-gray-500">/{plan.period}</span>
                  {(plan as Record<string, unknown>).originalPrice && (
                    <span className="text-sm text-gray-500 line-through ml-2">
                      ${(plan as Record<string, unknown>).originalPrice}/{plan.period}
                    </span>
                  )}
                </div>
                {plan.id === 'yearly' && (
                  <p className="text-green-600 font-medium">
                    Save ${(49 - 39) * 12}/year with annual billing
                  </p>
                )}
                <p className="text-gray-600">{plan.description}</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">What's included:</h4>
                  <ul className="space-y-2">
                    {plan.features.map((feature: string, index: number) => (
                      <li key={index} className="flex items-start space-x-3">
                        <Check className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-700">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {plan.period !== 'once' && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-blue-900 mb-2">Billing Information</h4>
                    <p className="text-sm text-blue-700">
                      {plan.id === 'yearly'
                        ? `You'll be charged $${plan.price * 12} today, then $${plan.price * 12} every year.`
                        : `You'll be charged $${plan.price} today, then $${plan.price} every month.`}
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      You can cancel your subscription at any time from your account settings.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment Form */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Complete Your Subscription</CardTitle>
                <p className="text-gray-600">
                  Enter your payment details to start your Max Booster journey.
                </p>
              </CardHeader>
              <CardContent>
                <Elements stripe={stripePromise} options={{ clientSecret }}>
                  <SubscribeForm plan={plan} onRetry={handleRetry} />
                </Elements>
              </CardContent>
            </Card>

            {/* Security Notice */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-gray-400 mt-0.5" />
                <div className="text-sm text-gray-600">
                  <h4 className="font-medium text-gray-900 mb-1">Secure Payment</h4>
                  <p>
                    Your payment is processed securely by Stripe. We never store your credit card
                    information. All transactions are encrypted and protected.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
