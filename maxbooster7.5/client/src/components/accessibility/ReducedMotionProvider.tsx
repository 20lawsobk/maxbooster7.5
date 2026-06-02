import React, {
  createContext,
  useContext,
  type ReactNode,
  useMemo,
  useCallback,
} from "react";
import {
  useReducedMotion,
  type ReducedMotionResult,
} from "@/hooks/useReducedMotion";

export interface ReducedMotionContextValue extends ReducedMotionResult {
  shouldAnimate: boolean;
  motionVariants: {
    hidden: Record<string, unknown>;
    visible: Record<string, unknown>;
    exit: Record<string, unknown>;
  };
  getSpringConfig: () => Record<string, unknown>;
  getDuration: (normalMs: number) => number;
}

const ReducedMotionContext = createContext<
  ReducedMotionContextValue | undefined
>(undefined);

export interface ReducedMotionProviderProps {
  children: ReactNode;
  defaultValue?: boolean;
  respectUserPreference?: boolean;
}

export function ReducedMotionProvider({
  children,
  defaultValue,
  respectUserPreference = true,
}: ReducedMotionProviderProps) {
  const reducedMotion = useReducedMotion({
    defaultValue,
    respectUserPreference,
  });

  const shouldAnimate = !reducedMotion.prefersReducedMotion;

  const motionVariants = useMemo(
    () => ({
      hidden: reducedMotion.prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: 20, scale: 0.95 },
      visible: reducedMotion.prefersReducedMotion
        ? { opacity: 1 }
        : { opacity: 1, y: 0, scale: 1 },
      exit: reducedMotion.prefersReducedMotion
        ? { opacity: 0 }
        : { opacity: 0, y: -20, scale: 0.95 },
    }),
    [reducedMotion.prefersReducedMotion],
  );

  const getSpringConfig = useCallback(() => {
    if (reducedMotion.prefersReducedMotion) {
      return { duration: 0 };
    }
    return {
      type: "spring",
      stiffness: 300,
      damping: 30,
    };
  }, [reducedMotion.prefersReducedMotion]);

  const getDuration = useCallback(
    (normalMs: number): number => {
      return reducedMotion.prefersReducedMotion ? 0 : normalMs;
    },
    [reducedMotion.prefersReducedMotion],
  );

  const value = useMemo<ReducedMotionContextValue>(
    () => ({
      ...reducedMotion,
      shouldAnimate,
      motionVariants,
      getSpringConfig,
      getDuration,
    }),
    [
      reducedMotion,
      shouldAnimate,
      motionVariants,
      getSpringConfig,
      getDuration,
    ],
  );

  return (
    <ReducedMotionContext.Provider value={value}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

export function useReducedMotionContext(): ReducedMotionContextValue {
  const context = useContext(ReducedMotionContext);
  if (context === undefined) {
    throw new Error(
      "useReducedMotionContext must be used within a ReducedMotionProvider",
    );
  }
  return context;
}

export function useShouldAnimate(): boolean {
  const context = useContext(ReducedMotionContext);
  if (context === undefined) {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return !prefersReducedMotion;
  }
  return context.shouldAnimate;
}

export function useMotionVariants() {
  const context = useContext(ReducedMotionContext);
  if (context === undefined) {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    return {
      hidden: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 },
      visible: prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
      exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20 },
    };
  }
  return context.motionVariants;
}

export interface MotionSafeWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function MotionSafeWrapper({
  children,
  fallback,
}: MotionSafeWrapperProps) {
  const shouldAnimate = useShouldAnimate();

  if (!shouldAnimate && fallback) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export default ReducedMotionProvider;
