import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, Search, X, Play, Square, Circle, SkipBack, SkipForward, Scissors, Copy, Clipboard, Trash2, Undo, Redo, Save, ZoomIn, ZoomOut, Layers, Music, Maximize2, Grid, Mic, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface KeyboardShortcut {
  id: string;
  keys: string[];
  description: string;
  category: string;
  icon?: Record<string, unknown>;
  action?: () => void;
}

interface EnhancedKeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
  onShortcutTriggered?: (shortcutId: string) => void;
}

const SHORTCUTS: KeyboardShortcut[] = [
  {
    id: "play",
    keys: ["Space"],
    description: "Play / Pause",
    category: "Transport",
    icon: Play,
  },
  {
    id: "stop",
    keys: ["Enter"],
    description: "Stop",
    category: "Transport",
    icon: Square,
  },
  {
    id: "record",
    keys: ["R"],
    description: "Record",
    category: "Transport",
    icon: Circle,
  },
  {
    id: "return",
    keys: ["Home"],
    description: "Return to Start",
    category: "Transport",
    icon: SkipBack,
  },
  {
    id: "forward",
    keys: ["End"],
    description: "Go to End",
    category: "Transport",
    icon: SkipForward,
  },
  {
    id: "loop",
    keys: ["L"],
    description: "Toggle Loop",
    category: "Transport",
  },

  {
    id: "cut",
    keys: ["Cmd", "X"],
    description: "Cut Selection",
    category: "Editing",
    icon: Scissors,
  },
  {
    id: "copy",
    keys: ["Cmd", "C"],
    description: "Copy Selection",
    category: "Editing",
    icon: Copy,
  },
  {
    id: "paste",
    keys: ["Cmd", "V"],
    description: "Paste",
    category: "Editing",
    icon: Clipboard,
  },
  {
    id: "delete",
    keys: ["Backspace"],
    description: "Delete Selection",
    category: "Editing",
    icon: Trash2,
  },
  {
    id: "undo",
    keys: ["Cmd", "Z"],
    description: "Undo",
    category: "Editing",
    icon: Undo,
  },
  {
    id: "redo",
    keys: ["Cmd", "Shift", "Z"],
    description: "Redo",
    category: "Editing",
    icon: Redo,
  },
  {
    id: "select-all",
    keys: ["Cmd", "A"],
    description: "Select All",
    category: "Editing",
  },
  {
    id: "duplicate",
    keys: ["Cmd", "D"],
    description: "Duplicate",
    category: "Editing",
  },
  {
    id: "split",
    keys: ["S"],
    description: "Split at Playhead",
    category: "Editing",
    icon: Scissors,
  },

  {
    id: "save",
    keys: ["Cmd", "S"],
    description: "Save Project",
    category: "File",
    icon: Save,
  },
  {
    id: "save-as",
    keys: ["Cmd", "Shift", "S"],
    description: "Save As",
    category: "File",
  },
  {
    id: "export",
    keys: ["Cmd", "E"],
    description: "Export Audio",
    category: "File",
    icon: Download,
  },
  {
    id: "import",
    keys: ["Cmd", "I"],
    description: "Import Audio",
    category: "File",
  },

  {
    id: "zoom-in",
    keys: ["Cmd", "+"],
    description: "Zoom In",
    category: "View",
    icon: ZoomIn,
  },
  {
    id: "zoom-out",
    keys: ["Cmd", "-"],
    description: "Zoom Out",
    category: "View",
    icon: ZoomOut,
  },
  {
    id: "fit-all",
    keys: ["Cmd", "0"],
    description: "Fit All",
    category: "View",
  },
  {
    id: "fullscreen",
    keys: ["F"],
    description: "Toggle Fullscreen",
    category: "View",
    icon: Maximize2,
  },
  {
    id: "grid",
    keys: ["G"],
    description: "Toggle Grid",
    category: "View",
    icon: Grid,
  },
  {
    id: "mixer",
    keys: ["M"],
    description: "Toggle Mixer",
    category: "View",
    icon: Layers,
  },

  {
    id: "new-track",
    keys: ["Cmd", "T"],
    description: "New Track",
    category: "Tracks",
    icon: Music,
  },
  {
    id: "delete-track",
    keys: ["Cmd", "Backspace"],
    description: "Delete Track",
    category: "Tracks",
  },
  {
    id: "arm-record",
    keys: ["Shift", "R"],
    description: "Arm Track for Recording",
    category: "Tracks",
    icon: Mic,
  },
  {
    id: "mute",
    keys: ["Cmd", "M"],
    description: "Mute Track",
    category: "Tracks",
  },
  {
    id: "solo",
    keys: ["Cmd", "Shift", "M"],
    description: "Solo Track",
    category: "Tracks",
  },

  {
    id: "ai-generate",
    keys: ["Cmd", "G"],
    description: "AI Generate",
    category: "AI Tools",
  },
  {
    id: "ai-mastering",
    keys: ["Cmd", "Shift", "G"],
    description: "AI Mastering",
    category: "AI Tools",
  },
  {
    id: "stem-separation",
    keys: ["Cmd", "Shift", "X"],
    description: "Stem Separation",
    category: "AI Tools",
  },
];

