import React, { ComponentType } from 'react';
import { UndoProvider } from '@/contexts/UndoContext';
import { UndoToast } from '@/components/undo/UndoToast';

export interface WithUndoConfig {
  maxHistorySize?: number;
  persistToStorage?: boolean;
  showToast?: boolean;
}

export function withUndo<P extends object>(
  WrappedComponent: ComponentType<P>,
  config: WithUndoConfig = {}
) {
  const {
    maxHistorySize = 100,
    persistToStorage = true,
    showToast = true,
  } = config;

  const WithUndoComponent: React.FC<P> = (props) => {
    return (
      <UndoProvider
        maxHistorySize={maxHistorySize}
        persistToStorage={persistToStorage}
      >
        <WrappedComponent {...props} />
        {showToast && <UndoToast />}
      </UndoProvider>
    );
  };

  WithUndoComponent.displayName = `withUndo(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithUndoComponent;
}

export default withUndo;
