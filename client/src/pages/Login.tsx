import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Logo } from "@/components/ui/Logo";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import {
  Eye,
  EyeOff,
  AlertCircle,
  Shield,
  Clock,
  Play,
  Loader2,
  Mail,
} from "lucide-react";
import { GoogleIcon } from "@/components/ui/brand-icons";

const OAUTH_ERROR_MESSAGES: Record<
  string,
  { title: string; description: string }
> = {
  google_not_configured: {
    title: "Google Login Unavailable",
    description:
      "Google sign-in is not configured. Please use email and password.",
  },
  google_denied: {
    title: "Access Denied",
    description: "You cancelled the Google sign-in or denied access.",
  },
  invalid_state: {
    title: "Security Error",
    description: "Invalid authentication state. Please try again.",
  },
  token_exchange_failed: {
    title: "Authentication Failed",
    description: "Could not complete Google sign-in. Please try again.",
  },
  no_email: {
    title: "Email Required",
    description: "Your Google account must have an email address.",
  },
  login_failed: {
    title: "Login Failed",
    description: "Could not complete login. Please try again.",
  },
  oauth_error: {
    title: "OAuth Error",
    description: "An error occurred during Google sign-in. Please try again.",
  },
  account_not_verified: {
    title: "Account Not Verified",
    description:
      "Please verify your email address before logging in. Check your inbox for a verification link.",
  },
  unverified_identity: {
    title: "Google Identity Not Verified",
    description: "Google did not provide a verified identity. Please try another account or sign in with email and password.",
  },
  identity_mismatch: {
    title: "Google Account Mismatch",
    description: "This Google identity does not match the linked account. Please use the Google account originally connected.",
  },
  account_unavailable: {
    title: "Account Unavailable",
    description: "The account could not be loaded. Please try again or contact support.",
  },
  authenticator_recovery_required: {
    title: "Authenticator Recovery Required",
    description: "Your authenticator needs recovery. Please contact support before trying to sign in again.",
  },
};

type AuthResponse = Record<string, unknown>;

function getSafeLoginRedirect(value: string | null): string {
  // Reject network-path URLs and browser-normalized backslashes/control chars.
  return value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\u0000-\u0020\u007f]/.test(value)
    ? value
    : "/dashboard";
}

async function getRequiredCsrfToken(): Promise<string> {
  const existingToken = getCsrfTokenFromCookie();
  if (existingToken) {
    return existingToken;
  }

  const response = await fetch("/api/csrf-token", {
    credentials: "include",
    signal: AbortSignal.timeout(30_000),
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !body || typeof body !== "object" ||
      !("csrfToken" in body) || typeof body.csrfToken !== "string" || !body.csrfToken) {
    throw new Error(
      "Unable to establish the security token required to sign in. Please refresh the page and try again.",
    );
  }

  return body.csrfToken;
}

async function readAuthResponse(response: Response): Promise<AuthResponse> {
  const body = await response.text();
  if (!body) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as AuthResponse)
      : {};
  } catch {
    return {};
  }
}

function getResponseMessage(data: AuthResponse, fallback: string): string {
  return typeof data.message === "string" && data.message
    ? data.message
    : fallback;
}

