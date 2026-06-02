import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Keyboard, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useAccessibility } from "./AccessibilityProvider";

export interface ShortcutCategory {
  name: string;
  shortcuts: Shortcut[];
}

export interface Shortcut {
  keys: string[];
  description: string;
  category?: string;
}

const defaultShortcuts: ShortcutCategory[] = [
  {
    name: "Navigation",
    shortcuts: [
      { keys: ["Alt", "1"], description: "Skip to main content" },
      { keys: ["Alt", "2"], description: "Skip to navigation" },
      { keys: ["Alt", "3"], description: "Skip to search" },
      { keys: ["Alt", "4"], description: "Skip to sidebar" },
      { keys: ["Alt", "5"], description: "Skip to footer" },
      { keys: ["Tab"], description: "Move to next focusable element" },
      {
        keys: ["Shift", "Tab"],
        description: "Move to previous focusable element",
      },
      { keys: ["Home"], description: "Go to first item in list" },
      { keys: ["End"], description: "Go to last item in list" },
    ],
  },
  {
    name: "General",
    shortcuts: [
      { keys: ["?"], description: "Show keyboard shortcuts help" },
      { keys: ["Escape"], description: "Close dialog or cancel action" },
      { keys: ["Ctrl", "K"], description: "Open command palette" },
      { keys: ["Ctrl", "S"], description: "Save current project" },
      { keys: ["Ctrl", "Z"], description: "Undo last action" },
      { keys: ["Ctrl", "Shift", "Z"], description: "Redo last action" },
    ],
  },
  {
    name: "Accessibility",
    shortcuts: [
      {
        keys: ["Ctrl", "Alt", "A"],
        description: "Open accessibility settings",
      },
      { keys: ["Ctrl", "+"], description: "Increase text size" },
      { keys: ["Ctrl", "-"], description: "Decrease text size" },
      { keys: ["Ctrl", "0"], description: "Reset text size" },
    ],
  },
  {
    name: "Lists & Menus",
    shortcuts: [
      { keys: ["↑"], description: "Move up in list/menu" },
      { keys: ["↓"], description: "Move down in list/menu" },
      { keys: ["←"], description: "Move left in horizontal list" },
      { keys: ["→"], description: "Move right in horizontal list" },
      { keys: ["Enter"], description: "Select/activate item" },
      { keys: ["Space"], description: "Toggle selection" },
    ],
  },
  {
    name: "Studio",
    shortcuts: [
      { keys: ["Space"], description: "Play/Pause transport" },
      { keys: ["R"], description: "Toggle record" },
      { keys: ["L"], description: "Toggle loop" },
      { keys: ["M"], description: "Toggle metronome" },
      { keys: ["Ctrl", "T"], description: "Add new track" },
      { keys: ["Delete"], description: "Delete selected item" },
    ],
  },
];

export interface KeyboardShortcutsHelpDialogProps {
  shortcuts?: ShortcutCategory[];
  triggerLabel?: string;
  showTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

function KeyBadge({ keyName }: { keyName: string }) {
  return (
    <kbd className="px-2 py-1 text-xs font-mono font-medium bg-muted border rounded shadow-sm min-w-[24px] text-center">
      {keyName}
    </kbd>
  );
}

export function KeyboardShortcutsHelpDialog({
  shortcuts = defaultShortcuts,
  triggerLabel = "Keyboard Shortcuts",
  showTrigger = true,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  className = "",
}: KeyboardShortcutsHelpDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { announce } = useAccessibility();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const onOpenChange = isControlled ? controlledOnOpenChange : setInternalOpen;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "?" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      ) {
        const target = event.target as HTMLElement;
        const isInput =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;
        if (!isInput) {
          event.preventDefault();
          onOpenChange?.(true);
          announce("Keyboard shortcuts dialog opened");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, announce]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      onOpenChange?.(newOpen);
      if (!newOpen) {
        setSearchQuery("");
        announce("Keyboard shortcuts dialog closed");
      }
    },
    [onOpenChange, announce],
  );

  const filteredShortcuts = shortcuts
    .map((category) => ({
      ...category,
      shortcuts: category.shortcuts.filter(
        (shortcut) =>
          shortcut.description
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          shortcut.keys.some((key) =>
            key.toLowerCase().includes(searchQuery.toLowerCase()),
          ),
      ),
    }))
    .filter((category) => category.shortcuts.length > 0);

  const totalShortcuts = filteredShortcuts.reduce(
    (sum, cat) => sum + cat.shortcuts.length,
    0,
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={className}
            aria-label="Open keyboard shortcuts help"
          >
            <Keyboard className="h-4 w-4 mr-2" aria-hidden="true" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent
        className="max-w-2xl max-h-[85vh]"
        aria-describedby="keyboard-shortcuts-description"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" aria-hidden="true" />
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription id="keyboard-shortcuts-description">
            Use these keyboard shortcuts to navigate and interact with the
            application more efficiently. Press{" "}
            <kbd className="px-1 py-0.5 text-xs bg-muted rounded">?</kbd>{" "}
            anywhere to open this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-4">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Search keyboard shortcuts"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {searchQuery && `${totalShortcuts} shortcuts found`}
        </div>

        <ScrollArea className="h-[400px] mt-4 pr-4">
          {filteredShortcuts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No shortcuts found for "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredShortcuts.map((category) => (
                <section
                  key={category.name}
                  aria-labelledby={`category-${category.name}`}
                >
                  <h3
                    id={`category-${category.name}`}
                    className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider"
                  >
                    {category.name}
                  </h3>
                  <ul className="space-y-2" role="list">
                    {category.shortcuts.map((shortcut, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm">{shortcut.description}</span>
                        <div
                          className="flex items-center gap-1"
                          aria-label={shortcut.keys.join(" plus ")}
                        >
                          {shortcut.keys.map((key, keyIndex) => (
                            <React.Fragment key={keyIndex}>
                              {keyIndex > 0 && (
                                <span className="text-muted-foreground text-xs">
                                  +
                                </span>
                              )}
                              <KeyBadge keyName={key} />
                            </React.Fragment>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
          <p>
            Tip: Many shortcuts can be customized in{" "}
            <Button
              variant="link"
              className="p-0 h-auto text-sm"
              onClick={() => handleOpenChange(false)}
            >
              Settings → Keyboard
            </Button>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default KeyboardShortcutsHelpDialog;
