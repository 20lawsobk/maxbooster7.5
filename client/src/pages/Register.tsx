import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Logo } from "@/components/ui/Logo";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
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
  AlertCircle,
  Eye,
  EyeOff,
  X,
  Mic2,
} from "lucide-react";
import { GoogleIcon } from "@/components/ui/brand-icons";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { ACCOUNT_AGE_REQUIREMENT, getAccountEligibilityError } from "@shared/agePolicy";

interface FieldErrors {
  birthdate?: string;
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  termsAccepted?: string;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  requirements: { met: boolean; text: string }[];
}

const getPasswordStrength = (password: string): PasswordStrength => {
  const requirements = [
    { met: password.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(password), text: "One uppercase letter" },
    { met: /[a-z]/.test(password), text: "One lowercase letter" },
    { met: /[0-9]/.test(password), text: "One number" },
    { met: /[^A-Za-z0-9]/.test(password), text: "One special character" },
  ];

  const score = requirements.filter((r) => r.met).length;

  if (score <= 1)
    return { score, label: "Weak", color: "bg-red-500", requirements };
  if (score <= 2)
    return { score, label: "Fair", color: "bg-orange-500", requirements };
  if (score <= 3)
    return { score, label: "Good", color: "bg-yellow-500", requirements };
  if (score <= 4)
    return { score, label: "Strong", color: "bg-green-500", requirements };
  return { score, label: "Very Strong", color: "bg-green-600", requirements };
};

const OAUTH_ERROR_MESSAGES: Record<
  string,
  { title: string; description: string }
> = {
  google_not_configured: {
    title: "Google Signup Unavailable",
    description:
      "Google sign-up is not configured. Please use email and password.",
  },
  google_denied: {
    title: "Access Denied",
    description: "You cancelled the Google sign-up or denied access.",
  },
  oauth_error: {
    title: "OAuth Error",
    description: "An error occurred during Google sign-up. Please try again.",
  },
  eligibility_required: {
    title: "Date of Birth Required",
    description: "To create a new Google account, enter your date of birth below and continue with Google. You must be at least 16.",
  },
};

