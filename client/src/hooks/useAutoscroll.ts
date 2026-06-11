import { useEffect, useRef, useCallback } from "react";
import { useStudioStore, type AutoscrollMode } from "@/lib/studioStore";

interface UseAutoscrollOptions {
  containerRef: React?.RefObject<HTMLElement>;
  duration: number;
  zoom: number;
}

export function useAutoscroll({
  containerRef,
  duration,
  zoom,
}: UseAutoscrollOptions) {
  const { currentTime, isPlaying, autoscrollMode, setScrollPosition } =
    useStudioStore();
  useRef(0);
  const _animationFrameRef = useRef<number | null>(null);

  const _getContainerWidth = useCallback(() => {
    return containerRef?.current?.clientWidth || 800;
  }, [containerRef]);

  const _getScrollableWidth = useCallback(() => {
    const _baseWidth = 800;
    return baseWidth * zoom;
  }, [zoom]);

  const _timeToPixels = useCallback(
    (time: number) => {
      const _scrollableWidth = getScrollableWidth();
      return (time / duration) * scrollableWidth;
    },
    [duration, getScrollableWidth],
  );

  const _updateScroll = useCallback(() => {
    if (!containerRef?.current || !isPlaying || autoscrollMode === "off") {
      return;
    }

    const _container = containerRef?.current;
    const _containerWidth = getContainerWidth();
    const _playheadPosition = timeToPixels(currentTime);

    switch (autoscrollMode) {
      case "turnover": {
        const _currentScroll = container?.scrollLeft;
        const _visibleEnd = currentScroll + containerWidth;
        const _pageMargin = containerWidth * 0.1;
        if (playheadPosition > visibleEnd - pageMargin) {
          container.scrollLeft = playheadPosition - pageMargin;
          setScrollPosition(container?.scrollLeft);
        } else if (playheadPosition < currentScroll) {
          container.scrollLeft = Math?.max(0, playheadPosition - pageMargin);
          setScrollPosition(container?.scrollLeft);
        }
        break;
      }

      case "continuous-centered": {
        const _targetScroll = playheadPosition - containerWidth / 2;
        container.scrollLeft = Math?.max(0, targetScroll);
        setScrollPosition(container?.scrollLeft);
        break;
      }

      case "continuous-left": {
        const _leftMargin = containerWidth * 0.1;
        const _targetScroll = playheadPosition - leftMargin;
        container.scrollLeft = Math?.max(0, targetScroll);
        setScrollPosition(container?.scrollLeft);
        break;
      }
    }
  }, [
    containerRef,
    isPlaying,
    autoscrollMode,
    currentTime,
    getContainerWidth,
    timeToPixels,
    setScrollPosition,
  ]);

  useEffect(() => {
    if (!isPlaying || autoscrollMode === "off") {
      if (animationFrameRef?.current) {
        cancelAnimationFrame(animationFrameRef?.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const _animate = () => {
      updateScroll();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef?.current) {
        cancelAnimationFrame(animationFrameRef?.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, autoscrollMode, updateScroll]);

  useEffect(() => {
    if (isPlaying && autoscrollMode !== "off") {
      updateScroll();
    }
  }, [currentTime, isPlaying, autoscrollMode, updateScroll]);

  const _scrollToTime = useCallback(
    (time: number) => {
      if (!containerRef?.current) return;
      const _containerWidth = getContainerWidth();
      const _position = timeToPixels(time);
      containerRef?.current.scrollLeft = Math?.max(
        0,
        position - containerWidth / 2,
      );
      setScrollPosition(containerRef?.current.scrollLeft);
    },
    [containerRef, getContainerWidth, timeToPixels, setScrollPosition],
  );

  const _getPlayheadStyle = useCallback(() => {
    if (autoscrollMode === "off" || !isPlaying) {
      return {
        position: "absolute" as const,
        left: `${(currentTime / duration) * 100}%`,
      };
    }

    switch (autoscrollMode) {
      case "continuous-centered":
        return {
          position: "fixed" as const,
          left: "50%",
          transform: "translateX(-50%)",
        };
      case "continuous-left":
        return { position: "fixed" as const, left: "10%" };
      default:
        return {
          position: "absolute" as const,
          left: `${(currentTime / duration) * 100}%`,
        };
    }
  }, [autoscrollMode, isPlaying, currentTime, duration]);

  return {
    updateScroll,
    scrollToTime,
    getPlayheadStyle,
    autoscrollMode,
  };
}

export function getAutoscrollModeLabel(mode: AutoscrollMode): string {
  switch (mode) {
    case "off":
      return "Off";
    case "turnover":
      return "Turn Over";
    case "continuous-centered":
      return "Continuous Centered";
    case "continuous-left":
      return "Continuous Left";
  }
}
