import React from 'react';
import ReactDOM from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import App from './App';
import './index.css';
import './i18n/config';
import { idbStorage, IDB_CACHE_KEY } from './lib/idbPersister';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

const persister = createAsyncStoragePersister({
  storage: idbStorage,
  key: IDB_CACHE_KEY,
  throttleTime: 2000,
  serialize: JSON.stringify,
  deserialize: JSON.parse,
});

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister,
            maxAge: 24 * 60 * 60 * 1000,
            buster: 'mb-v3',
            dehydrateOptions: {
              shouldDehydrateQuery: (query) =>
                query.state.status === 'success' &&
                !query.queryKey.some((k) =>
                  typeof k === 'string' &&
                  (k.includes('payment') ||
                    k.includes('stripe') ||
                    k.includes('billing') ||
                    k.includes('contracts') ||
                    k.includes('invoices') ||
                    k.includes('presence') ||
                    k.includes('heartbeat'))
                ),
            },
          }}
        >
          <AuthProvider>
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </AuthProvider>
        </PersistQueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
