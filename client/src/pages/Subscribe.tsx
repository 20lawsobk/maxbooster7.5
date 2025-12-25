import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Logo } from '@/components/ui/Logo';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Check, ArrowLeft, Shield, CreditCard } from 'lucide-react';
import { Link } from 'wouter';

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  throw new Error('Missing required Stripe key: VITE_STRIPE_PUBLIC_KEY');
}
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

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

const SubscribeForm = ({ plan }: { plan: any }) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/dashboard`,
      },
    });

    if (error) {
      toast({
        title: 'Payment Failed',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Payment Successful',
        description: `Welcome to Max Booster ${plan.name}!`,
      });
      navigate('/dashboard');
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-gray-50 p-4 rounded-lg">
        <PaymentElement />
      </div>

      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Shield className="h-4 w-4" />
        <span>Your payment information is secure and encrypted</span>
      </div>

      <Button
        type="submit"
        className="w-full py-3 text-lg gradient-bg"
        disabled={!stripe || isProcessing}
      >
        {isProcessing ? (
          <>
            <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
            Processing...
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

      <p className="text-xs text-gray-500 text-center">
        By subscribing, you agree to our Terms of Service and Privacy Policy.
        {plan.period !== 'once' && ' You can cancel anytime.'}
      </p>
    </form>
  );
};

export default function Subscribe() {
  const { tier } = useParams();
  const { user } = useAuth();
  const [clientSecret, setClientSecret] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const plan = plans[tier as keyof typeof plans];

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!plan) {
      navigate('/pricing');
      return;
    }

    // Create subscription intent
    const createSubscription = async () => {
      try {
        const response = await apiRequest('POST', '/api/create-subscription', {
          priceId: plan.priceId,
        });
        const data = await response.json();
        setClientSecret(data.clientSecret);
      } catch (error: unknown) {
        toast({
          title: 'Setup Failed',
          description: error.message || 'Failed to setup payment. Please try again.',
          variant: 'destructive',
        });
        navigate('/pricing');
      } finally {
        setIsLoading(false);
      }
    };

    createSubscription();
  }, [user, plan, navigate, toast]);

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

  if (!clientSecret) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="max-w-md mx-4">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Setup Error</h1>
            <p className="text-gray-600 mb-6">
              We couldn't set up your subscription. Please try again.
            </p>
            <Link href="/pricing">
              <Button>Back to Pricing</Button>
            </Link>
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
                  {(plan as any).originalPrice && (
                    <span className="text-sm text-gray-500 line-through ml-2">
                      ${(plan as any).originalPrice}/{plan.period}
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
                  <SubscribeForm plan={plan} />
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
