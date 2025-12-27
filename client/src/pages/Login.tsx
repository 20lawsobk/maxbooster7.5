import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useRedirectIfAuthenticated } from '@/hooks/useRequireAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Logo } from '@/components/ui/Logo';
import { Eye, EyeOff } from 'lucide-react';
import { GoogleIcon } from '@/components/ui/brand-icons';

export default function Login() {
  const { user: authUser, isLoading: authLoading } = useRedirectIfAuthenticated();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Show loading spinner while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          username, 
          password,
          twoFactorCode: requiresTwoFactor ? twoFactorCode : undefined
        }),
      });
      
      const data = await response.json();
      
      if (data.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        toast({
          title: '2FA Required',
          description: 'Please enter your authenticator code.',
        });
        return;
      }
      
      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }
      
      toast({
        title: 'Welcome back!',
        description: "You've successfully signed in.",
      });
      window.location.href = '/dashboard';
    } catch (error: unknown) {
      const err = error as Error;
      toast({
        title: 'Login Failed',
        description: err.message || 'Invalid credentials. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50/30 via-white to-purple-50/30 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/80 dark:bg-gray-800 dark:border dark:border-gray-700 backdrop-blur-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Logo size="lg" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-amber-500 to-purple-600 bg-clip-text text-transparent">
            Sign In
          </CardTitle>
          <CardDescription className="text-gray-600 dark:text-muted-foreground">Welcome back to Max Booster</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={requiresTwoFactor}
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={requiresTwoFactor}
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                  disabled={requiresTwoFactor}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {requiresTwoFactor && (
              <div className="space-y-2">
                <Label htmlFor="twoFactorCode">Authenticator Code</Label>
                <Input
                  id="twoFactorCode"
                  data-testid="input-2fa-code"
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-login-submit"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          <div className="text-center">
            <Link href="/forgot-password">
              <Button variant="link" size="sm" data-testid="link-forgot-password">
                Forgot your password?
              </Button>
            </Link>
          </div>

          <Separator />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            data-testid="button-google-login"
          >
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{' '}
            <Link href="/pricing">
              <Button variant="link" size="sm" className="p-0" data-testid="link-signup">
                Sign up here
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
