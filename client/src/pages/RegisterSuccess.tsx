import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { apiRequest, ApiError } from "@/lib/queryClient";
import {
  parseRegistrationCompletionPayload,
  parseVerificationPayload,
  readRegistrationCompletionPayload,
  validateCheckoutSessionId,
  validateRegistrationPassword,
} from "@/lib/registrationCompletion";

export default function RegisterSuccess() {
  const [, navigate] = useLocation();
  const searchParams = useMemo(
    () => new URLSearchParams(window.location.search),
    [],
  );
  const rawSessionId = searchParams.get("session_id");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [paymentValid, setPaymentValid] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [completionAttention, setCompletionAttention] = useState("");
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      navigate("/dashboard");
      return;
    }

    let sessionId: string;
    try {
      sessionId = validateCheckoutSessionId(rawSessionId);
    } catch (error) {
      setPaymentValid(false);
      setVerificationError(
        error instanceof Error
          ? error.message
          : "Invalid payment session. Please return to pricing.",
      );
      setIsVerifying(false);
      return;
    }

    let cancelled = false;
    setIsVerifying(true);
    setPaymentValid(false);
    setVerificationError("");

    void (async () => {
      try {
        const response = await apiRequest(
          "POST",
          "/api/verify-checkout-session",
          { sessionId },
        );
        const payload = await readRegistrationCompletionPayload(response);
        parseVerificationPayload(payload);
        if (!cancelled) {
          setPaymentValid(true);
          setIsVerifying(false);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof ApiError
            ? error.userMessage || error.message
            : error instanceof Error
              ? error.message
              : "Unable to verify your payment. Please try again.";
        setPaymentValid(false);
        setVerificationError(message);
        setIsVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, navigate, rawSessionId, user, verificationAttempt]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading || !paymentValid) return;

    setCompletionAttention("");
    setIsLoading(true);

    try {
      const sessionId = validateCheckoutSessionId(rawSessionId);
      validateRegistrationPassword(password, confirmPassword);

      const response = await apiRequest("POST", "/api/register-after-payment", {
        sessionId,
        password,
        // Legal acceptance is required before Stripe checkout on RegisterPayment.
        // The completion boundary records that acceptance as durable evidence.
        tosAccepted: true,
        privacyAccepted: true,
        marketingConsent,
      });
      const payload = await readRegistrationCompletionPayload(response);
      parseRegistrationCompletionPayload(payload);

      toast({
        title: "Welcome to Max Booster!",
        description:
          "Your paid account is complete and your registration preferences were saved.",
      });
      window.location.assign("/dashboard");
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.userMessage || error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Please try again.";
      const rawMessage = error instanceof Error ? error.message : message;

      if (/Account already exists with this email/i.test(rawMessage)) {
        toast({
          title: "Account Already Created",
          description: "Your payment is associated with an existing account. Please sign in.",
        });
        navigate("/login?redirect=%2Fdashboard");
        return;
      }

      if (/Account created but registration finalization failed/i.test(rawMessage)) {
        setCompletionAttention(
          "Your paid account was created, but its registration record needs attention. Sign in, then contact support so we can verify the consent record before you continue.",
        );
      } else {
        toast({
          title: "Account Creation Failed",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || isVerifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Verifying Payment...
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Please wait while we confirm your Stripe payment session.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!paymentValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Payment Verification Failed
            </h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {verificationError ||
                "We couldn't verify your payment. Please try again."}
            </p>
            <div className="space-y-3">
              {rawSessionId && (
                <Button
                  onClick={() => setVerificationAttempt((value) => value + 1)}
                  className="w-full"
                  data-testid="button-retry-verification"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Verification
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => navigate("/pricing")}
                className="w-full"
                data-testid="button-back-to-pricing"
              >
                Back to Pricing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (completionAttention) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-4">Registration Needs Attention</h1>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              {completionAttention}
            </p>
            <div className="space-y-3">
              <Button
                className="w-full"
                onClick={() => navigate("/login?redirect=%2Fdashboard")}
              >
                Sign In
              </Button>
              <Link href="/help">
                <Button variant="outline" className="w-full">
                  Contact Support
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800">
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Logo size="sm" />
          </div>
        </div>
      </nav>

      <div className="max-w-md mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl font-bold">
              Payment Verified
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Create your password to finish your Max Booster account. Your
              subscription access is finalized with this registration step.
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
                    type={showPassword ? "text" : "password"}
                    placeholder="8-72 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword((value) => !value)}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={
                      showConfirmPassword
                        ? "Hide password confirmation"
                        : "Show password confirmation"
                    }
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword((value) => !value)}
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

              <div className="rounded-lg border p-4 text-sm text-gray-600 dark:text-gray-300">
                The Terms of Service and Privacy Policy were accepted before
                secure payment. You can review them anytime in{" "}
                <Link href="/terms" className="text-primary hover:underline">
                  Terms
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy
                </Link>
                .
              </div>

              <div className="flex items-start space-x-3">
                <Checkbox
                  id="marketingConsent"
                  checked={marketingConsent}
                  onCheckedChange={(checked) =>
                    setMarketingConsent(checked === true)
                  }
                  data-testid="checkbox-marketing"
                  className="mt-1"
                />
                <Label
                  htmlFor="marketingConsent"
                  className="text-sm leading-relaxed cursor-pointer font-normal"
                >
                  I would like to receive marketing emails and promotional
                  offers (optional)
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                size="lg"
                disabled={isLoading}
                data-testid="button-complete-registration"
              >
                {isLoading ? (
                  <span className="flex items-center space-x-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    <span>Creating Account...</span>
                  </span>
                ) : (
                  "Complete Registration"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
