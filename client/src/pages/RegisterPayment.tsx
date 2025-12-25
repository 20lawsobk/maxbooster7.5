import { useState } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Music, ArrowLeft, Shield, CreditCard } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { apiRequest } from '@/lib/queryClient';

const plans = {
  monthly: {
    id: 'monthly',
    name: 'Monthly Plan',
    price: 49,
    period: 'month',
    description: 'Perfect for getting started',
    features: [
      'Complete AI-Powered Studio Access',
      'Unlimited Active Projects',
      'Professional Analytics Dashboard',
      'Advanced Social Media Management',
      'Distribution to All Major Platforms',
      'AI Mastering & Audio Enhancement',
      'Royalty Tracking & Analytics',
      'Beat Marketplace Access',
      'Custom Branding & White-label',
      'Cloud Storage (100GB)',
      'Priority Email & Chat Support',
      'Early Access to New Features',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Yearly Plan',
    price: 39,
    originalPrice: 49,
    period: 'month',
    billedAnnually: true,
    description: 'Best value for serious artists',
    popular: true,
    features: [
      'Complete AI-Powered Studio Access',
      'Unlimited Active Projects',
      'Professional Analytics Dashboard',
      'Advanced Social Media Management',
      'Distribution to All Major Platforms',
      'AI Mastering & Audio Enhancement',
      'Royalty Tracking & Analytics',
      'Beat Marketplace Access',
      'Custom Branding & White-label',
      'Cloud Storage (500GB)',
      'Priority Email & Chat Support',
      'Early Access to New Features',
      'API Access & Integrations',
      'Premium Content Library',
    ],
  },
  lifetime: {
    id: 'lifetime',
    name: 'Lifetime Plan',
    price: 699,
    period: 'once',
    description: 'Complete access forever',
    features: [
      'Complete AI-Powered Studio Access',
      'Unlimited Active Projects',
      'Professional Analytics Dashboard',
      'Advanced Social Media Management',
      'Distribution to All Major Platforms',
      'AI Mastering & Audio Enhancement',
      'Royalty Tracking & Analytics',
      'Beat Marketplace Access',
      'Custom Branding & White-label',
      'Unlimited Cloud Storage',
      'Premium Support (Phone & Video)',
      'Early Access to New Features',
      'API Access & Integrations',
      'Premium Content Library',
      'Personal Account Manager',
      'Custom Enterprise Integrations',
    ],
  },
};

export default function RegisterPayment() {
  const { tier } = useParams<{ tier: string }>();
  const [, navigate] = useLocation();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    birthdate: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const plan = plans[tier as keyof typeof plans];

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Plan Not Found</h1>
            <p className="text-gray-600 mb-6">The subscription plan you selected doesn't exist.</p>
            <Link href="/pricing">
              <Button data-testid="button-back-to-pricing">View Available Plans</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form data
      if (!formData.username.trim() || !formData.email.trim() || !formData.birthdate.trim()) {
        throw new Error('Please fill in all fields');
      }

      if (!formData.email.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      // Validate age (13+) for COPPA compliance
      const birthDate = new Date(formData.birthdate);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      if (age < 13) {
        throw new Error('You must be at least 13 years old to create an account (COPPA compliance)');
      }

      // Create Stripe checkout session
      const response = await apiRequest('POST', '/api/create-checkout-session', {
        tier: plan.id,
        userEmail: formData.email,
        username: formData.username,
        birthdate: formData.birthdate,
      });

      const data = await response.json();

      if (data.url) {
        // Redirect to Stripe hosted checkout
        window.location.href = data.url;
      } else {
        throw new Error('Failed to create checkout session');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/pricing">
              <Button
                variant="ghost"
                className="flex items-center space-x-2"
                data-testid="button-back-navigation"
              >
                <ArrowLeft className="h-4 w-4" />
                <Logo size="sm" />
              </Button>
            </Link>
            <div className="flex items-center space-x-4">
              <Link href="/login">
                <Button variant="ghost" data-testid="button-sign-in">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Plan Summary */}
          <div className="order-2 lg:order-1">
            <Card className={`${plan.popular ? 'border-primary shadow-lg' : 'shadow-md'}`}>
              <CardHeader className="text-center">
                {plan.popular && (
                  <div className="mb-4">
                    <span className="bg-primary text-white text-sm px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}
                <CardTitle className="text-2xl font-bold text-gray-900">{plan.name}</CardTitle>
                <div className="mt-4">
                  <div className="flex items-baseline justify-center">
                    <span
                      className="text-4xl font-bold text-gray-900"
                      data-testid={`text-price-${plan.id}`}
                    >
                      ${plan.price}
                    </span>
                    <span className="text-gray-500 ml-2">/{plan.period}</span>
                  </div>
                  {plan.originalPrice && (
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="line-through">${plan.originalPrice}/month</span>
                      <span className="text-green-600 ml-2 font-medium">
                        Save ${(plan.originalPrice - plan.price) * 12}/year
                      </span>
                    </div>
                  )}
                  {plan.billedAnnually && (
                    <p className="text-sm text-gray-500 mt-2">
                      Billed annually (${plan.price * 12})
                    </p>
                  )}
                </div>
                <CardDescription className="mt-4">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start space-x-3">
                      <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center mt-0.5 flex-shrink-0">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      </div>
                      <span className="text-gray-700 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2 text-blue-800">
                    <Shield className="h-5 w-5" />
                    <span className="font-medium">90-Day Money-Back Guarantee</span>
                  </div>
                  <p className="text-blue-700 text-sm mt-1">
                    If you're not completely satisfied, we'll refund your entire payment, no
                    questions asked.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Registration Form */}
          <div className="order-1 lg:order-2">
            <Card>
              <CardHeader className="text-center">
                <div className="mx-auto w-12 h-12 gradient-bg rounded-xl flex items-center justify-center mb-4">
                  <CreditCard className="h-7 w-7 text-white" />
                </div>
                <CardTitle className="text-2xl font-bold">Complete Your Purchase</CardTitle>
                <CardDescription>Enter your details to continue to secure payment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      name="username"
                      type="text"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={handleInputChange}
                      required
                      data-testid="input-username"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      data-testid="input-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthdate">Date of Birth</Label>
                    <Input
                      id="birthdate"
                      name="birthdate"
                      type="date"
                      value={formData.birthdate}
                      onChange={handleInputChange}
                      max={new Date().toISOString().split('T')[0]}
                      required
                      data-testid="input-birthdate"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500">You must be at least 13 years old (COPPA compliance)</p>
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                    size="lg"
                    disabled={isLoading}
                    data-testid="button-continue-to-payment"
                  >
                    {isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <CreditCard className="h-5 w-5" />
                        <span>Continue to Secure Payment</span>
                      </div>
                    )}
                  </Button>
                </form>

                <div className="text-center text-xs text-gray-500 space-y-2">
                  <p>Secure payment powered by Stripe</p>
                  <p>By continuing, you agree to our Terms of Service and Privacy Policy</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