async function readRegistrationResponse(response: Response): Promise<Record<string, unknown>> {
  const data: unknown = await response.json().catch(() => null);
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

function getRegistrationFieldError(message: string): "email" | "username" | undefined {
  const lower = message.toLowerCase();
  if (lower.includes("email") && (lower.includes("already registered") || lower.includes("already exists"))) return "email";
  if (lower.includes("username") && (lower.includes("already taken") || lower.includes("already exists"))) return "username";
  return undefined;
}

export default function Register() {
  const [, navigate] = useLocation();
  const { user: authenticatedUser, isLoading: authLoading, authenticate } = useAuth();
  const { toast } = useToast();
  const requestInFlight = useRef(false);

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    artistName: "",
    birthdate: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    if (!authLoading && authenticatedUser) navigate("/dashboard");
  }, [authenticatedUser, authLoading, navigate]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error && OAUTH_ERROR_MESSAGES[error]) {
      const { title, description } = OAUTH_ERROR_MESSAGES[error];
      toast({ title, description, variant: "destructive" });
      urlParams.delete("error");
      window.history.replaceState({}, "", `${window.location.pathname}${urlParams.size ? `?${urlParams}` : ""}${window.location.hash}`);
    }
  }, [toast]);

  const passwordStrength = useMemo(
    () => getPasswordStrength(formData.password),
    [formData.password],
  );

  const validateField = (
    field: keyof typeof formData,
    value: string,
  ): string | undefined => {
    switch (field) {
      case "birthdate":
        return getAccountEligibilityError(value);
      case "username":
        if (!value.trim()) return "Username is required";
        if (value.length < 3) return "Username must be at least 3 characters";
        if (value.length > 30)
          return "Username must be 30 characters or fewer";
        if (!/^[a-zA-Z0-9_]+$/.test(value))
          return "Username can only contain letters, numbers, and underscores";
        return undefined;
      case "email":
        if (!value.trim()) return "Email is required";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          return "Please enter a valid email address";
        return undefined;
      case "password":
        if (!value) return "Password is required";
        if (value.length < 8) return "Password must be at least 8 characters";
        return undefined;
      case "confirmPassword":
        if (!value) return "Please confirm your password";
        if (value !== formData.password) return "Passwords do not match";
        return undefined;
      default:
        return undefined;
    }
  };

  const handleBlur = (field: keyof typeof formData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validateField(field, formData[field]);
    setFieldErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) {
      const error = validateField(field, value);
      setFieldErrors((prev) => ({ ...prev, [field]: error }));
    }
    if (
      field === "password" &&
      touched.confirmPassword &&
      formData.confirmPassword
    ) {
      const confirmError =
        value !== formData.confirmPassword
          ? "Passwords do not match"
          : undefined;
      setFieldErrors((prev) => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const validateForm = (): boolean => {
    const errors: FieldErrors = {
      birthdate: validateField("birthdate", formData.birthdate),
      username: validateField("username", formData.username),
      email: validateField("email", formData.email),
      password: validateField("password", formData.password),
      confirmPassword: validateField(
        "confirmPassword",
        formData.confirmPassword,
      ),
      termsAccepted: !termsAccepted
        ? "You must accept the Terms of Service and Privacy Policy"
        : undefined,
    };
    setFieldErrors(errors);
    setTouched({
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
      termsAccepted: true,
      birthdate: true,
    });
    return !Object.values(errors).some((error) => error !== undefined);
  };

  const getEnhancedErrorMessage = (message: string, status: number): string => {
    const lowerMessage = message.toLowerCase();
    if (status === 429)
      return "Too many registration attempts. Please wait a few minutes before trying again.";
    if (getRegistrationFieldError(message) === "email")
      return "This email is already registered. Please sign in or use a different email.";
    if (
      lowerMessage.includes("username") &&
      (lowerMessage.includes("exists") || lowerMessage.includes("taken"))
    )
      return "This username is already taken. Please choose a different one.";
    if (lowerMessage.includes("password") && lowerMessage.includes("weak"))
      return "Please choose a stronger password with at least 8 characters, including uppercase, lowercase, and numbers.";
    return message;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestInFlight.current) return;
    setError("");

    if (!validateForm()) {
      return;
    }

    requestInFlight.current = true;
    setIsLoading(true);

    try {
      const { response, data } = await authenticate(async () => {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(formData),
        });
        const data = await readRegistrationResponse(response);
        return { response, data };
      });

      if (!response.ok) {
        const message = typeof data.message === "string" && data.message
          ? data.message
          : `Registration failed (${response.status}). Please try again.`;
        const enhancedMessage = getEnhancedErrorMessage(
          message,
          response.status,
        );
        setError(enhancedMessage);

        if (getRegistrationFieldError(message) === "email") {
          setFieldErrors((prev) => ({
            ...prev,
            email: "This email is already registered",
          }));
        } else if (getRegistrationFieldError(message) === "username") {
          setFieldErrors((prev) => ({
            ...prev,
            username: "This username is already taken",
          }));
        }
        setIsLoading(false);
        return;
      }

      if (typeof data.id !== "string" || !data.id) {
        setError("The server returned an invalid registration response. Please try signing in before registering again.");
        return;
      }

      toast({
        title: "Account created successfully!",
        description: "Welcome to Max Booster! Let's get started.",
      });
      navigate("/dashboard");
    } catch (error: unknown) {
      setError(
        error instanceof Error && error.message
          ? error.message
          : "Unable to connect to the server. Please check your internet connection and try again.",
      );
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    if (requestInFlight.current || !termsAccepted) return;
    const birthdateError = getAccountEligibilityError(formData.birthdate);
    setTouched((prev) => ({ ...prev, birthdate: true }));
    setFieldErrors((prev) => ({ ...prev, birthdate: birthdateError }));
    if (birthdateError) return;
    requestInFlight.current = true;
    setIsLoading(true);
    setIsGoogleLoading(true);
    setError("");
    try {
      let csrfToken = getCsrfTokenFromCookie();
      if (!csrfToken) {
        const csrfResponse = await fetch("/api/csrf-token", {
          credentials: "include", signal: AbortSignal.timeout(30_000),
        });
        const csrfData = await readRegistrationResponse(csrfResponse);
        if (!csrfResponse.ok || typeof csrfData.csrfToken !== "string" || !csrfData.csrfToken) {
          throw new Error("Unable to establish the signup security token. Please refresh and try again.");
        }
        csrfToken = csrfData.csrfToken;
      }
      const response = await fetch("/api/auth/google/signup", {
        method: "POST",
        credentials: "include",
        signal: AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ birthdate: formData.birthdate }),
      });
      const data = await readRegistrationResponse(response);
      if (!response.ok || data.success !== true) {
        throw new Error(typeof data.message === "string" ? data.message : "Unable to confirm signup eligibility. Please try again.");
      }
      window.location.href = "/api/auth/google";
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Unable to prepare Google signup. Please try again.");
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
      setIsGoogleLoading(false);
    }
  };

  const benefits = [
    { icon: Sparkles, text: "AI-powered music creation" },
    { icon: Music, text: "1000+ professional plugins" },
    { icon: TrendingUp, text: "10x growth acceleration" },
    { icon: Users, text: "Automated social media" },
    { icon: DollarSign, text: "Revenue optimization" },
  ];

  if (authLoading || authenticatedUser) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status">
        Checking authentication...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex">
      {/* Left Panel - Value Proposition */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-cyan-600 p-12 text-white">
        <div className="flex flex-col justify-center">
          <Logo size="lg" className="mb-8" />
          <h1 className="text-4xl font-bold mb-6">
            Start Your Music Empire Today
          </h1>
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
              Purchase Max Booster with confidence. If you're not completely
              satisfied within 90 days, get a full refund - no questions asked!
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
            <CardTitle className="text-2xl dark:text-white">
              Create Your Account
            </CardTitle>
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
                  <p className="font-semibold text-green-800 dark:text-green-300">
                    100% Risk-Free
                  </p>
                  <p className="text-green-700 dark:text-green-400">
                    Your purchase is protected for 90 days. If you're not
                    satisfied, get a full refund - no questions asked.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
              <div className="space-y-1">
                <Label htmlFor="birthdate">Date of Birth</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={formData.birthdate}
                  onChange={(e) => handleChange("birthdate", e.target.value)}
                  onBlur={() => handleBlur("birthdate")}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                  disabled={isLoading}
                  autoComplete="bday"
                  data-testid="input-birthdate"
                  aria-invalid={!!(fieldErrors.birthdate && touched.birthdate)}
                  aria-describedby={fieldErrors.birthdate ? "birthdate-policy birthdate-error" : "birthdate-policy"}
                />
                <p id="birthdate-policy" className="text-xs text-muted-foreground">
                  {ACCOUNT_AGE_REQUIREMENT}. Required for email and Google signup.
                </p>
                {fieldErrors.birthdate && touched.birthdate && (
                  <p id="birthdate-error" className="text-sm text-destructive" role="alert">
                    {fieldErrors.birthdate}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Choose a unique username"
                  value={formData.username}
                  onChange={(e) => handleChange("username", e.target.value)}
                  onBlur={() => handleBlur("username")}
                  required
                  disabled={isLoading}
                  autoComplete="username"
                  data-testid="input-username"
                  className={
                    fieldErrors.username && touched.username
                      ? "border-destructive"
                      : ""
                  }
                  aria-invalid={!!(fieldErrors.username && touched.username)}
                  aria-describedby={
                    fieldErrors.username ? "username-error" : undefined
                  }
                />
                {fieldErrors.username && touched.username && (
                  <p
                    id="username-error"
                    className="text-sm text-destructive flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.username}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="artistName"
                  className="flex items-center gap-1.5"
                >
                  <Mic2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Artist / Producer Name
                  <span className="text-xs text-muted-foreground font-normal">
                    (optional — powers auto-discovery)
                  </span>
                </Label>
                <Input
                  id="artistName"
                  type="text"
                  placeholder="Your stage name or producer alias"
                  value={formData.artistName}
                  onChange={(e) => handleChange("artistName", e.target.value)}
                  disabled={isLoading}
                  autoComplete="nickname"
                  data-testid="input-artist-name"
                />
                <p className="text-xs text-muted-foreground">
                  We'll automatically find your profiles on Spotify, Apple Music
                  &amp; Deezer.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  onBlur={() => handleBlur("email")}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                  data-testid="input-email"
                  className={
                    fieldErrors.email && touched.email
                      ? "border-destructive"
                      : ""
                  }
                  aria-invalid={!!(fieldErrors.email && touched.email)}
                  aria-describedby={
                    fieldErrors.email ? "email-error" : undefined
                  }
                />
                {fieldErrors.email && touched.email && (
                  <p
                    id="email-error"
                    className="text-sm text-destructive flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => handleChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    required
                    disabled={isLoading}
                    autoComplete="new-password"
                    data-testid="input-password"
                    className={`pr-10 ${fieldErrors.password && touched.password ? "border-destructive" : ""}`}
                    aria-invalid={!!(fieldErrors.password && touched.password)}
                    aria-describedby={[
                      formData.password ? "password-strength" : "",
                      fieldErrors.password && touched.password ? "password-error" : "",
                    ].filter(Boolean).join(" ") || undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    data-testid="button-toggle-password"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {formData.password && (
                  <div id="password-strength" className="space-y-2 mt-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{
                            width: `${(passwordStrength.score / 5) * 100}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          passwordStrength.score <= 2
                            ? "text-red-600"
                            : passwordStrength.score <= 3
                              ? "text-yellow-600"
                              : "text-green-600"
                        }`}
                      >
                        {passwordStrength.label}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {passwordStrength.requirements.map((req, i) => (
                        <div
                          key={i}
                          className={`text-xs flex items-center gap-1 ${req.met ? "text-green-600" : "text-gray-500"}`}
                        >
                          {req.met ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          {req.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {fieldErrors.password && touched.password && (
                  <p
                    id="password-error"
                    className="text-sm text-destructive flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) =>
                      handleChange("confirmPassword", e.target.value)
                    }
                    onBlur={() => handleBlur("confirmPassword")}
                    required
                    disabled={isLoading}
                    autoComplete="new-password"
                    data-testid="input-confirm-password"
                    className={`pr-10 ${fieldErrors.confirmPassword && touched.confirmPassword ? "border-destructive" : ""}`}
                    aria-invalid={
                      !!(fieldErrors.confirmPassword && touched.confirmPassword)
                    }
                    aria-describedby={
                      fieldErrors.confirmPassword
                        ? "confirm-password-error"
                        : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isLoading}
                    aria-label={showConfirmPassword ? "Hide confirmed password" : "Show confirmed password"}
                    data-testid="button-toggle-confirm-password"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {formData.confirmPassword &&
                  formData.password === formData.confirmPassword && (
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" />
                      Passwords match
                    </p>
                  )}
                {fieldErrors.confirmPassword && touched.confirmPassword && (
                  <p
                    id="confirm-password-error"
                    className="text-sm text-destructive flex items-center gap-1"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="terms"
                    disabled={isLoading}
                    aria-invalid={!!fieldErrors.termsAccepted}
                    checked={termsAccepted}
                    onCheckedChange={(checked) => {
                      setTermsAccepted(checked === true);
                      if (fieldErrors.termsAccepted) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          termsAccepted: undefined,
                        }));
                      }
                    }}
                    data-testid="checkbox-terms"
                    aria-describedby={
                      fieldErrors.termsAccepted ? "terms-error" : undefined
                    }
                    className="mt-0.5"
                  />
                  <Label
                    htmlFor="terms"
                    className="text-sm font-normal leading-tight cursor-pointer"
                  >
                    I agree to the{" "}
                    <Link
                      href="/terms"
                      className="text-primary hover:underline"
                    >
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      href="/privacy"
                      className="text-primary hover:underline"
                    >
                      Privacy Policy
                    </Link>
                  </Label>
                </div>
                {fieldErrors.termsAccepted && touched.termsAccepted && (
                  <p
                    id="terms-error"
                    className="text-sm text-destructive flex items-center gap-1 ml-6"
                  >
                    <AlertCircle className="h-3 w-3" />
                    {fieldErrors.termsAccepted}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                disabled={
                  isLoading ||
                  !termsAccepted ||
                  (Object.keys(touched).length > 0 &&
                    Object.values(fieldErrors).some((e) => e))
                }
                data-testid="button-create-account"
              >
                {isLoading ? (isGoogleLoading ? "Preparing Google Signup..." : "Creating Account...") : "Create Your Account"}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <Separator className="my-4" />

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignup}
              disabled={isLoading || !termsAccepted}
              data-testid="button-google-signup"
            >
              <GoogleIcon className="mr-2 h-4 w-4" />
              {isGoogleLoading ? "Preparing Google Signup..." : "Sign up with Google"}
            </Button>
          </CardContent>

          <CardFooter className="flex flex-col space-y-3">
            <div className="flex items-center justify-center text-xs text-green-600 dark:text-green-400">
              <Clock className="w-3 h-3 mr-1" />
              <span>90-day money back guarantee applies to all plans</span>
            </div>
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Sign in
              </Link>
            </div>
            <div className="text-center text-xs text-muted-foreground">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="hover:underline">
                Terms
              </Link>{" "}
              and{" "}
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
