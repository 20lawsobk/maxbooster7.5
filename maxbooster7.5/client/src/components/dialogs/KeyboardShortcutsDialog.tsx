import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useDialogAccessibility } from '@/lib/accessibility';
import { useRef } from 'react';

interface KeyboardShortcut {
  keys: string[];
  description: string;
  category: string;
}

const shortcuts: KeyboardShortcut[] = [
  // Global Navigation
  { keys: ['?'], description: 'Open this help dialog', category: 'Global' },
  { keys: ['Escape'], description: 'Close dialogs/modals', category: 'Global' },
  { keys: ['Tab'], description: 'Navigate forward', category: 'Global' },
  { keys: ['Shift', 'Tab'], description: 'Navigate backward', category: 'Global' },
  { keys: ['/'], description: 'Focus search', category: 'Global' },
  { keys: ['Alt', 'H'], description: 'Go to home/dashboard', category: 'Global' },
  { keys: ['Alt', 'S'], description: 'Go to Studio', category: 'Global' },
  { keys: ['Alt', 'P'], description: 'Go to Projects', category: 'Global' },

  // Studio Controls
  { keys: ['Space'], description: 'Play/Pause', category: 'Studio' },
  { keys: ['R'], description: 'Toggle recording', category: 'Studio' },
  { keys: ['Ctrl', 'S'], description: 'Save project', category: 'Studio' },
  { keys: ['Ctrl', 'Z'], description: 'Undo', category: 'Studio' },
  { keys: ['Ctrl', 'Y'], description: 'Redo', category: 'Studio' },
  { keys: ['M'], description: 'Toggle metronome', category: 'Studio' },
  { keys: ['L'], description: 'Toggle loop', category: 'Studio' },
  { keys: ['T'], description: 'Tap tempo', category: 'Studio' },
  { keys: ['Delete'], description: 'Delete selected', category: 'Studio' },
  { keys: ['+'], description: 'Zoom in', category: 'Studio' },
  { keys: ['-'], description: 'Zoom out', category: 'Studio' },

  // Lists & Tables
  { keys: ['↑'], description: 'Move up in list', category: 'Lists' },
  { keys: ['↓'], description: 'Move down in list', category: 'Lists' },
  { keys: ['←'], description: 'Move left', category: 'Lists' },
  { keys: ['→'], description: 'Move right', category: 'Lists' },
  { keys: ['Home'], description: 'Go to first item', category: 'Lists' },
  { keys: ['End'], description: 'Go to last item', category: 'Lists' },
  { keys: ['Enter'], description: 'Activate item', category: 'Lists' },
  { keys: ['Space'], description: 'Select/Toggle item', category: 'Lists' },

  // Forms
  { keys: ['Enter'], description: 'Submit form', category: 'Forms' },
  { keys: ['Escape'], description: 'Cancel form', category: 'Forms' },
  { keys: ['Tab'], description: 'Next field', category: 'Forms' },
  { keys: ['Shift', 'Tab'], description: 'Previous field', category: 'Forms' },

  // Media Controls
  { keys: ['K'], description: 'Play/Pause media', category: 'Media' },
  { keys: ['J'], description: 'Rewind 10 seconds', category: 'Media' },
  { keys: ['L'], description: 'Forward 10 seconds', category: 'Media' },
  { keys: ['F'], description: 'Toggle fullscreen', category: 'Media' },
  { keys: ['M'], description: 'Toggle mute', category: 'Media' },
  { keys: ['↑'], description: 'Increase volume', category: 'Media' },
  { keys: ['↓'], description: 'Decrease volume', category: 'Media' },
];

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * TODO: Add function documentation
 */
export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Use accessibility hook for dialog
  useDialogAccessibility(dialogRef, open, () => onOpenChange(false));

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (acc, shortcut) => {
      if (!acc[shortcut.category]) {
        acc[shortcut.category] = [];
      }
      acc[shortcut.category].push(shortcut);
      return acc;
    },
    {} as Record<string, KeyboardShortcut[]>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        className="max-w-3xl max-h-[80vh]"
        aria-labelledby="shortcuts-dialog-title"
        aria-describedby="shortcuts-dialog-description"
      >
        <DialogHeader>
          <DialogTitle id="shortcuts-dialog-title" className="text-2xl">
            Keyboard Shortcuts
          </DialogTitle>
          <DialogDescription id="shortcuts-dialog-description">
            Press <kbd className="px-2 py-1 bg-muted rounded text-xs">?</kbd> anytime to view this
            guide
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <div key={category} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{category}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {categoryShortcuts.length} shortcuts
                  </Badge>
                </div>

                <div className="space-y-2">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded hover:bg-muted/50 transition-colors"
                      role="group"
                      aria-label={`${shortcut.description}: ${shortcut.keys.join(' + ')}`}
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex} className="flex items-center gap-1">
                            <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono min-w-[32px] text-center">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="text-muted-foreground text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {category !==
                  Object.keys(groupedShortcuts)[Object.keys(groupedShortcuts).length - 1] && (
                  <Separator className="mt-4" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            <strong>Tip:</strong> Most shortcuts work globally unless you&apos;re typing in a text
            field
          </div>
          <Badge variant="outline">{shortcuts.length} total shortcuts</Badge>
        </div>
      </DialogContent>
    </Dialog>
  );
}
