import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';

export type TokenRefreshOutcome =
  | 'token_refresh_successful'
  | 'token_refresh_failed'
  | 'token_expired_during_operation'
  | 'token_revoked_by_provider'
  | 'token_scope_insufficient'
  | 'provider_api_error'
  | 'reauth_required'
  | 'session_valid';

interface TokenRefreshResult {
  success: boolean;
  outcome: TokenRefreshOutcome;
  expiresAt?: string;
  message?: string;
}

interface TokenRefreshHandlerProps {
  refreshInterval?: number;
  onRefreshSuccess?: (result: TokenRefreshResult) => void;
  onRefreshFailure?: (result: TokenRefreshResult) => void;
  onReauthRequired?: () => void;
  silentRefresh?: boolean;
}

export function TokenRefreshHandler({
  refreshInterval = 5 * 60 * 1000,
  onRefreshSuccess,
  onRefreshFailure,
  onReauthRequired,
  silentRefresh = true,
}: TokenRefreshHandlerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // Use a ref so changing this never causes the callback or effect to re-run
  const isRefreshingRef = useRef(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Stable callback — no state in deps, so identity never changes between renders
  const handleTokenRefresh = useCallback(async (): Promise<TokenRefreshResult> => {
    if (!user || isRefreshingRef.current) {
      return { success: true, outcome: 'session_valid' };
    }

    isRefreshingRef.current = true;

    try {
      const response = await apiRequest('POST', '/api/auth/refresh-token');
      const data = await response.json();

      if (data.success) {
        setLastRefresh(new Date());
        const result: TokenRefreshResult = {
          success: true,
          outcome: 'token_refresh_successful',
          expiresAt: data.expiresAt,
          message: data.message,
        };
        onRefreshSuccess?.(result);
        return result;
      } else {
        const outcome: TokenRefreshOutcome =
          data.action === 'reauth_required' ? 'reauth_required' :
          data.error === 'session_expired' ? 'token_expired_during_operation' :
          'token_refresh_failed';

        const result: TokenRefreshResult = {
          success: false,
          outcome,
          message: data.message,
        };

        if (outcome === 'reauth_required') {
          onReauthRequired?.();
          if (!silentRefresh) {
            toast({
              title: 'Session Expired',
              description: 'Please sign in again to continue.',
              variant: 'destructive',
            });
          }
        } else {
          onRefreshFailure?.(result);
        }

        return result;
      }
    } catch (error) {
      const result: TokenRefreshResult = {
        success: false,
        outcome: 'provider_api_error',
        message: error.message || 'Failed to refresh token',
      };

      if (!silentRefresh) {
        onRefreshFailure?.(result);
      }

      return result;
    } finally {
      isRefreshingRef.current = false;
    }
  // Intentionally omit isRefreshingRef — refs are stable and don't need listing.
  // onRefresh*/onReauth*/silentRefresh/toast/queryClient are safe to omit since
  // they are either stable refs or the effect only cares about user/refreshInterval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user) return;

    handleTokenRefresh();

    const id = setInterval(handleTokenRefresh, refreshInterval);
    return () => clearInterval(id);
  }, [user, refreshInterval, handleTokenRefresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        handleTokenRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user, handleTokenRefresh]);

  return null;
}

export function useTokenRefresh() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastOutcome, setLastOutcome] = useState<TokenRefreshOutcome | null>(null);

  const refreshToken = useCallback(async (): Promise<TokenRefreshResult> => {
    setIsRefreshing(true);
    try {
      const response = await apiRequest('POST', '/api/auth/refresh-token');
      const data = await response.json();

      const outcome: TokenRefreshOutcome = data.success
        ? 'token_refresh_successful'
        : data.action === 'reauth_required' ? 'reauth_required' : 'token_refresh_failed';

      setLastOutcome(outcome);
      return {
        success: data.success,
        outcome,
        expiresAt: data.expiresAt,
        message: data.message,
      };
    } catch (error) {
      setLastOutcome('provider_api_error');
      return {
        success: false,
        outcome: 'provider_api_error',
        message: error.message,
      };
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return {
    refreshToken,
    isRefreshing,
    lastOutcome,
  };
}

export default TokenRefreshHandler;
