import { ReactNode, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { useAppLayout } from "./AppLayout";

interface DynamicContainerProps {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
}

const maxWidthMap = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-7xl",
  xl: "max-w-[1920px]",
  full: "max-w-full",
};

const paddingMap = {
  none: "",
  sm: "px-3 sm:px-4 lg:px-6",
  md: "px-4 sm:px-6 lg:px-8",
  lg: "px-6 sm:px-8 lg:px-12",
};

export const DynamicContainer = forwardRef<
  HTMLDivElement,
  DynamicContainerProps
>(({ children, size = "xl", padding = "md", className }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "mx-auto w-full",
        maxWidthMap[size],
        paddingMap[padding],
        className,
      )}
    >
      {children}
    </div>
  );
});

DynamicContainer.displayName = "DynamicContainer";

interface DynamicSectionProps {
  children: ReactNode;
  spacing?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sectionSpacingMap = {
  sm: "py-4 sm:py-6",
  md: "py-6 sm:py-8 lg:py-10",
  lg: "py-8 sm:py-12 lg:py-16",
  xl: "py-12 sm:py-16 lg:py-24",
};

export function DynamicSection({
  children,
  spacing = "md",
  className,
}: DynamicSectionProps) {
  return (
    <section className={cn(sectionSpacingMap[spacing], className)}>
      {children}
    </section>
  );
}

interface DynamicCardProps {
  children: ReactNode;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
  className?: string;
}

const cardPaddingMap = {
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5 lg:p-6",
  lg: "p-5 sm:p-6 lg:p-8",
};

export function DynamicCard({
  children,
  padding = "md",
  hover = false,
  className,
}: DynamicCardProps) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-card rounded-lg border border-gray-200 dark:border-border shadow-sm",
        cardPaddingMap[padding],
        hover && "transition-shadow hover:shadow-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface DynamicTextProps {
  children: ReactNode;
  variant?: "h1" | "h2" | "h3" | "h4" | "body" | "caption";
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}

const textVariantMap = {
  h1: "text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight",
  h2: "text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight",
  h3: "text-lg sm:text-xl lg:text-2xl font-semibold",
  h4: "text-base sm:text-lg lg:text-xl font-medium",
  body: "text-sm sm:text-base",
  caption: "text-xs sm:text-sm text-muted-foreground",
};

export function DynamicText({
  children,
  variant = "body",
  className,
  as,
}: DynamicTextProps) {
  const Component =
    as ||
    ((variant.startsWith("h") ? variant : "p") as keyof JSX.IntrinsicElements);

  return (
    <Component className={cn(textVariantMap[variant], className)}>
      {children}
    </Component>
  );
}

interface FluidSpacerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const spacerSizeMap = {
  xs: "h-2 sm:h-3",
  sm: "h-3 sm:h-4 lg:h-5",
  md: "h-4 sm:h-6 lg:h-8",
  lg: "h-6 sm:h-8 lg:h-12",
  xl: "h-8 sm:h-12 lg:h-16",
};

export function FluidSpacer({ size = "md" }: FluidSpacerProps) {
  return <div className={spacerSizeMap[size]} aria-hidden="true" />;
}

interface AdaptiveVisibilityProps {
  children: ReactNode;
  showOn?: ("xs" | "sm" | "md" | "lg" | "xl")[];
  hideOn?: ("xs" | "sm" | "md" | "lg" | "xl")[];
}

export function AdaptiveVisibility({
  children,
  showOn,
  hideOn,
}: AdaptiveVisibilityProps) {
  const { isMobile, isTablet, isDesktop, isWide } = useAppLayout();

  const currentBreakpoint = isMobile
    ? "xs"
    : isTablet
      ? "md"
      : isDesktop
        ? "lg"
        : "xl";

  if (
    showOn &&
    !showOn.includes(currentBreakpoint as Record<string, unknown>)
  ) {
    return null;
  }

  if (hideOn && hideOn.includes(currentBreakpoint as Record<string, unknown>)) {
    return null;
  }

  return <>{children}</>;
}
