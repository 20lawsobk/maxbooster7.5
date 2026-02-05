import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getPlatformModifiers, ShortcutModifier, formatShortcutKeys } from '@/lib/shortcuts/types';

interface ShortcutHintProps {
  shortcut: string | { key: string; modifiers?: ShortcutModifier[] };
  className?: string;
  size?: 'xs' | 'sm' | 'md';
  variant?: 'default' | 'muted' | 'ghost';
}

export function ShortcutHint({ 
  shortcut, 
  className,
  size = 'sm',
  variant = 'default' 
}: ShortcutHintProps) {
  const platform = getPlatformModifiers();

  const keys = useMemo(() => {
    if (typeof shortcut === 'string') {
      const parts = shortcut.split('+').map(p => p.trim());
      return parts.map(part => {
        const lower = part.toLowerCase();
        if (lower === 'cmd' || lower === 'ctrl' || lower === 'mod') {
          return platform.mod;
        }
        if (lower === 'shift') return platform.shift;
        if (lower === 'alt' || lower === 'option') return platform.alt;
        return part.length === 1 ? part.toUpperCase() : part;
      });
    }
    
    return formatShortcutKeys(shortcut.key, shortcut.modifiers).split('+');
  }, [shortcut, platform]);

  const sizeClasses = {
    xs: 'px-1 py-0.5 text-[10px] min-w-[16px]',
    sm: 'px-1.5 py-0.5 text-xs min-w-[20px]',
    md: 'px-2 py-1 text-sm min-w-[24px]',
  };

  const variantClasses = {
    default: 'bg-zinc-800 border border-zinc-700 text-zinc-300',
    muted: 'bg-zinc-800/50 border border-zinc-700/50 text-zinc-400',
    ghost: 'bg-transparent border border-zinc-600 text-zinc-400',
  };

  return (
    <div className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((key, index) => (
        <span key={index} className="flex items-center">
          <kbd className={cn(
            "inline-flex items-center justify-center rounded font-mono",
            sizeClasses[size],
            variantClasses[variant]
          )}>
            {key}
          </kbd>
          {index < keys.length - 1 && (
            <span className="mx-0.5 text-zinc-600">+</span>
          )}
        </span>
      ))}
    </div>
  );
}

interface ShortcutBadgeProps {
  label: string;
  shortcut: string | { key: string; modifiers?: ShortcutModifier[] };
  className?: string;
}

export function ShortcutBadge({ label, shortcut, className }: ShortcutBadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-2 text-sm text-zinc-400",
      className
    )}>
      <span>{label}</span>
      <ShortcutHint shortcut={shortcut} size="xs" variant="muted" />
    </span>
  );
}

interface ShortcutTooltipContentProps {
  action: string;
  shortcut: string | { key: string; modifiers?: ShortcutModifier[] };
}

export function ShortcutTooltipContent({ action, shortcut }: ShortcutTooltipContentProps) {
  return (
    <div className="flex items-center gap-2">
      <span>{action}</span>
      <ShortcutHint shortcut={shortcut} size="xs" variant="ghost" />
    </div>
  );
}

export default ShortcutHint;
