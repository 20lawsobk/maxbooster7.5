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
import { AlertTriangle, Trash2 } from 'lucide-react';
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

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();

    if (confirmation !== 'DELETE') {
      toast({
        title: 'Error',
        description: 'Please type DELETE to confirm',
        variant: 'destructive',
      });
      return;
    }

    if (!password) {
      toast({
        title: 'Error',
        description: 'Please enter your password',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      await apiRequest('DELETE', '/api/auth/account', { password });

      toast({
        title: 'Account Deleted',
        description: 'Your account has been permanently deleted',
      });

      setTimeout(() => {
        logout();
      }, 1500);
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete account',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
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
          <div>
            <Label htmlFor="confirmation">
              Type <strong className="text-destructive">DELETE</strong> to confirm
            </Label>
            <Input
              id="confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type DELETE"
              required
              data-testid="input-delete-confirmation"
            />
          </div>

          <div>
            <Label htmlFor="password">Enter your password to continue</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              data-testid="input-delete-password"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setConfirmation('');
                setPassword('');
              }}
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
