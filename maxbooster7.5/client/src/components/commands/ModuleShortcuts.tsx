import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Music,
  BarChart3,
  Share2,
  Disc,
  ShoppingBag,
  Keyboard,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { ShortcutHint } from '@/components/shortcuts/ShortcutHint';
import { ShortcutContext, ShortcutDefinition } from '@/lib/shortcuts/types';

interface ModuleShortcutsProps {
  className?: string;
  defaultExpanded?: boolean;
  showModules?: ShortcutContext[];
}

const MODULE_CONFIG: Record<
  ShortcutContext,
  { name: string; icon: React.ElementType; color: string }
> = {
  global: { name: 'Global', icon: Keyboard, color: 'text-zinc-400' },
  studio: { name: 'Studio', icon: Music, color: 'text-purple-400' },
  analytics: { name: 'Analytics', icon: BarChart3, color: 'text-blue-400' },
  social: { name: 'Social', icon: Share2, color: 'text-pink-400' },
  distribution: { name: 'Distribution', icon: Disc, color: 'text-orange-400' },
  marketplace: { name: 'Marketplace', icon: ShoppingBag, color: 'text-green-400' },
  dashboard: { name: 'Dashboard', icon: Settings, color: 'text-amber-400' },
};

export function ModuleShortcuts({
  className,
  defaultExpanded = true,
  showModules = ['global', 'studio', 'analytics', 'social', 'distribution', 'marketplace'],
}: ModuleShortcutsProps) {
  const { shortcutManager, currentContext } = useShortcuts();
  const [expandedModules, setExpandedModules] = useState<Set<ShortcutContext>>(
    new Set(defaultExpanded ? showModules : [currentContext])
  );

  const groupedShortcuts = useMemo(() => {
    if (!shortcutManager) return new Map<ShortcutContext, ShortcutDefinition[]>();

    const groups = new Map<ShortcutContext, ShortcutDefinition[]>();
    const allShortcuts = shortcutManager.getAllShortcuts();

    allShortcuts.forEach((shortcut) => {
      const context = shortcut.context;
      if (!showModules.includes(context)) return;

      const existing = groups.get(context) || [];
      existing.push(shortcut);
      groups.set(context, existing);
    });

    return groups;
  }, [shortcutManager, showModules]);

  const toggleModule = (module: ShortcutContext) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(module)) {
        next.delete(module);
      } else {
        next.add(module);
      }
      return next;
    });
  };

  return (
    <div className={cn('space-y-2', className)}>
      {showModules.map((module) => {
        const config = MODULE_CONFIG[module];
        const shortcuts = groupedShortcuts.get(module) || [];
        const isExpanded = expandedModules.has(module);
        const isCurrentContext = currentContext === module;
        const Icon = config.icon;

        return (
          <Collapsible
            key={module}
            open={isExpanded}
            onOpenChange={() => toggleModule(module)}
          >
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-lg transition-colors',
                  isCurrentContext
                    ? 'bg-amber-600/20 border border-amber-600/30'
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn('w-4 h-4', config.color)} />
                  <span className="font-medium text-sm">{config.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {shortcuts.length}
                  </Badge>
                  {isCurrentContext && (
                    <Badge className="bg-amber-600 text-white text-[10px]">Active</Badge>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                )}
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-1 ml-7 pl-4 border-l border-zinc-800"
              >
                <ModuleShortcutsList shortcuts={shortcuts} />
              </motion.div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

interface ModuleShortcutsListProps {
  shortcuts: ShortcutDefinition[];
}

function ModuleShortcutsList({ shortcuts }: ModuleShortcutsListProps) {
  const groupedByCategory = useMemo(() => {
    const groups: Record<string, ShortcutDefinition[]> = {};
    shortcuts.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return Object.entries(groups);
  }, [shortcuts]);

  if (shortcuts.length === 0) {
    return (
      <div className="py-2 text-sm text-zinc-500">No shortcuts for this module</div>
    );
  }

  return (
    <div className="py-2 space-y-3">
      {groupedByCategory.map(([category, categoryShortcuts]) => (
        <div key={category}>
          <div className="text-xs text-zinc-500 uppercase mb-1.5">
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </div>
          <div className="space-y-1">
            {categoryShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className={cn(
                  'flex items-center justify-between py-1.5 px-2 rounded text-sm',
                  shortcut.enabled === false
                    ? 'opacity-50 line-through'
                    : 'hover:bg-zinc-800/50'
                )}
              >
                <span className="text-zinc-300">{shortcut.description}</span>
                <ShortcutHint
                  shortcut={{ key: shortcut.key, modifiers: shortcut.modifiers }}
                  size="xs"
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ModuleShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ModuleShortcutsPanel({ isOpen, onClose }: ModuleShortcutsPanelProps) {
  const { open: openCustomizer } = useShortcuts();

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      className="fixed right-0 top-0 h-full w-80 bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50"
    >
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Keyboard className="w-5 h-5 text-amber-400" />
          <h2 className="font-semibold">Module Shortcuts</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="p-4">
          <ModuleShortcuts />
        </div>
      </ScrollArea>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-800 bg-zinc-950">
        <Button variant="outline" className="w-full" onClick={() => {}}>
          <Settings className="w-4 h-4 mr-2" />
          Customize Shortcuts
        </Button>
      </div>
    </motion.div>
  );
}

export default ModuleShortcuts;
