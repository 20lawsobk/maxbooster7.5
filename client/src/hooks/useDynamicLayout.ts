// @ts-nocheck
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  RefObject,
  useMemo,
} from "react";

export type BreakpointKey = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface Breakpoints {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  "2xl": number;
}

const BREAKPOINTS: Breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

interface DynamicLayoutResult {
  containerRef: RefObject<HTMLDivElement>;
  width: number;
  height: number;
  breakpoint: BreakpointKey;
  isXs: boolean;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  is2xl: boolean;
  isSmallScreen: boolean;
  isMediumScreen: boolean;
  isLargeScreen: boolean;
  columns: number;
  gap: number;
  padding: number;
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    "2xl": string;
    "3xl": string;
  };
  getGridCols: (maxCols?: number) => number;
  getCardWidth: (minWidth?: number, maxWidth?: number) => string;
  getSpacing: (base?: number) => number;
  clamp: (min: number, preferred: number, max: number) => number;
}

function getBreakpoint(width: number): BreakpointKey {
  if (width >= BREAKPOINTS["2xl"]) return "2xl";
  if (width >= BREAKPOINTS?.xl) return "xl";
  if (width >= BREAKPOINTS?.lg) return "lg";
  if (width >= BREAKPOINTS?.md) return "md";
  if (width >= BREAKPOINTS?.sm) return "sm";
  return "xs";
}

function calculateColumns(width: number): number {
  if (width < 640) return 1;
  if (width < 768) return 2;
  if (width < 1024) return 3;
  if (width < 1280) return 4;
  if (width < 1536) return 5;
  return 6;
}

function calculateGap(width: number): number {
  const minGap = 12;
  const maxGap = 32;
  const minWidth = 320;
  const maxWidth = 1920;

  const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  const ratio = (clampedWidth - minWidth) / (maxWidth - minWidth);
  return Math.round(minGap + ratio * (maxGap - minGap));
}

function calculatePadding(width: number): number {
  const minPadding = 12;
  const maxPadding = 48;
  const minWidth = 320;
  const maxWidth = 1920;

  const clampedWidth = Math.max(minWidth, Math.min(maxWidth, width));
  const ratio = (clampedWidth - minWidth) / (maxWidth - minWidth);
  return Math.round(minPadding + ratio * (maxPadding - minPadding));
}

function calculateFontSizes(width: number) {
  const scale = Math.max(0.85, Math.min(1.15, width / 1200));

  return {
    xs: `${Math.round(10 * scale)}px`,
    sm: `${Math.round(12 * scale)}px`,
    base: `${Math.round(14 * scale)}px`,
    lg: `${Math.round(16 * scale)}px`,
    xl: `${Math.round(18 * scale)}px`,
    "2xl": `${Math.round(22 * scale)}px`,
    "3xl": `${Math.round(28 * scale)}px`,
  };
}

export function useDynamicLayout(): DynamicLayoutResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 1200,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  });

  useEffect(() => {
    const container = containerRef?.current;

    const updateDimensions = (width: number, height: number) => {
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    };

    if (container) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry?.contentRect ?? {};
          updateDimensions(width, height);
        }
      });
      resizeObserver?.observe(container);
      const rect = container?.getBoundingClientRect();
      updateDimensions(rect?.width, rect?.height);
      return () => resizeObserver?.disconnect();
    } else {
      const handleResize = () => {
        updateDimensions(window.innerWidth, window.innerHeight);
      };
      handleResize();
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);

  const { width, height } = dimensions;
  const breakpoint = useMemo(() => getBreakpoint(width), [width]);
  const columns = useMemo(() => calculateColumns(width), [width]);
  const gap = useMemo(() => calculateGap(width), [width]);
  const padding = useMemo(() => calculatePadding(width), [width]);
  const fontSize = useMemo(() => calculateFontSizes(width), [width]);

  const getGridCols = useCallback(
    (maxCols: number = 6): number => {
      return Math.min(columns, maxCols);
    },
    [columns],
  );

  const getCardWidth = useCallback(
    (minWidth: number = 280, maxWidth: number = 400): string => {
      const cols = columns;
      const availableWidth = width - padding * 2 - (cols - 1) * gap;
      const cardWidth = Math.floor(availableWidth / cols);
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, cardWidth));
      return `${clampedWidth}px`;
    },
    [columns, width, padding, gap],
  );

  const getSpacing = useCallback(
    (base: number = 1): number => {
      return Math.round(gap * base);
    },
    [gap],
  );

  const clamp = useCallback(
    (min: number, preferred: number, max: number): number => {
      return Math.max(min, Math.min(max, preferred));
    },
    [],
  );

  return {
    containerRef,
    width,
    height,
    breakpoint,
    isXs: breakpoint === "xs",
    isSm: breakpoint === "sm",
    isMd: breakpoint === "md",
    isLg: breakpoint === "lg",
    isXl: breakpoint === "xl",
    is2xl: breakpoint === "2xl",
    isSmallScreen: ["xs", "sm"].includes(breakpoint),
    isMediumScreen: ["md", "lg"].includes(breakpoint),
    isLargeScreen: ["xl", "2xl"].includes(breakpoint),
    columns,
    gap,
    padding,
    fontSize,
    getGridCols,
    getCardWidth,
    getSpacing,
    clamp,
  };
}

