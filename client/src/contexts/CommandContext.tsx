import React, { createContext, useContext, useCallback } from 'react';
import { useShortcuts, useCommandPalette } from './ShortcutContext';
import { Command } from '@/lib/commands/CommandRegistry';

interface CommandContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  search: (query: string) => Command[];
  execute: (commandId: string) => Promise<void>;
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
  recentCommands: Command[];
}

const CommandContextObj = createContext<CommandContextValue | null>(null);

interface CommandProviderProps {
  children: React.ReactNode;
}

export function CommandProvider({ children }: CommandProviderProps) {
  const {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    searchCommands,
    executeCommand,
    registerCommand,
    unregisterCommand,
    recentCommands,
  } = useShortcuts();

  const contextValue: CommandContextValue = {
    isOpen: isCommandPaletteOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
    search: searchCommands,
    execute: executeCommand,
    registerCommand,
    unregisterCommand,
    recentCommands,
  };

  return (
    <CommandContextObj.Provider value={contextValue}>
      {children}
    </CommandContextObj.Provider>
  );
}

export function useCommandContext(): CommandContextValue {
  const context = useContext(CommandContextObj);
  if (!context) {
    throw new Error('useCommandContext must be used within a CommandProvider');
  }
  return context;
}

export function useQuickActions() {
  const { search, execute } = useCommandPalette();

  const quickActions = useCallback(() => {
    return search('').filter(cmd => 
      cmd.category === 'actions' || 
      cmd.category === 'navigation'
    ).slice(0, 10);
  }, [search]);

  const executeQuickAction = useCallback(async (actionId: string) => {
    await execute(actionId);
  }, [execute]);

  return {
    getQuickActions: quickActions,
    executeQuickAction,
    actions: {
      createProject: () => execute('action.new-project'),
      uploadTrack: () => execute('action.upload'),
      schedulePost: () => execute('social.schedule'),
      viewAnalytics: () => execute('nav.analytics'),
      openSettings: () => execute('nav.settings'),
    },
  };
}

export { useCommandPalette } from './ShortcutContext';
export default CommandProvider;
