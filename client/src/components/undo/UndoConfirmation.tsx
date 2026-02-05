import { useState, useCallback } from 'react';
import { AlertTriangle, Undo2, Redo2, Trash2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { UndoableAction, getActionLabel, isDestructiveAction } from '@/lib/undo/types';

export interface UndoConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: UndoableAction | null;
  type: 'undo' | 'redo' | 'delete' | 'restore';
  onConfirm: () => Promise<void>;
  onCancel?: () => void;
  title?: string;
  description?: string;
  warningMessage?: string;
}

export function UndoConfirmation({
  open,
  onOpenChange,
  action,
  type,
  onConfirm,
  onCancel,
  title,
  description,
  warningMessage,
}: UndoConfirmationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!action) return null;

  const actionLabel = getActionLabel(action);
  const isDestructive = action.metadata.isDestructive || isDestructiveAction(action.type);

  const getDefaultTitle = () => {
    switch (type) {
      case 'undo':
        return 'Confirm Undo';
      case 'redo':
        return 'Confirm Redo';
      case 'delete':
        return 'Confirm Delete';
      case 'restore':
        return 'Confirm Restore';
      default:
        return 'Confirm Action';
    }
  };

  const getDefaultDescription = () => {
    switch (type) {
      case 'undo':
        return 'Are you sure you want to undo this action?';
      case 'redo':
        return 'Are you sure you want to redo this action?';
      case 'delete':
        return 'Are you sure you want to delete this? This action may be undoable.';
      case 'restore':
        return 'Are you sure you want to restore this item?';
      default:
        return 'Are you sure you want to proceed?';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'undo':
        return <Undo2 className="w-4 h-4" />;
      case 'redo':
        return <Redo2 className="w-4 h-4" />;
      case 'delete':
        return <Trash2 className="w-4 h-4" />;
      case 'restore':
        return <RotateCcw className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getDefaultWarning = () => {
    if (type === 'undo' && isDestructive) {
      return 'This will restore previously deleted data. Some related changes may also be affected.';
    }
    if (type === 'delete') {
      return 'This action will remove the item. You may be able to undo this from the action history.';
    }
    return null;
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      if (dontAskAgain) {
        const storageKey = `undoConfirm_${type}_dismissed`;
        sessionStorage.setItem(storageKey, 'true');
      }
    } finally {
      setIsLoading(false);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const displayWarning = warningMessage || getDefaultWarning();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {(isDestructive || type === 'delete') && (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            {title || getDefaultTitle()}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>{description || getDefaultDescription()}</p>
            <div className="p-3 bg-muted rounded-lg">
              <div className="font-medium text-foreground">{actionLabel}</div>
              <div className="text-xs mt-1 text-muted-foreground">
                {new Date(action.metadata.timestamp).toLocaleString()}
              </div>
              {action.metadata.module && (
                <div className="text-xs mt-1 text-muted-foreground">
                  Module: {action.metadata.module}
                </div>
              )}
            </div>
            {displayWarning && (
              <p className="text-amber-600 dark:text-amber-400 text-sm">
                {displayWarning}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="dontAskAgainConfirmation"
            checked={dontAskAgain}
            onCheckedChange={(checked) => setDontAskAgain(checked === true)}
          />
          <label
            htmlFor="dontAskAgainConfirmation"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Don't ask for confirmation again for {type} actions
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={`gap-1 ${type === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
          >
            {isLoading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              getIcon()
            )}
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export interface UseUndoConfirmationOptions {
  type: 'undo' | 'redo' | 'delete' | 'restore';
  skipForNonDestructive?: boolean;
}

export function useUndoConfirmation(options: UseUndoConfirmationOptions = { type: 'undo' }) {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    action: UndoableAction | null;
    onConfirm: (() => Promise<void>) | null;
    customTitle?: string;
    customDescription?: string;
  }>({
    open: false,
    action: null,
    onConfirm: null,
  });

  const showConfirmation = useCallback(
    (
      action: UndoableAction,
      onConfirm: () => Promise<void>,
      customOptions?: { title?: string; description?: string }
    ) => {
      const storageKey = `undoConfirm_${options.type}_dismissed`;
      const skipConfirmation = sessionStorage.getItem(storageKey) === 'true';

      const isDestructive = action.metadata.isDestructive || isDestructiveAction(action.type);

      if (skipConfirmation || (options.skipForNonDestructive && !isDestructive && !action.metadata.requiresConfirmation)) {
        onConfirm();
        return;
      }

      setDialogState({
        open: true,
        action,
        onConfirm,
        customTitle: customOptions?.title,
        customDescription: customOptions?.description,
      });
    },
    [options]
  );

  const hideConfirmation = useCallback(() => {
    setDialogState({
      open: false,
      action: null,
      onConfirm: null,
    });
  }, []);

  const ConfirmationDialog = useCallback(() => (
    <UndoConfirmation
      open={dialogState.open}
      onOpenChange={(open) => {
        if (!open) hideConfirmation();
      }}
      action={dialogState.action}
      type={options.type}
      title={dialogState.customTitle}
      description={dialogState.customDescription}
      onConfirm={async () => {
        if (dialogState.onConfirm) {
          await dialogState.onConfirm();
        }
      }}
      onCancel={hideConfirmation}
    />
  ), [dialogState, options.type, hideConfirmation]);

  return {
    showConfirmation,
    hideConfirmation,
    ConfirmationDialog,
    isOpen: dialogState.open,
  };
}

export function useDeleteConfirmation() {
  return useUndoConfirmation({ type: 'delete', skipForNonDestructive: false });
}

export function useRestoreConfirmation() {
  return useUndoConfirmation({ type: 'restore', skipForNonDestructive: true });
}

export default UndoConfirmation;
