import { logger } from "@/lib/logger";
import { useState, useMemo } from "react";
import {
  Flag,
  GitBranch,
  Clock,
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useUndoStack } from "@/hooks/useUndoStack";

export interface RestorePoint {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  module?: string;
  actionsCount: number;
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  if (diff < 86400000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diff < 604800000) {
    return date.toLocaleDateString([], {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RestorePointCardProps {
  point: RestorePoint;
  isActive: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

function RestorePointCard({
  point,
  isActive,
  onRestore,
  onDelete,
}: RestorePointCardProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        "hover:bg-muted/50",
        isActive && "bg-primary/5 border-primary/30",
      )}
    >
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            isActive
              ? "bg-primary text-primary-foreground"
              : "bg-amber-500/10 text-amber-500",
          )}
        >
          <Flag className="w-4 h-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{point.name}</span>
          {isActive && (
            <Badge variant="default" className="text-[10px]">
              Current
            </Badge>
          )}
        </div>
        {point.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {point.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>{formatTimestamp(point.createdAt)}</span>
          <span className="text-muted-foreground/50">•</span>
          <span>{point.actionsCount} actions after</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRestore}
            className="gap-1 text-xs"
          >
            <RotateCcw className="w-3 h-3" />
            Restore
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export interface RestorePointDialogProps {
  className?: string;
  trigger?: React.ReactNode;
}

export function RestorePointDialog({
  className,
  trigger,
}: RestorePointDialogProps) {
  const {
    history,
    createRestorePoint,
    getRestorePoints,
    undoToRestorePoint,
    historyLength,
  } = useUndoStack();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<RestorePoint | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const [newPointName, setNewPointName] = useState("");
  const [newPointDescription, setNewPointDescription] = useState("");

  const restorePoints: RestorePoint[] = useMemo(() => {
    const points = getRestorePoints();
    return points
      .map((action, _index) => {
        const pointIndex = history.findIndex((a) => a.id === action.id);
        const actionsAfter = historyLength - pointIndex - 1;

        return {
          id: action.id,
          name: action.description,
          description: action.customData?.description as string | undefined,
          createdAt: action.timestamp,
          module: action.module,
          actionsCount: actionsAfter >= 0 ? actionsAfter : 0,
        };
      })
      .reverse();
  }, [history, getRestorePoints, historyLength]);

  const handleCreateRestorePoint = () => {
    if (!newPointName.trim()) return;

    createRestorePoint(newPointName.trim());
    setNewPointName("");
    setNewPointDescription("");
    setIsCreateOpen(false);
  };

  const handleRestoreToPoint = async () => {
    if (!selectedPoint) return;

    setIsRestoring(true);
    try {
      await undoToRestorePoint(selectedPoint.id);
      setConfirmRestoreOpen(false);
      setSelectedPoint(null);
    } finally {
      setIsRestoring(false);
    }
  };

  const initiateRestore = (point: RestorePoint) => {
    setSelectedPoint(point);
    setConfirmRestoreOpen(true);
  };

  const handleDeleteRestorePoint = (pointId: string) => {
    logger.info("Delete restore point:", pointId);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          {trigger || (
            <Button
              variant="outline"
              size="sm"
              className={cn("gap-2", className)}
            >
              <Flag className="w-4 h-4" />
              Restore Points
              {restorePoints.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {restorePoints.length}
                </Badge>
              )}
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              Restore Points
            </DialogTitle>
            <DialogDescription>
              Create restore points to save your progress. You can return to any
              restore point at any time.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {restorePoints.length} restore point
                {restorePoints.length !== 1 ? "s" : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(true)}
                className="gap-1"
              >
                <Plus className="w-3 h-3" />
                Create Restore Point
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              {restorePoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Flag className="w-12 h-12 mb-4 opacity-50" />
                  <p className="text-sm font-medium">No restore points</p>
                  <p className="text-xs mt-1 text-center max-w-[200px]">
                    Create a restore point to save your current progress
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCreateOpen(true)}
                    className="mt-4 gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    Create First Restore Point
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {restorePoints.map((point, index) => (
                    <RestorePointCard
                      key={point.id}
                      point={point}
                      isActive={index === 0 && point.actionsCount === 0}
                      onRestore={() => initiateRestore(point)}
                      onDelete={() => handleDeleteRestorePoint(point.id)}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create Restore Point
            </DialogTitle>
            <DialogDescription>
              Save your current progress as a restore point.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="restore-point-name">Name</Label>
              <Input
                id="restore-point-name"
                placeholder="e.g., Before major changes"
                value={newPointName}
                onChange={(e) => setNewPointName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restore-point-description">
                Description (optional)
              </Label>
              <Textarea
                id="restore-point-description"
                placeholder="Add notes about this restore point..."
                value={newPointDescription}
                onChange={(e) => setNewPointDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                Current state with {historyLength} actions recorded
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateRestorePoint}
              disabled={!newPointName.trim()}
              className="gap-1"
            >
              <Flag className="w-4 h-4" />
              Create Restore Point
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmRestoreOpen}
        onOpenChange={setConfirmRestoreOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Restore to Point
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedPoint && (
                <>
                  <p className="mb-3">
                    Are you sure you want to restore to this point? This will
                    undo{" "}
                    <strong>
                      {selectedPoint.actionsCount} action
                      {selectedPoint.actionsCount !== 1 ? "s" : ""}
                    </strong>
                    .
                  </p>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="font-medium text-foreground">
                      {selectedPoint.name}
                    </div>
                    <div className="text-xs mt-1 text-muted-foreground">
                      Created {formatTimestamp(selectedPoint.createdAt)}
                    </div>
                  </div>
                  <p className="mt-3 text-amber-600 dark:text-amber-400 text-sm">
                    You can redo these actions later if needed.
                  </p>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRestoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreToPoint}
              disabled={isRestoring}
              className="gap-1"
            >
              {isRestoring ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default RestorePointDialog;
