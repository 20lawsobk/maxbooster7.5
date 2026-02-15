import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getPlatformModifiers, ShortcutModifier } from '@/lib/shortcuts/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface KeyboardShortcutHintProps {
  keys: string[];
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'muted' | 'ghost' | 'solid';
  inline?: boolean;
  label?: string;
  showTooltip?: boolean;
  tooltipContent?: string;
}

export function KeyboardShortcutHint({
  keys,
  className,
  size = 'sm',
  variant = 'default',
  inline = false,
  label,
  showTooltip = false,
  tooltipContent,
}: KeyboardShortcutHintProps) {
  const platform = getPlatformModifiers();

  const formattedKeys = useMemo(() => {
    return keys.map(key => {
      const lower = key.toLowerCase();
      if (lower === 'cmd' || lower === 'ctrl' || lower === 'mod' || lower === 'meta') {
        return platform.mod;
      }
      if (lower === 'shift') return platform.shift;
      if (lower === 'alt' || lower === 'option') return platform.alt;
      if (lower === 'enter' || lower === 'return') return '↵';
      if (lower === 'escape' || lower === 'esc') return 'Esc';
      if (lower === 'backspace') return '⌫';
      if (lower === 'delete') return '⌦';
      if (lower === 'tab') return '⇥';
      if (lower === 'space') return '␣';
      if (lower === 'arrowup' || lower === 'up') return '↑';
      if (lower === 'arrowdown' || lower === 'down') return '↓';
      if (lower === 'arrowleft' || lower === 'left') return '←';
      if (lower === 'arrowright' || lower === 'right') return '→';
      return key.length === 1 ? key.toUpperCase() : key;
    });
  }, [keys, platform]);

  const sizeClasses = {
    xs: 'px-1 py-0.5 text-[9px] min-w-[14px]',
    sm: 'px-1.5 py-0.5 text-[10px] min-w-[18px]',
    md: 'px-2 py-1 text-xs min-w-[22px]',
    lg: 'px-2.5 py-1.5 text-sm min-w-[28px]',
  };

  const variantClasses = {
    default: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    muted: 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400',
    ghost: 'bg-transparent border border-zinc-600 text-zinc-400',
    solid: 'bg-zinc-700 border-0 text-zinc-200',
  };

  const content = (
    <div className={cn(
      "inline-flex items-center gap-0.5",
      inline && "ml-1",
      className
    )}>
      {label && <span className="mr-1.5 text-zinc-400">{label}</span>}
      {formattedKeys.map((key, index) => (
        <span key={index} className="flex items-center">
          <kbd className={cn(
            "inline-flex items-center justify-center rounded font-mono",
            sizeClasses[size],
            variantClasses[variant]
          )}>
            {key}
          </kbd>
          {index < formattedKeys.length - 1 && (
            <span className="mx-0.5 text-zinc-600 text-xs">+</span>
          )}
        </span>
      ))}
    </div>
  );

  if (showTooltip && tooltipContent) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {content}
          </TooltipTrigger>
          <TooltipContent>
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

interface ShortcutWithLabelProps {
  shortcut: string | { key: string; modifiers?: ShortcutModifier[] };
  label: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'inline' | 'block';
}

export function ShortcutWithLabel({
  shortcut,
  label,
  className,
  size = 'sm',
  variant = 'inline',
}: ShortcutWithLabelProps) {
  const keys = useMemo(() => {
    if (typeof shortcut === 'string') {
      return shortcut.split('+').map(k => k.trim());
    }
    const parts: string[] = [];
    if (shortcut.modifiers) {
      parts.push(...shortcut.modifiers);
    }
    parts.push(shortcut.key);
    return parts;
  }, [shortcut]);

  if (variant === 'block') {
    return (
      <div className={cn("flex items-center justify-between gap-4", className)}>
        <span className="text-sm text-zinc-300">{label}</span>
        <KeyboardShortcutHint keys={keys} size={size} />
      </div>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2 text-sm text-zinc-400", className)}>
      <span>{label}</span>
      <KeyboardShortcutHint keys={keys} size="xs" variant="muted" />
    </span>
  );
}

interface ActionShortcutHintProps {
  action: string;
  shortcut: string;
  className?: string;
}

export function ActionShortcutHint({ action, shortcut, className }: ActionShortcutHintProps) {
  const keys = shortcut.split('+').map(k => k.trim());
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-sm">{action}</span>
      <KeyboardShortcutHint keys={keys} size="xs" variant="ghost" />
    </div>
  );
}

export default KeyboardShortcutHint;
