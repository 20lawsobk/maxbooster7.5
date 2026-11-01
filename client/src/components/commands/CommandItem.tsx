import { forwardRef, memo } from "react";
import { ArrowRight, Command as CommandIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Command } from "@/lib/commands/CommandRegistry";
import { getPlatformModifiers, ShortcutModifier } from "@/lib/shortcuts/types";

export interface CommandItemProps {
  command: Command;
  index: number;
  isSelected: boolean;
  onSelect: (command: Command) => void;
  icon?: React.ElementType;
  showDescription?: boolean;
  showCategory?: boolean;
  variant?: "default" | "compact" | "minimal";
  className?: string;
}

export const CommandItem = memo(
  forwardRef<HTMLButtonElement, CommandItemProps>(function CommandItem(
    {
      command,
      index,
      isSelected,
      onSelect,
      icon: Icon = CommandIcon,
      showDescription = true,
      showCategory = false,
      variant = "default",
      className,
    },
    ref,
  ) {
    const platform = getPlatformModifiers();

    const formatModifier = (mod: ShortcutModifier) => {
      if (mod === "cmd") return platform.mod;
      if (mod === "shift") return platform.shift;
      if (mod === "alt") return platform.alt;
      return mod;
    };

    if (variant === "minimal") {
      return (
        <button
          ref={ref}
          data-index={index}
          onClick={() => onSelect(command)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors",
            isSelected
              ? "bg-amber-600/20 text-amber-400"
              : "hover:bg-zinc-800/50 text-zinc-300",
            className,
          )}
        >
          <Icon
            className={cn(
              "w-3.5 h-3.5 flex-shrink-0",
              isSelected ? "text-amber-400" : "text-zinc-500",
            )}
          />
          <span className="truncate text-sm">{command.name}</span>
          {command.shortcut && (
            <ShortcutKeys
              shortcut={command.shortcut}
              formatModifier={formatModifier}
              size="xs"
            />
          )}
        </button>
      );
    }

    if (variant === "compact") {
      return (
        <button
          ref={ref}
          data-index={index}
          onClick={() => onSelect(command)}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors",
            isSelected
              ? "bg-amber-600/20 text-amber-400"
              : "hover:bg-zinc-800/50 text-zinc-300",
            className,
          )}
        >
          <Icon
            className={cn(
              "w-4 h-4 flex-shrink-0",
              isSelected ? "text-amber-400" : "text-zinc-400",
            )}
          />
          <span className="flex-1 truncate">{command.name}</span>
          {command.shortcut && (
            <ShortcutKeys
              shortcut={command.shortcut}
              formatModifier={formatModifier}
              size="xs"
            />
          )}
        </button>
      );
    }

    return (
      <button
        ref={ref}
        data-index={index}
        onClick={() => onSelect(command)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
          isSelected
            ? "bg-amber-600/20 text-amber-400"
            : "hover:bg-zinc-800/50 text-zinc-300",
          className,
        )}
      >
        <Icon
          className={cn(
            "w-4 h-4 flex-shrink-0",
            isSelected ? "text-amber-400" : "text-zinc-400",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium">{command.name}</p>
            {showCategory && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase">
                {command.category}
              </span>
            )}
          </div>
          {showDescription && command.description && (
            <p className="text-xs text-zinc-500 truncate">
              {command.description}
            </p>
          )}
        </div>
        {command.shortcut && (
          <ShortcutKeys
            shortcut={command.shortcut}
            formatModifier={formatModifier}
            size="sm"
          />
        )}
        {isSelected && (
          <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
        )}
      </button>
    );
  }),
);

interface ShortcutKeysProps {
  shortcut: {
    key: string;
    modifiers?: ShortcutModifier[];
  };
  formatModifier: (mod: ShortcutModifier) => string;
  size?: "xs" | "sm" | "md";
}

function ShortcutKeys({
  shortcut,
  formatModifier,
  size = "sm",
}: ShortcutKeysProps) {
  const sizeClasses = {
    xs: "px-1 py-0.5 text-[10px]",
    sm: "px-1.5 py-0.5 text-xs",
    md: "px-2 py-1 text-sm",
  };

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {shortcut.modifiers?.map((mod) => (
        <kbd
          key={mod}
          className={cn(
            "bg-zinc-800 border border-zinc-700 rounded",
            sizeClasses[size],
          )}
        >
          {formatModifier(mod)}
        </kbd>
      ))}
      <kbd
        className={cn(
          "bg-zinc-800 border border-zinc-700 rounded",
          sizeClasses[size],
        )}
      >
        {shortcut.key.toUpperCase()}
      </kbd>
    </div>
  );
}

export default CommandItem;
