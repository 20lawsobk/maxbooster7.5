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
    gcTime: Infinity,
  });

  const user = (userData && userData.id) ? userData : null;
  const isLoading = queryLoading && !isFetched;

  const login = async (credentials: { username: string; password: string }) => {
    const response = await apiRequest('POST', '/api/auth/login', credentials);
    const data = await response.json();
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
    queryClient.setQueryData(['/api/auth/me'], result);
  };

  const logout = async () => {
    await apiRequest('POST', '/api/auth/logout', {});
    queryClient.setQueryData(['/api/auth/me'], null);
    queryClient.clear();
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
