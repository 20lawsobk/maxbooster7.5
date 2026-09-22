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

interface AuthContextType {
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

// Silent auth check that doesn't throw errors on timeout
async function silentAuthCheck(): Promise<User | null> {
  await acquireAccountLease();
  try {
    // A deployed legacy worker may still control this tab during its upgrade.
    // A never-reused URL cannot authenticate from that worker's URL-only cache.
    const response = await fetch(`/api/auth/me?account-check=${crypto.randomUUID()}`, {
      credentials: "include",
      cache: "no-store",
    });
    if (response.status === 401) {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    // Silent fail - return null on any error (timeout, network, etc.)
    return null;
  }
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
  } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: silentAuthCheck,
    enabled: !accountLocked,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const user = !accountLocked && userData && userData.id ? userData : null;
  const isLoading = queryLoading && !isFetched;
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

  const login = async (credentials: { username: string; password: string }) => {
    await changeAccount(async () => {
      const response = await apiRequest("POST", "/api/auth/login", credentials);
      const data = await response.json();
      if (data.sessionToken) setAuthToken(data.sessionToken);
    });
    // Reverify after acquiring the shared lease; another exclusive transition
    // may have won the lock between our response and lease acquisition.
    const loginUser = await silentAuthCheck();
    authTransition.current = false;
    setAccountLocked(false);
    queryClient.setQueryData(["/api/auth/me"], loginUser);
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    await changeAccount(async () => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      const result = await response.json();
      if (result.sessionToken) setAuthToken(result.sessionToken);
    });
    const result = await silentAuthCheck();
    authTransition.current = false;
    setAccountLocked(false);
    queryClient.setQueryData(["/api/auth/me"], result);
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
      login,
      register,
      logout,
      isLoading,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
