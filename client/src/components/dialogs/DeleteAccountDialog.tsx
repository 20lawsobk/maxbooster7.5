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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { AlertTriangle, Trash2, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ confirmation?: string; password?: string }>({});

  const validateForm = (): boolean => {
    const errors: { confirmation?: string; password?: string } = {};
    
    if (!confirmation) {
      errors.confirmation = 'Please type DELETE to confirm';
    } else if (confirmation !== 'DELETE') {
      errors.confirmation = 'Please type DELETE exactly as shown';
    }
    
    if (!password) {
      errors.password = 'Password is required to delete your account';
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getEnhancedErrorMessage = (error: unknown): string => {
    const errorObj = error as { message?: string; status?: number };
    const message = errorObj?.message || '';
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('incorrect') || lowerMessage.includes('invalid') || lowerMessage.includes('wrong')) {
      return 'The password you entered is incorrect. Please try again.';
    }
    if (lowerMessage.includes('google') || lowerMessage.includes('oauth')) {
      return 'Your account is connected via Google. Please set a password in Settings first.';
    }
    
    return message || 'Failed to delete account. Please try again.';
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await apiRequest('DELETE', '/api/auth/account', { password });

      toast({
        title: 'Account Deleted',
        description: 'Your account and all associated data have been permanently deleted.',
      });

      setTimeout(() => {
        logout();
      }, 1500);
    } catch (error: unknown) {
      const errorMessage = getEnhancedErrorMessage(error);
      
      if (errorMessage.toLowerCase().includes('password') || errorMessage.toLowerCase().includes('incorrect')) {
        setFieldErrors(prev => ({ ...prev, password: 'Incorrect password' }));
      }
      
      toast({
        title: 'Account Deletion Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setConfirmation('');
    setPassword('');
    setFieldErrors({});
    setShowPassword(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Account
            </div>
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your account and all
            associated data.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warning:</strong> Deleting your account will:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Remove all your projects and tracks</li>
              <li>Delete all your analytics and royalty data</li>
              <li>Cancel any active subscriptions</li>
              <li>Remove all social media connections</li>
              <li>Delete all collaborations and shared content</li>
            </ul>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleDelete} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="confirmation">
              Type <strong className="text-destructive">DELETE</strong> to confirm
            </Label>
            <Input
              id="confirmation"
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                if (fieldErrors.confirmation) setFieldErrors(prev => ({ ...prev, confirmation: undefined }));
              }}
              placeholder="Type DELETE"
              required
              className={fieldErrors.confirmation ? 'border-destructive' : ''}
              data-testid="input-delete-confirmation"
            />
            {fieldErrors.confirmation && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.confirmation}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="password">Enter your password to continue</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: undefined }));
                }}
                placeholder="Enter your password"
                required
                className={`pr-10 ${fieldErrors.password ? 'border-destructive' : ''}`}
                data-testid="input-delete-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            {fieldErrors.password && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              data-testid="button-cancel-delete-account"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={loading || confirmation !== 'DELETE' || !password}
              data-testid="button-confirm-delete-account"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {loading ? 'Deleting...' : 'Delete Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
