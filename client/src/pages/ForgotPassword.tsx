import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo } from '@/components/ui/Logo';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send reset link');
      }

      setSubmitted(true);
      toast({
        title: 'Reset Link Sent',
        description: data.message || 'Check your email for password reset instructions.',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send reset link. Please try again.',
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
                <div>
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    data-testid="input-forgot-password-email"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    The link will expire in 1 hour. Check your spam folder if you don't see it.
                  </p>
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
                    onClick={() => {
                      setSubmitted(false);
                      setEmail('');
                    }}
                    data-testid="button-resend-email"
                  >
                    Resend Email
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
