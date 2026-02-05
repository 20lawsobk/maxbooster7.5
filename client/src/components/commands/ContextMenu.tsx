import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Trash2,
  Edit,
  Share2,
  Download,
  FolderPlus,
  Music,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  ChevronRight,
  Scissors,
  Clipboard,
  RotateCcw,
  Undo,
  Redo,
  Settings,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShortcutHint } from '@/components/shortcuts/ShortcutHint';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  danger?: boolean;
  submenu?: ContextMenuItem[];
  separator?: boolean;
}

export interface ContextMenuConfig {
  items: ContextMenuItem[];
  onAction?: (itemId: string) => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
  onAction?: (itemId: string) => void;
}

export function ContextMenu({ x, y, items, onClose, onAction }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      if (adjustedX !== x || adjustedY !== y) {
        menuRef.current.style.left = `${adjustedX}px`;
        menuRef.current.style.top = `${adjustedY}px`;
      }
    }
  }, [x, y]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    if (item.submenu) return;

    if (item.action) {
      item.action();
    }
    if (onAction) {
      onAction(item.id);
    }
    onClose();
  };

  const handleMouseEnter = (item: ContextMenuItem, e: React.MouseEvent) => {
    if (item.submenu) {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setActiveSubmenu(item.id);
      setSubmenuPosition({
        x: rect.right,
        y: rect.top,
      });
    } else {
      setActiveSubmenu(null);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        onClick={onClose}
      />

      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        style={{ left: x, top: y }}
        className={cn(
          "fixed z-50 min-w-[180px] py-1",
          "bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl",
          "overflow-hidden"
        )}
        role="menu"
        aria-label="Context menu"
      >
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`sep-${index}`} className="my-1 h-px bg-zinc-800" />;
          }

          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item)}
              onMouseEnter={(e) => handleMouseEnter(item, e)}
              disabled={item.disabled}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
                "outline-none focus:bg-zinc-800",
                item.disabled 
                  ? "text-zinc-600 cursor-not-allowed" 
                  : item.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-zinc-300 hover:bg-zinc-800"
              )}
              role="menuitem"
            >
              {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <ShortcutHint shortcut={item.shortcut} size="xs" variant="ghost" />
              )}
              {item.submenu && <ChevronRight className="w-4 h-4 text-zinc-500" />}
            </button>
          );
        })}
      </motion.div>

      <AnimatePresence>
        {activeSubmenu && (
          <ContextMenuSubmenu
            x={submenuPosition.x}
            y={submenuPosition.y}
            items={items.find(i => i.id === activeSubmenu)?.submenu || []}
            onClose={onClose}
            onAction={onAction}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ContextMenuSubmenu({ x, y, items, onClose, onAction }: ContextMenuProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -5 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -5 }}
      transition={{ duration: 0.1 }}
      style={{ left: x, top: y }}
      className={cn(
        "fixed z-50 min-w-[160px] py-1",
        "bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl"
      )}
      role="menu"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={`sep-${index}`} className="my-1 h-px bg-zinc-800" />;
        }

        const Icon = item.icon;

        return (
          <button
            key={item.id}
            onClick={() => {
              if (!item.disabled) {
                item.action?.();
                onAction?.(item.id);
                onClose();
              }
            }}
            disabled={item.disabled}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors",
              item.disabled 
                ? "text-zinc-600 cursor-not-allowed" 
                : item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-zinc-300 hover:bg-zinc-800"
            )}
            role="menuitem"
          >
            {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <ShortcutHint shortcut={item.shortcut} size="xs" variant="ghost" />
            )}
          </button>
        );
      })}
    </motion.div>
  );
}

export const DEFAULT_CONTEXT_ITEMS: Record<string, ContextMenuItem[]> = {
  track: [
    { id: 'edit', label: 'Edit Track', icon: Edit, shortcut: 'E' },
    { id: 'duplicate', label: 'Duplicate', icon: Copy, shortcut: 'cmd+D' },
    { id: 'separator1', label: '', separator: true },
    { id: 'mute', label: 'Mute', icon: VolumeX, shortcut: 'M' },
    { id: 'solo', label: 'Solo', icon: Volume2, shortcut: 'S' },
    { id: 'separator2', label: '', separator: true },
    { id: 'export', label: 'Export Track', icon: Download },
    { id: 'delete', label: 'Delete Track', icon: Trash2, shortcut: 'Delete', danger: true },
  ],
  clip: [
    { id: 'cut', label: 'Cut', icon: Scissors, shortcut: 'cmd+X' },
    { id: 'copy', label: 'Copy', icon: Copy, shortcut: 'cmd+C' },
    { id: 'paste', label: 'Paste', icon: Clipboard, shortcut: 'cmd+V' },
    { id: 'separator1', label: '', separator: true },
    { id: 'split', label: 'Split at Playhead', icon: Scissors, shortcut: 'S' },
    { id: 'reverse', label: 'Reverse', icon: RotateCcw },
    { id: 'separator2', label: '', separator: true },
    { id: 'delete', label: 'Delete', icon: Trash2, shortcut: 'Delete', danger: true },
  ],
  project: [
    { id: 'open', label: 'Open Project', icon: FolderPlus },
    { id: 'rename', label: 'Rename', icon: Edit, shortcut: 'F2' },
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { id: 'separator1', label: '', separator: true },
    { id: 'export', label: 'Export', icon: Download },
    { id: 'share', label: 'Share', icon: Share2 },
    { id: 'separator2', label: '', separator: true },
    { id: 'info', label: 'Project Info', icon: Info },
    { id: 'delete', label: 'Delete Project', icon: Trash2, danger: true },
  ],
  timeline: [
    { id: 'undo', label: 'Undo', icon: Undo, shortcut: 'cmd+Z' },
    { id: 'redo', label: 'Redo', icon: Redo, shortcut: 'cmd+shift+Z' },
    { id: 'separator1', label: '', separator: true },
    { id: 'paste', label: 'Paste', icon: Clipboard, shortcut: 'cmd+V' },
    { id: 'separator2', label: '', separator: true },
    { id: 'add-track', label: 'Add Track', icon: Music },
    { id: 'add-marker', label: 'Add Marker', icon: FolderPlus },
  ],
  social: [
    { id: 'edit', label: 'Edit Post', icon: Edit },
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { id: 'separator1', label: '', separator: true },
    { id: 'schedule', label: 'Reschedule', icon: Settings },
    { id: 'preview', label: 'Preview', icon: Eye },
    { id: 'separator2', label: '', separator: true },
    { id: 'delete', label: 'Delete', icon: Trash2, danger: true },
  ],
  general: [
    { id: 'cut', label: 'Cut', icon: Scissors, shortcut: 'cmd+X' },
    { id: 'copy', label: 'Copy', icon: Copy, shortcut: 'cmd+C' },
    { id: 'paste', label: 'Paste', icon: Clipboard, shortcut: 'cmd+V' },
    { id: 'separator1', label: '', separator: true },
    { id: 'select-all', label: 'Select All', icon: Eye, shortcut: 'cmd+A' },
  ],
};

export default ContextMenu;
