import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CreditCard } from 'lucide-react';

interface PaymentUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PaymentUpdateDialog({ open, onOpenChange }: PaymentUpdateDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvc: '',
    name: '',
    zip: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic validation
    if (paymentData.cardNumber.replace(/\s/g, '').length !== 16) {
      toast({
        title: 'Error',
        description: 'Please enter a valid 16-digit card number',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await apiRequest('POST', '/api/billing/update-payment', {
        ...paymentData,
        cardNumber: paymentData.cardNumber.replace(/\s/g, ''),
      });

      toast({
        title: 'Success',
        description: 'Your payment method has been updated successfully',
      });

      onOpenChange(false);
      setPaymentData({
        cardNumber: '',
        expiryMonth: '',
        expiryYear: '',
        cvc: '',
        name: '',
        zip: '',
      });
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update payment method',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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

        <form onSubmit={handleSubmit} className="space-y-4">
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
                <SelectTrigger id="expiryMonth" data-testid="select-expiry-month">
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={month.toString().padStart(2, '0')}>
                      {month.toString().padStart(2, '0')}
                    </SelectItem>
                  ))}
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
                <SelectTrigger id="expiryYear" data-testid="select-expiry-year">
                  <SelectValue placeholder="YYYY" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(
                    (year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    )
                  )}
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
                  const value = e.target.value.replace(/\D/g, '');
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
              onChange={(e) => setPaymentData((prev) => ({ ...prev, name: e.target.value }))}
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
                const value = e.target.value.replace(/\D/g, '');
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
            <Button type="submit" disabled={loading} data-testid="button-submit-payment-update">
              {loading ? 'Updating...' : 'Update Payment Method'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
