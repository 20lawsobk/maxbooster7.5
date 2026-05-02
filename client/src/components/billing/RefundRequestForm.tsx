import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { 
  RotateCcw, 
  Loader2, 
  CheckCircle, 
  AlertTriangle,
  DollarSign,
  Info
} from 'lucide-react';

type RefundReason = 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'service_issue' | 'other';

interface RefundRequestFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: string;
  chargeId?: string;
  maxRefundAmount?: number;
  description?: string;
  onSuccess?: (refundId: string) => void;
}

const refundReasons: { value: RefundReason; label: string; description: string }[] = [
  { 
    value: 'duplicate', 
    label: 'Duplicate Charge', 
    description: 'I was charged multiple times for the same service'
  },
  { 
    value: 'service_issue', 
    label: 'Service Issue', 
    description: 'The service did not work as expected'
  },
  { 
    value: 'requested_by_customer', 
    label: 'Cancellation', 
    description: 'I no longer need or want the service'
  },
  { 
    value: 'fraudulent', 
    label: 'Unauthorized Transaction', 
    description: 'I did not authorize this transaction'
  },
  { 
    value: 'other', 
    label: 'Other Reason', 
    description: 'Another reason not listed above'
  },
];

export default function RefundRequestForm({
  open,
  onOpenChange,
  invoiceId,
  chargeId,
  maxRefundAmount,
  description,
  onSuccess,
}: RefundRequestFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    reason: '' as RefundReason | '',
    description: '',
    isPartialRefund: false,
    partialAmount: '',
    confirmUnderstand: false,
  });

  const resetForm = () => {
    setFormData({
      reason: '',
      description: '',
      isPartialRefund: false,
      partialAmount: '',
      confirmUnderstand: false,
    });
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.reason) {
      setError('Please select a reason for your refund request');
      return;
    }

    if (!formData.confirmUnderstand) {
      setError('Please confirm you understand the refund policy');
      return;
    }

    if (formData.isPartialRefund && !formData.partialAmount) {
      setError('Please enter the partial refund amount');
      return;
    }

    const partialAmountCents = formData.isPartialRefund 
      ? Math.round(parseFloat(formData.partialAmount) * 100)
      : undefined;

    if (partialAmountCents && maxRefundAmount && partialAmountCents > maxRefundAmount * 100) {
      setError(`Refund amount cannot exceed $${maxRefundAmount.toFixed(2)}`);
      return;
    }

    setLoading(true);

    try {
      const response = await apiRequest('POST', '/api/billing/refund/request', {
        invoiceId,
        chargeId,
        reason: formData.reason,
        description: formData.description || undefined,
        amount: partialAmountCents,
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        queryClient.invalidateQueries({ queryKey: ['/api/billing/refunds'] });

        toast({
          title: 'Refund Request Submitted',
          description: 'Our team will review your request within 5-7 business days.',
        });

        onSuccess?.(data.refundRequest?.id);

        setTimeout(() => {
          onOpenChange(false);
          resetForm();
        }, 2000);
      } else {
        throw data;
      }
    } catch (err) {
      const errorData = err.body || err;
      setError(errorData.message || 'Failed to submit refund request');

      toast({
        title: 'Request Failed',
        description: errorData.message || 'Please try again later.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetForm();
      onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Request a Refund
          </DialogTitle>
          <DialogDescription>
            {description || 'Submit a refund request for your payment'}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
              Request Submitted!
            </h3>
            <p className="text-muted-foreground">
              We'll review your refund request and get back to you within 5-7 business days.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {maxRefundAmount && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Maximum refund amount: <strong>${maxRefundAmount.toFixed(2)}</strong>
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Refund</Label>
              <Select
                value={formData.reason}
                onValueChange={(value: RefundReason) => 
                  setFormData(prev => ({ ...prev, reason: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {refundReasons.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      <div className="flex flex-col">
                        <span>{reason.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {reason.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Additional Details (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Please provide any additional context that might help us process your request..."
                value={formData.description}
                onChange={(e) => 
                  setFormData(prev => ({ ...prev, description: e.target.value }))
                }
                rows={3}
              />
            </div>

            {maxRefundAmount && maxRefundAmount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="partialRefund"
                    checked={formData.isPartialRefund}
                    onCheckedChange={(checked) =>
                      setFormData(prev => ({ 
                        ...prev, 
                        isPartialRefund: checked === true,
                        partialAmount: checked ? prev.partialAmount : ''
                      }))
                    }
                  />
                  <Label htmlFor="partialRefund" className="text-sm font-normal">
                    Request a partial refund
                  </Label>
                </div>

                {formData.isPartialRefund && (
                  <div className="pl-6 space-y-2">
                    <Label htmlFor="partialAmount">Refund Amount ($)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="partialAmount"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={maxRefundAmount}
                        placeholder="0.00"
                        className="pl-9"
                        value={formData.partialAmount}
                        onChange={(e) =>
                          setFormData(prev => ({ ...prev, partialAmount: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Refund Policy</AlertTitle>
              <AlertDescription className="text-sm">
                Refunds are processed within 5-7 business days. Once approved, funds will 
                be returned to your original payment method within 5-10 business days.
              </AlertDescription>
            </Alert>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="confirmUnderstand"
                checked={formData.confirmUnderstand}
                onCheckedChange={(checked) =>
                  setFormData(prev => ({ ...prev, confirmUnderstand: checked === true }))
                }
              />
              <Label htmlFor="confirmUnderstand" className="text-sm font-normal leading-relaxed">
                I understand that refunds are subject to review and approval. If approved, 
                my subscription benefits may be affected.
              </Label>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={loading || !formData.reason || !formData.confirmUnderstand}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Request'
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