export function getDynamicGridClass(
  breakpoint: BreakpointKey,
  maxCols: number = 4,
): string {
  const colMap: Record<BreakpointKey, Record<number, string>> = {
    xs: {
      1: "grid-cols-1",
      2: "grid-cols-1",
      3: "grid-cols-1",
      4: "grid-cols-1",
      5: "grid-cols-1",
      6: "grid-cols-1",
    },
    sm: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-2",
      4: "grid-cols-2",
      5: "grid-cols-2",
      6: "grid-cols-2",
    },
    md: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-2",
      4: "grid-cols-2",
      5: "grid-cols-3",
      6: "grid-cols-3",
    },
    lg: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-3",
      5: "grid-cols-4",
      6: "grid-cols-4",
    },
    xl: {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-5",
    },
    "2xl": {
      1: "grid-cols-1",
      2: "grid-cols-2",
      3: "grid-cols-3",
      4: "grid-cols-4",
      5: "grid-cols-5",
      6: "grid-cols-6",
    },
  };
  return colMap[breakpoint][Math.min(maxCols, 6) as 1 | 2 | 3 | 4 | 5 | 6];
}

export function getDynamicSpacingClass(breakpoint: BreakpointKey): {
  gap: string;
  padding: string;
} {
  const spacingMap: Record<BreakpointKey, { gap: string; padding: string }> = {
    xs: { gap: "gap-3", padding: "p-3" },
    sm: { gap: "gap-4", padding: "p-4" },
    md: { gap: "gap-4", padding: "p-5" },
    lg: { gap: "gap-5", padding: "p-6" },
    xl: { gap: "gap-6", padding: "p-8" },
    "2xl": { gap: "gap-8", padding: "p-10" },
  };
  return spacingMap[breakpoint];
}

export function getDynamicTextClass(
  breakpoint: BreakpointKey,
  variant: "heading" | "subheading" | "body" | "caption" = "body",
): string {
  const textMap: Record<BreakpointKey, Record<string, string>> = {
    xs: {
      heading: "text-xl",
      subheading: "text-base",
      body: "text-sm",
      caption: "text-xs",
    },
    sm: {
      heading: "text-xl",
      subheading: "text-lg",
      body: "text-sm",
      caption: "text-xs",
    },
    md: {
      heading: "text-2xl",
      subheading: "text-lg",
      body: "text-base",
      caption: "text-sm",
    },
    lg: {
      heading: "text-2xl",
      subheading: "text-xl",
      body: "text-base",
      caption: "text-sm",
    },
    xl: {
      heading: "text-3xl",
      subheading: "text-xl",
      body: "text-base",
      caption: "text-sm",
    },
    "2xl": {
      heading: "text-4xl",
      subheading: "text-2xl",
      body: "text-lg",
      caption: "text-base",
    },
  };
  return textMap[breakpoint][variant];
}

export { BREAKPOINTS };
