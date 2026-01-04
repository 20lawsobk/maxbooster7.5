import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialogContainer } from '@/components/ui/dialog';

interface ShortcutCategory {
  name: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    name: 'Transport',
    shortcuts: [
      { keys: ['Space'], description: 'Play / Pause' },
      { keys: ['Enter'], description: 'Stop & Return to Start' },
      { keys: ['R'], description: 'Toggle Record' },
      { keys: [','], description: 'Skip Back' },
      { keys: ['.'], description: 'Skip Forward' },
      { keys: ['L'], description: 'Toggle Loop' },
      { keys: ['M'], description: 'Toggle Metronome' },
      { keys: ['Home'], description: 'Go to Start' },
      { keys: ['End'], description: 'Go to End' },
    ],
  },
  {
    name: 'Editing',
    shortcuts: [
      { keys: ['Ctrl', 'Z'], description: 'Undo' },
      { keys: ['Ctrl', 'Y'], description: 'Redo' },
      { keys: ['Ctrl', 'C'], description: 'Copy' },
      { keys: ['Ctrl', 'V'], description: 'Paste' },
      { keys: ['Ctrl', 'X'], description: 'Cut' },
      { keys: ['Ctrl', 'D'], description: 'Duplicate' },
      { keys: ['Ctrl', 'A'], description: 'Select All' },
      { keys: ['Delete'], description: 'Delete Selected' },
      { keys: ['Backspace'], description: 'Delete Selected' },
    ],
  },
  {
    name: 'Track Controls',
    shortcuts: [
      { keys: ['M'], description: 'Mute Selected Track' },
      { keys: ['S'], description: 'Solo Selected Track' },
      { keys: ['Shift', 'R'], description: 'Arm Track for Recording' },
      { keys: ['↑'], description: 'Select Previous Track' },
      { keys: ['↓'], description: 'Select Next Track' },
      { keys: ['Ctrl', 'T'], description: 'Add New Track' },
      { keys: ['Ctrl', 'Shift', 'T'], description: 'Add Instrument Track' },
    ],
  },
  {
    name: 'Zoom & Navigation',
    shortcuts: [
      { keys: ['Ctrl', '+'], description: 'Zoom In' },
      { keys: ['Ctrl', '-'], description: 'Zoom Out' },
      { keys: ['Ctrl', '0'], description: 'Fit to Window' },
      { keys: ['G'], description: 'Toggle Snap to Grid' },
      { keys: ['['], description: 'Set Loop Start' },
      { keys: [']'], description: 'Set Loop End' },
      { keys: ['Scroll'], description: 'Horizontal Scroll' },
      { keys: ['Ctrl', 'Scroll'], description: 'Zoom Timeline' },
    ],
  },
  {
    name: 'Mixer',
    shortcuts: [
      { keys: ['Tab'], description: 'Toggle Mixer View' },
      { keys: ['F'], description: 'Toggle Fullscreen' },
      { keys: ['B'], description: 'Toggle Browser Panel' },
      { keys: ['I'], description: 'Toggle Inspector' },
      { keys: ['Ctrl', 'M'], description: 'Toggle Master Section' },
    ],
  },
  {
    name: 'File & Project',
    shortcuts: [
      { keys: ['Ctrl', 'S'], description: 'Save Project' },
      { keys: ['Ctrl', 'Shift', 'S'], description: 'Save As...' },
      { keys: ['Ctrl', 'E'], description: 'Export Audio' },
      { keys: ['Ctrl', 'Shift', 'E'], description: 'Export Stems' },
      { keys: ['?'], description: 'Show Keyboard Shortcuts' },
    ],
  },
];

interface KeyboardShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsOverlay({ isOpen, onClose }: KeyboardShortcutsOverlayProps) {
  const container = useDialogContainer();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      if (e.key === '?' && !isOpen) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const overlayContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 w-full max-w-4xl max-h-[85vh] rounded-xl overflow-hidden"
            style={{
              background: 'var(--studio-bg-medium)',
              border: '1px solid var(--studio-border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--studio-border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="p-2 rounded-lg"
                  style={{ background: 'var(--studio-accent)', color: '#ffffff' }}
                >
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: 'var(--studio-text)' }}>
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                    Quick reference for all studio shortcuts
                  </p>
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[calc(85vh-80px)]">
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SHORTCUT_CATEGORIES.map((category) => (
                  <div
                    key={category.name}
                    className="rounded-lg p-4"
                    style={{
                      background: 'var(--studio-bg-deep)',
                      border: '1px solid var(--studio-border)',
                    }}
                  >
                    <h3
                      className="text-sm font-bold uppercase tracking-wider mb-3 pb-2 border-b"
                      style={{
                        color: 'var(--studio-accent)',
                        borderColor: 'var(--studio-border)',
                      }}
                    >
                      {category.name}
                    </h3>

                    <div className="space-y-2">
                      {category.shortcuts.map((shortcut, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <span
                            className="text-sm"
                            style={{ color: 'var(--studio-text-muted)' }}
                          >
                            {shortcut.description}
                          </span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, keyIdx) => (
                              <span key={keyIdx} className="flex items-center">
                                <kbd
                                  className="px-2 py-0.5 rounded text-[11px] font-mono font-medium"
                                  style={{
                                    background: 'var(--studio-surface)',
                                    color: 'var(--studio-text)',
                                    border: '1px solid var(--studio-border)',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                  }}
                                >
                                  {key === 'Ctrl' && navigator.platform.includes('Mac') ? (
                                    <span className="flex items-center gap-0.5">
                                      <Command className="w-3 h-3" />
                                    </span>
                                  ) : (
                                    key
                                  )}
                                </kbd>
                                {keyIdx < shortcut.keys.length - 1 && (
                                  <span
                                    className="mx-0.5 text-xs"
                                    style={{ color: 'var(--studio-text-muted)' }}
                                  >
                                    +
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div
              className="px-6 py-3 border-t flex items-center justify-between"
              style={{
                borderColor: 'var(--studio-border)',
                background: 'var(--studio-bg-deep)',
              }}
            >
              <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                Press <kbd className="px-1.5 py-0.5 rounded text-[10px] mx-1" style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)' }}>?</kbd> to toggle this overlay
              </span>
              <span className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                Press <kbd className="px-1.5 py-0.5 rounded text-[10px] mx-1" style={{ background: 'var(--studio-surface)', border: '1px solid var(--studio-border)' }}>Esc</kbd> to close
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (container) {
    return createPortal(overlayContent, container);
  }

  return overlayContent;
}

export function KeyboardShortcutHint({ keys, className = '' }: { keys: string[]; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {keys.map((key, idx) => (
        <span key={idx} className="flex items-center">
          <kbd
            className="px-1 py-0.5 rounded text-[9px] font-mono"
            style={{
              background: 'var(--studio-surface)',
              color: 'var(--studio-text-muted)',
              border: '1px solid var(--studio-border)',
            }}
          >
            {key === 'Ctrl' && navigator.platform.includes('Mac') ? '⌘' : key}
          </kbd>
          {idx < keys.length - 1 && (
            <span className="text-[9px] mx-0.5" style={{ color: 'var(--studio-text-muted)' }}>
              +
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
