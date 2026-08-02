import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, Clock, RotateCcw, Trash2, GitCompare, Save, AlertTriangle, Check, ChevronRight, Download, Eye, Loader2, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type VersionOutcomeType =
  | "new_version_created"
  | "version_restored"
  | "version_compared"
  | "version_deleted"
  | "auto_save_completed"
  | "unsaved_changes_warning";

export interface Version {
  id: string;
  version: number;
  name: string;
  description?: string;
  createdBy: string;
  createdByName: string;
  createdByAvatar?: string;
  createdAt: Date;
  size?: number;
  changes?: string[];
  isAutoSave?: boolean;
  isCurrent?: boolean;
}

export interface VersionComparison {
  versionA: Version;
  versionB: Version;
  changes: string[];
}

interface VersionHistoryProps {
  projectId: string;
  versions: Version[];
  currentVersionId?: string;
  hasUnsavedChanges?: boolean;
  lastAutoSave?: Date;
  onRestore: (versionId: string) => Promise<void>;
  onCompare: (
    versionAId: string,
    versionBId: string,
  ) => Promise<VersionComparison>;
  onDelete: (versionId: string) => Promise<void>;
  onSaveVersion: (name?: string, description?: string) => Promise<void>;
  onDownload?: (versionId: string) => Promise<void>;
  onPreview?: (versionId: string) => void;
  onOutcome?: (type: VersionOutcomeType, details?: Record<string, any>) => void;
  className?: string;
}

