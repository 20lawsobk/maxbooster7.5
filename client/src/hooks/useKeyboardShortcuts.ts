import { useEffect, useCallback, useRef, useState } from 'react';

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  handler: () => void;
  description?: string;
  category?: string;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        const ctrlMatch = shortcut.ctrl === undefined || shortcut.ctrl === (e.ctrlKey || e.metaKey);
        const shiftMatch = shortcut.shift === undefined || shortcut.shift === e.shiftKey;
        const altMatch = shortcut.alt === undefined || shortcut.alt === e.altKey;
        const metaMatch = shortcut.meta === undefined || shortcut.meta === e.metaKey;
        const keyMatch = shortcut.key.toLowerCase() === e.key.toLowerCase();

        if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.handler();
          break;
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, enabled]);

  return shortcuts.map((s) => ({
    key: s.key,
    description: s.description || '',
    category: s.category || 'General',
    modifiers: [s.ctrl && 'Ctrl', s.shift && 'Shift', s.alt && 'Alt', s.meta && 'Cmd']
      .filter(Boolean)
      .join('+'),
  }));
}

export function useShortcutOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName !== 'INPUT' &&
          target.tagName !== 'TEXTAREA' &&
          target.contentEditable !== 'true'
        ) {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return { isOpen, setIsOpen, toggle: () => setIsOpen((prev) => !prev) };
}

// Studio DAW specific shortcuts
export const STUDIO_SHORTCUTS = {
  PLAY_PAUSE: { key: ' ', description: 'Play/Pause' },
  STOP: { key: 's', description: 'Stop' },
  RECORD: { key: 'r', description: 'Record' },
  MUTE: { key: 'm', description: 'Mute selected track' },
  DELETE: { key: 'Delete', description: 'Delete selected clip' },
  SAVE: { key: 's', ctrl: true, description: 'Save project' },
  UNDO: { key: 'z', ctrl: true, description: 'Undo' },
  REDO: { key: 'y', ctrl: true, description: 'Redo' },
  SELECT_ALL: { key: 'a', ctrl: true, description: 'Select all' },
  DUPLICATE: { key: 'd', ctrl: true, description: 'Duplicate' },
  LOOP: { key: 'l', description: 'Toggle loop' },
  METRONOME: { key: 'k', description: 'Toggle metronome' },
  ZOOM_IN: { key: '=', ctrl: true, description: 'Zoom in' },
  ZOOM_OUT: { key: '-', ctrl: true, description: 'Zoom out' },
  SKIP_BACK: { key: ',', description: 'Skip back' },
  SKIP_FORWARD: { key: '.', description: 'Skip forward' },
};
