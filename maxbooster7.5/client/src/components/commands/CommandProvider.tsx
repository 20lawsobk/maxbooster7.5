import React from 'react';
import { ShortcutProvider, ShortcutProviderProps } from '@/contexts/ShortcutContext';
import { CommandPalette } from './CommandPalette';

export interface CommandProviderProps extends Omit<ShortcutProviderProps, 'children'> {
  children: React.ReactNode;
  showCommandPalette?: boolean;
}

export function CommandProvider({ 
  children, 
  showCommandPalette = true,
  ...props 
}: CommandProviderProps) {
  return (
    <ShortcutProvider {...props}>
      {children}
      {showCommandPalette && <CommandPalette />}
    </ShortcutProvider>
  );
}

export { ShortcutProvider } from '@/contexts/ShortcutContext';
export { 
  useShortcuts, 
  useShortcut,
  useCommandPalette, 
  useShortcutGuide,
  useShortcutContext 
} from '@/contexts/ShortcutContext';

export default CommandProvider;
