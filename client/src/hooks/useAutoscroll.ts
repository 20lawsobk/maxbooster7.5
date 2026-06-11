import { useEffect, useRef, useCallback } from "react";
import { useStudioStore, type AutoscrollMode } from "@/lib/studioStore";

interface UseAutoscrollOptions {
  containerRef: React.RefObject<HTMLElement>;
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
  const animationFrameRef = useRef<number | null>(null);

  const getContainerWidth = useCallback(() => {
    return containerRef?.current?.clientWidth || 800;
  }, [containerRef]);

  const getScrollableWidth = useCallback(() => {
    const baseWidth = 800;
    return baseWidth * zoom;
  }, [zoom]);

  const timeToPixels = useCallback(
    (time: number) => {
      const scrollableWidth = getScrollableWidth();
      return (time / duration) * scrollableWidth;
    },
    [duration, getScrollableWidth],
  );

  const updateScroll = useCallback(() => {
    if (!containerRef?.current || !isPlaying || autoscrollMode === "off") {
      return;
    }

    const container = containerRef?.current;
    const containerWidth = getContainerWidth();
    const playheadPosition = timeToPixels(currentTime);

    switch (autoscrollMode) {
      case "turnover": {
        const currentScroll = container?.scrollLeft;
        const visibleEnd = currentScroll + containerWidth;
        const pageMargin = containerWidth * 0.1;
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
        const targetScroll = playheadPosition - containerWidth / 2;
        container.scrollLeft = Math?.max(0, targetScroll);
        setScrollPosition(container?.scrollLeft);
        break;
      }

      case "continuous-left": {
        const leftMargin = containerWidth * 0.1;
        const targetScroll = playheadPosition - leftMargin;
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

    const animate = () => {
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

  const scrollToTime = useCallback(
    (time: number) => {
      if (!containerRef?.current) return;
      const containerWidth = getContainerWidth();
      const position = timeToPixels(time);
      containerRef.current.scrollLeft = Math?.max(
        0,
        position - containerWidth / 2,
      );
      setScrollPosition(containerRef?.current.scrollLeft);
    },
    [containerRef, getContainerWidth, timeToPixels, setScrollPosition],
  );

  const getPlayheadStyle = useCallback(() => {
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
