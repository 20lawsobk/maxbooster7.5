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
  PLAY_PAUSE: { key: ' ', description: 'Play/Pause', category: 'Transport' },
  STOP: { key: 's', description: 'Stop', category: 'Transport' },
  RECORD: { key: 'r', description: 'Record', category: 'Transport' },
  AUTOSCROLL: { key: 'f', description: 'Toggle Autoscroll mode', category: 'Navigation' },
  MUTE: { key: 'm', description: 'Mute selected track', category: 'Track' },
  SOLO: { key: 'o', description: 'Solo selected track', category: 'Track' },
  DELETE: { key: 'Delete', description: 'Delete selected clip', category: 'Edit' },
  SAVE: { key: 's', ctrl: true, description: 'Save project', category: 'File' },
  UNDO: { key: 'z', ctrl: true, description: 'Undo', category: 'Edit' },
  REDO: { key: 'y', ctrl: true, description: 'Redo', category: 'Edit' },
  SELECT_ALL: { key: 'a', ctrl: true, description: 'Select all', category: 'Edit' },
  DUPLICATE: { key: 'd', ctrl: true, description: 'Duplicate', category: 'Edit' },
  LOOP: { key: 'l', description: 'Toggle loop', category: 'Transport' },
  METRONOME: { key: 'k', description: 'Toggle metronome', category: 'Transport' },
  ZOOM_IN: { key: '=', ctrl: true, description: 'Zoom in', category: 'Navigation' },
  ZOOM_OUT: { key: '-', ctrl: true, description: 'Zoom out', category: 'Navigation' },
  SKIP_BACK: { key: ',', description: 'Skip back', category: 'Navigation' },
  SKIP_FORWARD: { key: '.', description: 'Skip forward', category: 'Navigation' },
  GO_TO_START: { key: 'Home', description: 'Go to start', category: 'Navigation' },
  GO_TO_END: { key: 'End', description: 'Go to end', category: 'Navigation' },
};
