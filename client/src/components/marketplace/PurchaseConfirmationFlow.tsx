import { useState } from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileText,
  Lock,
  Music,
  Shield,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Beat {
  id: string;
  title: string;
  artist: string;
  coverArt?: string;
  price: number;
}

interface License {
  id: string;
  name: string;
  type: string;
  price: number;
  duration: string;
  features: string[];
}

type PurchaseStep = "review" | "payment" | "processing" | "complete" | "failed";

interface PurchaseConfirmationFlowProps {
  beat: Beat;
  license: License;
  onConfirm: () => Promise<{
    success: boolean;
    downloadUrl?: string;
    licenseUrl?: string;
    error?: string;
  }>;
  onCancel: () => void;
  useEscrow?: boolean;
  className?: string;
}

export function PurchaseConfirmationFlow({
  beat,
  license,
  onConfirm,
  onCancel,
  useEscrow = false,
  className,
}: PurchaseConfirmationFlowProps) {
  const [currentStep, setCurrentStep] = useState<PurchaseStep>("review");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToLicense, setAgreedToLicense] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    downloadUrl?: string;
    licenseUrl?: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const subtotal = license.price;
  const escrowFee = useEscrow ? subtotal * 0.025 : 0;
  const platformFee = subtotal * 0.1;
  const discountAmount = discount > 0 ? subtotal * (discount / 100) : 0;
  const total = subtotal + escrowFee + platformFee - discountAmount;

  const handleApplyPromo = () => {
    if (promoCode.toLowerCase() === "first10") {
      setDiscount(10);
    } else if (promoCode.toLowerCase() === "beats20") {
      setDiscount(20);
    } else {
      setDiscount(0);
    }
  };

  const handleProceed = async () => {
    if (currentStep === "review") {
      if (!agreedToTerms || !agreedToLicense) return;
      setCurrentStep("payment");
    } else if (currentStep === "payment") {
      setCurrentStep("processing");
      setProcessing(true);

      try {
        const response = await onConfirm();
        setProcessing(false);

        if (response.success) {
          setResult(response);
          setCurrentStep("complete");
        } else {
          setResult({
            error: response.error || "Payment failed. Please try again.",
          });
          setCurrentStep("failed");
        }
      } catch (error) {
        setProcessing(false);
        setResult({ error: "An unexpected error occurred. Please try again." });
        setCurrentStep("failed");
      }
    }
  };

  const handleBack = () => {
    if (currentStep === "payment") {
      setCurrentStep("review");
    }
  };

  const handleRetry = () => {
    setCurrentStep("payment");
    setResult(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    { id: "review", label: "Review", icon: FileText },
    { id: "payment", label: "Payment", icon: CreditCard },
    { id: "complete", label: "Complete", icon: Check },
  ];

  const getStepProgress = () => {
    switch (currentStep) {
      case "review":
        return 33;
      case "payment":
      case "processing":
        return 66;
      case "complete":
      case "failed":
        return 100;
      default:
        return 0;
    }
  };

  return (
    <Card className={cn("max-w-2xl mx-auto overflow-hidden", className)}>
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => {
            const isActive =
              steps.findIndex(
                (s) =>
                  s.id === currentStep ||
                  (currentStep === "processing" && s.id === "payment") ||
                  (currentStep === "failed" && s.id === "complete"),
              ) >= index;
            const isComplete =
              steps.findIndex((s) => s.id === currentStep) > index ||
              currentStep === "complete";
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                    isComplete
                      ? "bg-white border-white text-purple-600"
                      : isActive
                        ? "border-white text-white"
                        : "border-white/40 text-white/40",
                  )}
                >
                  {isComplete ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "ml-2 text-sm font-medium hidden sm:block",
                    isActive ? "text-white" : "text-white/40",
                  )}
                >
                  {step.label}
                </span>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "w-12 sm:w-24 h-0.5 mx-2",
                      isComplete ? "bg-white" : "bg-white/20",
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Progress value={getStepProgress()} className="h-1 bg-white/20" />
      </div>

      <CardContent className="p-6">
        {currentStep === "review" && (
          <div className="space-y-6">
            <div className="flex items-start gap-4 p-4 bg-muted rounded-lg">
              {beat.coverArt ? (
                <img
                  src={beat.coverArt}
                  alt={beat.title}
                  className="w-20 h-20 rounded-lg object-cover"
                />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Music className="w-8 h-8 text-white" />
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{beat.title}</h3>
                <p className="text-sm text-muted-foreground">
                  by {beat.artist}
                </p>
                <Badge variant="secondary" className="mt-2">
                  {license.name}
                </Badge>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">License Features</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {license.features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Promo code"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleApplyPromo}>
                  Apply
                </Button>
              </div>
              {discount > 0 && (
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  {discount}% discount applied!
                </Badge>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              {useEscrow && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    Escrow Fee
                    <Shield className="w-3 h-3" />
                  </span>
                  <span>${escrowFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Platform Fee</span>
                <span>${platformFee.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) =>
                    setAgreedToTerms(checked as boolean)
                  }
                />
                <Label
                  htmlFor="terms"
                  className="text-sm leading-tight cursor-pointer"
                >
                  I agree to the Terms of Service and understand that all sales
                  are final
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  id="license"
                  checked={agreedToLicense}
                  onCheckedChange={(checked) =>
                    setAgreedToLicense(checked as boolean)
                  }
                />
                <Label
                  htmlFor="license"
                  className="text-sm leading-tight cursor-pointer"
                >
                  I have read and agree to the license terms for "{license.name}
                  "
                </Label>
              </div>
            </div>
          </div>
        )}

        {currentStep === "payment" && (
          <div className="space-y-6">
            <div className="text-center">
              <CreditCard className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold">Complete Payment</h3>
              <p className="text-muted-foreground mt-2">
                Total:{" "}
                <span className="font-bold text-foreground">
                  ${total.toFixed(2)}
                </span>
              </p>
            </div>

            <Alert>
              <Lock className="w-4 h-4" />
              <AlertDescription>
                Your payment is secured with 256-bit SSL encryption. We never
                store your card details.
              </AlertDescription>
            </Alert>

            <div className="p-6 border rounded-lg bg-muted/50">
              <p className="text-sm text-center text-muted-foreground">
                Payment form would be integrated here (Stripe, PayPal, etc.)
              </p>
            </div>
          </div>
        )}

        {currentStep === "processing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="w-16 h-16 mx-auto text-purple-600 animate-spin" />
            <h3 className="text-xl font-semibold">Processing Payment</h3>
            <p className="text-muted-foreground">
              Please wait while we complete your transaction...
            </p>
          </div>
        )}

        {currentStep === "complete" && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-12 h-12 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-green-600">
                Purchase Complete!
              </h3>
              <p className="text-muted-foreground mt-2">
                Thank you for your purchase. Your files are ready to download.
              </p>
            </div>

            <div className="space-y-3">
              {result?.downloadUrl && (
                <Button
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600"
                  onClick={() => window.open(result.downloadUrl, "_blank")}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Beat Files
                </Button>
              )}
              {result?.licenseUrl && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(result.licenseUrl, "_blank")}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    View License
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(result.licenseUrl!)}
                  >
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
              <AlertDescription className="text-sm">
                A confirmation email has been sent to your email address with
                download links and license details.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {currentStep === "failed" && (
          <div className="py-8 space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle className="w-12 h-12 text-red-600" />
              </div>
              <h3 className="text-2xl font-bold text-red-600">
                Payment Failed
              </h3>
              <p className="text-muted-foreground mt-2">
                {result?.error || "We were unable to process your payment."}
              </p>
            </div>

            <div className="space-y-3">
              <Button className="w-full" onClick={handleRetry}>
                Try Again
              </Button>
              <Button variant="outline" className="w-full" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {(currentStep === "review" || currentStep === "payment") && (
        <CardFooter className="flex justify-between p-6 pt-0">
          {currentStep === "payment" ? (
            <Button variant="ghost" onClick={handleBack}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          ) : (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleProceed}
            disabled={
              currentStep === "review" && (!agreedToTerms || !agreedToLicense)
            }
            className="bg-gradient-to-r from-purple-600 to-indigo-600"
          >
            {currentStep === "review" ? (
              <>
                Continue to Payment
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              <>Complete Purchase - ${total.toFixed(2)}</>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export default PurchaseConfirmationFlow;
