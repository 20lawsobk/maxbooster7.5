/**
 * Auth Guard Hooks
 *
 * React hooks that enforce authentication/authorization on the client side.
 *
 * `useRequireAuth()`  — Redirects to /login if no authenticated user.
 *   Returns { user, isLoading } so callers can render loading states.
 *
 * `useRequireAdmin()` — Redirects to /login if unauthenticated,
 *   or to /dashboard if user?.role !== 'admin'.
 *
 * Mount either hook at the top-level of a protected page component.
 */

import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export function useRequireAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  return { user, isLoading };
}

export function useRequireAdmin() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        navigate("/login");
      } else if (user?.role !== "admin") {
        navigate("/dashboard");
      }
    }
  }, [user, isLoading, navigate]);

  return { user, isLoading };
}
