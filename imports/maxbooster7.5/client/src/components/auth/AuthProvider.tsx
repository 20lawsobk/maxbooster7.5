import { createContext, useContext, useMemo, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken, clearAuthToken, getAuthToken, getCsrfTokenFromCookie } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { useTheme } from "@/contexts/ThemeContext";
import { setOfflineIdentity, offlineIdentity } from "@/lib/offline/identity";
import { draftStorage, offlineCache, offlineQueue, syncManager } from "@/lib/offline";
import { clearPrivateQueryCache } from "@/lib/idbPersister";
import { toast } from "@/hooks/use-toast";
import { acquireAccountLease, changeAccount, registerAccountCleanup } from "@/lib/offline/accountCoordinator";
import { resetStudioOfflineState } from "@/lib/offline/studioOfflineLifecycle";
import { completeAuthentication, type AuthenticationExchange } from "@/lib/authenticationBoundary";
import { probeSession, SessionProbeUnavailable } from "@/lib/sessionProbe";

interface AuthContextType {
  authenticate: <T extends AuthenticationExchange>(request: () => Promise<T>) => Promise<T>;
  user: User | null;
  login: (credentials: { username: string; password: string }) => Promise<void>;
  register: (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Temporary transport failures are not authoritative anonymous sessions.
async function silentAuthCheck(): Promise<User | null> {
  await acquireAccountLease();
  return probeSession<User>();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { acceptAccountTheme } = useTheme();
  const authTransition = useRef(false);
  const [accountLocked, setAccountLocked] = useState(false);

  const {
    data: userData,
    isLoading: queryLoading,
    isFetched,
    isError: authFailed,
    failureCount: authFailures,
    refetch: retrySession,
    isFetching: checkingSession,
  } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: silentAuthCheck,
    enabled: !accountLocked,
    retry: 2,
    retryDelay: (_attempt, error) => error instanceof SessionProbeUnavailable ? error.retryAfterMs : 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const user = !accountLocked && userData && userData.id ? userData : null;
  const sessionUnavailable = !accountLocked && (authFailed || authFailures > 0);
  const isLoading = (queryLoading && !isFetched) || (sessionUnavailable && !userData);
  const { data: accountPreferences, isSuccess: preferencesLoaded } = useQuery<{ theme?: string }>({
    queryKey: ["/api/auth/preferences"],
    enabled: !!user,
  });
  useEffect(() => {
    if (authTransition.current) return;
    const owner = user?.id ? String(user.id) : null;
    const changed = offlineIdentity().owner !== owner;
    setOfflineIdentity(owner);
    if (changed) void resetStudioOfflineState().catch(error => toast({
      title: "Studio recovery unavailable", description: (error as Error).message, variant: "destructive",
    }));
    acceptAccountTheme(user?.id ? String(user.id) : null, accountPreferences?.theme, preferencesLoaded);
    if (user?.id && "serviceWorker" in navigator) {
      void navigator.serviceWorker.ready.then(registration => {
        if (!authTransition.current) registration.active?.postMessage({ type: "VERIFY_ACTIVE_ACCOUNT", ownerId: String(user.id) });
      });
    }
  }, [user?.id, accountPreferences?.theme, preferencesLoaded]);

  const clearPrivateState = async () => {
    authTransition.current = true;
    setAccountLocked(true);
    acceptAccountTheme(null);
    setOfflineIdentity(null);
    await resetStudioOfflineState();
    syncManager.pause();
    draftStorage.destroy();
    offlineQueue.close();
    const purgeCache = offlineCache.clearPrivateData();
    offlineCache.destroy();
    clearAuthToken();
    await queryClient.cancelQueries();
    queryClient.clear();
    queryClient.setQueryData(["/api/auth/me"], null);
    await Promise.all([clearPrivateQueryCache(), purgeCache]);
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter(name =>
        /^max-booster-(api|dynamic|shell|drafts|media|sync-handoffs|account-state)-/.test(name)
      ).map(name => caches.delete(name)));
    }
  };
  useEffect(() => {
    try {
      return registerAccountCleanup(clearPrivateState);
    } catch (error) {
      toast({ title: "Account isolation unavailable", description: (error as Error).message, variant: "destructive" });
    }
  }, []);

  const authenticate = <T extends AuthenticationExchange,>(request: () => Promise<T>) =>
    completeAuthentication(request, {
      changeAccount,
      setToken: setAuthToken,
      verify: silentAuthCheck,
      commit: loginUser => {
        queryClient.setQueryData(["/api/auth/me"], loginUser);
        authTransition.current = false;
        setAccountLocked(false);
      },
    });

  const login = async (credentials: { username: string; password: string }) => {
    const result = await authenticate(async () => {
      const response = await apiRequest("POST", "/api/auth/login", credentials);
      const data = await response.json();
      return { response, data };
    });
    if (result.data.requiresTwoFactor === true) {
      throw new Error("Two-factor authentication is required. Continue on the sign-in page.");
    }
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    await authenticate(async () => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      const result = await response.json();
      return { response, data: result };
    });
  };

  const logout = async () => {
    const token = getAuthToken();
    await changeAccount(async () => {
      // Local cleanup removed the in-memory token; retain it only for this
      // already-authorized revocation request, never for subsequent work.
      const response = await fetch("/api/auth/logout", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json",
          ...(getCsrfTokenFromCookie() ? { "x-csrf-token": getCsrfTokenFromCookie()! } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: "{}",
      });
      if (!response.ok) throw new Error("Local account locked, but server logout failed. Retry logout before leaving this device.");
    });
  };

  const value = useMemo(
    () => ({
      user,
      authenticate,
      login,
      register,
      logout,
      isLoading,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>
    {sessionUnavailable && <div role="alert" className="border-b border-amber-500 bg-amber-50 p-3 text-center text-slate-900">
      <p>Session verification is temporarily unavailable.</p>
      <button type="button" disabled={checkingSession} onClick={() => { void retrySession(); }}>
        {checkingSession ? "Retrying session verification…" : "Retry session verification"}
      </button>
    </div>}
    {children}
  </AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
