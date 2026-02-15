import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/ui/Logo';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const { toast } = useToast();

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Please enter a valid email address';
    return undefined;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) {
      const error = validateEmail(value);
      setEmailError(error || '');
    }
  };

  const handleEmailBlur = () => {
    const error = validateEmail(email);
    setEmailError(error || '');
  };

  const startResendCooldown = () => {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const error = validateEmail(email);
    if (error) {
      setEmailError(error);
      return;
    }
    
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.status === 429) {
        toast({
          title: 'Too Many Requests',
          description: 'You have made too many password reset requests. Please wait a few minutes before trying again.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send reset link');
      }

      setSubmitted(true);
      startResendCooldown();
      toast({
        title: 'Reset Link Sent',
        description: 'Check your email for password reset instructions.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Request Sent',
        description: 'If an account exists with this email, you will receive a password reset link.',
      });
      setSubmitted(true);
      startResendCooldown();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.status === 429) {
        toast({
          title: 'Too Many Requests',
          description: 'Please wait before requesting another reset link.',
          variant: 'destructive',
        });
      } else {
        startResendCooldown();
        toast({
          title: 'Email Resent',
          description: 'A new password reset link has been sent to your email.',
        });
      }
    } catch (error) {
      toast({
        title: 'Resend Failed',
        description: 'Could not resend the reset link. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 sm:p-6">
        <Link href="/">
          <div className="cursor-pointer">
            <Logo size="md" />
          </div>
        </Link>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
        <Card className="w-full max-w-md dark:bg-gray-900 dark:border-gray-700">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl dark:text-white">
              {!submitted ? 'Forgot Password?' : 'Check Your Email'}
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {!submitted
                ? "Enter your email and we'll send you a reset link"
                : "We've sent password reset instructions to your email"}
            </p>
          </CardHeader>
          <CardContent>
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    onBlur={handleEmailBlur}
                    disabled={loading}
                    autoComplete="email"
                    data-testid="input-forgot-password-email"
                    className={emailError ? 'border-destructive' : ''}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                  {emailError && (
                    <p id="email-error" className="text-sm text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {emailError}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !!emailError}
                  data-testid="button-send-reset-link"
                >
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </Button>
                <div className="text-center">
                  <Link href="/login">
                    <Button variant="link" className="text-sm" data-testid="link-back-to-login">
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-6">
                <CheckCircle className="h-16 w-16 text-green-600 mx-auto" />
                <div>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">We've sent a password reset link to:</p>
                  <p className="font-medium text-gray-900 dark:text-white mb-6">{email}</p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left">
                    <div className="flex items-start gap-2">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-300">Link expires in 1 hour</p>
                        <p className="text-amber-700 dark:text-amber-400 mt-1">
                          Can't find it? Check your spam folder or request a new link below.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Link href="/login">
                    <Button className="w-full" data-testid="button-back-to-login">
                      Back to Login
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleResend}
                    disabled={loading || resendCooldown > 0}
                    data-testid="button-resend-email"
                  >
                    {resendCooldown > 0 ? (
                      <>
                        <Clock className="h-4 w-4 mr-2" />
                        Resend in {resendCooldown}s
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Resend Email
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground"
                    onClick={() => {
                      setSubmitted(false);
                      setEmail('');
                      setEmailError('');
                    }}
                    data-testid="button-try-different-email"
                  >
                    Try a different email
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
