import { createContext, useContext, useEffect, useState } from 'react';
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
 * TODO: Add function documentation
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);

  const { data: userData, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (userData && userData.user) {
      setUser(userData.user);
    } else if (userData === null) {
      setUser(null);
    }
  }, [userData]);

  const login = async (credentials: { username: string; password: string }) => {
    const response = await apiRequest('POST', '/api/auth/login', credentials);
    const data = await response.json();
    setUser(data.user);
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
  };

  const register = async (data: {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    const response = await apiRequest('POST', '/api/auth/register', data);
    const result = await response.json();
    setUser(result.user);
    queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
  };

  const logout = async () => {
    await apiRequest('POST', '/api/auth/logout', {});
    setUser(null);
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
