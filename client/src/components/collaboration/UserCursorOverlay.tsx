import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MousePointer2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CursorPosition {
  x: number;
  y: number;
  elementId?: string;
  trackId?: string;
}

export interface Selection {
  start: number;
  end: number;
  elementId?: string;
}

export interface RemoteCursor {
  userId: string;
  displayName: string;
  avatar?: string;
  color: string;
  position: CursorPosition;
  selection?: Selection;
  isTyping?: boolean;
  lastUpdate: Date;
}

export type CursorOutcomeType =
  | "cursor_position_updated"
  | "selection_highlighted"
  | "typing_indicator_shown";

interface UserCursorOverlayProps {
  cursors: RemoteCursor[];
  currentUserId?: string;
  containerRef?: React.RefObject<HTMLElement>;
  showNames?: boolean;
  showSelection?: boolean;
  fadeTimeout?: number;
  onCursorClick?: (cursor: RemoteCursor) => void;
  className?: string;
}

export function UserCursorOverlay({
  cursors,
  currentUserId,
  _containerRef,
  showNames = true,
  showSelection = true,
  fadeTimeout = 5000,
  onCursorClick,
  className,
}: UserCursorOverlayProps) {
  const [visibleCursors, setVisibleCursors] = useState<RemoteCursor[]>([]);
  const [hoveredCursor, setHoveredCursor] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const filtered = cursors
      .filter((cursor) => cursor.userId !== currentUserId)
      .filter((cursor) => {
        const timeSinceUpdate = now.getTime() - cursor.lastUpdate.getTime();
        return timeSinceUpdate < fadeTimeout;
      });

    setVisibleCursors(filtered);
  }, [cursors, currentUserId, fadeTimeout]);

  const getOpacity = useCallback(
    (cursor: RemoteCursor) => {
      const now = new Date();
      const timeSinceUpdate = now.getTime() - cursor.lastUpdate.getTime();
      const fadeStart = fadeTimeout * 0.7;

      if (timeSinceUpdate < fadeStart) return 1;

      const fadeProgress =
        (timeSinceUpdate - fadeStart) / (fadeTimeout - fadeStart);
      return Math.max(0, 1 - fadeProgress);
    },
    [fadeTimeout],
  );

  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none overflow-hidden",
        className,
      )}
    >
      <AnimatePresence>
        {visibleCursors.map((cursor) => {
          const opacity = getOpacity(cursor);

          return (
            <motion.div
              key={cursor.userId}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{
                opacity,
                scale: 1,
                x: cursor.position.x,
                y: cursor.position.y,
              }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 400,
                mass: 0.5,
              }}
              className="absolute top-0 left-0 pointer-events-auto cursor-pointer z-50"
              onClick={() => onCursorClick?.(cursor)}
              onMouseEnter={() => setHoveredCursor(cursor.userId)}
              onMouseLeave={() => setHoveredCursor(null)}
            >
              <div className="relative">
                <MousePointer2
                  className="w-5 h-5 -rotate-12 drop-shadow-lg"
                  style={{
                    color: cursor.color,
                    fill: cursor.color,
                  }}
                />

                {showNames && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{
                      opacity: hoveredCursor === cursor.userId ? 1 : 0.9,
                      y: 0,
                    }}
                    className="absolute top-4 left-3"
                  >
                    <div
                      className="px-2 py-1 rounded-md text-xs font-medium text-white whitespace-nowrap shadow-lg flex items-center gap-1"
                      style={{ backgroundColor: cursor.color }}
                    >
                      {cursor.displayName}
                      {cursor.isTyping && (
                        <motion.span
                          animate={{ opacity: [1, 0.3, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="flex gap-0.5"
                        >
                          <span className="w-1 h-1 bg-white rounded-full" />
                          <span className="w-1 h-1 bg-white rounded-full" />
                          <span className="w-1 h-1 bg-white rounded-full" />
                        </motion.span>
                      )}
                    </div>
                  </motion.div>
                )}

                {cursor.isTyping && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: cursor.color }}
                  >
                    <span className="text-[8px] text-white font-bold">...</span>
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {showSelection &&
        visibleCursors.map((cursor) => {
          if (!cursor.selection) return null;

          return (
            <motion.div
              key={`selection-${cursor.userId}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.2 }}
              exit={{ opacity: 0 }}
              className="absolute rounded"
              style={{
                backgroundColor: cursor.color,
                left: cursor.selection.start,
                width: cursor.selection.end - cursor.selection.start,
                top: cursor.position.y - 10,
                height: 20,
              }}
            />
          );
        })}
    </div>
  );
}

interface UseRemoteCursorsOptions {
  sessionId: string;
  userId: string;
  displayName: string;
  color: string;
  updateInterval?: number;
}

export function useRemoteCursors({
  _sessionId,
  _userId,
  _displayName,
  _color,
  updateInterval = 50,
}: UseRemoteCursorsOptions) {
  const [cursors, _setCursors] = useState<RemoteCursor[]>([]);
  const [localPosition, setLocalPosition] = useState<CursorPosition>({
    x: 0,
    y: 0,
  });
  const [localSelection, setLocalSelection] = useState<Selection | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const updatePosition = useCallback(
    (position: CursorPosition) => {
      const now = Date.now();
      if (now - lastUpdateRef.current < updateInterval) return;

      lastUpdateRef.current = now;
      setLocalPosition(position);
    },
    [updateInterval],
  );

  const updateSelection = useCallback((selection: Selection | null) => {
    setLocalSelection(selection);
  }, []);

  const startTyping = useCallback(() => {
    setIsTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 2000);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      updatePosition({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [updatePosition],
  );

  const handleSelectionChange = useCallback(
    (start: number, end: number, elementId?: string) => {
      if (start === end) {
        updateSelection(null);
      } else {
        updateSelection({ start, end, elementId });
      }
    },
    [updateSelection],
  );

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    cursors,
    localPosition,
    localSelection,
    isTyping,
    updatePosition,
    updateSelection,
    startTyping,
    handleMouseMove,
    handleSelectionChange,
  };
}

export default UserCursorOverlay;
