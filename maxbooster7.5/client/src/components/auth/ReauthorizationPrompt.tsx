import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { apiRequest } from '@/lib/queryClient';
import {
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';

export type ReauthReason =
  | 'session_expired'
  | 'token_refresh_failed'
  | 'sensitive_action'
  | 'security_verification'
  | 'token_revoked'
  | 'scope_insufficient';

interface ReauthorizationPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason?: ReauthReason;
  onSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
  requiresPassword?: boolean;
  sensitiveAction?: string;
}

const REASON_CONFIG: Record<ReauthReason, { title: string; description: string; icon: any }> = {
  session_expired: {
    title: 'Session Expired',
    description: 'Your session has expired. Please sign in again to continue.',
    icon: Lock,
  },
  token_refresh_failed: {
    title: 'Authentication Required',
    description: 'We couldn\'t refresh your credentials. Please sign in again.',
    icon: ShieldAlert,
  },
  sensitive_action: {
    title: 'Confirm Your Identity',
    description: 'This action requires you to re-enter your password for security.',
    icon: KeyRound,
  },
  security_verification: {
    title: 'Security Verification',
    description: 'For your security, please verify your identity.',
    icon: ShieldAlert,
  },
  token_revoked: {
    title: 'Access Revoked',
    description: 'Your access has been revoked. Please sign in again.',
    icon: AlertTriangle,
  },
  scope_insufficient: {
    title: 'Additional Permissions Required',
    description: 'This action requires additional permissions. Please re-authorize.',
    icon: ShieldAlert,
  },
};

export function ReauthorizationPrompt({
  open,
  onOpenChange,
  reason = 'session_expired',
  onSuccess,
  onCancel,
  title,
  description,
  requiresPassword = true,
  sensitiveAction,
}: ReauthorizationPromptProps) {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = REASON_CONFIG[reason];
  const Icon = config.icon;

  const handleReauthorize = useCallback(async () => {
    if (!user?.email && !user?.username) {
      setError('Unable to verify identity. Please log in again.');
      return;
    }

    if (requiresPassword && !password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login({
        username: user.username || user.email!,
        password,
      });

      toast({
        title: 'Verified Successfully',
        description: 'Your identity has been confirmed.',
      });

      setPassword('');
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Incorrect password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [user, password, requiresPassword, login, toast, onSuccess, onOpenChange]);

  const handleCancel = useCallback(() => {
    setPassword('');
    setError(null);
    onCancel?.();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {title || config.title}
          </DialogTitle>
          <DialogDescription className="text-center">
            {description || config.description}
            {sensitiveAction && (
              <span className="block mt-2 font-medium text-foreground">
                Action: {sensitiveAction}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {requiresPassword && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reauth-password">Password</Label>
              <div className="relative">
                <Input
                  id="reauth-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="pr-10"
                  onKeyDown={(e) => e.key === 'Enter' && handleReauthorize()}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleReauthorize}
            disabled={isLoading || (requiresPassword && !password)}
            className="gap-2"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {requiresPassword ? 'Verify' : 'Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useReauthorization() {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState<ReauthReason>('session_expired');
  const [pendingCallback, setPendingCallback] = useState<(() => void) | null>(null);

  const requestReauthorization = useCallback((reason: ReauthReason, onSuccess?: () => void) => {
    setPendingReason(reason);
    setPendingCallback(() => onSuccess || null);
    setIsOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    if (pendingCallback) {
      pendingCallback();
    }
    setPendingCallback(null);
  }, [pendingCallback]);

  return {
    isOpen,
    setIsOpen,
    reason: pendingReason,
    requestReauthorization,
    handleSuccess,
  };
}

export default ReauthorizationPrompt;
