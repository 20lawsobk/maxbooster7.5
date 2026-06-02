import { useState, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreditCard,
  AlertTriangle,
  Shield,
  Loader2,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

interface PaymentError {
  message: string;
  code?: string;
  field?: string;
  retryable?: boolean;
}

const getPaymentErrorMessage = (error: Error): PaymentError => {
  const errorCode = error.code || error.type;

  switch (errorCode) {
    case "card_declined":
    case "PAYMENT_DECLINED":
      return {
        message: "Your card was declined. Please try a different card.",
        code: errorCode,
        retryable: true,
      };
    case "incorrect_cvc":
    case "CARD_VALIDATION_ERROR":
      return {
        message: "The CVC number is incorrect.",
        code: errorCode,
        field: "cvc",
        retryable: true,
      };
    case "expired_card":
    case "CARD_EXPIRED":
      return {
        message: "Your card has expired.",
        code: errorCode,
        retryable: true,
      };
    case "incorrect_number":
      return {
        message: "The card number is incorrect.",
        code: errorCode,
        field: "cardNumber",
        retryable: true,
      };
    case "STRIPE_NOT_CONFIGURED":
      return {
        message:
          "Payment service is temporarily unavailable. Please try again later.",
        code: errorCode,
        retryable: false,
      };
    case "RATE_LIMITED":
      return {
        message: "Too many attempts. Please wait a moment and try again.",
        code: errorCode,
        retryable: true,
      };
    default:
      return {
        message: error.message || "Failed to update payment method.",
        retryable: error.retryable ?? true,
      };
  }
};

interface PaymentUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentUpdateDialog({
  open,
  onOpenChange,
}: PaymentUpdateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<PaymentError | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [success, setSuccess] = useState(false);
  const [paymentData, setPaymentData] = useState({
    cardNumber: "",
    expiryMonth: "",
    expiryYear: "",
    cvc: "",
    name: "",
    zip: "",
  });

  const resetForm = useCallback(() => {
    setPaymentData({
      cardNumber: "",
      expiryMonth: "",
      expiryYear: "",
      cvc: "",
      name: "",
      zip: "",
    });
    setPaymentError(null);
    setRetryCount(0);
    setSuccess(false);
  }, []);

  const validateForm = (): string | null => {
    if (paymentData.cardNumber.replace(/\s/g, "").length !== 16) {
      return "Please enter a valid 16-digit card number";
    }
    if (!paymentData.expiryMonth || !paymentData.expiryYear) {
      return "Please select the expiration date";
    }
    if (paymentData.cvc.length < 3) {
      return "Please enter a valid CVC";
    }
    if (!paymentData.name.trim()) {
      return "Please enter the cardholder name";
    }
    if (paymentData.zip.length < 5) {
      return "Please enter a valid ZIP code";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);

    const validationError = validateForm();
    if (validationError) {
      setPaymentError({ message: validationError, retryable: true });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/billing/update-payment", {
        ...paymentData,
        cardNumber: paymentData.cardNumber.replace(/\s/g, ""),
      });

      const data = await response.json();

      if (data.code && data.code !== "SUCCESS") {
        throw data;
      }

      setSuccess(true);
      queryClient.invalidateQueries({
        queryKey: ["/api/billing/payment-method"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/billing/subscription"],
      });

      toast({
        title: "Payment Method Updated",
        description: "Your payment method has been updated successfully.",
      });

      setTimeout(() => {
        onOpenChange(false);
        resetForm();
      }, 1500);
    } catch (error) {
      const errorData = error.body || error;
      const parsedError = getPaymentErrorMessage(errorData);
      setPaymentError(parsedError);
      setRetryCount((prev) => prev + 1);

      toast({
        title: "Update Failed",
        description: parsedError.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setPaymentError(null);
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(" ");
    } else {
      return value;
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) resetForm();
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Update Payment Method
            </div>
          </DialogTitle>
          <DialogDescription>
            Enter your new payment details to update your billing information
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
              Payment Method Updated!
            </h3>
            <p className="text-muted-foreground">
              Your new payment method has been saved successfully.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {paymentError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{paymentError.message}</p>
                  {paymentError.retryable && retryCount < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRetry}
                      className="mt-2"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Try Again
                    </Button>
                  )}
                  {retryCount >= 3 && (
                    <p className="text-sm mt-2">
                      Multiple attempts failed. Please try a different card or
                      contact support.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <div>
              <Label htmlFor="cardNumber">Card Number</Label>
              <Input
                id="cardNumber"
                placeholder="1234 5678 9012 3456"
                value={paymentData.cardNumber}
                onChange={(e) =>
                  setPaymentData((prev) => ({
                    ...prev,
                    cardNumber: formatCardNumber(e.target.value),
                  }))
                }
                maxLength={19}
                required
                data-testid="input-card-number"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="expiryMonth">Exp. Month</Label>
                <Select
                  value={paymentData.expiryMonth}
                  onValueChange={(value) =>
                    setPaymentData((prev) => ({ ...prev, expiryMonth: value }))
                  }
                >
                  <SelectTrigger
                    id="expiryMonth"
                    data-testid="select-expiry-month"
                  >
                    <SelectValue placeholder="MM" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(
                      (month) => (
                        <SelectItem
                          key={month}
                          value={month.toString().padStart(2, "0")}
                        >
                          {month.toString().padStart(2, "0")}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="expiryYear">Exp. Year</Label>
                <Select
                  value={paymentData.expiryYear}
                  onValueChange={(value) =>
                    setPaymentData((prev) => ({ ...prev, expiryYear: value }))
                  }
                >
                  <SelectTrigger
                    id="expiryYear"
                    data-testid="select-expiry-year"
                  >
                    <SelectValue placeholder="YYYY" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from(
                      { length: 10 },
                      (_, i) => new Date().getFullYear() + i,
                    ).map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="cvc">CVC</Label>
                <Input
                  id="cvc"
                  placeholder="123"
                  value={paymentData.cvc}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "");
                    if (value.length <= 4) {
                      setPaymentData((prev) => ({ ...prev, cvc: value }));
                    }
                  }}
                  maxLength={4}
                  required
                  data-testid="input-cvc"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="name">Cardholder Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={paymentData.name}
                onChange={(e) =>
                  setPaymentData((prev) => ({ ...prev, name: e.target.value }))
                }
                required
                data-testid="input-cardholder-name"
              />
            </div>

            <div>
              <Label htmlFor="zip">Billing ZIP Code</Label>
              <Input
                id="zip"
                placeholder="12345"
                value={paymentData.zip}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  if (value.length <= 5) {
                    setPaymentData((prev) => ({ ...prev, zip: value }));
                  }
                }}
                maxLength={5}
                required
                data-testid="input-zip-code"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
                data-testid="button-cancel-payment-update"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                data-testid="button-submit-payment-update"
              >
                {loading ? "Updating..." : "Update Payment Method"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
