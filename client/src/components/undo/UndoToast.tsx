import { useEffect, useState } from 'react';
import { X, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLastAction } from '@/contexts/UndoContext';
import { getActionLabel } from '@/lib/undo/types';
import { cn } from '@/lib/utils';

export interface UndoToastProps {
  className?: string;
  autoHideDuration?: number;
}

export function UndoToast({ className, autoHideDuration = 5000 }: UndoToastProps) {
  const { lastAction, showUndoToast, dismissUndoToast, undoLastAction } = useLastAction();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (!showUndoToast) {
      setIsExiting(false);
    }
  }, [showUndoToast]);

  const handleUndo = async () => {
    setIsExiting(true);
    setTimeout(async () => {
      await undoLastAction();
      dismissUndoToast();
    }, 150);
  };

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => {
      dismissUndoToast();
    }, 150);
  };

  if (!showUndoToast || !lastAction) return null;

  const actionLabel = getActionLabel(lastAction);
  const isDestructive = lastAction.metadata.isDestructive;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-background border rounded-lg shadow-lg',
        'flex items-center gap-3 px-4 py-3',
        'transition-all duration-150',
        isExiting ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0',
        isDestructive && 'border-destructive/50',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {isDestructive && (
          <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
        )}
        <span className="text-sm font-medium">{actionLabel}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleUndo}
        className="gap-1"
      >
        <Undo2 className="w-3 h-3" />
        Undo
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
