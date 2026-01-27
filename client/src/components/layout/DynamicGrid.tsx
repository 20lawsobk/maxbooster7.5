import { ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useAppLayout } from './AppLayout';

interface DynamicGridProps {
  children: ReactNode;
  minItemWidth?: number;
  maxItemWidth?: number;
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  style?: CSSProperties;
}

const gapSizes = {
  sm: 'gap-2 sm:gap-3',
  md: 'gap-3 sm:gap-4 lg:gap-5',
  lg: 'gap-4 sm:gap-5 lg:gap-6',
  xl: 'gap-5 sm:gap-6 lg:gap-8',
};

export function DynamicGrid({
  children,
  minItemWidth = 280,
  maxItemWidth = 1,
  gap = 'md',
  className,
  style,
}: DynamicGridProps) {
  const { containerWidth } = useAppLayout();
  
  const adjustedMinWidth = containerWidth < 640 
    ? Math.min(minItemWidth, containerWidth - 32) 
    : minItemWidth;

  return (
    <div
      className={cn('grid w-full', gapSizes[gap], className)}
      style={{
        gridTemplateColumns: `repeat(auto-fit, minmax(min(${adjustedMinWidth}px, 100%), ${maxItemWidth === 1 ? '1fr' : `${maxItemWidth}px`}))`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

interface DynamicFlexProps {
  children: ReactNode;
  direction?: 'row' | 'col';
  wrap?: boolean;
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  className?: string;
}

export function DynamicFlex({
  children,
  direction = 'row',
  wrap = true,
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  className,
}: DynamicFlexProps) {
  const alignMap = {
    start: 'items-start',
    center: 'items-center',
    end: 'items-end',
    stretch: 'items-stretch',
  };

  const justifyMap = {
    start: 'justify-start',
    center: 'justify-center',
    end: 'justify-end',
    between: 'justify-between',
    around: 'justify-around',
    evenly: 'justify-evenly',
  };

  return (
    <div
      className={cn(
        'flex',
        direction === 'col' ? 'flex-col' : 'flex-row',
        wrap && 'flex-wrap',
        gapSizes[gap],
        alignMap[align],
        justifyMap[justify],
        className
      )}
    >
      {children}
    </div>
  );
}

interface DynamicStackProps {
  children: ReactNode;
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function DynamicStack({ children, gap = 'md', className }: DynamicStackProps) {
  const spacingMap = {
    sm: 'space-y-2 sm:space-y-3',
    md: 'space-y-3 sm:space-y-4 lg:space-y-5',
    lg: 'space-y-4 sm:space-y-5 lg:space-y-6',
    xl: 'space-y-5 sm:space-y-6 lg:space-y-8',
  };

  return (
    <div className={cn(spacingMap[gap], className)}>
      {children}
    </div>
  );
}

interface ResponsiveColumnsProps {
  children: ReactNode;
  cols?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number };
  gap?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function ResponsiveColumns({
  children,
  cols = { xs: 1, sm: 2, md: 2, lg: 3, xl: 4 },
  gap = 'md',
  className,
}: ResponsiveColumnsProps) {
  const getGridClass = () => {
    const classes = [];
    if (cols.xs) classes.push(`grid-cols-${cols.xs}`);
    if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`);
    if (cols.md) classes.push(`md:grid-cols-${cols.md}`);
    if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`);
    if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`);
    return classes.join(' ');
  };

  return (
    <div className={cn('grid', getGridClass(), gapSizes[gap], className)}>
      {children}
    </div>
  );
}
