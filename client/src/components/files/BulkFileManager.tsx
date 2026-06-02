import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getCsrfTokenFromCookie } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useToast } from "@/hooks/use-toast";
import {
  Trash2,
  Download,
  FolderInput,
  Copy,
  Share2,
  MoreHorizontal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileAudio,
  FileImage,
  File,
  X,
  Undo2,
  Archive,
  RefreshCw,
} from "lucide-react";

export type BulkOperationType =
  | "delete"
  | "move"
  | "download"
  | "duplicate"
  | "share"
  | "restore";

export type BulkOperationStatus =
  | "idle"
  | "confirming"
  | "processing"
  | "complete"
  | "error";

export interface BulkFileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  selected: boolean;
}

export interface BulkOperationResult {
  success: string[];
  failed: { id: string; error: string }[];
  totalRequested: number;
  totalSucceeded: number;
  totalFailed: number;
}

interface BulkFileManagerProps {
  files: BulkFileItem[];
  onSelectionChange?: (selectedIds: string[]) => void;
  onDelete?: (ids: string[]) => Promise<BulkOperationResult>;
  onMove?: (
    ids: string[],
    targetFolder: string,
  ) => Promise<BulkOperationResult>;
  onDownload?: (ids: string[]) => Promise<BulkOperationResult>;
  onDuplicate?: (ids: string[]) => Promise<BulkOperationResult>;
  onRestore?: (ids: string[]) => Promise<BulkOperationResult>;
  folders?: { id: string; name: string }[];
  showTrashActions?: boolean;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.startsWith("image/")) return FileImage;
  return File;
}

