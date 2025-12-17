import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Music, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import { apiRequest } from '@/lib/queryClient';

export default function RegisterSuccess() {
  const [, navigate] = useLocation();
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const sessionId = searchParams.get('session_id');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [paymentValid, setPaymentValid] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!sessionId) {
      toast({
        title: 'Invalid Session',
        description: 'No payment session found. Please try again.',
        variant: 'destructive',
      });
      navigate('/pricing');
      return;
    }

    // If user is already logged in, redirect to dashboard
    if (user) {
      navigate('/dashboard');
      return;
    }

    // Verify the payment session
    const verifyPayment = async () => {
      try {
        // We'll verify the session exists and payment was successful on form submit
        setPaymentValid(true);
        setIsVerifying(false);
      } catch (error: unknown) {
        setIsVerifying(false);
        toast({
          title: 'Payment Verification Failed',
          description: 'Unable to verify your payment. Please try again.',
          variant: 'destructive',
        });
        navigate('/pricing');
      }
    };

    verifyPayment();
  }, [sessionId, user, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      if (!tosAccepted) {
        throw new Error('You must accept the Terms of Service to continue');
      }

      if (!privacyAccepted) {
        throw new Error('You must accept the Privacy Policy to continue');
      }

      // Create account after payment verification
      // Note: birthdate is retrieved from Stripe session metadata (collected before payment)
      const response = await apiRequest('POST', '/api/register-after-payment', {
        sessionId,
        password,
        tosAccepted,
        privacyAccepted,
        marketingConsent,
      });

      const data = await response.json();

      if (data.user) {
        toast({
          title: 'Welcome to Max Booster!',
          description: 'Your account has been created and your subscription is active.',
        });

        // Force page reload to update authentication state
        window.location.href = '/dashboard';
      } else {
        throw new Error(data.error || 'Account creation failed');
      }
    } catch (error: unknown) {
      toast({
        title: 'Account Creation Failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Verifying Payment...</h2>
            <p className="text-gray-600">Please wait while we confirm your payment.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!paymentValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Payment Verification Failed</h1>
            <p className="text-gray-600 mb-6">
              We couldn't verify your payment. Please try again.
            </p>
            <Button onClick={() => navigate('/pricing')} data-testid="button-back-to-pricing">
              Back to Pricing
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Logo size="sm" />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">Payment Successful!</CardTitle>
            <p className="text-gray-600 mt-2">
              Your payment has been processed successfully. Now create your password to complete
              your account setup.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Create Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a secure password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    data-testid="input-confirm-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-gray-200">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="tosAccepted"
                    checked={tosAccepted}
                    onCheckedChange={(checked) => setTosAccepted(checked as boolean)}
                    data-testid="checkbox-tos"
                    className="mt-1"
                  />
                  <Label htmlFor="tosAccepted" className="text-sm leading-relaxed cursor-pointer">
                    I have read and agree to the{' '}
                    <a href="/terms" target="_blank" className="text-primary hover:underline font-medium">
                      Terms of Service
                    </a>
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="privacyAccepted"
                    checked={privacyAccepted}
                    onCheckedChange={(checked) => setPrivacyAccepted(checked as boolean)}
                    data-testid="checkbox-privacy"
                    className="mt-1"
                  />
                  <Label htmlFor="privacyAccepted" className="text-sm leading-relaxed cursor-pointer">
                    I have read and agree to the{' '}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </a>
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="marketingConsent"
                    checked={marketingConsent}
                    onCheckedChange={(checked) => setMarketingConsent(checked as boolean)}
                    data-testid="checkbox-marketing"
                    className="mt-1"
                  />
                  <Label htmlFor="marketingConsent" className="text-sm leading-relaxed cursor-pointer">
                    I would like to receive marketing emails and promotional offers (optional)
                  </Label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                size="lg"
                disabled={isLoading}
                data-testid="button-complete-registration"
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    <span>Creating Account...</span>
                  </div>
                ) : (
                  'Complete Registration'
                )}
              </Button>
            </form>

            <div className="text-center text-xs text-gray-500 mt-4">
              <p>Your subscription is already active and ready to use!</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
