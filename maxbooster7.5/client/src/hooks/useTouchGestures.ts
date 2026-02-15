import { useEffect, useRef, useState, useCallback, RefObject } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | 'down' | null;

interface TouchPosition {
  x: number;
  y: number;
  time: number;
}

interface SwipeConfig {
  threshold?: number;
  maxTime?: number;
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useSwipeGesture<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  config: SwipeConfig = {}
) {
  const {
    threshold = 50,
    maxTime = 300,
    onSwipe,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
  } = config;

  const startPos = useRef<TouchPosition | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startPos.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!startPos.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startPos.current.x;
      const deltaY = touch.clientY - startPos.current.y;
      const deltaTime = Date.now() - startPos.current.time;

      if (deltaTime > maxTime) {
        startPos.current = null;
        return;
      }

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      let direction: SwipeDirection = null;

      if (absX > absY && absX > threshold) {
        direction = deltaX > 0 ? 'right' : 'left';
      } else if (absY > absX && absY > threshold) {
        direction = deltaY > 0 ? 'down' : 'up';
      }

      if (direction) {
        onSwipe?.(direction);
        if (direction === 'left') onSwipeLeft?.();
        if (direction === 'right') onSwipeRight?.();
        if (direction === 'up') onSwipeUp?.();
        if (direction === 'down') onSwipeDown?.();
      }

      startPos.current = null;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, threshold, maxTime, onSwipe, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown]);
}

interface PullToRefreshConfig {
  threshold?: number;
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

export function usePullToRefresh<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  config: PullToRefreshConfig
) {
  const { threshold = 80, onRefresh, disabled = false } = config;
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);

  useEffect(() => {
    const element = ref.current;
    if (!element || disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (element.scrollTop === 0) {
        startY.current = e.touches[0].clientY;
        setIsPulling(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;

      currentY.current = e.touches[0].clientY;
      const distance = Math.max(0, currentY.current - startY.current);
      const dampedDistance = Math.min(distance * 0.5, threshold * 1.5);
      setPullDistance(dampedDistance);
    };

    const handleTouchEnd = async () => {
      if (!isPulling) return;

      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }

      setIsPulling(false);
      setPullDistance(0);
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, threshold, onRefresh, disabled, isPulling, pullDistance, isRefreshing]);

  return { isPulling, pullDistance, isRefreshing, progress: Math.min(pullDistance / threshold, 1) };
}

interface LongPressConfig {
  duration?: number;
  onLongPress: () => void;
  onPress?: () => void;
}

export function useLongPress<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  config: LongPressConfig
) {
  const { duration = 500, onLongPress, onPress } = config;
  const [isLongPressing, setIsLongPressing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressedRef = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleTouchStart = () => {
      isLongPressedRef.current = false;
      timerRef.current = setTimeout(() => {
        isLongPressedRef.current = true;
        setIsLongPressing(true);
        onLongPress();
        triggerHapticFeedback('heavy');
      }, duration);
    };

    const handleTouchEnd = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (!isLongPressedRef.current) {
        onPress?.();
      }
      setIsLongPressing(false);
    };

    const handleTouchMove = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setIsLongPressing(false);
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchmove', handleTouchMove);
    };
  }, [ref, duration, onLongPress, onPress]);

  return { isLongPressing };
}

interface PinchZoomConfig {
  minScale?: number;
  maxScale?: number;
  onZoomChange?: (scale: number) => void;
}

export function usePinchZoom<T extends HTMLElement = HTMLElement>(
  ref: RefObject<T>,
  config: PinchZoomConfig = {}
) {
  const { minScale = 0.5, maxScale = 3, onZoomChange } = config;
  const [scale, setScale] = useState(1);
  const initialDistance = useRef<number>(0);
  const initialScale = useRef<number>(1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const getDistance = (touches: TouchList) => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance.current = getDistance(e.touches);
        initialScale.current = scale;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialDistance.current > 0) {
        const currentDistance = getDistance(e.touches);
        const scaleChange = currentDistance / initialDistance.current;
        const newScale = Math.min(maxScale, Math.max(minScale, initialScale.current * scaleChange));
        setScale(newScale);
        onZoomChange?.(newScale);
      }
    };

    const handleTouchEnd = () => {
      initialDistance.current = 0;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [ref, minScale, maxScale, scale, onZoomChange]);

  const resetZoom = useCallback(() => {
    setScale(1);
    onZoomChange?.(1);
  }, [onZoomChange]);

  return { scale, resetZoom };
}

export function triggerHapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const patterns: Record<string, number | number[]> = {
      light: 10,
      medium: 25,
      heavy: 50,
    };
    navigator.vibrate(patterns[type]);
  }
}

export function useHorizontalSwipeNavigation(
  sections: string[],
  currentIndex: number,
  onChange: (index: number) => void
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useSwipeGesture(containerRef, {
    onSwipeLeft: () => {
      if (currentIndex < sections.length - 1) {
        onChange(currentIndex + 1);
        triggerHapticFeedback('light');
      }
    },
    onSwipeRight: () => {
      if (currentIndex > 0) {
        onChange(currentIndex - 1);
        triggerHapticFeedback('light');
      }
    },
  });

  return containerRef;
}
