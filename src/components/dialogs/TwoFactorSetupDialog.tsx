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
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Shield, Copy, CheckCircle } from 'lucide-react';

interface TwoFactorSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TwoFactorSetupDialog({ open, onOpenChange }: TwoFactorSetupDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify'>('setup');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const handleSetup = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('POST', '/api/auth/2fa/setup');
      const data = await response.json();

      setQrCode(
        data.qrCode ||
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
      );
      setSecret(data.secret || 'MOCK2FASECRETKEY');
      setStep('verify');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Failed to setup 2FA. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: 'Error',
        description: 'Please enter a 6-digit verification code',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await apiRequest('POST', '/api/auth/2fa/verify', {
        code: verificationCode,
      });

      toast({
        title: 'Success',
        description: 'Two-factor authentication has been enabled successfully',
      });

      onOpenChange(false);
      setStep('setup');
      setVerificationCode('');
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: 'Invalid verification code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast({
      title: 'Copied',
      description: 'Secret key copied to clipboard',
    });
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
            {step === 'setup'
              ? 'Enhance your account security by enabling two-factor authentication'
              : 'Scan the QR code with your authenticator app or enter the secret key manually'}
          </DialogDescription>
        </DialogHeader>

        {step === 'setup' ? (
          <div className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-medium">How it works:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
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
              <Button onClick={handleSetup} disabled={loading} data-testid="button-start-2fa-setup">
                {loading ? 'Setting up...' : 'Start Setup'}
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
                  variant="outline"
                  onClick={copySecret}
                  data-testid="button-copy-secret"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verificationCode">Verification Code</Label>
              <Input
                id="verificationCode"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                maxLength={6}
                data-testid="input-verification-code"
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setStep('setup');
                  setVerificationCode('');
                }}
                disabled={loading}
                data-testid="button-back-2fa"
              >
                Back
              </Button>
              <Button
                onClick={handleVerify}
                disabled={loading || !verificationCode}
                data-testid="button-verify-2fa"
              >
                {loading ? 'Verifying...' : 'Verify & Enable'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
