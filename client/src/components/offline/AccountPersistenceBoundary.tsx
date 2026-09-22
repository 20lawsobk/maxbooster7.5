import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useAuth } from "@/components/auth/AuthProvider";
import { queryClient } from "@/lib/queryClient";
import { createAccountPersister } from "@/lib/idbPersister";
import { offlineIdentity } from "@/lib/offline/identity";

function subscribe(listener: () => void) {
  window.addEventListener("offline-identity-change", listener);
  return () => window.removeEventListener("offline-identity-change", listener);
}

export function AccountPersistenceBoundary({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const epoch = useSyncExternalStore(subscribe, () => offlineIdentity().epoch);
  const owner = offlineIdentity().owner;
  const persister = useMemo(() =>
    owner && String(user?.id) === owner ? createAccountPersister({ owner, epoch }) : null,
  [owner, epoch, user?.id]);
  useEffect(() => {
    persister?.activate();
    return () => persister?.dispose();
  }, [persister]);
  if (!persister) return <>{children}</>;
  return (
    <PersistQueryClientProvider key={`${owner}:${epoch}`} client={queryClient} persistOptions={{
      persister, maxAge: 24 * 60 * 60 * 1000, buster: "mb-account-v4",
      dehydrateOptions: {
        shouldDehydrateMutation: () => false,
        shouldDehydrateQuery: query => query.state.status === "success" &&
          !query.queryKey.some(key => typeof key === "string" &&
            (/\/api\/auth\/me$/.test(key) || /payment|stripe|billing|contracts|invoices|presence|heartbeat|warp/.test(key))),
      },
    }}>
      {children}
    </PersistQueryClientProvider>
  );
}