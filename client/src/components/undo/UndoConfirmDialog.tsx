import { useState } from "react";
import { AlertTriangle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { UndoableAction, getActionLabel } from "@/lib/undo/types";

export interface UndoConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: UndoableAction | null;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function UndoConfirmDialog({
  open,
  onOpenChange,
  action,
  onConfirm,
  onCancel,
}: UndoConfirmDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!action) return null;

  const actionLabel = getActionLabel(action);
  const isDestructive = action.metadata.isDestructive;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
      if (dontAskAgain) {
        localStorage.setItem("undoConfirmDismissed", "true");
      }
    } finally {
      setIsLoading(false);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {isDestructive && (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            Confirm Undo
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>Are you sure you want to undo this action?</p>
            <div className="p-3 bg-muted rounded-lg">
              <div className="font-medium text-foreground">{actionLabel}</div>
              <div className="text-xs mt-1 text-muted-foreground">
                {new Date(action.metadata.timestamp).toLocaleString()}
              </div>
            </div>
            {isDestructive && (
              <p className="text-amber-600 dark:text-amber-400 text-sm">
                This will restore previously deleted data. Some related changes
                may also be affected.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-center space-x-2 py-2">
          <Checkbox
            id="dontAskAgain"
            checked={dontAskAgain}
            onCheckedChange={(checked) => setDontAskAgain(checked === true)}
          />
          <label
            htmlFor="dontAskAgain"
            className="text-sm text-muted-foreground cursor-pointer"
          >
            Don't ask for confirmation again
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className="gap-1"
          >
            {isLoading ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            Undo Action
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useUndoConfirmDialog() {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    action: UndoableAction | null;
    onConfirm: (() => Promise<void>) | null;
  }>({
    open: false,
    action: null,
    onConfirm: null,
  });

  const showConfirmDialog = (
    action: UndoableAction,
    onConfirm: () => Promise<void>,
  ) => {
    const skipConfirmation =
      localStorage.getItem("undoConfirmDismissed") === "true";

    if (skipConfirmation || !action.metadata.requiresConfirmation) {
      onConfirm();
      return;
    }

    setDialogState({
      open: true,
      action,
      onConfirm,
    });
  };

  const hideConfirmDialog = () => {
    setDialogState({
      open: false,
      action: null,
      onConfirm: null,
    });
  };

  const DialogComponent = () => (
    <UndoConfirmDialog
      open={dialogState.open}
      onOpenChange={(open) => {
        if (!open) hideConfirmDialog();
      }}
      action={dialogState.action}
      onConfirm={async () => {
        if (dialogState.onConfirm) {
          await dialogState.onConfirm();
        }
      }}
      onCancel={hideConfirmDialog}
    />
  );

  return {
    showConfirmDialog,
    hideConfirmDialog,
    UndoConfirmDialogComponent: DialogComponent,
  };
}
