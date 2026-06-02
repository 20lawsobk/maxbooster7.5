import { useState, useRef, useCallback, useEffect, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { triggerHapticFeedback } from "@/hooks/useTouchGestures";

export type SplitDirection = "horizontal" | "vertical";

interface SplitPaneProps {
  direction?: SplitDirection;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  snapSizes?: number[];
  snapThreshold?: number;
  primaryPane: ReactNode;
  secondaryPane: ReactNode;
  primaryMinSize?: number;
  secondaryMinSize?: number;
  className?: string;
  resizerClassName?: string;
  onResize?: (size: number) => void;
  disabled?: boolean;
}

export function SplitPane({
  direction = "horizontal",
  defaultSize = 300,
  minSize = 100,
  maxSize = 800,
  snapSizes = [],
  snapThreshold = 20,
  primaryPane,
  secondaryPane,
  primaryMinSize = 100,
  secondaryMinSize = 100,
  className,
  resizerClassName,
  onResize,
  disabled = false,
}: SplitPaneProps) {
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startPos = useRef<number>(0);
  const startSize = useRef<number>(0);

  const isHorizontal = direction === "horizontal";

  const clampSize = useCallback(
    (newSize: number): number => {
      const containerSize = isHorizontal
        ? containerRef.current?.offsetWidth || 0
        : containerRef.current?.offsetHeight || 0;

      const effectiveMaxSize = Math.min(
        maxSize,
        containerSize - secondaryMinSize,
      );
      const effectiveMinSize = Math.max(minSize, primaryMinSize);

      let clampedSize = Math.max(
        effectiveMinSize,
        Math.min(effectiveMaxSize, newSize),
      );

      for (const snapSize of snapSizes) {
        if (Math.abs(clampedSize - snapSize) < snapThreshold) {
          clampedSize = snapSize;
          triggerHapticFeedback("light");
          break;
        }
      }

      return clampedSize;
    },
    [
      isHorizontal,
      maxSize,
      minSize,
      primaryMinSize,
      secondaryMinSize,
      snapSizes,
      snapThreshold,
    ],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
      startPos.current = isHorizontal ? e.clientX : e.clientY;
      startSize.current = size;
      triggerHapticFeedback("light");
    },
    [disabled, isHorizontal, size],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      setIsDragging(true);
      const touch = e.touches[0];
      startPos.current = isHorizontal ? touch.clientX : touch.clientY;
      startSize.current = size;
      triggerHapticFeedback("light");
    },
    [disabled, isHorizontal, size],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = isHorizontal ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      const newSize = clampSize(startSize.current + delta);
      setSize(newSize);
      onResize?.(newSize);
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const currentPos = isHorizontal ? touch.clientX : touch.clientY;
      const delta = currentPos - startPos.current;
      const newSize = clampSize(startSize.current + delta);
      setSize(newSize);
      onResize?.(newSize);
    };

    const handleEnd = () => {
      setIsDragging(false);
      triggerHapticFeedback("medium");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging, isHorizontal, clampSize, onResize]);

  const resizerStyle = isHorizontal
    ? { width: 8, cursor: "col-resize" }
    : { height: 8, cursor: "row-resize" };

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex overflow-hidden",
        isHorizontal ? "flex-row" : "flex-col",
        className,
      )}
    >
      <div
        className="overflow-auto flex-shrink-0"
        style={isHorizontal ? { width: size } : { height: size }}
      >
        {primaryPane}
      </div>

      <div
        className={cn(
          "flex-shrink-0 bg-border/50 hover:bg-primary/20 transition-colors touch-none select-none",
          "flex items-center justify-center",
          isDragging && "bg-primary/30",
          disabled && "cursor-not-allowed opacity-50",
          resizerClassName,
        )}
        style={resizerStyle}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        role="separator"
        aria-orientation={isHorizontal ? "vertical" : "horizontal"}
        aria-valuenow={size}
        aria-valuemin={minSize}
        aria-valuemax={maxSize}
        tabIndex={disabled ? -1 : 0}
      >
        <div
          className={cn(
            "rounded-full bg-muted-foreground/30",
            isHorizontal ? "w-1 h-8" : "h-1 w-8",
          )}
        />
      </div>

      <div className="flex-1 overflow-auto min-w-0 min-h-0">
        {secondaryPane}
      </div>
    </div>
  );
}

interface CollapsibleSplitPaneProps extends Omit<SplitPaneProps, "disabled"> {
  collapsed?: boolean;
  collapsedSize?: number;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function CollapsibleSplitPane({
  collapsed = false,
  collapsedSize = 48,
  onCollapsedChange,
  defaultSize = 300,
  ...props
}: CollapsibleSplitPaneProps) {
  const effectiveSize = collapsed ? collapsedSize : defaultSize;

  return (
    <SplitPane
      {...props}
      defaultSize={effectiveSize}
      minSize={collapsed ? collapsedSize : props.minSize}
      maxSize={collapsed ? collapsedSize : props.maxSize}
      disabled={collapsed}
      onResize={(size) => {
        if (!collapsed) {
          props.onResize?.(size);
        }
      }}
    />
  );
}
