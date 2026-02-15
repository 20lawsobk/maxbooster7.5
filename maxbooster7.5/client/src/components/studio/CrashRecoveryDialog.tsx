import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const RECOVERY_KEY = 'daw_recovery';
const RECOVERY_TIMESTAMP_KEY = 'daw_recovery_timestamp';

interface RecoveryData {
  metadata?: {
    name?: string;
    modifiedAt?: number;
  };
}

interface CrashRecoveryDialogProps {
  onRecover: (data: string) => void;
  onDiscard: () => void;
}

export function CrashRecoveryDialog({ onRecover, onDiscard }: CrashRecoveryDialogProps) {
  const [open, setOpen] = useState(false);
  const [recoveryData, setRecoveryData] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('Unknown Project');
  const [lastModified, setLastModified] = useState<number | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    try {
      const data = localStorage.getItem(RECOVERY_KEY);
      const timestamp = localStorage.getItem(RECOVERY_TIMESTAMP_KEY);

      if (data) {
        setRecoveryData(data);

        try {
          const parsed: RecoveryData = JSON.parse(data);
          if (parsed.metadata?.name) {
            setProjectName(parsed.metadata.name);
          }
          if (parsed.metadata?.modifiedAt) {
            setLastModified(parsed.metadata.modifiedAt);
          } else if (timestamp) {
            setLastModified(parseInt(timestamp));
          }
        } catch {
          if (timestamp) {
            setLastModified(parseInt(timestamp));
          }
        }

        setOpen(true);
      }
    } catch (error) {
      console.error('[CrashRecovery] Failed to check for recovery data:', error);
    }
  }, []);

  const handleRecover = async () => {
    if (!recoveryData) return;

    setIsRecovering(true);
    try {
      onRecover(recoveryData);
      localStorage.removeItem(RECOVERY_KEY);
      localStorage.removeItem(RECOVERY_TIMESTAMP_KEY);
      setOpen(false);
    } catch (error) {
      console.error('[CrashRecovery] Recovery failed:', error);
    } finally {
      setIsRecovering(false);
    }
  };

  const handleDiscard = () => {
    localStorage.removeItem(RECOVERY_KEY);
    localStorage.removeItem(RECOVERY_TIMESTAMP_KEY);
    onDiscard();
    setOpen(false);
  };

  if (!open) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="bg-[#1e1e22] border-[#333] text-white max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Recover Unsaved Work?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400 space-y-2">
            <p>
              It looks like there was unsaved work from a previous session.
            </p>
            <div className="bg-[#2a2a2e] rounded-md p-3 mt-3 border border-[#444]">
              <p className="text-white font-medium">{projectName}</p>
              {lastModified && (
                <p className="text-sm text-gray-500 mt-1">
                  Last modified {formatDistanceToNow(lastModified, { addSuffix: true })}
                </p>
              )}
            </div>
            <p className="text-sm mt-3">
              Would you like to recover this work or start fresh?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="destructive"
            onClick={handleDiscard}
            disabled={isRecovering}
            className="bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 border border-red-600/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Discard
          </Button>
          <Button
            onClick={handleRecover}
            disabled={isRecovering}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRecovering ? 'animate-spin' : ''}`} />
            {isRecovering ? 'Recovering...' : 'Recover Work'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
