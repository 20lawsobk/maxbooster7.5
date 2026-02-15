import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, 
  Scissors, 
  Trash2, 
  Volume2, 
  VolumeX,
  Headphones,
  Palette,
  Layers,
  Edit3,
  ArrowUp,
  ArrowDown,
  Wand2,
  GitBranch,
  Lock,
  Unlock,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  label: string;
  icon?: typeof Copy;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
  action?: () => void;
}

interface FlowStateContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: MenuItem[];
  onClose: () => void;
}

export function FlowStateContextMenu({
  isOpen,
  position,
  items,
  onClose,
}: FlowStateContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-50 min-w-[200px] py-1 bg-slate-800 border border-white/10 rounded-lg shadow-xl overflow-hidden"
          style={{
            left: Math.min(position.x, window.innerWidth - 220),
            top: Math.min(position.y, window.innerHeight - 300),
          }}
        >
          {items.map((item, index) => (
            <div key={item.id}>
              {item.id === 'separator' ? (
                <div className="h-px bg-white/10 my-1" />
              ) : (
                <button
                  onClick={() => {
                    if (!item.disabled && item.action) {
                      item.action();
                      onClose();
                    }
                  }}
                  disabled={item.disabled}
                  className={cn(
                    "w-full px-3 py-2 flex items-center gap-3 text-sm transition-colors",
                    item.disabled
                      ? "text-white/30 cursor-not-allowed"
                      : item.danger
                        ? "text-red-400 hover:bg-red-500/10"
                        : "text-white/80 hover:bg-white/10"
                  )}
                >
                  {item.icon && <item.icon className="w-4 h-4 flex-shrink-0" />}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-xs text-white/30 font-mono">{item.shortcut}</span>
                  )}
                  {item.submenu && <ChevronRight className="w-3 h-3 text-white/30" />}
                </button>
              )}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const TRACK_CONTEXT_MENU_ITEMS = (handlers: {
  onDuplicate: () => void;
  onDelete: () => void;
  onMute: () => void;
  onSolo: () => void;
  onRename: () => void;
  onChangeColor: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFreeze: () => void;
  onAIProcess: () => void;
  onAddPlugin?: () => void;
  isMuted: boolean;
  isSolo: boolean;
  isFrozen: boolean;
}): MenuItem[] => [
  { id: 'rename', label: 'Rename Track', icon: Edit3, shortcut: 'F2', action: handlers.onRename },
  { id: 'duplicate', label: 'Duplicate Track', icon: Copy, shortcut: '⌘D', action: handlers.onDuplicate },
  { id: 'separator', label: '' },
  { 
    id: 'mute', 
    label: handlers.isMuted ? 'Unmute' : 'Mute', 
    icon: handlers.isMuted ? Volume2 : VolumeX, 
    shortcut: 'M', 
    action: handlers.onMute 
  },
  { 
    id: 'solo', 
    label: handlers.isSolo ? 'Unsolo' : 'Solo', 
    icon: Headphones, 
    shortcut: 'S', 
    action: handlers.onSolo 
  },
  { id: 'separator', label: '' },
  { id: 'add-plugin', label: 'Add Plugin/Instrument...', icon: Layers, shortcut: '⇧P', action: handlers.onAddPlugin },
  { id: 'color', label: 'Change Color', icon: Palette, action: handlers.onChangeColor },
  { id: 'move-up', label: 'Move Up', icon: ArrowUp, action: handlers.onMoveUp },
  { id: 'move-down', label: 'Move Down', icon: ArrowDown, action: handlers.onMoveDown },
  { id: 'separator', label: '' },
  { 
    id: 'freeze', 
    label: handlers.isFrozen ? 'Unfreeze Track' : 'Freeze Track', 
    icon: handlers.isFrozen ? Unlock : Lock, 
    action: handlers.onFreeze 
  },
  { id: 'ai-process', label: 'AI Process...', icon: Wand2, action: handlers.onAIProcess },
  { id: 'separator', label: '' },
  { id: 'delete', label: 'Delete Track', icon: Trash2, shortcut: 'Del', danger: true, action: handlers.onDelete },
];

export const CLIP_CONTEXT_MENU_ITEMS = (handlers: {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSplit: () => void;
  onMerge: () => void;
  onRename: () => void;
  onAIProcess: () => void;
  onStemSeparate: () => void;
  canPaste: boolean;
  canMerge: boolean;
}): MenuItem[] => [
  { id: 'cut', label: 'Cut', icon: Scissors, shortcut: '⌘X', action: handlers.onCut },
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C', action: handlers.onCopy },
  { id: 'paste', label: 'Paste', icon: Layers, shortcut: '⌘V', action: handlers.onPaste, disabled: !handlers.canPaste },
  { id: 'duplicate', label: 'Duplicate', icon: Copy, shortcut: '⌘D', action: handlers.onDuplicate },
  { id: 'separator', label: '' },
  { id: 'split', label: 'Split at Playhead', icon: GitBranch, shortcut: 'S', action: handlers.onSplit },
  { id: 'merge', label: 'Merge Clips', icon: Layers, action: handlers.onMerge, disabled: !handlers.canMerge },
  { id: 'rename', label: 'Rename Clip', icon: Edit3, action: handlers.onRename },
  { id: 'separator', label: '' },
  { id: 'stem-separate', label: 'Stem Separation', icon: GitBranch, action: handlers.onStemSeparate },
  { id: 'ai-process', label: 'AI Process...', icon: Wand2, action: handlers.onAIProcess },
  { id: 'separator', label: '' },
  { id: 'delete', label: 'Delete', icon: Trash2, shortcut: 'Del', danger: true, action: handlers.onDelete },
];
