import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X, Lightbulb, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useShortcuts, useShortcutGuide } from "@/contexts/ShortcutContext";
import { ShortcutHint } from "@/components/shortcuts/ShortcutHint";
import { ShortcutContext } from "@/lib/shortcuts/types";

interface ShortcutHintsProps {
  context?: ShortcutContext;
  maxHints?: number;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  autoHide?: boolean;
  autoHideDelay?: number;
  className?: string;
}

export function ShortcutHints({
  context,
  maxHints = 3,
  position = "bottom-right",
  autoHide = true,
  autoHideDelay = 10000,
  className,
}: ShortcutHintsProps) {
  const { shortcutManager, currentContext } = useShortcuts();
  const { open: openShortcutGuide } = useShortcutGuide();
  const [isVisible, setIsVisible] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  const activeContext = context || currentContext;

  const contextualHints = useMemo(() => {
    if (!shortcutManager) return [];

    const shortcuts = shortcutManager.getShortcutsByContext(activeContext);
    const priorityCategories = ["actions", "transport", "navigation"];

    return shortcuts
      .filter((s) => s.enabled !== false)
      .sort((a, b) => {
        const aPriority = priorityCategories.indexOf(a.category);
        const bPriority = priorityCategories.indexOf(b.category);
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;
        return 0;
      })
      .slice(0, maxHints);
  }, [shortcutManager, activeContext, maxHints]);

  useEffect(() => {
    if (autoHide && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, autoHideDelay);
      return () => clearTimeout(timer);
    }
  }, [autoHide, autoHideDelay, isVisible]);

  useEffect(() => {
    setIsVisible(true);
  }, [activeContext]);

  if (isDismissed || contextualHints.length === 0) return null;

  const positionClasses = {
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={cn("fixed z-40", positionClasses[position], className)}
        >
          <div className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-800 rounded-lg shadow-xl p-3 max-w-xs">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <Lightbulb className="w-3 h-3 text-amber-400" />
                <span>Quick shortcuts</span>
              </div>
              <button
                onClick={() => setIsDismissed(true)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            <div className="space-y-1.5">
              {contextualHints.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-zinc-300 truncate">
                    {shortcut.description}
                  </span>
                  <ShortcutHint
                    shortcut={{
                      key: shortcut.key,
                      modifiers: shortcut.modifiers,
                    }}
                    size="xs"
                    variant="muted"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={openShortcutGuide}
              className="w-full mt-3 flex items-center justify-center gap-1 text-xs text-zinc-500 hover:text-amber-400 transition-colors"
            >
              <span>View all shortcuts</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface TooltipWithShortcutProps {
  children: React.ReactNode;
  action: string;
  shortcut?: string | { key: string; modifiers?: string[] };
  side?: "top" | "bottom" | "left" | "right";
}

export function TooltipWithShortcut({
  children,
  action,
  shortcut,
  side = "top",
}: TooltipWithShortcutProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{action}</span>
        {shortcut && (
          <ShortcutHint
            shortcut={shortcut as Record<string, unknown>}
            size="xs"
            variant="ghost"
          />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

interface ContextualShortcutBannerProps {
  context: ShortcutContext;
  className?: string;
}

export function ContextualShortcutBanner({
  context,
  className,
}: ContextualShortcutBannerProps) {
  const { open: openShortcutGuide } = useShortcutGuide();
  const { shortcutManager } = useShortcuts();

  const keyShortcuts = useMemo(() => {
    if (!shortcutManager) return [];
    return shortcutManager.getShortcutsByContext(context).slice(0, 4);
  }, [shortcutManager, context]);

  if (keyShortcuts.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-4 px-3 py-2 bg-zinc-900/50 border-b border-zinc-800 text-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-zinc-500">
        <Keyboard className="w-3 h-3" />
        <span>Shortcuts:</span>
      </div>
      <div className="flex items-center gap-3">
        {keyShortcuts.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <ShortcutHint
              shortcut={{ key: s.key, modifiers: s.modifiers }}
              size="xs"
              variant="muted"
            />
            <span className="text-zinc-400">{s.description}</span>
          </div>
        ))}
      </div>
      <button
        onClick={openShortcutGuide}
        className="ml-auto text-zinc-500 hover:text-amber-400 transition-colors"
      >
        View all
      </button>
    </div>
  );
}

interface ShortcutCheatSheetTriggerProps {
  className?: string;
}

export function ShortcutCheatSheetTrigger({
  className,
}: ShortcutCheatSheetTriggerProps) {
  const { open: openShortcutGuide } = useShortcutGuide();

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={openShortcutGuide}
      className={cn("text-zinc-400 hover:text-white", className)}
    >
      <Keyboard className="w-4 h-4 mr-1" />
      <span className="hidden sm:inline">Shortcuts</span>
      <Badge variant="secondary" className="ml-1 text-[10px]">
        ?
      </Badge>
    </Button>
  );
}

export default ShortcutHints;
