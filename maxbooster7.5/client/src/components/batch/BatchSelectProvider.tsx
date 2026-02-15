import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useBatchSelect, UseBatchSelectResult } from '@/hooks/useBatchSelect';

interface BatchSelectContextValue<T = string> extends UseBatchSelectResult<T> {
  resource: string;
  allIds: T[];
  setAllIds: (ids: T[]) => void;
}

const BatchSelectContext = createContext<BatchSelectContextValue<any> | null>(null);

export interface BatchSelectProviderProps<T = string> {
  children: ReactNode;
  resource: string;
  initialIds?: T[];
  initialSelection?: T[];
  maxSelection?: number;
  onSelectionChange?: (selectedIds: T[]) => void;
}

export function BatchSelectProvider<T = string>({
  children,
  resource,
  initialIds = [],
  initialSelection = [],
  maxSelection,
  onSelectionChange,
}: BatchSelectProviderProps<T>) {
  const [allIds, setAllIds] = React.useState<T[]>(initialIds);

  const batchSelect = useBatchSelect<T>({
    initialSelection,
    maxSelection,
    onSelectionChange,
  });

  const contextValue = useMemo<BatchSelectContextValue<T>>(() => ({
    ...batchSelect,
    resource,
    allIds,
    setAllIds,
  }), [batchSelect, resource, allIds]);

  return (
    <BatchSelectContext.Provider value={contextValue}>
      {children}
    </BatchSelectContext.Provider>
  );
}

export function useBatchSelectContext<T = string>(): BatchSelectContextValue<T> {
  const context = useContext(BatchSelectContext);
  if (!context) {
    throw new Error('useBatchSelectContext must be used within a BatchSelectProvider');
  }
  return context as BatchSelectContextValue<T>;
}

export function useOptionalBatchSelectContext<T = string>(): BatchSelectContextValue<T> | null {
  return useContext(BatchSelectContext) as BatchSelectContextValue<T> | null;
}

interface WithBatchSelectProps {
  resource: string;
}

export function withBatchSelect<P extends object>(
  Component: React.ComponentType<P>,
  options: WithBatchSelectProps
) {
  return function WrappedComponent(props: P) {
    return (
      <BatchSelectProvider resource={options.resource}>
        <Component {...props} />
      </BatchSelectProvider>
    );
  };
}
