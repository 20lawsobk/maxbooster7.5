import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Save, Trash2, X } from "lucide-react";

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => Promise<void> | void;
  onDiscard: () => void;
  onCancel: () => void;
  projectName?: string;
  isSaving?: boolean;
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  onCancel,
  projectName = "this project",
  isSaving = false,
}: UnsavedChangesDialogProps) {
  const handleSave = async () => {
    await onSave();
    onOpenChange(false);
  };

  const handleDiscard = () => {
    onDiscard();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#1e1e22] border-[#333] text-white max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center gap-2">
            <Save className="h-5 w-5 text-amber-400" />
            Unsaved Changes
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-400">
            You have unsaved changes in "{projectName}". Would you like to save
            before continuing?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="ghost"
            onClick={handleCancel}
            disabled={isSaving}
            className="text-gray-400 hover:text-white hover:bg-[#333]"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDiscard}
            disabled={isSaving}
            className="bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300 border border-red-600/30"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Discard Changes
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