export function BulkFileManager({
  files,
  onSelectionChange,
  onDelete,
  onMove,
  onDownload,
  onDuplicate,
  onRestore,
  folders = [],
  showTrashActions = false,
  className,
}: BulkFileManagerProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [operationType, setOperationType] = useState<BulkOperationType | null>(
    null,
  );
  const [operationStatus, setOperationStatus] =
    useState<BulkOperationStatus>("idle");
  const [operationProgress, setOperationProgress] = useState({
    current: 0,
    total: 0,
    currentFile: "",
  });
  const [operationResult, setOperationResult] =
    useState<BulkOperationResult | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const selectedFiles = files.filter((f) => selectedIds.has(f.id));
  const selectedCount = selectedIds.size;
  const totalSelectedSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const allSelected = files.length > 0 && selectedCount === files.length;
  const someSelected = selectedCount > 0 && selectedCount < files.length;

  const toggleSelection = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange],
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const allIds = new Set(files.map((f) => f.id));
      setSelectedIds(allIds);
      onSelectionChange?.(Array.from(allIds));
    }
  }, [allSelected, files, onSelectionChange]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  const startOperation = (type: BulkOperationType) => {
    setOperationType(type);
    setShowConfirmDialog(true);
  };

  const executeOperation = async () => {
    if (!operationType || selectedCount === 0) return;

    setShowConfirmDialog(false);
    setOperationStatus("processing");
    setOperationProgress({
      current: 0,
      total: selectedCount,
      currentFile: selectedFiles[0]?.name || "",
    });

    try {
      let result: BulkOperationResult;
      const ids = Array.from(selectedIds);

      switch (operationType) {
        case "delete":
          if (onDelete) {
            result = await onDelete(ids);
          } else {
            const csrfToken = getCsrfTokenFromCookie();
            const response = await fetch("/api/files/bulk-delete", {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
              },
              body: JSON.stringify({ fileIds: ids }),
            });
            result = await response.json();
          }
          break;
        case "move":
          if (onMove) {
            result = await onMove(ids, selectedFolder);
          } else {
            result = {
              success: ids,
              failed: [],
              totalRequested: ids.length,
              totalSucceeded: ids.length,
              totalFailed: 0,
            };
          }
          break;
        case "download":
          if (onDownload) {
            result = await onDownload(ids);
          } else {
            result = {
              success: ids,
              failed: [],
              totalRequested: ids.length,
              totalSucceeded: ids.length,
              totalFailed: 0,
            };
          }
          break;
        case "duplicate":
          if (onDuplicate) {
            result = await onDuplicate(ids);
          } else {
            result = {
              success: ids,
              failed: [],
              totalRequested: ids.length,
              totalSucceeded: ids.length,
              totalFailed: 0,
            };
          }
          break;
        case "restore":
          if (onRestore) {
            result = await onRestore(ids);
          } else {
            result = {
              success: ids,
              failed: [],
              totalRequested: ids.length,
              totalSucceeded: ids.length,
              totalFailed: 0,
            };
          }
          break;
        default:
          throw new Error("Unknown operation");
      }

      setOperationResult(result);
      setOperationStatus("complete");
      setShowResultDialog(true);

      if (result.totalFailed === 0) {
        toast({
          title: getOperationSuccessTitle(operationType),
          description: `Successfully processed ${result.totalSucceeded} file${result.totalSucceeded > 1 ? "s" : ""}`,
        });
        clearSelection();
      } else {
        toast({
          title: "Operation Completed with Errors",
          description: `${result.totalFailed} file${result.totalFailed > 1 ? "s" : ""} failed`,
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/files/storage-usage"] });
    } catch (error) {
      setOperationStatus("error");
      toast({
        title: "Operation Failed",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    }
  };

  const getOperationSuccessTitle = (type: BulkOperationType) => {
    switch (type) {
      case "delete":
        return "Files Deleted";
      case "move":
        return "Files Moved";
      case "download":
        return "Download Started";
      case "duplicate":
        return "Files Duplicated";
      case "restore":
        return "Files Restored";
      default:
        return "Operation Complete";
    }
  };

  const getOperationIcon = (type: BulkOperationType) => {
    switch (type) {
      case "delete":
        return <Trash2 className="h-4 w-4" />;
      case "move":
        return <FolderInput className="h-4 w-4" />;
      case "download":
        return <Download className="h-4 w-4" />;
      case "duplicate":
        return <Copy className="h-4 w-4" />;
      case "restore":
        return <Undo2 className="h-4 w-4" />;
      default:
        return null;
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all files"
          />
          <span className="text-sm text-muted-foreground">
            {selectedCount > 0 ? (
              <>
                {selectedCount} selected · {formatBytes(totalSelectedSize)}
              </>
            ) : (
              `${files.length} files`
            )}
          </span>
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2">
            {!showTrashActions ? (
              <>
                {onDownload && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startOperation("download")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                )}
                {folders.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startOperation("move")}
                  >
                    <FolderInput className="h-4 w-4 mr-1" />
                    Move
                  </Button>
                )}
                {onDuplicate && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startOperation("duplicate")}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Duplicate
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startOperation("delete")}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startOperation("restore")}
                >
                  <Undo2 className="h-4 w-4 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => startOperation("delete")}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete Permanently
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="h-80">
        <div className="space-y-1">
          {files.map((file) => {
            const Icon = getFileIcon(file.type);
            const isSelected = selectedIds.has(file.id);

            return (
              <div
                key={file.id}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg border transition-colors cursor-pointer",
                  isSelected
                    ? "bg-primary/5 border-primary/30"
                    : "hover:bg-muted/50",
                )}
                onClick={() => toggleSelection(file.id)}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleSelection(file.id)}
                  aria-label={`Select ${file.name}`}
                />
                <div className="p-1.5 rounded bg-muted">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {operationType === "delete" && "Delete Files?"}
              {operationType === "move" && "Move Files?"}
              {operationType === "download" && "Download Files?"}
              {operationType === "duplicate" && "Duplicate Files?"}
              {operationType === "restore" && "Restore Files?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {operationType === "delete" && (
                <>
                  Are you sure you want to delete {selectedCount} file
                  {selectedCount > 1 ? "s" : ""}?
                  {!showTrashActions && " They will be moved to trash."}
                  {showTrashActions && " This action cannot be undone."}
                </>
              )}
              {operationType === "move" &&
                `Move ${selectedCount} file${selectedCount > 1 ? "s" : ""} to another folder?`}
              {operationType === "download" &&
                `Download ${selectedCount} file${selectedCount > 1 ? "s" : ""} (${formatBytes(totalSelectedSize)})?`}
              {operationType === "duplicate" &&
                `Create copies of ${selectedCount} file${selectedCount > 1 ? "s" : ""}?`}
              {operationType === "restore" &&
                `Restore ${selectedCount} file${selectedCount > 1 ? "s" : ""} from trash?`}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {operationType === "move" && folders.length > 0 && (
            <div className="space-y-2 py-2">
              <p className="text-sm font-medium">Select destination:</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
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
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeOperation}
              className={cn(
                operationType === "delete" &&
                  showTrashActions &&
                  "bg-destructive text-destructive-foreground",
              )}
            >
              {getOperationIcon(operationType!)}
              <span className="ml-1">
                {operationType === "delete" && "Delete"}
                {operationType === "move" && "Move"}
                {operationType === "download" && "Download"}
                {operationType === "duplicate" && "Duplicate"}
                {operationType === "restore" && "Restore"}
              </span>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={operationStatus === "processing"} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing Files
            </DialogTitle>
            <DialogDescription>
              Please wait while we process your files...
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Progress
              value={
                (operationProgress.current / operationProgress.total) * 100
              }
            />
            <p className="text-sm text-center text-muted-foreground">
              {operationProgress.current} of {operationProgress.total} files
            </p>
            {operationProgress.currentFile && (
              <p className="text-xs text-center text-muted-foreground truncate">
                {operationProgress.currentFile}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {operationResult?.totalFailed === 0 ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Operation Complete
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Completed with Errors
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {operationResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-lg bg-muted">
                  <p className="text-2xl font-bold">
                    {operationResult.totalRequested}
                  </p>
                  <p className="text-xs text-muted-foreground">Requested</p>
                </div>
                <div className="p-3 rounded-lg bg-green-500/10">
                  <p className="text-2xl font-bold text-green-500">
                    {operationResult.totalSucceeded}
                  </p>
                  <p className="text-xs text-muted-foreground">Succeeded</p>
                </div>
                <div className="p-3 rounded-lg bg-destructive/10">
                  <p className="text-2xl font-bold text-destructive">
                    {operationResult.totalFailed}
                  </p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>

              {operationResult.failed.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-destructive">
                    Failed Files:
                  </p>
                  <ScrollArea className="h-32">
                    <div className="space-y-1">
                      {operationResult.failed.map(({ id, error }) => (
                        <div
                          key={id}
                          className="text-xs p-2 rounded bg-destructive/5"
                        >
                          <span className="font-medium">{id}</span>: {error}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowResultDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function BulkOperationProgress({
  operation,
  progress,
  total,
  currentFile,
  onCancel,
  className,
}: {
  operation: BulkOperationType;
  progress: number;
  total: number;
  currentFile?: string;
  onCancel?: () => void;
  className?: string;
}) {
  const percentage = Math.round((progress / total) * 100);

  return (
    <div className={cn("p-4 border rounded-lg space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="font-medium capitalize">
            {operation}ing files...
          </span>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      <Progress value={percentage} />
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{currentFile ? `Processing: ${currentFile}` : ""}</span>
        <span>
          {progress} / {total} ({percentage}%)
        </span>
      </div>
    </div>
  );
}