const CATEGORIES = [
  "Transport",
  "Editing",
  "File",
  "View",
  "Tracks",
  "AI Tools",
];

export function EnhancedKeyboardShortcuts({
  isOpen,
  onClose,
  onShortcutTriggered,
}: EnhancedKeyboardShortcutsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [recentlyUsed, setRecentlyUsed] = useState<string[]>([]);

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS.filter((shortcut) => {
      const matchesSearch =
        shortcut.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        shortcut.keys
          .join(" ")
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesCategory =
        !selectedCategory || shortcut.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, KeyboardShortcut[]> = {};
    filteredShortcuts.forEach((shortcut) => {
      if (!groups[shortcut.category]) {
        groups[shortcut.category] = [];
      }
      groups[shortcut.category].push(shortcut);
    });
    return groups;
  }, [filteredShortcuts]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      const keys: string[] = [];
      if (e.metaKey || e.ctrlKey) keys.push("Cmd");
      if (e.shiftKey) keys.push("Shift");
      if (e.altKey) keys.push("Alt");
      if (!["Meta", "Control", "Shift", "Alt"].includes(e.key)) {
        keys.push(e.key.toUpperCase());
      }

      const matchingShortcut = SHORTCUTS.find(
        (s) =>
          s.keys.length === keys.length &&
          s.keys.every((k, i) => k.toUpperCase() === keys[i].toUpperCase()),
      );

      if (matchingShortcut) {
        e.preventDefault();
        setRecentlyUsed((prev) =>
          [
            matchingShortcut.id,
            ...prev.filter((id) => id !== matchingShortcut.id),
          ].slice(0, 5),
        );
        onShortcutTriggered?.(matchingShortcut.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, onShortcutTriggered]);

  const getKeyDisplay = (key: string) => {
    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    if (key === "Cmd") return isMac ? "⌘" : "Ctrl";
    if (key === "Shift") return "⇧";
    if (key === "Alt") return isMac ? "⌥" : "Alt";
    if (key === "Backspace") return "⌫";
    if (key === "Enter") return "↵";
    if (key === "Space") return "␣";
    return key;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed inset-x-0 top-20 mx-auto max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg">
                  <Keyboard className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Press any key combination to see what it does
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-4 border-b border-zinc-800">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shortcuts..."
                  className="pl-10 bg-zinc-900 border-zinc-700"
                  autoFocus
                />
              </div>

              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors",
                    !selectedCategory
                      ? "bg-amber-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
                  )}
                >
                  All
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors",
                      selectedCategory === cat
                        ? "bg-amber-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <ScrollArea className="h-96">
              <div className="p-4 space-y-6">
                {recentlyUsed.length > 0 &&
                  !searchQuery &&
                  !selectedCategory && (
                    <div>
                      <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">
                        Recently Used
                      </h3>
                      <div className="space-y-1">
                        {recentlyUsed.map((id) => {
                          const shortcut = SHORTCUTS.find((s) => s.id === id);
                          if (!shortcut) return null;
                          return (
                            <ShortcutRow
                              key={id}
                              shortcut={shortcut}
                              getKeyDisplay={getKeyDisplay}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                {Object.entries(groupedShortcuts).map(
                  ([category, shortcuts]) => (
                    <div key={category}>
                      <h3 className="text-xs font-medium text-zinc-500 uppercase mb-2">
                        {category}
                      </h3>
                      <div className="space-y-1">
                        {shortcuts.map((shortcut) => (
                          <ShortcutRow
                            key={shortcut.id}
                            shortcut={shortcut}
                            getKeyDisplay={getKeyDisplay}
                          />
                        ))}
                      </div>
                    </div>
                  ),
                )}

                {filteredShortcuts.length === 0 && (
                  <div className="text-center py-8 text-zinc-500">
                    No shortcuts found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="p-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
              <span>
                Press{" "}
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded mx-1">?</kbd>{" "}
                anytime to show this panel
              </span>
              <span>{SHORTCUTS.length} shortcuts available</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface ShortcutRowProps {
  shortcut: KeyboardShortcut;
  getKeyDisplay: (key: string) => string;
}

function ShortcutRow({ shortcut, getKeyDisplay }: ShortcutRowProps) {
  const Icon = shortcut.icon;

  return (
    <div className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-900/50 transition-colors">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-4 h-4 text-zinc-400" />}
        <span className="text-sm text-zinc-300">{shortcut.description}</span>
      </div>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <span key={i} className="flex items-center">
            <kbd className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 min-w-[24px] text-center">
              {getKeyDisplay(key)}
            </kbd>
            {i < shortcut.keys.length - 1 && (
              <span className="mx-0.5 text-zinc-600">+</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="text-zinc-400 hover:text-white"
    >
      <Keyboard className="w-4 h-4 mr-1" />
      <span className="text-xs">Shortcuts</span>
      <Badge variant="secondary" className="ml-2 text-[10px] px-1">
        ?
      </Badge>
    </Button>
  );
}

export default EnhancedKeyboardShortcuts;
