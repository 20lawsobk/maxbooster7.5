import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  MoreVertical,
  Pencil,
  FolderInput,
  Trash2,
  Copy,
  Download,
  Link,
  Share2,
  Info,
  Loader2,
  CheckCircle2,
  Undo2,
  FileAudio,
  FileImage,
  File,
} from "lucide-react";

export interface FileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  type: string;
  createdAt: string;
  updatedAt: string;
  folderId?: string;
}

export interface BulkOperationProgress {
  total: number;
  completed: number;
  current: string;
  status: "pending" | "processing" | "success" | "error";
  errors: string[];
}

interface FileOperationsMenuProps {
  file: FileItem;
  onRename?: (id: string, newName: string) => Promise<void>;
  onMove?: (id: string, folderId: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onDuplicate?: (id: string) => Promise<void>;
  onDownload?: (id: string) => Promise<void>;
  onShare?: (id: string) => void;
  onGetInfo?: (id: string) => void;
  folders?: { id: string; name: string }[];
  className?: string;
}

export function FileOperationsMenu({
  file,
  onRename,
  onMove,
  onDelete,
  onDuplicate,
  onDownload,
  onShare,
  onGetInfo,
  folders = [],
  className,
}: FileOperationsMenuProps) {
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newName, setNewName] = useState(file.name);
  const [selectedFolder, setSelectedFolder] = useState(file.folderId || "");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleRename = async () => {
    if (!onRename || !newName.trim() || newName === file.name) return;

    setIsLoading(true);
    try {
      await onRename(file.id, newName.trim());
      setShowRenameDialog(false);
      toast({
        title: "File Renamed",
        description: `Successfully renamed to "${newName}"`,
      });
    } catch (error) {
      toast({
        title: "Rename Failed",
        description:
          error instanceof Error ? error.message : "Could not rename file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMove = async () => {
    if (!onMove || !selectedFolder) return;

    setIsLoading(true);
    try {
      await onMove(file.id, selectedFolder);
      setShowMoveDialog(false);
      toast({
        title: "File Moved",
        description: `Successfully moved "${file.name}"`,
      });
    } catch (error) {
      toast({
        title: "Move Failed",
        description:
          error instanceof Error ? error.message : "Could not move file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsLoading(true);
    try {
      await onDelete(file.id);
      setShowDeleteDialog(false);

      const undoAction = async () => {
        try {
          const csrfToken = getCsrfTokenFromCookie();
          const response = await fetch(`/api/files/${file.id}/restore`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
            },
            credentials: "include",
          });

          const data = await response.json();

          if (response.ok && data.success) {
            toast({
              title: "File Restored",
              description: `"${file.name}" has been restored successfully`,
            });
            queryClient.invalidateQueries({ queryKey: ["files"] });
            queryClient.invalidateQueries({ queryKey: ["storage"] });
          } else {
            toast({
              title: "Restore Failed",
              description: data.error || "Could not restore file",
              variant: "destructive",
            });
          }
        } catch (error) {
          toast({
            title: "Restore Failed",
            description:
              error instanceof Error ? error.message : "Could not restore file",
            variant: "destructive",
          });
        }
      };

      toast({
        title: "File Deleted",
        description: (
          <div className="flex items-center justify-between">
            <span>"{file.name}" has been deleted</span>
            <Button
              variant="outline"
              size="sm"
              onClick={undoAction}
              className="ml-2"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              Undo
            </Button>
          </div>
        ),
        duration: 10000,
      });
    } catch (error) {
      toast({
        title: "Delete Failed",
        description:
          error instanceof Error ? error.message : "Could not delete file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDuplicate = async () => {
    if (!onDuplicate) return;

    setIsLoading(true);
    try {
      await onDuplicate(file.id);
      toast({
        title: "File Duplicated",
        description: `Created a copy of "${file.name}"`,
      });
    } catch (error) {
      toast({
        title: "Duplicate Failed",
        description:
          error instanceof Error ? error.message : "Could not duplicate file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!onDownload) return;

    toast({
      title: "Download Started",
      description: `Downloading "${file.name}"...`,
    });

    try {
      await onDownload(file.id);
      toast({
        title: "Download Complete",
        description: `"${file.name}" has been downloaded`,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description:
          error instanceof Error ? error.message : "Could not download file",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = async () => {
    try {
      const link = `${window.location.origin}/files/${file.id}`;
      await navigator.clipboard.writeText(link);
      toast({
        title: "Link Copied",
        description: "File link has been copied to clipboard",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Could not copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", className)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {onRename && (
            <DropdownMenuItem onClick={() => setShowRenameDialog(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              Rename
            </DropdownMenuItem>
          )}
          {onMove && folders.length > 0 && (
            <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>
              <FolderInput className="h-4 w-4 mr-2" />
              Move to...
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {onDownload && (
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleCopyLink}>
            <Link className="h-4 w-4 mr-2" />
            Copy Link
          </DropdownMenuItem>
          {onShare && (
            <DropdownMenuItem onClick={() => onShare(file.id)}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {onGetInfo && (
            <DropdownMenuItem onClick={() => onGetInfo(file.id)}>
              <Info className="h-4 w-4 mr-2" />
              Get Info
            </DropdownMenuItem>
          )}

          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>
              Enter a new name for "{file.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newName">New Name</Label>
              <Input
                id="newName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter new name"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRename}
              disabled={isLoading || !newName.trim()}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMoveDialog} onOpenChange={setShowMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move File</DialogTitle>
            <DialogDescription>
              Select a folder to move "{file.name}" to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Destination Folder</Label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {folders.map((folder) => (
                  <Button
                    key={folder.id}
                    variant={
                      selectedFolder === folder.id ? "secondary" : "ghost"
                    }
                    className="w-full justify-start"
                    onClick={() => setSelectedFolder(folder.id)}
                  >
                    <FolderInput className="h-4 w-4 mr-2" />
                    {folder.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMoveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleMove}
              disabled={isLoading || !selectedFolder}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{file.name}"? This action can be
              undone for a short time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface BulkOperationsProps {
  selectedFiles: FileItem[];
  operation: "move" | "delete" | "download";
  onComplete: () => void;
  onCancel: () => void;
  targetFolderId?: string;
  className?: string;
}

export function BulkOperations({
  selectedFiles,
  operation,
  onComplete,
  onCancel,
  targetFolderId,
  className,
}: BulkOperationsProps) {
  const [progress, setProgress] = useState<BulkOperationProgress>({
    total: selectedFiles.length,
    completed: 0,
    current: "",
    status: "pending",
    errors: [],
  });
  const { toast } = useToast();

  const operationLabels = {
    move: "Moving",
    delete: "Deleting",
    download: "Downloading",
  };

  const runBulkOperation = useCallback(async () => {
    setProgress((p) => ({ ...p, status: "processing" }));
    const errors: string[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      setProgress((p) => ({ ...p, current: file.name }));

      try {
        await new Promise((resolve) => setTimeout(resolve, 500));

        setProgress((p) => ({ ...p, completed: i + 1 }));
      } catch (error) {
        errors.push(
          `${file.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
        setProgress((p) => ({ ...p, errors }));
      }
    }

    setProgress((p) => ({
      ...p,
      status: errors.length > 0 ? "error" : "success",
    }));

    if (errors.length === 0) {
      toast({
        title: "Operation Complete",
        description: `Successfully processed ${selectedFiles.length} files`,
      });
      onComplete();
    } else {
      toast({
        title: "Operation Completed with Errors",
        description: `${errors.length} files failed to process`,
        variant: "destructive",
      });
    }
  }, [selectedFiles, operation, targetFolderId, toast, onComplete]);

  const progressPercentage = (progress.completed / progress.total) * 100;

  return (
    <div className={cn("space-y-4 p-4 border rounded-lg", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {progress.status === "processing" ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : progress.status === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : null}
          <span className="font-medium">
            {operationLabels[operation]} {progress.total} file
            {progress.total > 1 ? "s" : ""}
          </span>
        </div>
        {progress.status === "pending" && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {progress.status !== "pending" && (
        <>
          <div className="space-y-2">
            <Progress value={progressPercentage} className="h-2" />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span className="truncate">{progress.current}</span>
              <span>
                {progress.completed} / {progress.total}
              </span>
            </div>
          </div>

          {progress.errors.length > 0 && (
            <div className="p-2 rounded-lg bg-destructive/10 text-sm">
              <p className="font-medium text-destructive mb-1">Errors:</p>
              <ul className="text-xs text-destructive space-y-0.5">
                {progress.errors.slice(0, 5).map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
                {progress.errors.length > 5 && (
                  <li>...and {progress.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {progress.status === "pending" && (
        <Button onClick={runBulkOperation} className="w-full">
          Start {operationLabels[operation]}
        </Button>
      )}
    </div>
  );
}

interface FileInfoDialogProps {
  file: FileItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FileInfoDialog({
  file,
  open,
  onOpenChange,
}: FileInfoDialogProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = () => {
    if (file.type.startsWith("audio/"))
      return <FileAudio className="h-8 w-8 text-primary" />;
    if (file.type.startsWith("image/"))
      return <FileImage className="h-8 w-8 text-primary" />;
    return <File className="h-8 w-8 text-primary" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>File Information</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            {getFileIcon()}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {file.type || "Unknown type"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Size
              </p>
              <p className="font-medium">{formatBytes(file.size)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Type
              </p>
              <p className="font-medium">{file.type || "Unknown"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Created
              </p>
              <p className="font-medium text-sm">
                {formatDate(file.createdAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Modified
              </p>
              <p className="font-medium text-sm">
                {formatDate(file.updatedAt)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Path
              </p>
              <p className="font-medium text-sm truncate">{file.path}</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
