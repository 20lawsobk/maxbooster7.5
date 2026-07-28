import { useEffect, useState, useRef } from "react";
import { X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLastAction } from "@/contexts/UndoContext";
import { getActionLabel } from "@/lib/undo/types";
import { cn } from "@/lib/utils";

export interface UndoToastProps {
  className?: string;
  autoHideDuration?: number;
  showCountdown?: boolean;
  position?: "top" | "bottom" | "top-right" | "bottom-right";
}

export function UndoToast({
  className,
  autoHideDuration = 5000,
  showCountdown = true,
  position = "bottom",
}: UndoToastProps) {
  const { lastAction, showUndoToast, dismissUndoToast, undoLastAction } =
    useLastAction();
  const [isExiting, setIsExiting] = useState(false);
  const [countdown, setCountdown] = useState(
    Math.ceil(autoHideDuration / 1000),
  );
  const [progress, setProgress] = useState(100);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!showUndoToast) {
      setIsExiting(false);
      setCountdown(Math.ceil(autoHideDuration / 1000));
      setProgress(100);
      return;
    }

    startTimeRef.current = Date.now();
    setCountdown(Math.ceil(autoHideDuration / 1000));
    setProgress(100);

    countdownRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, autoHideDuration - elapsed);
      const newCountdown = Math.ceil(remaining / 1000);
      setCountdown(newCountdown);

      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
      }
    }, 100);

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, autoHideDuration - elapsed);
      const newProgress = (remaining / autoHideDuration) * 100;
      setProgress(newProgress);

      if (remaining <= 0) {
        if (progressRef.current) clearInterval(progressRef.current);
      }
    }, 50);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [showUndoToast, autoHideDuration]);

  const handleUndo = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setIsExiting(true);
    setTimeout(async () => {
      await undoLastAction();
      dismissUndoToast();
    }, 150);
  };

  const handleDismiss = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setIsExiting(true);
    setTimeout(() => {
      dismissUndoToast();
    }, 150);
  };

  if (!showUndoToast || !lastAction) return null;

  const actionLabel = getActionLabel(lastAction);
  const isDestructive = lastAction.metadata.isDestructive;

  const positionClasses = {
    top: "top-4 left-1/2 -translate-x-1/2",
    bottom: "bottom-4 left-1/2 -translate-x-1/2",
    "top-right": "top-4 right-4",
    "bottom-right": "bottom-4 right-4",
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        "fixed z-50",
        positionClasses[position],
        "bg-background border rounded-lg shadow-lg overflow-hidden",
        "transition-all duration-150",
        isExiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0",
        isDestructive && "border-destructive/50",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          {isDestructive && (
            <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
          )}
          <span className="text-sm font-medium">{actionLabel}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          className="gap-1.5"
        >
          <Undo2 className="w-3 h-3" />
          Undo
          {showCountdown && countdown > 0 && (
            <span className="text-xs text-muted-foreground ml-1">
              ({countdown}s)
            </span>
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      {showCountdown && (
        <div className="h-1 bg-muted">
          <div
            className={cn(
              "h-full transition-all duration-100 ease-linear",
              isDestructive ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
