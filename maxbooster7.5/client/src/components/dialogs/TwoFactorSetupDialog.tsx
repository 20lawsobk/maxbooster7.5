import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Shield, Copy, CheckCircle, AlertCircle, Clock } from "lucide-react";

interface TwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function TwoFactorSetupDialog({
  open,
  onOpenChange,
  onSuccess,
}: TwoFactorSetupDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"setup" | "verify">("setup");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "verify" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [step]);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/auth/2fa/setup");
      const data = await response.json();

      if (!data.secret || !data.qrCode) {
        throw new Error(
          "Server did not return a valid 2FA secret. Please try again.",
        );
      }
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep("verify");
    } catch (error: unknown) {
      const errorObj = error as { message?: string; status?: number };
      toast({
        title: "2FA Setup Failed",
        description:
          errorObj?.message || "Failed to setup 2FA. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 6);
    setVerificationCode(digitsOnly);
    if (codeError) setCodeError("");
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      setCodeError("Please enter a 6-digit verification code");
      return;
    }

    if (!/^\d{6}$/.test(verificationCode)) {
      setCodeError("Code must contain only numbers");
      return;
    }

    setLoading(true);
    setCodeError("");

    try {
      await apiRequest("POST", "/api/auth/2fa/verify", {
        code: verificationCode,
      });

      toast({
        title: "2FA Enabled",
        description:
          "Two-factor authentication has been enabled successfully. Your account is now more secure.",
      });

      onOpenChange(false);
      setStep("setup");
      setVerificationCode("");
      setQrCode("");
      setSecret("");
      onSuccess?.();
    } catch (error: unknown) {
      const errorObj = error as { message?: string; status?: number };
      const message = errorObj?.message?.toLowerCase() || "";

      if (message.includes("rate") || message.includes("too many")) {
        setCodeError(
          "Too many attempts. Please wait a moment before trying again.",
        );
        toast({
          title: "Rate Limited",
          description:
            "Too many verification attempts. Please wait before trying again.",
          variant: "destructive",
        });
      } else if (message.includes("invalid") || message.includes("incorrect")) {
        setCodeError(
          "Invalid code. Please check your authenticator app and try again.",
        );
      } else {
        setCodeError(
          "Verification failed. Make sure your device time is synchronized.",
        );
      }

      setVerificationCode("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      toast({
        title: "Secret Key Copied",
        description:
          "You can paste this into your authenticator app for manual entry.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Copy Failed",
        description:
          "Could not copy to clipboard. Please manually select and copy the key.",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("setup");
      setVerificationCode("");
      setCodeError("");
      setQrCode("");
      setSecret("");
      setCopied(false);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Two-Factor Authentication Setup
            </div>
          </DialogTitle>
          <DialogDescription>
            {step === "setup"
              ? "Enhance your account security by enabling two-factor authentication"
              : "Scan the QR code with your authenticator app or enter the secret key manually"}
          </DialogDescription>
        </DialogHeader>

        {step === "setup" ? (
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-medium">How it works:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>
                  Install an authenticator app (Google Authenticator, Authy,
                  etc.)
                </li>
                <li>Scan the QR code or enter the secret key</li>
                <li>Enter the 6-digit code to verify setup</li>
                <li>Use the app to generate codes when logging in</li>
              </ol>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-2fa-setup"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSetup}
                disabled={loading}
                data-testid="button-start-2fa-setup"
              >
                {loading ? "Setting up..." : "Start Setup"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-white rounded-lg">
                <img
                  src={qrCode}
                  alt="2FA QR Code"
                  className="w-48 h-48"
                  data-testid="img-2fa-qr-code"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Secret Key (for manual entry)</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={secret}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="input-2fa-secret"
                />
                <Button
                  size="sm"
                  variant={copied ? "default" : "outline"}
                  onClick={copySecret}
                  data-testid="button-copy-secret"
                  className={copied ? "bg-green-600 hover:bg-green-600" : ""}
                >
                  {copied ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verificationCode">Verification Code</Label>
              <Input
                ref={inputRef}
                id="verificationCode"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                maxLength={6}
                className={`text-center text-2xl tracking-widest font-mono ${codeError ? "border-destructive" : ""}`}
                data-testid="input-verification-code"
              />
              {codeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {codeError}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the 6-digit code from your authenticator app. Make sure
                your device time is synchronized.
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                data-testid="button-back-2fa"
              >
                Cancel
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || verificationCode.length !== 6}
                data-testid="button-verify-2fa"
              >
                {loading ? "Verifying..." : "Verify & Enable"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
