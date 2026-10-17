import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, Eye, EyeOff } from "lucide-react";
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
  const sessionId = rawSessionId?.trim() ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [paymentValid, setPaymentValid] = useState(false);
  const [verificationError, setVerificationError] = useState("");
  const [formError, setFormError] = useState("");
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const verificationRequest = useRef<Promise<void> | null>(null);
  const submitting = useRef(false);
  const { toast } = useToast();
  const { user, isLoading: authLoading, authenticate } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!sessionId || sessionId.length > 255 || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
      setVerificationError("No valid payment session found. If you already paid, contact support before purchasing again.");
      setIsVerifying(false);
      return;
    }

    // If user is already logged in, redirect to dashboard
    if (user) {
      navigate("/dashboard");
      return;
    }

    let cancelled = false;
    setIsVerifying(true);
    setPaymentValid(false);
    setVerificationError("");

    void (async () => {
      try {
        if (!verificationRequest.current) {
          verificationRequest.current = (async () => {
            const response = await apiRequest("POST", "/api/verify-checkout-session", { sessionId });
            const data = await readRegistrationCompletionPayload(response);
            try {
              parseVerificationPayload(data);
            } catch {
              throw new Error("Payment could not be verified. Please contact support before purchasing again.");
            }
          })();
        }
        await verificationRequest.current;
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
  }, [sessionId, user?.id, authLoading, navigate, verificationAttempt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    if (!paymentValid || isVerifying || !sessionId || authLoading || user) return;
    submitting.current = true;
    setIsLoading(true);
    setFormError("");

    try {
      const sessionId = validateCheckoutSessionId(rawSessionId);
      validateRegistrationPassword(password, confirmPassword);

      if (!tosAccepted) {
        throw new Error("You must accept the Terms of Service to continue");
      }

      if (!privacyAccepted) {
        throw new Error("You must accept the Privacy Policy to continue");
      }

      // Create account after payment verification
      // Note: birthdate is retrieved from Stripe session metadata (collected before payment)
      // This endpoint actually creates a login session. Its legacy payload nests
      // the authenticated identity under user; adapt that identity, not a checkout
      // receipt, for the provider's cleanup + independent /auth/me verification.
      await authenticate(async () => {
        const response = await apiRequest("POST", "/api/register-after-payment", {
          sessionId, password, tosAccepted, privacyAccepted, marketingConsent,
        });
        const payload = await readRegistrationCompletionPayload(response);
        const { userId } = parseRegistrationCompletionPayload(payload);
        return { response, data: { ...(payload as Record<string, unknown>), id: userId } };
      });
        toast({
          title: "Welcome to Max Booster!",
          description: "Your account has been created and your sign-in verified.",
        });
        navigate("/dashboard");
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
      toast({
        title: "Registration needs attention",
        description: errorMessage,
        variant: "destructive",
      });
      setFormError(errorMessage);
    } finally {
      submitting.current = false;
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
            <p role="alert" className="text-gray-600 mb-6">
              {verificationError || "We couldn't verify your payment. Please try again."}
            </p>
            {sessionId && /^cs_[A-Za-z0-9_]+$/.test(sessionId) && (
              <Button className="mb-3" onClick={() => {
                verificationRequest.current = null;
                setVerificationAttempt(attempt => attempt + 1);
              }}>Retry Verification</Button>
            )}
            <p className="text-sm mb-4">Already paid? <a className="underline" href="/help">Contact support</a> before starting another purchase. Already registered? <a className="underline" href="/login">Sign in</a>.</p>
            <Button
              onClick={() => navigate("/pricing")}
              data-testid="button-back-to-pricing"
            >
              Back to Pricing
            </Button>
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
            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
              {formError && <p role="alert" className="text-sm text-red-600">{formError} <a href="/login" className="underline">Sign in</a> or <a href="/help" className="underline">contact support</a> if your account was already created.</p>}
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
                    autoComplete="new-password"
                    data-testid="input-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-pressed={showPassword}
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
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-pressed={showConfirmPassword}
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
                    onCheckedChange={(checked) =>
                      setTosAccepted(checked === true)
                    }
                    data-testid="checkbox-tos"
                    className="mt-1"
                  />
                  <Label
                    htmlFor="tosAccepted"
                    className="text-sm leading-relaxed cursor-pointer"
                  >
                    I have read and agree to the{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Terms of Service
                    </a>
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
                </div>

                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="privacyAccepted"
                    checked={privacyAccepted}
                    onCheckedChange={(checked) =>
                      setPrivacyAccepted(checked === true)
                    }
                    data-testid="checkbox-privacy"
                    className="mt-1"
                  />
                  <Label
                    htmlFor="privacyAccepted"
                    className="text-sm leading-relaxed cursor-pointer"
                  >
                    I have read and agree to the{" "}
                    <a
                      href="/privacy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    >
                      Privacy Policy
                    </a>
                    <span className="text-red-500 ml-1">*</span>
                  </Label>
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
                    className="text-sm leading-relaxed cursor-pointer"
                  >
                    I would like to receive marketing emails and promotional
                    offers (optional)
                  </Label>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
                size="lg"
                disabled={isLoading || !tosAccepted || !privacyAccepted}
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

            <div className="text-center text-xs text-gray-500 mt-4">
              <p>Your payment is verified. Complete registration to access your account.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
