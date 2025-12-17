import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectIfAuthenticated } from '@/hooks/useRequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Logo } from '@/components/ui/Logo';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'wouter';
import {
  Sparkles,
  Music,
  TrendingUp,
  Users,
  DollarSign,
  CheckCircle,
  ArrowRight,
  Shield,
  Clock,
} from 'lucide-react';
import { GoogleIcon } from '@/components/ui/brand-icons';

export default function Register() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const { toast } = useToast();
  useRedirectIfAuthenticated();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      await register(formData);
      toast({
        title: 'Account created successfully!',
        description: "Welcome to Max Booster! Let's get started.",
      });
      navigate('/dashboard');
    } catch (error: unknown) {
      setError(error.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = () => {
    window.location.href = '/api/auth/google';
  };

  const benefits = [
    { icon: Sparkles, text: 'AI-powered music creation' },
    { icon: Music, text: '1000+ professional plugins' },
    { icon: TrendingUp, text: '10x growth acceleration' },
    { icon: Users, text: 'Automated social media' },
    { icon: DollarSign, text: 'Revenue optimization' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex">
      {/* Left Panel - Value Proposition */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-cyan-600 p-12 text-white">
        <div className="flex flex-col justify-center">
          <Logo size="lg" className="mb-8" />
          <h1 className="text-4xl font-bold mb-6">Start Your Music Empire Today</h1>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of artists using AI to 10x their career growth
          </p>

          <div className="space-y-4 mb-8">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <benefit.icon className="w-5 h-5" />
                </div>
                <span className="text-lg">{benefit.text}</span>
              </div>
            ))}
          </div>

          <div className="bg-white/10 rounded-lg p-6 backdrop-blur-sm">
            <div className="flex items-center space-x-2 mb-3">
              <Shield className="w-5 h-5" />
              <span className="font-semibold">90-Day Money Back Guarantee</span>
            </div>
            <p className="text-sm opacity-80">
              Purchase Max Booster with confidence. If you're not completely satisfied within 90
              days, get a full refund - no questions asked!
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Registration Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md dark:bg-gray-900 dark:border-gray-700">
          <CardHeader className="text-center">
            <div className="lg:hidden mb-4">
              <Logo size="md" />
            </div>
            <CardTitle className="text-2xl dark:text-white">Create Your Account</CardTitle>
            <CardDescription className="space-y-2 dark:text-gray-400">
              <span>Start your journey to music success</span>
              <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border-green-300 dark:border-green-700 px-3 py-1">
                <Shield className="w-4 h-4 mr-1" />
                90-Day Money Back Guarantee
              </Badge>
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* Guarantee Info Box */}
            <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-green-800 dark:text-green-300">100% Risk-Free</p>
                  <p className="text-green-700 dark:text-green-400">
                    Your purchase is protected for 90 days. If you're not satisfied, get a full
                    refund - no questions asked.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Choose a unique username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  required
                  disabled={isLoading}
                  data-testid="input-username"
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  disabled={isLoading}
                  data-testid="input-email"
                />
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  disabled={isLoading}
                  data-testid="input-password"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  disabled={isLoading}
                  data-testid="input-confirm-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                disabled={isLoading}
                data-testid="button-create-account"
              >
                {isLoading ? 'Creating Account...' : 'Create Your Account'}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <Separator className="my-4" />

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignup}
              data-testid="button-google-signup"
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              Sign up with Google
            </Button>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <div className="flex items-center justify-center text-xs text-green-600 dark:text-green-400">
              <Clock className="w-3 h-3 mr-1" />
              <span>90-day money back guarantee applies to all plans</span>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="hover:underline">
                Privacy Policy
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
