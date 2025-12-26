import { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import type { User } from '@shared/schema';

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

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider manages authentication state for the application.
 * Uses React Query with stable caching to prevent race conditions during navigation.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: userData, isLoading: queryLoading, isFetching, isFetched } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
    gcTime: Infinity, // Keep data in cache indefinitely to prevent null flashes
  });

  // Derive user directly from query data to avoid state synchronization issues
  const user = (userData && userData.id) ? userData : null;
  
  // Consider loading only during initial fetch, not during background refetches
  // This prevents flashing when cached data exists
  const isLoading = queryLoading && !isFetched;

  const login = async (credentials: { username: string; password: string }) => {
    const response = await apiRequest('POST', '/api/auth/login', credentials);
    const data = await response.json();
    // Update cache directly to avoid flash of unauthenticated state
    queryClient.setQueryData(['/api/auth/me'], data);
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    const response = await apiRequest('POST', '/api/auth/register', data);
    const result = await response.json();
    // Update cache directly to avoid flash of unauthenticated state
    queryClient.setQueryData(['/api/auth/me'], result);
  };

  const logout = async () => {
    await apiRequest('POST', '/api/auth/logout', {});
    // Clear the auth cache and all other queries
    queryClient.setQueryData(['/api/auth/me'], null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * TODO: Add function documentation
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
