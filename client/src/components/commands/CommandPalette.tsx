import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  ArrowRight,
  Clock,
  Command as CommandIcon,
  Home,
  Music,
  BarChart3,
  Share2,
  Settings,
  HelpCircle,
  Upload,
  Plus,
  Moon,
  Folder,
  DollarSign,
  ShoppingBag,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useCommandPalette } from "@/contexts/ShortcutContext";
import { Command } from "@/lib/commands/CommandRegistry";
import { getPlatformModifiers } from "@/lib/shortcuts/types";

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  navigation: ArrowRight,
  actions: Plus,
  help: HelpCircle,
  view: Settings,
};

const COMMAND_ICONS: Record<string, React.ElementType> = {
  "go-to-dashboard": Home,
  "go-to-studio": Music,
  "go-to-projects": Folder,
  "go-to-analytics": BarChart3,
  "go-to-distribution": Share2,
  "go-to-social": Share2,
  "go-to-marketplace": ShoppingBag,
  "go-to-royalties": DollarSign,
  "go-to-settings": Settings,
  "new-project": Plus,
  "upload-file": Upload,
  "show-shortcuts": HelpCircle,
  "toggle-theme": Moon,
};

interface CommandPaletteProps {
  className?: string;
}

export function CommandPalette({ className }: CommandPaletteProps) {
  const { isOpen, close, search, execute, recentCommands } =
    useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const platform = getPlatformModifiers();

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return search(query);
  }, [query, search]);

  const displayedCommands = useMemo(() => {
    if (query.trim()) return searchResults;
    if (recentCommands.length > 0) return recentCommands;
    return search("");
  }, [query, searchResults, recentCommands, search]);

  const groupedCommands = useMemo(() => {
    if (query.trim()) return null;

    const groups: Record<string, Command[]> = {};
    displayedCommands.forEach((cmd) => {
      const category = cmd.category;
      if (!groups[category]) groups[category] = [];
      groups[category].push(cmd);
    });
    return groups;
  }, [query, displayedCommands]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    async (command: Command) => {
      close();
      await execute(command.id);
    },
    [close, execute],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) =>
            Math.min(i + 1, displayedCommands.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (displayedCommands[selectedIndex]) {
            handleSelect(displayedCommands[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [displayedCommands, selectedIndex, handleSelect, close],
  );

  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selectedElement?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const getCommandIcon = (command: Command) => {
    const IconComponent =
      COMMAND_ICONS[command.id] ||
      CATEGORY_ICONS[command.category] ||
      CommandIcon;
    return IconComponent;
  };

  const formatCategoryName = (category: string) => {
    return category
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
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
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-xl",
              "bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden",
              className,
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
              <Search className="w-5 h-5 text-zinc-400 flex-shrink-0" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a command or search..."
                className="flex-1 border-0 bg-transparent p-0 focus-visible:ring-0 text-lg placeholder:text-zinc-500"
              />
              <button
                onClick={close}
                className="p-1 hover:bg-zinc-800 rounded transition-colors"
                aria-label="Close command palette"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <ScrollArea className="max-h-[400px]">
              <div ref={listRef} className="p-2">
                {!query.trim() && recentCommands.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase">
                      <Clock className="w-3 h-3" />
                      Recent
                    </div>
                    {recentCommands.map((cmd, index) => (
                      <CommandItem
                        key={`recent-${cmd.id}`}
                        command={cmd}
                        index={index}
                        isSelected={selectedIndex === index}
                        onSelect={handleSelect}
                        icon={getCommandIcon(cmd)}
                      />
                    ))}
                  </div>
                )}

                {query.trim() ? (
                  searchResults.length > 0 ? (
                    <div>
                      <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase">
                        <Search className="w-3 h-3" />
                        Results
                      </div>
                      {searchResults.map((cmd, index) => (
                        <CommandItem
                          key={cmd.id}
                          command={cmd}
                          index={index}
                          isSelected={selectedIndex === index}
                          onSelect={handleSelect}
                          icon={getCommandIcon(cmd)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-zinc-500">
                      <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No commands found for "{query}"</p>
                      <p className="text-xs mt-1">
                        Try a different search term
                      </p>
                    </div>
                  )
                ) : groupedCommands && !recentCommands.length ? (
                  Object.entries(groupedCommands).map(
                    ([category, commands]) => (
                      <div key={category} className="mb-4">
                        <div className="flex items-center gap-2 px-2 py-1 text-xs text-zinc-500 uppercase">
                          {formatCategoryName(category)}
                        </div>
                        {commands.map((cmd) => {
                          const idx = displayedCommands.findIndex(
                            (c) => c.id === cmd.id,
                          );
                          return (
                            <CommandItem
                              key={cmd.id}
                              command={cmd}
                              index={idx}
                              isSelected={selectedIndex === idx}
                              onSelect={handleSelect}
                              icon={getCommandIcon(cmd)}
                            />
                          );
                        })}
                      </div>
                    ),
                  )
                ) : null}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between p-3 border-t border-zinc-800 text-xs text-zinc-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↓</kbd>
                  Navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">↵</kbd>
                  Select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">Esc</kbd>
                  Close
                </span>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">
                  {platform.mod}
                </kbd>
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded">K</kbd>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface CommandItemProps {
  command: Command;
  index: number;
  isSelected: boolean;
  onSelect: (command: Command) => void;
  icon: React.ElementType;
}

function CommandItem({
  command,
  index,
  isSelected,
  onSelect,
  icon: Icon,
}: CommandItemProps) {
  return (
    <button
      data-index={index}
      onClick={() => onSelect(command)}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
        isSelected
          ? "bg-amber-600/20 text-amber-400"
          : "hover:bg-zinc-800/50 text-zinc-300",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 flex-shrink-0",
          isSelected ? "text-amber-400" : "text-zinc-400",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{command.name}</p>
        {command.description && (
          <p className="text-xs text-zinc-500 truncate">
            {command.description}
          </p>
        )}
      </div>
      {command.shortcut && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {command.shortcut.modifiers?.map((mod) => (
            <kbd
              key={mod}
              className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs"
            >
              {mod === "cmd"
                ? getPlatformModifiers().mod
                : mod === "shift"
                  ? "⇧"
                  : mod === "alt"
                    ? getPlatformModifiers().alt
                    : mod}
            </kbd>
          ))}
          <kbd className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-xs">
            {command.shortcut.key.toUpperCase()}
          </kbd>
        </div>
      )}
      {isSelected && (
        <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
      )}
    </button>
  );
}

export default CommandPalette;
