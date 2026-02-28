/**
 * Responsive Layout Utilities
 *
 * Pure functions and constants for building fluid, viewport-adaptive layouts.
 * All values scale linearly between a defined min/max viewport width range.
 *
 * Key exports:
 *   fluidClamp(min, max)       — CSS clamp() string that scales from min→max px
 *                                across minVw→maxVw viewport width
 *   fluidValue(min, max, w)    — JS numeric equivalent (for canvas/chart sizing)
 *   fluidSpacing               — Pre-computed spacing tokens (xs→2xl)
 *   fluidFontSize              — Pre-computed font-size tokens (xs→4xl)
 *   fluidRadius                — Pre-computed border-radius tokens
 *   responsiveValue(w, map)    — Pick the right value from a breakpoint map
 *   currentBreakpoint(w)       — Return the active breakpoint label
 *   containerColumns(w, min)   — Auto-calculate column count from width
 *   aspectRatioHeight(w, '16/9') — Height for a given width + aspect ratio
 *   getAutoFitGrid / getAutoFillGrid — CSS grid-template-columns strings
 *   breakpointWidths           — Canonical breakpoint px values (xs→2xl)
 */

export function fluidClamp(minPx: number, maxPx: number, minVw: number = 320, maxVw: number = 1920): string {
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const yAxisIntersection = minPx - slope * minVw;
  const preferredValue = `${yAxisIntersection.toFixed(4)}px + ${(slope * 100).toFixed(4)}vw`;
  return `clamp(${minPx}px, ${preferredValue}, ${maxPx}px)`;
}

export function fluidValue(min: number, max: number, width: number, minWidth: number = 320, maxWidth: number = 1920): number {
  if (width <= minWidth) return min;
  if (width >= maxWidth) return max;
  const ratio = (width - minWidth) / (maxWidth - minWidth);
  return min + ratio * (max - min);
}

export const fluidSpacing = {
  xs: fluidClamp(4, 8),
  sm: fluidClamp(8, 16),
  md: fluidClamp(12, 24),
  lg: fluidClamp(16, 32),
  xl: fluidClamp(24, 48),
  '2xl': fluidClamp(32, 64),
};

export const fluidFontSize = {
  xs: fluidClamp(10, 12),
  sm: fluidClamp(12, 14),
  base: fluidClamp(14, 16),
  lg: fluidClamp(16, 18),
  xl: fluidClamp(18, 22),
  '2xl': fluidClamp(22, 28),
  '3xl': fluidClamp(28, 36),
  '4xl': fluidClamp(36, 48),
};

export const fluidRadius = {
  sm: fluidClamp(4, 6),
  md: fluidClamp(6, 8),
  lg: fluidClamp(8, 12),
  xl: fluidClamp(12, 16),
};

export function getAutoFitGrid(minItemWidth: number = 280): string {
  return `repeat(auto-fit, minmax(min(${minItemWidth}px, 100%), 1fr))`;
}

export function getAutoFillGrid(minItemWidth: number = 280, maxItemWidth: number = 400): string {
  return `repeat(auto-fill, minmax(${minItemWidth}px, ${maxItemWidth}px))`;
}

export function responsiveValue<T>(
  width: number,
  values: { xs?: T; sm?: T; md?: T; lg?: T; xl?: T; default: T }
): T {
  if (width >= 1280 && values.xl !== undefined) return values.xl;
  if (width >= 1024 && values.lg !== undefined) return values.lg;
  if (width >= 768 && values.md !== undefined) return values.md;
  if (width >= 640 && values.sm !== undefined) return values.sm;
  if (values.xs !== undefined) return values.xs;
  return values.default;
}

export const breakpointWidths = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export function isBreakpoint(width: number, breakpoint: keyof typeof breakpointWidths): boolean {
  return width >= breakpointWidths[breakpoint];
}

export function currentBreakpoint(width: number): keyof typeof breakpointWidths {
  if (width >= breakpointWidths['2xl']) return '2xl';
  if (width >= breakpointWidths.xl) return 'xl';
  if (width >= breakpointWidths.lg) return 'lg';
  if (width >= breakpointWidths.md) return 'md';
  if (width >= breakpointWidths.sm) return 'sm';
  return 'xs';
}

export function containerColumns(width: number, minColWidth: number = 300): number {
  return Math.max(1, Math.floor(width / minColWidth));
}

export function aspectRatioHeight(width: number, aspectRatio: string = '16/9'): number {
  const [w, h] = aspectRatio.split('/').map(Number);
  return Math.round(width * (h / w));
}
