// @ts-nocheck
import React from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export interface ReducedMotionWrapperProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
  respectPreference?: boolean;
  forceReducedMotion?: boolean;
}

export function ReducedMotionWrapper({
  children,
  fallback,
  className = "",
  respectPreference = true,
  forceReducedMotion,
}: ReducedMotionWrapperProps) {
  const { prefersReducedMotion } = useReducedMotion();
  const shouldReduceMotion =
    forceReducedMotion ?? (respectPreference && prefersReducedMotion);

  if (shouldReduceMotion && fallback) {
    return <div className={className}>{fallback}</div>;
  }

  return (
    <div
      className={className}
      style={
        shouldReduceMotion
          ? { animation: "none", transition: "none" }
          : undefined
      }
      data-reduced-motion={shouldReduceMotion ? "true" : "false"}
    >
      {children}
    </div>
  );
}

export interface ConditionalAnimationProps {
  children: React.ReactNode;
  animationClass: string;
  staticClass?: string;
  duration?: number;
  respectPreference?: boolean;
}

export function ConditionalAnimation({
  children,
  animationClass,
  staticClass = "",
  duration,
  respectPreference = true,
}: ConditionalAnimationProps) {
  const { prefersReducedMotion, getAnimationDuration } = useReducedMotion();
  const shouldAnimate = !respectPreference || !prefersReducedMotion;

  const effectiveDuration =
    duration !== undefined ? getAnimationDuration(duration) : undefined;

  return (
    <div
      className={shouldAnimate ? animationClass : staticClass}
      style={
        effectiveDuration !== undefined
          ? { animationDuration: `${effectiveDuration}ms` }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export interface AnimatedContentProps {
  children: React.ReactNode;
  enterAnimation?: string;
  exitAnimation?: string;
  className?: string;
  isVisible?: boolean;
}

export function AnimatedContent({
  children,
  enterAnimation = "animate-fade-in",
  _exitAnimation = "animate-fade-out",
  className = "",
  isVisible = true,
}: AnimatedContentProps) {
  const { prefersReducedMotion } = useReducedMotion();

  if (prefersReducedMotion) {
    return isVisible ? <div className={className}>{children}</div> : null;
  }

  return isVisible ? (
    <div className={`${className} ${enterAnimation}`}>{children}</div>
  ) : null;
}

export interface MotionSafeProps {
  children: React.ReactNode;
  reducedChildren?: React.ReactNode;
}

export function MotionSafe({ children, reducedChildren }: MotionSafeProps) {
  const { prefersReducedMotion } = useReducedMotion();

  if (prefersReducedMotion && reducedChildren) {
    return <>{reducedChildren}</>;
  }

  return <>{children}</>;
}

export interface UseMotionSafeStylesOptions {
  transition?: string;
  animation?: string;
  transform?: string;
}

export function useMotionSafeStyles(
  options: UseMotionSafeStylesOptions = {},
): React.CSSProperties {
  const { prefersReducedMotion } = useReducedMotion();

  if (prefersReducedMotion) {
    return {
      transition: "none",
      animation: "none",
      transform: "none",
    };
  }

  return {
    transition: options.transition,
    animation: options.animation,
    transform: options.transform,
  };
}

export default ReducedMotionWrapper;