export function VersionHistory({
  _projectId,
  versions,
  currentVersionId,
  hasUnsavedChanges = false,
  lastAutoSave,
  onRestore,
  onCompare,
  onDelete,
  onSaveVersion,
  onDownload,
  onPreview,
  onOutcome,
  className,
}: VersionHistoryProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [_selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<
    [string | null, string | null]
  >([null, null]);
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<Version | null>(null);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => Promise<void>) | null
  >(null);

  const handleRestore = useCallback(
    async (version: Version) => {
      if (hasUnsavedChanges) {
        setShowUnsavedWarning(true);
        setPendingAction(() => async () => {
          await performRestore(version);
        });
        onOutcome?.("unsaved_changes_warning", { versionId: version.id });
        return;
      }

      await performRestore(version);
    },
    [hasUnsavedChanges, onOutcome],
  );

  const performRestore = async (version: Version) => {
    setIsLoading(true);
    try {
      await onRestore(version.id);

      toast({
        title: "Version Restored",
        description: (
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-green-400" />
            <span>Restored to {version.name}</span>
          </div>
        ),
      });

      onOutcome?.("version_restored", {
        versionId: version.id,
        versionName: version.name,
      });
    } catch (error) {
      toast({
        title: "Restore Failed",
        description: "Failed to restore version. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompare = useCallback(async () => {
    if (!compareVersions[0] || !compareVersions[1]) return;

    setIsLoading(true);
    try {
      const result = await onCompare(compareVersions[0], compareVersions[1]);
      setComparison(result);
      setShowCompareDialog(true);

      onOutcome?.("version_compared", {
        versionAId: compareVersions[0],
        versionBId: compareVersions[1],
      });
    } catch (error) {
      toast({
        title: "Compare Failed",
        description: "Failed to compare versions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [compareVersions, onCompare, onOutcome, toast]);

  const handleDelete = useCallback(async () => {
    if (!versionToDelete) return;

    setIsLoading(true);
    try {
      await onDelete(versionToDelete.id);

      toast({
        title: "Version Deleted",
        description: `${versionToDelete.name} has been deleted`,
      });

      onOutcome?.("version_deleted", { versionId: versionToDelete.id });
      setShowDeleteDialog(false);
      setVersionToDelete(null);
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Failed to delete version. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [versionToDelete, onDelete, onOutcome, toast]);

  const handleSaveVersion = useCallback(async () => {
    setIsLoading(true);
    try {
      await onSaveVersion();

      toast({
        title: "Version Saved",
        description: (
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-green-400" />
            <span>New version created successfully</span>
          </div>
        ),
      });

      onOutcome?.("new_version_created");
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save version. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [onSaveVersion, onOutcome, toast]);

  const toggleCompareSelection = (versionId: string) => {
    if (compareVersions[0] === versionId) {
      setCompareVersions([compareVersions[1], null]);
    } else if (compareVersions[1] === versionId) {
      setCompareVersions([compareVersions[0], null]);
    } else if (!compareVersions[0]) {
      setCompareVersions([versionId, compareVersions[1]]);
    } else if (!compareVersions[1]) {
      setCompareVersions([compareVersions[0], versionId]);
    } else {
      setCompareVersions([compareVersions[1], versionId]);
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  return (
    <div
      className={cn("bg-zinc-950 rounded-lg border border-zinc-800", className)}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium">Version History</span>
          <Badge variant="secondary" className="text-xs">
            {versions.length} versions
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge
              variant="outline"
              className="text-amber-400 border-amber-400/30"
            >
              <AlertTriangle className="w-3 h-3 mr-1" />
              Unsaved
            </Badge>
          )}

          {lastAutoSave && (
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Cloud className="w-3 h-3" />
              {formatDate(lastAutoSave)}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompareMode(!compareMode)}
            className={cn(
              compareMode && "bg-violet-500/20 border-violet-500/50",
            )}
          >
            <GitCompare className="w-4 h-4 mr-1" />
            Compare
          </Button>

          <Button size="sm" onClick={handleSaveVersion} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>

      {compareMode && compareVersions[0] && compareVersions[1] && (
        <div className="px-4 py-2 bg-violet-500/10 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs text-violet-400">
            Comparing {versions.find((v) => v.id === compareVersions[0])?.name}{" "}
            with {versions.find((v) => v.id === compareVersions[1])?.name}
          </span>
          <Button size="sm" onClick={handleCompare} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "View Diff"
            )}
          </Button>
        </div>
      )}

      <ScrollArea className="h-80">
        <div className="p-2">
          <AnimatePresence mode="popLayout">
            {versions.map((version, index) => {
              const isSelected = compareVersions.includes(version.id);
              const isCurrent =
                version.isCurrent || version.id === currentVersionId;

              return (
                <motion.div
                  key={version.id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={cn(
                    "relative flex items-start gap-3 p-3 rounded-lg transition-colors",
                    isCurrent
                      ? "bg-green-500/10 border border-green-500/30"
                      : "hover:bg-zinc-900",
                    compareMode && isSelected && "ring-2 ring-violet-500",
                  )}
                >
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-3 h-3 rounded-full border-2",
                        isCurrent
                          ? "bg-green-500 border-green-400"
                          : version.isAutoSave
                            ? "bg-blue-500/50 border-blue-400/50"
                            : "bg-zinc-700 border-zinc-600",
                      )}
                    />
                    {index < versions.length - 1 && (
                      <div className="w-0.5 flex-1 bg-zinc-800 mt-1" />
                    )}
                  </div>

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() =>
                      compareMode
                        ? toggleCompareSelection(version.id)
                        : setSelectedVersion(version)
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {version.name}
                      </span>
                      {isCurrent && (
                        <Badge className="bg-green-500/20 text-green-400 text-[10px]">
                          Current
                        </Badge>
                      )}
                      {version.isAutoSave && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-blue-400 border-blue-400/30"
                        >
                          Auto-save
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Avatar className="w-4 h-4">
                        <AvatarImage src={version.createdByAvatar} />
                        <AvatarFallback className="text-[8px]">
                          {(version.createdByName || "?").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-zinc-500">
                        {version.createdByName}
                      </span>
                      <span className="text-xs text-zinc-600">•</span>
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(version.createdAt)}
                      </span>
                      {version.size && (
                        <>
                          <span className="text-xs text-zinc-600">•</span>
                          <span className="text-xs text-zinc-500">
                            {formatSize(version.size)}
                          </span>
                        </>
                      )}
                    </div>

                    {version.description && (
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                        {version.description}
                      </p>
                    )}
                  </div>

                  {!compareMode && (
                    <div className="flex items-center gap-1">
                      {onPreview && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onPreview(version.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                      {onDownload && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onDownload(version.id)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                      {!isCurrent && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleRestore(version)}
                            disabled={isLoading}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-300"
                            onClick={() => {
                              setVersionToDelete(version);
                              setShowDeleteDialog(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {compareMode && (
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full border-2 flex items-center justify-center",
                        isSelected
                          ? "bg-violet-500 border-violet-400"
                          : "border-zinc-600",
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4" />}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <Dialog open={showCompareDialog} onOpenChange={setShowCompareDialog}>
        <DialogContent className="max-w-2xl bg-zinc-950 border-zinc-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-violet-400" />
              Version Comparison
            </DialogTitle>
            {comparison && (
              <DialogDescription>
                Comparing {comparison.versionA.name} with{" "}
                {comparison.versionB.name}
              </DialogDescription>
            )}
          </DialogHeader>

          {comparison && (
            <ScrollArea className="h-64">
              <div className="space-y-2 p-2">
                {comparison.changes.length > 0 ? (
                  comparison.changes.map((change, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 bg-zinc-900 rounded text-sm"
                    >
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                      {change}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-zinc-500">
                    No differences found between versions
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCompareDialog(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <Trash2 className="w-5 h-5" />
              Delete Version
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{versionToDelete.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showUnsavedWarning}
        onOpenChange={setShowUnsavedWarning}
      >
        <AlertDialogContent className="bg-zinc-950 border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Restoring this version will discard your
              current changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingAction) {
                  await pendingAction();
                  setPendingAction(null);
                }
                setShowUnsavedWarning(false);
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Discard & Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default VersionHistory;
