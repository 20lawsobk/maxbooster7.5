import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Keyboard,
  X,
  Search,
  Play,
  Settings,
  Navigation,
  Edit,
  FileText,
  Eye,
  Music,
  Share2,
  Home,
  BarChart3,
  Disc,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useShortcutGuide, useShortcuts } from "@/contexts/ShortcutContext";
import { ShortcutDefinition, ShortcutContext } from "@/lib/shortcuts/types";
import { getPlatformModifiers } from "@/lib/shortcuts/types";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  global: Keyboard,
  navigation: Navigation,
  actions: Play,
  editing: Edit,
  transport: Play,
  track: Music,
  view: Eye,
  file: FileText,
  settings: Settings,
  help: Keyboard,
  search: Search,
};

const CONTEXT_LABELS: Record<ShortcutContext, string> = {
  global: "Global",
  studio: "Studio",
  dashboard: "Dashboard",
  social: "Social Media",
  marketplace: "Marketplace",
  distribution: "Distribution",
  analytics: "Analytics",
};

const CONTEXT_ICONS: Record<ShortcutContext, React.ElementType> = {
  global: Keyboard,
  studio: Music,
  dashboard: Home,
  social: Share2,
  marketplace: ShoppingBag,
  distribution: Disc,
  analytics: BarChart3,
};

interface ShortcutsOverlayProps {
  className?: string;
}

export function ShortcutsOverlay({ className }: ShortcutsOverlayProps) {
  const { isOpen, close, context } = useShortcutGuide();
  const { shortcutManager } = useShortcuts();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContext, setSelectedContext] = useState<
    ShortcutContext | "all"
  >("all");
  const platform = getPlatformModifiers();

  const allShortcuts = useMemo(() => {
    if (!shortcutManager) return [];
    return shortcutManager.getAllShortcuts();
  }, [shortcutManager]);

  const filteredShortcuts = useMemo(() => {
    let filtered = allShortcuts;

    if (selectedContext !== "all") {
      filtered = filtered.filter(
        (s) => s.context === selectedContext || s.context === "global",
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.description.toLowerCase().includes(query) ||
          s.key.toLowerCase().includes(query) ||
          s.category.toLowerCase().includes(query),
      );
    }

    return filtered;
  }, [allShortcuts, selectedContext, searchQuery]);

  const groupedShortcuts = useMemo(() => {
    const groups: Record<string, ShortcutDefinition[]> = {};

    filteredShortcuts.forEach((shortcut) => {
      const category = shortcut.category;
      if (!groups[category]) groups[category] = [];
      groups[category].push(shortcut);
    });

    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredShortcuts]);

  const contexts: (ShortcutContext | "all")[] = [
    "all",
    "global",
    "studio",
    "dashboard",
    "social",
    "marketplace",
    "distribution",
    "analytics",
  ];

  const formatCategoryName = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  const formatKey = (key: string, modifiers?: string[]) => {
    const parts: string[] = [];
    if (modifiers) {
      modifiers.forEach((mod) => {
        if (mod === "cmd") parts.push(platform.mod);
        else if (mod === "shift") parts.push("⇧");
        else if (mod === "alt") parts.push(platform.alt);
        else parts.push(mod);
      });
    }
    if (key === " ") parts.push("Space");
    else if (key === "Enter") parts.push("↵");
    else if (key === "Escape") parts.push("Esc");
    else parts.push(key.toUpperCase());
    return parts;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-full max-w-3xl max-h-[80vh]",
              "bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden",
              "flex flex-col",
              className,
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts guide"
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg">
                  <Keyboard className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-white text-lg">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Currently viewing: {CONTEXT_LABELS[context] || "Global"}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={close}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="p-4 border-b border-zinc-800 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search shortcuts..."
                  className="pl-10 bg-zinc-900 border-zinc-700"
                />
              </div>

              <div className="flex gap-2 flex-wrap">
                {contexts.map((ctx) => {
                  const Icon = ctx === "all" ? Keyboard : CONTEXT_ICONS[ctx];
                  const isSelected = selectedContext === ctx;
                  return (
                    <button
                      key={ctx}
                      onClick={() => setSelectedContext(ctx)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-colors",
                        isSelected
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
                      )}
                    >
                      <Icon className="w-3 h-3" />
                      {ctx === "all" ? "All" : CONTEXT_LABELS[ctx]}
                    </button>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                {groupedShortcuts.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500">
                    <Keyboard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No shortcuts found</p>
                    <p className="text-xs mt-1">
                      Try a different search term or context
                    </p>
                  </div>
                ) : (
                  groupedShortcuts.map(([category, categoryShortcuts]) => {
                    const CategoryIcon = CATEGORY_ICONS[category] || Keyboard;
                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 mb-3">
                          <CategoryIcon className="w-4 h-4 text-zinc-400" />
                          <h3 className="font-medium text-zinc-300">
                            {formatCategoryName(category)}
                          </h3>
                          <Badge variant="secondary" className="text-xs">
                            {categoryShortcuts.length}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          {categoryShortcuts.map((shortcut) => (
                            <div
                              key={shortcut.id}
                              className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-900/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <span className="text-sm text-zinc-300">
                                  {shortcut.description}
                                </span>
                                {shortcut.context !== "global" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0"
                                  >
                                    {CONTEXT_LABELS[shortcut.context]}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                {formatKey(
                                  shortcut.key,
                                  shortcut.modifiers,
                                ).map((k, i) => (
                                  <kbd
                                    key={i}
                                    className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs min-w-[24px] text-center"
                                  >
                                    {k}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between p-3 border-t border-zinc-800 text-xs text-zinc-500">
              <p>
                Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded">?</kbd>{" "}
                or{" "}
                <kbd className="px-1 py-0.5 bg-zinc-800 rounded">
                  {platform.mod}+/
                </kbd>{" "}
                anytime to show this guide
              </p>
              <Badge variant="outline">
                {filteredShortcuts.length} shortcuts
              </Badge>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function ShortcutGuide(props: ShortcutsOverlayProps) {
  return <ShortcutsOverlay {...props} />;
}

interface ShortcutHintProps {
  shortcut: string | { key: string; modifiers?: string[] };
  size?: "xs" | "sm" | "md";
}

export function ShortcutHint({ shortcut, size = "sm" }: ShortcutHintProps) {
  const platform = getPlatformModifiers();
  const sizeClasses = {
    xs: "px-1 py-0.5 text-[10px]",
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-sm",
  };

  let keys: string[] = [];

  if (typeof shortcut === "string") {
    const parts = shortcut.split("+");
    keys = parts.map((p) => {
      if (p === "cmd" || p === "meta") return platform.mod;
      if (p === "shift") return "⇧";
      if (p === "alt" || p === "option") return platform.alt;
      return p.toUpperCase();
    });
  } else {
    if (shortcut.modifiers) {
      shortcut.modifiers.forEach((mod) => {
        if (mod === "cmd") keys.push(platform.mod);
        else if (mod === "shift") keys.push("⇧");
        else if (mod === "alt") keys.push(platform.alt);
        else keys.push(mod);
      });
    }
    keys.push(shortcut.key.toUpperCase());
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className={cn(
            "bg-zinc-800 border border-zinc-700 rounded",
            sizeClasses[size],
          )}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutBadge({ shortcut }: { shortcut: string }) {
  return <ShortcutHint shortcut={shortcut} size="xs" />;
}

export function ShortcutTooltipContent({
  description,
  shortcut,
}: {
  description: string;
  shortcut: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span>{description}</span>
      <ShortcutHint shortcut={shortcut} size="xs" />
    </div>
  );
}

export default ShortcutsOverlay;
