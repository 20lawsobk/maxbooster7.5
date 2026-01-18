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

// Studio DAW specific shortcuts - comprehensive professional DAW controls
export const STUDIO_SHORTCUTS = {
  // Transport Controls
  PLAY_PAUSE: { key: ' ', description: 'Play/Pause', category: 'Transport' },
  STOP: { key: 's', description: 'Stop', category: 'Transport' },
  RECORD: { key: 'r', description: 'Record', category: 'Transport' },
  LOOP: { key: 'l', description: 'Toggle loop', category: 'Transport' },
  METRONOME: { key: 'k', description: 'Toggle metronome', category: 'Transport' },
  TAP_TEMPO: { key: 't', shift: true, description: 'Tap tempo', category: 'Transport' },
  
  // Navigation
  AUTOSCROLL: { key: 'f', description: 'Toggle Autoscroll mode', category: 'Navigation' },
  SKIP_BACK: { key: ',', description: 'Skip back', category: 'Navigation' },
  SKIP_FORWARD: { key: '.', description: 'Skip forward', category: 'Navigation' },
  GO_TO_START: { key: 'Home', description: 'Go to start', category: 'Navigation' },
  GO_TO_END: { key: 'End', description: 'Go to end', category: 'Navigation' },
  ZOOM_IN: { key: '=', ctrl: true, description: 'Zoom in', category: 'Navigation' },
  ZOOM_OUT: { key: '-', ctrl: true, description: 'Zoom out', category: 'Navigation' },
  ZOOM_FIT: { key: '0', ctrl: true, description: 'Zoom to fit', category: 'Navigation' },
  SCROLL_LEFT: { key: 'ArrowLeft', alt: true, description: 'Scroll left', category: 'Navigation' },
  SCROLL_RIGHT: { key: 'ArrowRight', alt: true, description: 'Scroll right', category: 'Navigation' },
  
  // Track Controls
  MUTE: { key: 'm', description: 'Mute selected track', category: 'Track' },
  SOLO: { key: 'o', description: 'Solo selected track', category: 'Track' },
  ARM_RECORD: { key: 'r', shift: true, description: 'Arm track for recording', category: 'Track' },
  ADD_TRACK: { key: 't', description: 'Add new track', category: 'Track' },
  DELETE_TRACK: { key: 'Backspace', shift: true, description: 'Delete selected track', category: 'Track' },
  TRACK_UP: { key: 'ArrowUp', description: 'Select previous track', category: 'Track' },
  TRACK_DOWN: { key: 'ArrowDown', description: 'Select next track', category: 'Track' },
  
  // Edit Operations
  DELETE: { key: 'Delete', description: 'Delete selected clip', category: 'Edit' },
  SAVE: { key: 's', ctrl: true, description: 'Save project', category: 'File' },
  UNDO: { key: 'z', ctrl: true, description: 'Undo', category: 'Edit' },
  REDO: { key: 'y', ctrl: true, description: 'Redo', category: 'Edit' },
  REDO_ALT: { key: 'z', ctrl: true, shift: true, description: 'Redo (alternative)', category: 'Edit' },
  SELECT_ALL: { key: 'a', ctrl: true, description: 'Select all', category: 'Edit' },
  DESELECT_ALL: { key: 'd', ctrl: true, shift: true, description: 'Deselect all', category: 'Edit' },
  DUPLICATE: { key: 'd', ctrl: true, description: 'Duplicate', category: 'Edit' },
  COPY: { key: 'c', ctrl: true, description: 'Copy', category: 'Edit' },
  CUT: { key: 'x', ctrl: true, description: 'Cut', category: 'Edit' },
  PASTE: { key: 'v', ctrl: true, description: 'Paste', category: 'Edit' },
  SPLIT: { key: 'b', description: 'Split clip at playhead', category: 'Edit' },
  QUANTIZE: { key: 'q', description: 'Quantize selected', category: 'Edit' },
  NUDGE_LEFT: { key: 'ArrowLeft', description: 'Nudge clip left', category: 'Edit' },
  NUDGE_RIGHT: { key: 'ArrowRight', description: 'Nudge clip right', category: 'Edit' },
  
  // Markers
  ADD_MARKER: { key: 'm', ctrl: true, description: 'Add marker at playhead', category: 'Markers' },
  PREV_MARKER: { key: '[', description: 'Go to previous marker', category: 'Markers' },
  NEXT_MARKER: { key: ']', description: 'Go to next marker', category: 'Markers' },
  
  // View/Panels
  TOGGLE_BROWSER: { key: 'b', description: 'Toggle browser panel', category: 'View' },
  TOGGLE_INSPECTOR: { key: 'i', description: 'Toggle inspector panel', category: 'View' },
  TOGGLE_MIXER: { key: 'x', shift: true, description: 'Toggle mixer view', category: 'View' },
  TOGGLE_ROUTING: { key: 'r', shift: true, description: 'Toggle routing matrix', category: 'View' },
  TOGGLE_EFFECTS: { key: 'e', description: 'Toggle effects panel', category: 'View' },
  FULLSCREEN: { key: 'F11', description: 'Toggle fullscreen', category: 'View' },
  HELP: { key: '?', description: 'Show keyboard shortcuts', category: 'Help' },
  
  // Tool Selection (number keys)
  TOOL_SELECT: { key: '1', description: 'Selection tool', category: 'Tools' },
  TOOL_RANGE: { key: '2', description: 'Range selection tool', category: 'Tools' },
  TOOL_DRAW: { key: '3', description: 'Draw/Pencil tool', category: 'Tools' },
  TOOL_ERASE: { key: '4', description: 'Eraser tool', category: 'Tools' },
  TOOL_SPLIT: { key: '5', description: 'Split tool', category: 'Tools' },
  TOOL_MUTE: { key: '6', description: 'Mute tool', category: 'Tools' },
  TOOL_ZOOM: { key: '7', description: 'Zoom tool', category: 'Tools' },
  TOOL_LISTEN: { key: '8', description: 'Listen tool', category: 'Tools' },
  
  // Snap/Grid
  SNAP_TOGGLE: { key: 'n', description: 'Toggle snap to grid', category: 'Grid' },
  SNAP_GRID_FINER: { key: 'g', description: 'Finer grid', category: 'Grid' },
  SNAP_GRID_COARSER: { key: 'g', shift: true, description: 'Coarser grid', category: 'Grid' },
  
  // Global Transpose
  TRANSPOSE_UP: { key: 'ArrowUp', shift: true, description: 'Transpose up 1 semitone', category: 'Transpose' },
  TRANSPOSE_DOWN: { key: 'ArrowDown', shift: true, description: 'Transpose down 1 semitone', category: 'Transpose' },
  TRANSPOSE_RESET: { key: '0', shift: true, description: 'Reset transpose', category: 'Transpose' },
};
