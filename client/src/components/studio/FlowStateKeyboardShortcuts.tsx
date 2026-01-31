import { motion, AnimatePresence } from 'framer-motion';
import { X, Keyboard } from 'lucide-react';

interface ShortcutCategory {
  name: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    name: 'Transport',
    shortcuts: [
      { keys: ['Space'], description: 'Play / Pause' },
      { keys: ['Enter'], description: 'Stop and return to start' },
      { keys: ['R'], description: 'Start / Stop recording' },
      { keys: ['L'], description: 'Toggle loop' },
      { keys: [','], description: 'Previous marker / bar' },
      { keys: ['.'], description: 'Next marker / bar' },
    ],
  },
  {
    name: 'Editing',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: 'Undo' },
      { keys: ['⌘', 'Shift', 'Z'], description: 'Redo' },
      { keys: ['⌘', 'C'], description: 'Copy' },
      { keys: ['⌘', 'V'], description: 'Paste' },
      { keys: ['⌘', 'X'], description: 'Cut' },
      { keys: ['⌘', 'A'], description: 'Select all' },
      { keys: ['Delete'], description: 'Delete selected' },
      { keys: ['⌘', 'D'], description: 'Duplicate' },
    ],
  },
  {
    name: 'Tools',
    shortcuts: [
      { keys: ['V'], description: 'Select tool' },
      { keys: ['B'], description: 'Range tool' },
      { keys: ['P'], description: 'Draw / Pencil tool' },
      { keys: ['S'], description: 'Split / Scissors tool' },
      { keys: ['E'], description: 'Erase tool' },
    ],
  },
  {
    name: 'Modes',
    shortcuts: [
      { keys: ['1'], description: 'Create mode' },
      { keys: ['2'], description: 'Record mode' },
      { keys: ['3'], description: 'Mix mode' },
      { keys: ['4'], description: 'Master mode' },
      { keys: ['5'], description: 'Perform mode' },
    ],
  },
  {
    name: 'View',
    shortcuts: [
      { keys: ['Tab'], description: 'Toggle Zero-Chrome mode' },
      { keys: ['M'], description: 'Toggle mixer' },
      { keys: ['⌘', '+'], description: 'Zoom in' },
      { keys: ['⌘', '-'], description: 'Zoom out' },
      { keys: ['⌘', '0'], description: 'Fit to window' },
      { keys: ['F'], description: 'Toggle fullscreen' },
    ],
  },
  {
    name: 'Tracks',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'New track' },
      { keys: ['⌘', 'T'], description: 'Add audio track' },
      { keys: ['⌘', 'I'], description: 'Add instrument track' },
      { keys: ['↑', '↓'], description: 'Select previous / next track' },
      { keys: ['Shift', 'M'], description: 'Mute selected track' },
      { keys: ['Shift', 'S'], description: 'Solo selected track' },
    ],
  },
  {
    name: 'Project',
    shortcuts: [
      { keys: ['⌘', 'S'], description: 'Save project' },
      { keys: ['⌘', 'E'], description: 'Export audio' },
      { keys: ['⌘', 'O'], description: 'Open project' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
    ],
  },
];

interface FlowStateKeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FlowStateKeyboardShortcuts({ isOpen, onClose }: FlowStateKeyboardShortcutsProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center">
                  <Keyboard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
                  <p className="text-xs text-white/50">Master FlowState with these shortcuts</p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-6">
                {SHORTCUTS.map((category) => (
                  <div key={category.name} className="space-y-2">
                    <h3 className="text-sm font-semibold text-white/80 mb-3">{category.name}</h3>
                    <div className="space-y-1.5">
                      {category.shortcuts.map((shortcut, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-white/5"
                        >
                          <span className="text-xs text-white/60">{shortcut.description}</span>
                          <div className="flex items-center gap-1">
                            {shortcut.keys.map((key, j) => (
                              <span key={j}>
                                <kbd className="px-2 py-1 rounded bg-black/30 border border-white/10 text-xs text-white/80 font-mono min-w-[24px] inline-flex items-center justify-center">
                                  {key}
                                </kbd>
                                {j < shortcut.keys.length - 1 && (
                                  <span className="text-white/30 mx-0.5">+</span>
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
            </div>

            <div className="p-4 border-t border-white/5 flex-shrink-0">
              <p className="text-xs text-white/40 text-center">
                Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">Esc</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">?</kbd> to close
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
