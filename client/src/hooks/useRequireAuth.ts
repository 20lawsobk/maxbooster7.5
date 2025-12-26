import { useAuth } from './useAuth';
import { useLocation } from 'wouter';
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
 * Hook to require authenticated user with active subscription.
 * Admins are always allowed regardless of subscription status.
 */
export function useRequireSubscription() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    // Only redirect after auth loading is complete
    if (isLoading) return;
    
    // Admin users are always allowed - check this FIRST
    if (user?.role === 'admin') {
      return; // No redirect needed for admins
    }
    
    // No user - redirect to login
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Check subscription status for non-admin users
    if (
      user.subscriptionStatus !== 'active' &&
      user.subscriptionStatus !== 'trialing'
    ) {
      navigate('/pricing');
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

/**
 * TODO: Add function documentation
 */
export function useRedirectIfAuthenticated() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, isLoading, navigate]);

  return { user, isLoading };
}
