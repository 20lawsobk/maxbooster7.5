import { useCallback, useMemo } from 'react';
import { useShortcuts } from '@/contexts/ShortcutContext';
import { Command } from '@/lib/commands/CommandRegistry';

export interface UseCommandPaletteReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  search: (query: string) => Command[];
  execute: (commandId: string) => Promise<void>;
  recentCommands: Command[];
  allCommands: Command[];
  getCommandsByCategory: (category: string) => Command[];
}

export function useCommandPalette(): UseCommandPaletteReturn {
  const {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    searchCommands,
    executeCommand,
    recentCommands,
    commandRegistry,
  } = useShortcuts();

  const allCommands = useMemo(() => {
    return commandRegistry?.getAllCommands() || [];
  }, [commandRegistry]);

  const getCommandsByCategory = useCallback(
    (category: string) => {
      return commandRegistry?.getCommandsByCategory(category) || [];
    },
    [commandRegistry]
  );

  return {
    isOpen: isCommandPaletteOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
    search: searchCommands,
    execute: executeCommand,
    recentCommands,
    allCommands,
    getCommandsByCategory,
  };
}

export default useCommandPalette;
