import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  X,
  Search,
  RotateCcw,
  AlertTriangle,
  Check,
  Keyboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { ShortcutHint } from './ShortcutHint';
import { 
  ShortcutDefinition, 
  ShortcutModifier, 
  getPlatformModifiers,
  formatShortcutKeys 
} from '@/lib/shortcuts/types';

interface ShortcutCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutCustomizer({ open, onOpenChange }: ShortcutCustomizerProps) {
  const { shortcutManager } = useShortcuts();
  const [shortcuts, setShortcuts] = useState<ShortcutDefinition[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingShortcut, setEditingShortcut] = useState<ShortcutDefinition | null>(null);
  const [recordedKeys, setRecordedKeys] = useState<{
    key: string;
    modifiers: ShortcutModifier[];
  } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [conflict, setConflict] = useState<ShortcutDefinition | null>(null);

  useEffect(() => {
    if (open && shortcutManager) {
      setShortcuts(shortcutManager.getAllShortcuts());
    }
  }, [open, shortcutManager]);

  const filteredShortcuts = shortcuts.filter(s =>
    s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartRecording = (shortcut: ShortcutDefinition) => {
    setEditingShortcut(shortcut);
    setRecordedKeys(null);
    setIsRecording(true);
    setConflict(null);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording || !editingShortcut) return;
    
    e.preventDefault();
    e.stopPropagation();

    const key = e.key;
    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(key)) {
      return;
    }

    const modifiers: ShortcutModifier[] = [];
    if (e.ctrlKey || e.metaKey) modifiers.push('cmd');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');

    const newKeys = { key: key.toLowerCase(), modifiers };
    setRecordedKeys(newKeys);
    setIsRecording(false);

    const existingConflict = shortcuts.find(s => {
      if (s.id === editingShortcut.id) return false;
      const sameKey = s.key.toLowerCase() === newKeys.key;
      const sameMods = 
        (s.modifiers || []).length === modifiers.length &&
        (s.modifiers || []).every(m => modifiers.includes(m));
      return sameKey && sameMods;
    });

    if (existingConflict) {
      setConflict(existingConflict);
    }
  }, [isRecording, editingShortcut, shortcuts]);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isRecording, handleKeyDown]);

  const handleSaveShortcut = () => {
    if (!editingShortcut || !recordedKeys || !shortcutManager) return;

    shortcutManager.customize(editingShortcut.id, {
      key: recordedKeys.key,
      modifiers: recordedKeys.modifiers,
    });

    setShortcuts(shortcutManager.getAllShortcuts());
    setEditingShortcut(null);
    setRecordedKeys(null);
    setConflict(null);
  };

  const handleCancelEdit = () => {
    setEditingShortcut(null);
    setRecordedKeys(null);
    setIsRecording(false);
    setConflict(null);
  };

  const handleResetShortcut = (shortcutId: string) => {
    if (!shortcutManager) return;
    shortcutManager.resetShortcut(shortcutId);
    setShortcuts(shortcutManager.getAllShortcuts());
  };

  const handleResetAll = () => {
    if (!shortcutManager) return;
    shortcutManager.resetAllShortcuts();
    setShortcuts(shortcutManager.getAllShortcuts());
  };

  const handleToggleShortcut = (shortcutId: string, enabled: boolean) => {
    if (!shortcutManager) return;
    shortcutManager.customize(shortcutId, { enabled });
    setShortcuts(shortcutManager.getAllShortcuts());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Customize Shortcuts
          </DialogTitle>
          <DialogDescription>
            Customize keyboard shortcuts to match your workflow
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="pl-10"
            />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all shortcuts?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all keyboard shortcuts to their default values. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAll}>Reset All</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-2">
            {filteredShortcuts.map(shortcut => (
              <div
                key={shortcut.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border border-zinc-800",
                  editingShortcut?.id === shortcut.id && "ring-2 ring-amber-500"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{shortcut.description}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {shortcut.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Context: {shortcut.context}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {editingShortcut?.id === shortcut.id ? (
                    <div className="flex items-center gap-2">
                      {isRecording ? (
                        <div className="px-3 py-1.5 border border-amber-500 rounded-lg animate-pulse text-sm text-amber-400">
                          Press keys...
                        </div>
                      ) : recordedKeys ? (
                        <div className="flex items-center gap-2">
                          <ShortcutHint
                            shortcut={{ key: recordedKeys.key, modifiers: recordedKeys.modifiers }}
                            size="sm"
                          />
                          {conflict && (
                            <AlertTriangle className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                      ) : (
                        <ShortcutHint
                          shortcut={{ key: shortcut.key, modifiers: shortcut.modifiers }}
                          size="sm"
                        />
                      )}
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                        <X className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={handleSaveShortcut}
                        disabled={!recordedKeys || !!conflict}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => handleStartRecording(shortcut)}
                        className="hover:bg-zinc-800 rounded-lg p-1 transition-colors"
                      >
                        <ShortcutHint
                          shortcut={{ key: shortcut.key, modifiers: shortcut.modifiers }}
                          size="sm"
                        />
                      </button>
                      <Switch
                        checked={shortcut.enabled !== false}
                        onCheckedChange={(checked) => handleToggleShortcut(shortcut.id, checked)}
                      />
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {conflict && editingShortcut && (
          <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              This shortcut conflicts with "{conflict.description}"
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ShortcutCustomizer;
