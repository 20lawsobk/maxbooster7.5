import React, { useMemo } from 'react';
import { motion, AnimatePresence, type MotionProps, type Transition } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export interface SafeMotionProps extends MotionProps {
  children: React.ReactNode;
  as?: keyof typeof motion;
  className?: string;
  reducedMotionVariant?: 'instant' | 'opacity' | 'none';
  forceReducedMotion?: boolean;
}

const instantTransition: Transition = {
  duration: 0,
  delay: 0,
};

const opacityOnlyTransition: Transition = {
  duration: 0.15,
  ease: 'linear',
};

export function SafeMotion({
  children,
  as = 'div',
  className,
  reducedMotionVariant = 'instant',
  forceReducedMotion,
  animate,
  initial,
  exit,
  transition,
  variants,
  ...props
}: SafeMotionProps) {
  const { prefersReducedMotion } = useReducedMotion();
  const shouldReduceMotion = forceReducedMotion ?? prefersReducedMotion;

  const safeProps = useMemo(() => {
    if (!shouldReduceMotion) {
      return {
        animate,
        initial,
        exit,
        transition,
        variants,
      };
    }

    switch (reducedMotionVariant) {
      case 'none':
        return {
          animate: undefined,
          initial: undefined,
          exit: undefined,
          transition: undefined,
          variants: undefined,
        };

      case 'opacity':
        return {
          animate: typeof animate === 'object' ? { opacity: (animate as any).opacity ?? 1 } : animate,
          initial: typeof initial === 'object' ? { opacity: (initial as any).opacity ?? 0 } : initial,
          exit: typeof exit === 'object' ? { opacity: (exit as any).opacity ?? 0 } : exit,
          transition: opacityOnlyTransition,
          variants: variants
            ? Object.fromEntries(
                Object.entries(variants).map(([key, value]) => [
                  key,
                  typeof value === 'object' ? { opacity: (value as any).opacity } : value,
                ])
              )
            : undefined,
        };

      case 'instant':
      default:
        return {
          animate,
          initial: false,
          exit: undefined,
          transition: instantTransition,
          variants,
        };
    }
  }, [
    shouldReduceMotion,
    reducedMotionVariant,
    animate,
    initial,
    exit,
    transition,
    variants,
  ]);

  const MotionComponent = motion[as] as React.ComponentType<any>;

  return (
    <MotionComponent className={className} {...props} {...safeProps}>
      {children}
    </MotionComponent>
  );
}

export interface SafeAnimatePresenceProps {
  children: React.ReactNode;
  mode?: 'wait' | 'sync' | 'popLayout';
  initial?: boolean;
  onExitComplete?: () => void;
}

export function SafeAnimatePresence({
  children,
  mode = 'wait',
  initial = true,
  onExitComplete,
}: SafeAnimatePresenceProps) {
  const { prefersReducedMotion } = useReducedMotion();

  return (
    <AnimatePresence
      mode={prefersReducedMotion ? 'sync' : mode}
      initial={prefersReducedMotion ? false : initial}
      onExitComplete={onExitComplete}
    >
      {children}
    </AnimatePresence>
  );
}

export interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
}

export function FadeIn({ children, className, duration = 0.3, delay = 0 }: FadeInProps) {
  const { prefersReducedMotion } = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: prefersReducedMotion ? 0 : duration,
        delay: prefersReducedMotion ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}

export interface SlideInProps {
  children: React.ReactNode;
  className?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  distance?: number;
  duration?: number;
  delay?: number;
}

export function SlideIn({
  children,
  className,
  direction = 'up',
  distance = 20,
  duration = 0.3,
  delay = 0,
}: SlideInProps) {
  const { prefersReducedMotion } = useReducedMotion();

  const initialPosition = useMemo(() => {
    switch (direction) {
      case 'left':
        return { x: -distance, y: 0 };
      case 'right':
        return { x: distance, y: 0 };
      case 'up':
        return { x: 0, y: distance };
      case 'down':
        return { x: 0, y: -distance };
    }
  }, [direction, distance]);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...initialPosition }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export interface ScaleInProps {
  children: React.ReactNode;
  className?: string;
  initialScale?: number;
  duration?: number;
  delay?: number;
}

export function ScaleIn({
  children,
  className,
  initialScale = 0.95,
  duration = 0.2,
  delay = 0,
}: ScaleInProps) {
  const { prefersReducedMotion } = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: initialScale }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

export function useMotionPreferences() {
  const { prefersReducedMotion, getAnimationDuration, getTransition } = useReducedMotion();

  const safeTransition = useMemo(
    () =>
      (normalTransition: Transition): Transition => {
        if (prefersReducedMotion) {
          return instantTransition;
        }
        return normalTransition;
      },
    [prefersReducedMotion]
  );

  const safeVariants = useMemo(
    () =>
      <T extends Record<string, any>>(variants: T): T => {
        if (!prefersReducedMotion) return variants;

        return Object.fromEntries(
          Object.entries(variants).map(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              return [
                key,
                {
                  ...value,
                  transition: instantTransition,
                },
              ];
            }
            return [key, value];
          })
        ) as T;
      },
    [prefersReducedMotion]
  );

  return {
    prefersReducedMotion,
    safeTransition,
    safeVariants,
    getAnimationDuration,
    getTransition,
  };
}

export default SafeMotion;
