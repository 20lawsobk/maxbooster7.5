import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
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
import { reportWebVitals } from './lib/reportWebVitals';

// Initialize Sentry client-side error tracking.
// VITE_SENTRY_DSN must be set to the same value as the server-side SENTRY_DSN secret.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE ?? 'development',
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.5 : 0,
    beforeSend(event) {
      // Drop ResizeObserver noise
      if (event.exception?.values?.some(v => v.value?.includes('ResizeObserver loop'))) return null;
      return event;
    },
  });
}

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

// Report Core Web Vitals (CLS / INP / LCP / FCP / TTFB) to /api/metrics/web-vitals.
// Uses sendBeacon when available so reports survive page unload.
reportWebVitals();

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
