import React, { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  useCallback, 
  useRef 
} from 'react';
import { 
  getShortcutManager, 
  DEFAULT_SHORTCUTS,
  type ShortcutManager 
} from '@/lib/shortcuts/ShortcutManager';
import { 
  getCommandRegistry, 
  DEFAULT_COMMANDS,
  type CommandRegistry 
} from '@/lib/commands/CommandRegistry';
import { 
  ShortcutDefinition, 
  ShortcutContext as ShortcutContextType,
  ShortcutEvent 
} from '@/lib/shortcuts/types';
import { Command } from '@/lib/commands/CommandRegistry';

interface ShortcutContextValue {
  shortcutManager: ShortcutManager;
  commandRegistry: CommandRegistry;
  currentContext: ShortcutContextType;
  setCurrentContext: (context: ShortcutContextType) => void;
  isCommandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  isShortcutGuideOpen: boolean;
  openShortcutGuide: () => void;
  closeShortcutGuide: () => void;
  toggleShortcutGuide: () => void;
  registerShortcut: (shortcut: ShortcutDefinition) => void;
  unregisterShortcut: (id: string) => void;
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
  executeCommand: (commandId: string) => Promise<void>;
  getShortcutsByContext: (context: ShortcutContextType) => ShortcutDefinition[];
  searchCommands: (query: string) => Command[];
  recentCommands: Command[];
  shortcutsEnabled: boolean;
  setShortcutsEnabled: (enabled: boolean) => void;
}

const ShortcutContextObj = createContext<ShortcutContextValue | null>(null);

export interface ShortcutProviderProps {
  children: React.ReactNode;
  defaultContext?: ShortcutContextType;
  persistConfig?: boolean;
}

export function ShortcutProvider({ 
  children, 
  defaultContext = 'global',
  persistConfig = true 
}: ShortcutProviderProps) {
  const shortcutManagerRef = useRef<ShortcutManager | null>(null);
  const commandRegistryRef = useRef<CommandRegistry | null>(null);
  
  const [currentContext, setCurrentContextState] = useState<ShortcutContextType>(defaultContext);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutGuideOpen, setIsShortcutGuideOpen] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [recentCommands, setRecentCommands] = useState<Command[]>([]);

  useEffect(() => {
    shortcutManagerRef.current = getShortcutManager({ persistConfig });
    commandRegistryRef.current = getCommandRegistry();

    shortcutManagerRef.current.registerMany(DEFAULT_SHORTCUTS);
    commandRegistryRef.current.registerMany(DEFAULT_COMMANDS);

    const openPaletteShortcut: ShortcutDefinition = {
      id: 'internal.open-command-palette',
      key: 'k',
      modifiers: ['cmd'],
      description: 'Open command palette',
      category: 'global',
      context: 'global',
      action: () => setIsCommandPaletteOpen(true),
      allowInInput: true,
    };

    const showHelpShortcut: ShortcutDefinition = {
      id: 'internal.show-shortcuts',
      key: '/',
      modifiers: ['cmd'],
      description: 'Show keyboard shortcuts',
      category: 'global',
      context: 'global',
      action: () => setIsShortcutGuideOpen(true),
    };

    const escapeShortcut: ShortcutDefinition = {
      id: 'internal.escape',
      key: 'Escape',
      description: 'Close overlays',
      category: 'global',
      context: 'global',
      action: () => {
        setIsCommandPaletteOpen(false);
        setIsShortcutGuideOpen(false);
      },
      allowInInput: true,
    };

    shortcutManagerRef.current.register(openPaletteShortcut);
    shortcutManagerRef.current.register(showHelpShortcut);
    shortcutManagerRef.current.register(escapeShortcut);

    setRecentCommands(commandRegistryRef.current.getRecentCommands(5));

    return () => {
      shortcutManagerRef.current?.unregister('internal.open-command-palette');
      shortcutManagerRef.current?.unregister('internal.show-shortcuts');
      shortcutManagerRef.current?.unregister('internal.escape');
    };
  }, [persistConfig]);

  useEffect(() => {
    if (shortcutManagerRef.current) {
      shortcutManagerRef.current.setContext(currentContext);
    }
    if (commandRegistryRef.current) {
      commandRegistryRef.current.setContext(currentContext);
    }
  }, [currentContext]);

  useEffect(() => {
    if (shortcutManagerRef.current) {
      shortcutManagerRef.current.setEnabled(shortcutsEnabled && !isCommandPaletteOpen);
    }
  }, [shortcutsEnabled, isCommandPaletteOpen]);

  const setCurrentContext = useCallback((context: ShortcutContextType) => {
    setCurrentContextState(context);
  }, []);

  const openCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const toggleCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(prev => !prev);
  }, []);

  const openShortcutGuide = useCallback(() => {
    setIsShortcutGuideOpen(true);
  }, []);

  const closeShortcutGuide = useCallback(() => {
    setIsShortcutGuideOpen(false);
  }, []);

  const toggleShortcutGuide = useCallback(() => {
    setIsShortcutGuideOpen(prev => !prev);
  }, []);

  const registerShortcut = useCallback((shortcut: ShortcutDefinition) => {
    shortcutManagerRef.current?.register(shortcut);
  }, []);

  const unregisterShortcut = useCallback((id: string) => {
    shortcutManagerRef.current?.unregister(id);
  }, []);

  const registerCommand = useCallback((command: Command) => {
    commandRegistryRef.current?.register(command);
  }, []);

  const unregisterCommand = useCallback((id: string) => {
    commandRegistryRef.current?.unregister(id);
  }, []);

  const executeCommand = useCallback(async (commandId: string) => {
    await commandRegistryRef.current?.execute(commandId);
    setRecentCommands(commandRegistryRef.current?.getRecentCommands(5) || []);
  }, []);

  const getShortcutsByContext = useCallback((context: ShortcutContextType) => {
    return shortcutManagerRef.current?.getShortcutsByContext(context) || [];
  }, []);

  const searchCommands = useCallback((query: string) => {
    return commandRegistryRef.current?.search(query) || [];
  }, []);

  const contextValue: ShortcutContextValue = {
    shortcutManager: shortcutManagerRef.current!,
    commandRegistry: commandRegistryRef.current!,
    currentContext,
    setCurrentContext,
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    isShortcutGuideOpen,
    openShortcutGuide,
    closeShortcutGuide,
    toggleShortcutGuide,
    registerShortcut,
    unregisterShortcut,
    registerCommand,
    unregisterCommand,
    executeCommand,
    getShortcutsByContext,
    searchCommands,
    recentCommands,
    shortcutsEnabled,
    setShortcutsEnabled,
  };

  return (
    <ShortcutContextObj.Provider value={contextValue}>
      {children}
    </ShortcutContextObj.Provider>
  );
}

