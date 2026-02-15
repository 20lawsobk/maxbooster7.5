import { useState } from 'react';
import { Bell, BellOff, Smartphone, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PushPermissionPromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGranted: () => void;
  onDenied: () => void;
}

export function PushPermissionPrompt({
  open,
  onOpenChange,
  onGranted,
  onDenied,
}: PushPermissionPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestPermission = async () => {
    setIsRequesting(true);
    setError(null);

    try {
      if (!('Notification' in window)) {
        setError('Push notifications are not supported in this browser.');
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission === 'granted') {
        onGranted();
        onOpenChange(false);
      } else if (permission === 'denied') {
        onDenied();
        setError('Permission denied. You can enable notifications in your browser settings.');
      } else {
        setError('Permission request was dismissed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while requesting permission.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Enable Push Notifications
          </DialogTitle>
          <DialogDescription className="text-center">
            Stay updated with real-time notifications about your releases, earnings, and collaborations.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-2">
              <Smartphone className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Instant updates</p>
              <p className="text-sm text-muted-foreground">
                Get notified immediately when you receive payments or collaboration invites.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900/30 p-2">
              <Bell className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm">Release milestones</p>
              <p className="text-sm text-muted-foreground">
                Celebrate when your tracks hit 100, 1K, or 10K streams.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-purple-100 dark:bg-purple-900/30 p-2">
              <BellOff className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-sm">You're in control</p>
              <p className="text-sm text-muted-foreground">
                Customize which notifications you receive anytime in settings.
              </p>
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            onClick={handleRequestPermission}
            disabled={isRequesting}
            className="w-full"
            data-testid="btn-enable-push"
          >
            {isRequesting ? 'Requesting...' : 'Enable Notifications'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full"
            data-testid="btn-dismiss-push"
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
