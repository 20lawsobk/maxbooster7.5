import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch,
  GitMerge,
  Check,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Eye,
  Code,
  Diff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export type ConflictResolutionType =
  | "auto_merge"
  | "manual_merge"
  | "accept_theirs"
  | "accept_mine";

export type ConflictOutcomeType =
  | "edit_conflict_detected"
  | "auto_merge_successful"
  | "manual_merge_required"
  | "their_changes_accepted"
  | "your_changes_accepted"
  | "changes_merged_with_diff";

export interface ConflictDetails {
  id: string;
  elementId?: string;
  elementType: "track" | "clip" | "effect" | "setting" | "text";
  description: string;
  yourChanges: {
    userId: string;
    userName: string;
    content: string;
    timestamp: Date;
  };
  theirChanges: {
    userId: string;
    userName: string;
    content: string;
    timestamp: Date;
  };
  baseContent: string;
  canAutoMerge: boolean;
  autoMergePreview?: string;
}

interface ConflictResolutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflict: ConflictDetails | null;
  onResolve: (
    resolution: ConflictResolutionType,
    mergedContent?: string,
  ) => Promise<void>;
  className?: string;
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  conflict,
  onResolve,
  className,
}: ConflictResolutionDialogProps) {
  const { toast } = useToast();
  const [isResolving, setIsResolving] = useState(false);
  const [activeView, setActiveView] = useState<"split" | "unified" | "manual">(
    "split",
  );
  const [manualContent, setManualContent] = useState("");

  const handleResolve = useCallback(
    async (resolution: ConflictResolutionType) => {
      if (!conflict) return;

      setIsResolving(true);
      try {
        const mergedContent =
          resolution === "manual_merge"
            ? manualContent
            : resolution === "auto_merge"
              ? conflict.autoMergePreview
              : undefined;

        await onResolve(resolution, mergedContent);

        let title: string;
        let description: React.ReactNode;

        switch (resolution) {
          case "auto_merge":
            title = "Auto-Merge Successful";
            description = (
              <div className="flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-green-400" />
                <span>Changes have been automatically merged</span>
              </div>
            );
            break;
          case "manual_merge":
            title = "Changes Merged";
            description = (
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-400" />
                <span>Your manual merge has been applied</span>
              </div>
            );
            break;
          case "accept_theirs":
            title = "Their Changes Accepted";
            description = `${conflict.theirChanges.userName}'s changes have been applied`;
            break;
          case "accept_mine":
            title = "Your Changes Accepted";
            description = "Your changes have been applied";
            break;
        }

        toast({ title, description });
        onOpenChange(false);
      } catch (error) {
        toast({
          title: "Resolution Failed",
          description: "Failed to resolve the conflict. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsResolving(false);
      }
    },
    [conflict, manualContent, onResolve, onOpenChange, toast],
  );

  const initializeManualContent = useCallback(() => {
    if (!conflict) return;
    setManualContent(conflict.autoMergePreview || conflict.yourChanges.content);
  }, [conflict]);

  if (!conflict) return null;

  const renderDiffLine = (
    line: string,
    type: "added" | "removed" | "unchanged",
  ) => {
    return (
      <div
        className={cn(
          "px-2 py-0.5 font-mono text-xs",
          type === "added" && "bg-green-500/20 text-green-400",
          type === "removed" && "bg-red-500/20 text-red-400",
          type === "unchanged" && "text-zinc-400",
        )}
      >
        <span className="mr-2">
          {type === "added" ? "+" : type === "removed" ? "-" : " "}
        </span>
        {line}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-4xl bg-zinc-950 border-zinc-800", className)}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-400">
            <GitBranch className="w-5 h-5" />
            Conflict Resolution Required
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {conflict.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="text-amber-400 border-amber-400/30"
              >
                <AlertTriangle className="w-3 h-3 mr-1" />
                {(conflict.elementType || "unknown").charAt(0).toUpperCase() +
                  (conflict.elementType || "unknown").slice(1)}{" "}
                Conflict
              </Badge>
              {conflict.canAutoMerge && (
                <Badge variant="secondary" className="text-green-400">
                  Auto-merge available
                </Badge>
              )}
            </div>

            <Tabs
              value={activeView}
              onValueChange={(v) => setActiveView(v as Record<string, unknown>)}
            >
              <TabsList className="bg-zinc-900">
                <TabsTrigger value="split" className="gap-1">
                  <Diff className="w-3 h-3" />
                  Split
                </TabsTrigger>
                <TabsTrigger value="unified" className="gap-1">
                  <Code className="w-3 h-3" />
                  Unified
                </TabsTrigger>
                <TabsTrigger
                  value="manual"
                  className="gap-1"
                  onClick={initializeManualContent}
                >
                  <Eye className="w-3 h-3" />
                  Manual
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <AnimatePresence mode="wait">
            {activeView === "split" && (
              <motion.div
                key="split"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid grid-cols-2 gap-4"
              >
                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-500/10 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <ArrowLeft className="w-4 h-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-400">
                        Your Changes
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {conflict.yourChanges.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <ScrollArea className="h-48 p-3 bg-zinc-900">
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap">
                      {conflict.yourChanges.content}
                    </pre>
                  </ScrollArea>
                </div>

                <div className="rounded-lg border border-zinc-800 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-purple-500/10 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-purple-400" />
                      <span className="text-sm font-medium text-purple-400">
                        {conflict.theirChanges.userName}'s Changes
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {conflict.theirChanges.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  <ScrollArea className="h-48 p-3 bg-zinc-900">
                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap">
                      {conflict.theirChanges.content}
                    </pre>
                  </ScrollArea>
                </div>
              </motion.div>
            )}

            {activeView === "unified" && (
              <motion.div
                key="unified"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-lg border border-zinc-800 overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
                  <span className="text-sm font-medium">Unified Diff View</span>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="flex items-center gap-1 text-red-400">
                      <span className="w-2 h-2 rounded bg-red-500" />
                      Removed
                    </span>
                    <span className="flex items-center gap-1 text-green-400">
                      <span className="w-2 h-2 rounded bg-green-500" />
                      Added
                    </span>
                  </div>
                </div>
                <ScrollArea className="h-64 bg-zinc-950">
                  <div className="font-mono">
                    {renderDiffLine("// Base version", "unchanged")}
                    {conflict.baseContent.split("\n").map((line, i) => (
                      <div key={`base-${i}`}>
                        {renderDiffLine(line, "unchanged")}
                      </div>
                    ))}
                    {renderDiffLine("", "unchanged")}
                    {renderDiffLine("// Your changes", "unchanged")}
                    {conflict.yourChanges.content.split("\n").map((line, i) => (
                      <div key={`yours-${i}`}>
                        {renderDiffLine(line, "added")}
                      </div>
                    ))}
                    {renderDiffLine("", "unchanged")}
                    {renderDiffLine(
                      `// ${conflict.theirChanges.userName}'s changes`,
                      "unchanged",
                    )}
                    {conflict.theirChanges.content
                      .split("\n")
                      .map((line, i) => (
                        <div key={`theirs-${i}`}>
                          {renderDiffLine(line, "removed")}
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </motion.div>
            )}

            {activeView === "manual" && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="rounded-lg border border-zinc-800 overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
                  <span className="text-sm font-medium">
                    Manual Merge Editor
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setManualContent(
                        conflict.autoMergePreview || conflict.baseContent,
                      )
                    }
                    className="text-xs"
                  >
                    Reset to Auto-Merge
                  </Button>
                </div>
                <Textarea
                  value={manualContent}
                  onChange={(e) => setManualContent(e.target.value)}
                  className="min-h-64 rounded-none border-0 bg-zinc-950 font-mono text-xs resize-none focus-visible:ring-0"
                  placeholder="Edit the merged content here..."
                />
              </motion.div>
            )}
          </AnimatePresence>

          {conflict.canAutoMerge &&
            conflict.autoMergePreview &&
            activeView !== "manual" && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <GitMerge className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-green-400">
                    Auto-Merge Preview
                  </span>
                </div>
                <ScrollArea className="h-24">
                  <pre className="text-xs text-zinc-400 whitespace-pre-wrap">
                    {conflict.autoMergePreview}
                  </pre>
                </ScrollArea>
              </div>
            )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex gap-2 flex-1">
            <Button
              variant="outline"
              onClick={() => handleResolve("accept_theirs")}
              disabled={isResolving}
              className="flex-1"
            >
              <ArrowRight className="w-4 h-4 mr-1" />
              Accept Theirs
            </Button>
            <Button
              variant="outline"
              onClick={() => handleResolve("accept_mine")}
              disabled={isResolving}
              className="flex-1"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Accept Mine
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isResolving}
            >
              Cancel
            </Button>
            {activeView === "manual" ? (
              <Button
                onClick={() => handleResolve("manual_merge")}
                disabled={isResolving || !manualContent.trim()}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {isResolving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                Apply Manual Merge
              </Button>
            ) : conflict.canAutoMerge ? (
              <Button
                onClick={() => handleResolve("auto_merge")}
                disabled={isResolving}
                className="bg-green-600 hover:bg-green-700"
              >
                {isResolving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <GitMerge className="w-4 h-4 mr-2" />
                )}
                Auto-Merge
              </Button>
            ) : (
              <Button
                onClick={initializeManualContent}
                className="bg-amber-600 hover:bg-amber-700"
              >
                Open Manual Merge
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConflictResolutionDialog;