export function useShortcuts(): ShortcutContextValue {
  const context = useContext(ShortcutContextObj);
  if (!context) {
    throw new Error('useShortcuts must be used within a ShortcutProvider');
  }
  return context;
}

export function useShortcut(
  shortcut: Omit<ShortcutDefinition, 'id'> & { id?: string },
  deps: React.DependencyList = []
) {
  const { registerShortcut, unregisterShortcut } = useShortcuts();
  const idRef = useRef(shortcut.id || `shortcut-${Math.random().toString(36).substr(2, 9)}`);

  useEffect(() => {
    const fullShortcut: ShortcutDefinition = {
      ...shortcut,
      id: idRef.current,
    };
    registerShortcut(fullShortcut);

    return () => {
      unregisterShortcut(idRef.current);
    };
  }, deps);
}

export function useCommandPalette() {
  const {
    isCommandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    searchCommands,
    executeCommand,
    recentCommands,
  } = useShortcuts();

  return {
    isOpen: isCommandPaletteOpen,
    open: openCommandPalette,
    close: closeCommandPalette,
    toggle: toggleCommandPalette,
    search: searchCommands,
    execute: executeCommand,
    recentCommands,
  };
}

export function useShortcutGuide() {
  const {
    isShortcutGuideOpen,
    openShortcutGuide,
    closeShortcutGuide,
    toggleShortcutGuide,
    getShortcutsByContext,
    currentContext,
  } = useShortcuts();

  return {
    isOpen: isShortcutGuideOpen,
    open: openShortcutGuide,
    close: closeShortcutGuide,
    toggle: toggleShortcutGuide,
    shortcuts: getShortcutsByContext(currentContext),
    context: currentContext,
  };
}

export function useShortcutContext(context: ShortcutContextType) {
  const { setCurrentContext } = useShortcuts();

  useEffect(() => {
    setCurrentContext(context);
    return () => {
      setCurrentContext('global');
    };
  }, [context, setCurrentContext]);
}
