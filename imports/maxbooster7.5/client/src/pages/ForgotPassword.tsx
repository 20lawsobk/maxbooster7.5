import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Logo } from "@/components/ui/Logo";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

async function requestPasswordReset(email: string): Promise<void> {
  const response = await fetch("/api/auth/forgot-password", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email: email.trim() }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (response.status === 429) {
    throw new Error("Too many password reset requests. Please wait a few minutes before trying again.");
  }
  const body = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (!response.ok || body.success !== true) {
    throw new Error(
      typeof body.message === "string" && body.message
        ? body.message
        : `Unable to confirm the reset request (${response.status}). Please try again.`,
    );
  }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const requestInFlight = useRef(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const { toast } = useToast();

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
      }
    };
  }, []);

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))
      return "Please enter a valid email address";
    return undefined;
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) {
      const error = validateEmail(value);
      setEmailError(error || "");
    }
  };

  const handleEmailBlur = () => {
    const error = validateEmail(email);
    setEmailError(error || "");
  };

  const startResendCooldown = () => {
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
    }
    setResendCooldown(60);
    resendIntervalRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (resendIntervalRef.current) {
            clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestInFlight.current) return;

    const error = validateEmail(email);
    if (error) {
      setEmailError(error);
      return;
    }

    requestInFlight.current = true;
    setRequestError("");
    setLoading(true);

    try {
      await requestPasswordReset(email);

      setEmail(email.trim());
      setSubmitted(true);
      startResendCooldown();
      toast({
        title: "Reset Request Received",
        description: "If an account exists for that email, check its inbox for reset instructions.",
      });
    } catch (error: unknown) {
      setRequestError(error instanceof Error ? error.message : "Unable to send the reset link. Please try again.");
      toast({
        title: "Unable to Send Reset Link",
        description:
          error instanceof Error
            ? error.message
            : "Unable to send the reset link. Please try again.",
        variant: "destructive",
      });
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (requestInFlight.current || resendCooldown > 0) return;
    requestInFlight.current = true;
    setRequestError("");
    setLoading(true);

    try {
      await requestPasswordReset(email);

      startResendCooldown();
      toast({
        title: "Reset Request Received",
        description: "If an account exists for that email, check its inbox for a new reset link.",
      });
    } catch (error: unknown) {
      setRequestError(error instanceof Error ? error.message : "Could not resend the reset link. Please try again.");
      toast({
        title: "Resend Failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not resend the reset link. Please try again.",
        variant: "destructive",
      });
    } finally {
      requestInFlight.current = false;
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
              {!submitted ? "Forgot Password?" : "Check Your Email"}
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {!submitted
                ? "Enter your email and we'll send you a reset link"
                : "If an account exists for that email, you'll receive reset instructions."}
            </p>
          </CardHeader>
          <CardContent>
            {requestError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            )}
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
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
                    className={emailError ? "border-destructive" : ""}
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? "email-error" : undefined}
                  />
                  {emailError && (
                    <p
                      id="email-error"
                      className="text-sm text-destructive flex items-center gap-1"
                    >
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
                  {loading ? "Sending..." : "Send Reset Link"}
                </Button>
                <div className="text-center">
                  <Link href="/login">
                    <Button
                      type="button"
                      variant="link"
                      className="text-sm"
                      data-testid="link-back-to-login"
                    >
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
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    If an account exists, reset instructions will be sent to:
                  </p>
                  <p className="font-medium text-gray-900 dark:text-white mb-6">
                    {email}
                  </p>
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left">
                    <div className="flex items-start gap-2">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-amber-800 dark:text-amber-300">
                          Link expires in 1 hour
                        </p>
                        <p className="text-amber-700 dark:text-amber-400 mt-1">
                          Can't find it? Check your spam folder or request a new
                          link below.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Link href="/login">
                    <Button
                      className="w-full"
                      data-testid="button-back-to-login"
                    >
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
                    {loading ? "Sending..." : resendCooldown > 0 ? (
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
                    disabled={loading}
                    onClick={() => {
                      setSubmitted(false);
                      setEmail("");
                      setEmailError("");
                      setRequestError("");
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
