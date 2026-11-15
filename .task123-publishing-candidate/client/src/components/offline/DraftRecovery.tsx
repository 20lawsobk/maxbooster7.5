import { useState, useEffect, useCallback } from "react";
import { logger } from "@/lib/logger";
import {
  FileText,
  RotateCcw,
  Trash2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
import { cn } from "@/lib/utils";
import { draftStorage, Draft } from "@/lib/offline";
import { formatDistanceToNow, format } from "date-fns";

interface DraftRecoveryProps {
  className?: string;
  formId?: string;
  onRecover?: (data: unknown, formId: string) => void;
  onDiscard?: (formId: string) => void;
  showAllDrafts?: boolean;
  maxDrafts?: number;
}

export function DraftRecovery({
  className,
  formId,
  onRecover,
  onDiscard,
  showAllDrafts = true,
  maxDrafts = 20,
}: DraftRecoveryProps) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedDrafts, setExpandedDrafts] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({
    total: 0,
    totalSize: 0,
    oldestDraft: null as number | null,
    newestDraft: null as number | null,
  });

  const loadDrafts = useCallback(async () => {
    setIsLoading(true);
    try {
      await draftStorage.init();

      let loadedDrafts: Draft[];
      if (formId && !showAllDrafts) {
        const draft = await draftStorage.getDraft(formId);
        loadedDrafts = draft ? [draft] : [];
      } else {
        loadedDrafts = await draftStorage.getAllDrafts();
      }

      setDrafts(loadedDrafts.slice(0, maxDrafts));

      const draftStats = await draftStorage.getDraftStats();
      setStats(draftStats);
    } catch (error) {
      logger.error("[DraftRecovery] Failed to load drafts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [formId, showAllDrafts, maxDrafts]);

  useEffect(() => {
    loadDrafts();

    const unsubSaved = draftStorage.on("draft-saved", loadDrafts);
    const unsubDeleted = draftStorage.on("draft-deleted", loadDrafts);
    const unsubExpired = draftStorage.on("draft-expired", loadDrafts);

    return () => {
      unsubSaved();
      unsubDeleted();
      unsubExpired();
    };
  }, [loadDrafts]);

  const handleRecover = async (draft: Draft) => {
    onRecover?.(draft.data, draft.formId);
    setShowPreview(false);
    setSelectedDraft(null);
  };

  const handleDiscard = async (draft: Draft) => {
    try {
      await draftStorage.deleteDraft(draft.formId);
      onDiscard?.(draft.formId);
      setShowDeleteConfirm(false);
      setSelectedDraft(null);
    } catch (error) {
      logger.error("[DraftRecovery] Failed to discard draft:", error);
    }
  };

  const handleClearAll = async () => {
    try {
      await draftStorage.clearAll();
      setDrafts([]);
    } catch (error) {
      logger.error("[DraftRecovery] Failed to clear all drafts:", error);
    }
  };

  const toggleExpanded = (draftId: string) => {
    setExpandedDrafts((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) {
        next.delete(draftId);
      } else {
        next.add(draftId);
      }
      return next;
    });
  };

  const getFormLabel = (fId: string): string => {
    const parts = fId.split("-");
    if (parts.length > 1) {
      return parts.slice(0, -1).join(" ").replace(/_/g, " ");
    }
    return fId.replace(/_/g, " ").replace(/-/g, " ");
  };

  const getPreviewText = (data: unknown): string => {
    if (!data) return "";
    if (typeof data === "string") return data.substring(0, 200);
    if (typeof data === "object") {
      const values = Object.values(data as Record<string, unknown>).filter(
        (v) => typeof v === "string" && v.length > 0,
      );
      const preview = values.join(" ").substring(0, 200);
      return preview + (preview.length >= 200 ? "..." : "");
    }
    return "";
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card className={cn("w-full", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-lg">Draft Recovery</CardTitle>
              {drafts.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {drafts.length}
                </Badge>
              )}
            </div>
            {drafts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setSelectedDraft(null);
                  setShowDeleteConfirm(true);
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
          <CardDescription>
            {drafts.length > 0
              ? `${stats.total} drafts saved (${formatSize(stats.totalSize)})`
              : "No saved drafts found"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : drafts.length > 0 ? (
            <ScrollArea className="h-[350px]">
              <div className="space-y-2">
                {drafts.map((draft, index) => {
                  const isExpanded = expandedDrafts.has(draft.id);
                  const preview = getPreviewText(draft.data);

                  return (
                    <div key={draft.id}>
                      <div
                        className={cn(
                          "p-3 rounded-lg border transition-colors",
                          "hover:bg-muted/50 cursor-pointer",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div
                            className="flex-1 min-w-0"
                            onClick={() => toggleExpanded(draft.id)}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              <span className="font-medium text-sm truncate capitalize">
                                {getFormLabel(draft.formId)}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-xs px-1.5 py-0"
                              >
                                v{draft.version}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span>
                                Saved{" "}
                                {formatDistanceToNow(draft.updatedAt, {
                                  addSuffix: true,
                                })}
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0"
                            onClick={() => toggleExpanded(draft.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="mt-3 space-y-3">
                            {preview && (
                              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                                <span className="italic">"{preview}"</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">
                                  Created:
                                </span>
                                <br />
                                <span>
                                  {format(
                                    draft.createdAt,
                                    "MMM d, yyyy h:mm a",
                                  )}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Expires:
                                </span>
                                <br />
                                <span>
                                  {formatDistanceToNow(draft.expiresAt, {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setSelectedDraft(draft);
                                  setShowPreview(true);
                                }}
                              >
                                Preview
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                className="flex-1"
                                onClick={() => handleRecover(draft)}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Restore
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setSelectedDraft(draft);
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      {index < drafts.length - 1 && (
                        <Separator className="my-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <FileText className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">No drafts found</p>
              <p className="text-xs text-muted-foreground">
                Your form inputs will be automatically saved as you type
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Draft Preview
            </DialogTitle>
            <DialogDescription>
              {selectedDraft && (
                <span>
                  Saved{" "}
                  {formatDistanceToNow(selectedDraft.updatedAt, {
                    addSuffix: true,
                  })}{" "}
                  · Version {selectedDraft.version}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {selectedDraft && JSON.stringify(selectedDraft.data, null, 2)}
            </pre>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedDraft && handleRecover(selectedDraft)}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Restore Draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              {selectedDraft ? "Delete Draft?" : "Delete All Drafts?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDraft
                ? "This draft will be permanently deleted. This action cannot be undone."
                : `All ${drafts.length} drafts will be permanently deleted. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (selectedDraft) {
                  handleDiscard(selectedDraft);
                } else {
                  handleClearAll();
                  setShowDeleteConfirm(false);
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {selectedDraft ? "Delete Draft" : "Delete All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default DraftRecovery;
