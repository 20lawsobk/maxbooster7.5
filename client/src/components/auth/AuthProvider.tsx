import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, setAuthToken, clearAuthToken } from "@/lib/queryClient";
import type { User } from "@shared/schema";

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
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include",
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

  const {
    data: userData,
    isLoading: queryLoading,
    isFetched,
  } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: silentAuthCheck,
    retry: 2,
    retryDelay: 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const user = userData && userData.id ? userData : null;
  const isLoading = queryLoading && !isFetched;

  const login = async (credentials: { username: string; password: string }) => {
    const response = await apiRequest("POST", "/api/auth/login", credentials);
    const data = await response.json();
    if (data.sessionToken) {
      setAuthToken(data.sessionToken);
    }
    const { sessionToken: _tok, ...loginUser } = data;
    queryClient.setQueryData(["/api/auth/me"], loginUser);
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    const response = await apiRequest("POST", "/api/auth/register", data);
    const result = await response.json();
    queryClient.setQueryData(["/api/auth/me"], result);
  };

  const logout = async () => {
    clearAuthToken();
    try {
      await apiRequest("POST", "/api/auth/logout", {});
    } catch {
      // Server logout failed - still clear local auth state
    } finally {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    }
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