export default function Login() {
  const { user: authenticatedUser, isLoading: authLoading, authenticate } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
  }>({});
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const requestInFlight = useRef(false);
  const [_location, navigate] = useLocation();
  const { toast } = useToast();

  const redirectAfterLogin = (() => {
    const urlParams = new URLSearchParams(window.location.search);
    const r = urlParams.get("redirect");
    return getSafeLoginRedirect(r);
  })();

  useEffect(() => {
    if (!authLoading && authenticatedUser) navigate(redirectAfterLogin);
  }, [authenticatedUser, authLoading, navigate, redirectAfterLogin]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error) {
      const { title, description } = OAUTH_ERROR_MESSAGES[error] || OAUTH_ERROR_MESSAGES.oauth_error;
      toast({
        title,
        description,
        variant: "destructive",
      });
      urlParams.delete("error");
      window.history.replaceState({}, "", `${window.location.pathname}${urlParams.size ? `?${urlParams}` : ""}${window.location.hash}`);
    }
  }, [toast]);

  // Show loading spinner while checking authentication
  if (authLoading || authenticatedUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        <span className="sr-only" role="status">Checking authentication...</span>
      </div>
    );
  }

  const validateForm = (): boolean => {
    const errors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      errors.username = "Username or email is required";
    }

    if (!password) {
      errors.password = "Password is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getEnhancedErrorMessage = (
    message: string,
    status: number,
  ): { title: string; description: string; icon?: React.ReactNode } => {
    const lowerMessage = message.toLowerCase();

    if (status === 429) {
      return {
        title: "Too Many Attempts",
        description:
          "You have made too many login attempts. Please wait a few minutes before trying again.",
        icon: <Clock className="h-4 w-4" />,
      };
    }

    if (lowerMessage.includes("locked") || lowerMessage.includes("suspended")) {
      return {
        title: "Account Access Unavailable",
        description: message,
        icon: <Shield className="h-4 w-4" />,
      };
    }

    if (
      lowerMessage.includes("not verified") ||
      lowerMessage.includes("verify your email")
    ) {
      return {
        title: "Email Not Verified",
        description:
          "Please verify your email address before logging in. Check your inbox for the verification link.",
        icon: <Mail className="h-4 w-4" />,
      };
    }

    if (
      lowerMessage.includes("2fa code") ||
      lowerMessage.includes("invalid verification")
    ) {
      return {
        title: "Invalid Code",
        description:
          "The authenticator code is invalid or already used. Wait for a fresh 6-digit code and try again.",
        icon: <Shield className="h-4 w-4" />,
      };
    }

    if (lowerMessage.includes("session")) {
      return {
        title: "Session Error",
        description:
          "There was a problem with your session. Please refresh the page and try again.",
      };
    }

    if (lowerMessage.includes("security token") || lowerMessage.includes("csrf")) {
      return {
        title: "Security Token Error",
        description: message,
      };
    }

    if (
      lowerMessage.includes("invalid") ||
      lowerMessage.includes("credentials")
    ) {
      return {
        title: "Invalid Credentials",
        description:
          "The username/email or password you entered is incorrect. Please check your credentials and try again.",
      };
    }

    return {
      title: "Login Failed",
      description: message || "An unexpected error occurred. Please try again.",
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestInFlight.current) return;
    setFieldErrors({});
    setTwoFactorError("");

    if (!validateForm()) {
      return;
    }
    if (requiresTwoFactor && !/^\d{6}$/.test(twoFactorCode)) {
      setTwoFactorError("Enter a 6-digit authenticator code.");
      return;
    }

    requestInFlight.current = true;
    setIsLoading(true);

    try {
      const { response, data } = await authenticate(async () => {
        const csrfToken = await getRequiredCsrfToken();
        const response = await fetch("/api/auth/login", {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
          body: JSON.stringify({
            username: username.trim(),
            password,
            twoFactorCode: requiresTwoFactor ? twoFactorCode : undefined,
          }),
        });
        const data = await readAuthResponse(response);
        return { response, data };
      });

      if (response.ok && data.requiresTwoFactor === true) {
        setRequiresTwoFactor(true);
        setTwoFactorCode("");
        toast({
          title: "Two-Factor Authentication Required",
          description:
            "Please enter the 6-digit code from your authenticator app.",
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        const { title, description } = getEnhancedErrorMessage(
          getResponseMessage(data, "Login failed"),
          response.status,
        );

        if (
          requiresTwoFactor &&
          (getResponseMessage(data, "").toLowerCase().includes("2fa") ||
            getResponseMessage(data, "").toLowerCase().includes("code"))
        ) {
          setTwoFactorError(description);
          setTwoFactorCode("");
        } else {
          toast({
            title,
            description,
            variant: "destructive",
          });

          if (!requiresTwoFactor) {
            setPassword("");
          }
        }
        setIsLoading(false);
        return;
      }

      if (typeof data.id !== "string" || !data.id) {
        toast({
          title: "Login Failed",
          description:
            "The server returned an invalid login response. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome back!",
        description: "You've successfully signed in.",
      });
      navigate(redirectAfterLogin);
    } catch (error: unknown) {
      toast({
        title: "Login Error",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Unable to connect to the server. Please check your internet connection and try again.",
        variant: "destructive",
      });
    } finally {
      requestInFlight.current = false;
      setIsLoading(false);
    }
  };

  const handleResetTwoFactor = () => {
    setRequiresTwoFactor(false);
    setTwoFactorCode("");
    setTwoFactorError("");
    setPassword("");
  };

  const handleGoogleLogin = () => {
    if (requestInFlight.current) return;
    window.location.href = "/api/auth/google";
  };

  const handleDemoLogin = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsDemoLoading(true);
    try {
      const { response, data } = await authenticate(async () => {
        const csrfToken = await getRequiredCsrfToken();
        const response = await fetch("/api/auth/demo", {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
        });
        const data = await readAuthResponse(response);
        return { response, data };
      });

      if (!response.ok) {
        toast({
          title: "Demo Login Failed",
          description: getResponseMessage(
            data,
            "Could not start demo mode. Please try again.",
          ),
          variant: "destructive",
        });
        return;
      }

      if (typeof data.id !== "string" || !data.id || data.isDemo !== true) {
        toast({
          title: "Demo Login Failed",
          description:
            "The server returned an invalid demo login response. Please try again.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Welcome to Demo Mode!",
        description: "Explore all Max Booster features with sample data.",
      });
      navigate(redirectAfterLogin);
    } catch (error: unknown) {
      toast({
        title: "Demo Login Error",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Unable to connect to the server. Please try again.",
        variant: "destructive",
      });
    } finally {
      requestInFlight.current = false;
      setIsDemoLoading(false);
    }
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
          <CardDescription className="text-gray-600 dark:text-muted-foreground">
            Welcome back to Max Booster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
            <div className="space-y-2">
              <Label htmlFor="username">Username or Email</Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                placeholder="Enter your username or email"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (fieldErrors.username)
                    setFieldErrors((prev) => ({
                      ...prev,
                      username: undefined,
                    }));
                }}
                required
                disabled={requiresTwoFactor || isLoading || isDemoLoading}
                autoComplete="username"
                className={fieldErrors.username ? "border-destructive" : ""}
                aria-invalid={!!fieldErrors.username}
                aria-describedby={
                  fieldErrors.username ? "username-error" : undefined
                }
              />
              {fieldErrors.username && (
                <p
                  id="username-error"
                  className="text-sm text-destructive flex items-center gap-1"
                >
                  <AlertCircle className="h-3 w-3" />
                  {fieldErrors.username}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((prev) => ({
                        ...prev,
                        password: undefined,
                      }));
                  }}
                  required
                  disabled={requiresTwoFactor || isLoading || isDemoLoading}
                  autoComplete="current-password"
                  className={
                    fieldErrors.password ? "border-destructive pr-10" : "pr-10"
                  }
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={
                    fieldErrors.password ? "password-error" : undefined
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                  disabled={requiresTwoFactor || isLoading || isDemoLoading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {fieldErrors.password && (
                <p
                  id="password-error"
                  className="text-sm text-destructive flex items-center gap-1"
                >
                  <AlertCircle className="h-3 w-3" />
                  {fieldErrors.password}
                </p>
              )}
            </div>
            {requiresTwoFactor && (
              <div className="space-y-3">
                <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 dark:text-blue-300">
                    Two-factor authentication is enabled on your account. Enter
                    the 6-digit code from your authenticator app.
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label htmlFor="twoFactorCode">Authenticator Code</Label>
                  <Input
                    id="twoFactorCode"
                    data-testid="input-2fa-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    disabled={isLoading || isDemoLoading}
                    placeholder="Enter 6-digit code"
                    value={twoFactorCode}
                    onChange={(e) => {
                      setTwoFactorCode(
                        e.target.value.replace(/\D/g, "").slice(0, 6),
                      );
                      if (twoFactorError) setTwoFactorError("");
                    }}
                    maxLength={6}
                    required
                    autoFocus
                    className={`text-center text-2xl tracking-widest font-mono ${twoFactorError ? "border-destructive" : ""}`}
                    aria-invalid={!!twoFactorError}
                    aria-describedby={twoFactorError ? "2fa-error" : undefined}
                  />
                  {twoFactorError && (
                    <p
                      id="2fa-error"
                      className="text-sm text-destructive flex items-center gap-1"
                    >
                      <AlertCircle className="h-3 w-3" />
                      {twoFactorError}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={handleResetTwoFactor}
                  disabled={isLoading || isDemoLoading}
                  className="p-0 h-auto text-muted-foreground"
                  data-testid="button-reset-2fa"
                >
                  Use a different account
                </Button>
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading || isDemoLoading || (requiresTwoFactor && twoFactorCode.length !== 6)
              }
              data-testid="button-login-submit"
            >
              {isLoading
                ? "Signing In..."
                : requiresTwoFactor
                  ? "Verify & Sign In"
                  : "Sign In"}
            </Button>
          </form>

          <div className="text-center">
            <Link href="/forgot-password">
              <Button
                variant="link"
                size="sm"
                data-testid="link-forgot-password"
              >
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
            disabled={isLoading || isDemoLoading}
            data-testid="button-google-login"
          >
            <GoogleIcon className="mr-2 h-4 w-4" />
            Continue with Google
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full border border-dashed border-gray-300 dark:border-gray-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
            onClick={handleDemoLogin}
            disabled={isLoading || isDemoLoading}
            data-testid="button-demo-login"
          >
            {isDemoLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Demo...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Try Demo Mode
              </>
            )}
          </Button>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            Don't have an account?{" "}
            <Link href="/pricing">
              <Button
                variant="link"
                size="sm"
                className="p-0"
                data-testid="link-signup"
              >
                Sign up here
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
