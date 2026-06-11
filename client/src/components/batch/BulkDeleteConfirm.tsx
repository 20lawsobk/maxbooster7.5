import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2, FileWarning, Undo2 } from "lucide-react";

export interface DeleteItem {
  id: string;
  name: string;
  type?: string;
  canRecover?: boolean;
  hasReferences?: boolean;
  referenceCount?: number;
}

export interface BulkDeleteConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: DeleteItem[];
  onConfirm: (ids: string[], permanently: boolean) => Promise<void>;
  title?: string;
  description?: string;
  isLoading?: boolean;
  allowPermanentDelete?: boolean;
  resourceName?: string;
}

export function BulkDeleteConfirm({
  open,
  onOpenChange,
  items,
  onConfirm,
  title,
  description,
  isLoading = false,
  allowPermanentDelete = false,
  resourceName = "item",
}: BulkDeleteConfirmProps) {
  const [confirmText, setConfirmText] = useState("");
  const [permanently, setPermanently] = useState(false);

  const itemCount = items.length;
  const hasReferences = items.some((item) => item.hasReferences);
  const totalReferences = items.reduce(
    (sum, item) => sum + (item.referenceCount || 0),
    0,
  );
  const canRecover =
    items.every((item) => item.canRecover !== false) && !permanently;

  const requiresConfirmation = itemCount >= 5 || hasReferences || permanently;
  const confirmationPhrase = `delete ${itemCount}`;
  const isConfirmed =
    !requiresConfirmation || confirmText.toLowerCase() === confirmationPhrase;

  const handleConfirm = useCallback(async () => {
    if (!isConfirmed) return;
    const ids = items.map((item) => item.id);
    await onConfirm(ids, permanently);
    setConfirmText("");
    setPermanently(false);
    onOpenChange(false);
  }, [items, onConfirm, permanently, isConfirmed, onOpenChange]);

  const handleCancel = useCallback(() => {
    setConfirmText("");
    setPermanently(false);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {title ||
              `Delete ${itemCount} ${resourceName}${itemCount > 1 ? "s" : ""}`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                {description ||
                  `Are you sure you want to delete ${itemCount} ${resourceName}${itemCount > 1 ? "s" : ""}?`}
              </p>

              {hasReferences && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <FileWarning className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-600">
                      Warning: Items have references
                    </p>
                    <p className="text-muted-foreground">
                      {totalReferences} reference
                      {totalReferences > 1 ? "s" : ""} will also be affected.
                    </p>
                  </div>
                </div>
              )}

              {canRecover && (
                <div className="flex items-start gap-2 p-3 bg-muted rounded-lg">
                  <Undo2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Items will be moved to trash and can be recovered within 30
                    days.
                  </p>
                </div>
              )}

              {itemCount <= 10 && (
                <ScrollArea className="max-h-32">
                  <div className="space-y-1">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1 px-2 rounded bg-muted/50 text-sm"
                      >
                        <span className="truncate">{item.name}</span>
                        {item.type && (
                          <Badge
                            variant="outline"
                            className="text-xs shrink-0 ml-2"
                          >
                            {item.type}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {allowPermanentDelete && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <Checkbox
                    id="permanent-delete"
                    checked={permanently}
                    onCheckedChange={(checked) =>
                      setPermanently(checked === true)
                    }
                  />
                  <Label
                    htmlFor="permanent-delete"
                    className="text-sm cursor-pointer text-destructive"
                  >
                    Delete permanently (cannot be recovered)
                  </Label>
                </div>
              )}

              {requiresConfirmation && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Type{" "}
                    <span className="font-mono text-destructive">
                      "{confirmationPhrase}"
                    </span>{" "}
                    to confirm:
                  </p>
                  <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={confirmationPhrase}
                    className={
                      confirmText &&
                      confirmText.toLowerCase() !== confirmationPhrase
                        ? "border-destructive"
                        : ""
                    }
                  />
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel} disabled={isLoading}>
            Cancel
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading || !isConfirmed}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete {itemCount} {resourceName}
                {itemCount > 1 ? "s" : ""}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function useBulkDeleteDialog<T extends DeleteItem>() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<
    ((ids: string[], permanently: boolean) => Promise<void>) | null
  >(null);

  const openDialog = useCallback(
    (
      itemsToDelete: T[],
      onConfirm: (ids: string[], permanently: boolean) => Promise<void>,
    ) => {
      setItems(itemsToDelete);
      setOnConfirmCallback(() => onConfirm);
      setOpen(true);
    },
    [],
  );

  const handleConfirm = useCallback(
    async (ids: string[], permanently: boolean) => {
      if (!onConfirmCallback) return;
      setIsLoading(true);
      try {
        await onConfirmCallback(ids, permanently);
      } finally {
        setIsLoading(false);
      }
    },
    [onConfirmCallback],
  );

  return {
    open,
    setOpen,
    items,
    isLoading,
    openDialog,
    dialogProps: {
      open,
      onOpenChange: setOpen,
      items,
      onConfirm: handleConfirm,
      isLoading,
    },
  };
}
