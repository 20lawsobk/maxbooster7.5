import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

/**
 * TODO: Add function documentation
 */
export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  return { user, isLoading };
}

/**
 * TODO: Add function documentation
 */
export function useRequireAdmin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate('/login');
      } else if (user.role !== 'admin') {
        navigate('/dashboard');
      }
    }
  }, [user, isLoading, navigate]);

  return { user, isLoading };
}
