import { ReactNode } from 'react';
import { useAppLayout } from './AppLayout';

interface FluidGridProps {
  children: ReactNode;
  cols?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    wide?: number;
  };
  className?: string;
}

export function FluidGrid({ 
  children, 
  cols = { mobile: 1, tablet: 2, desktop: 3, wide: 4 },
  className = '' 
}: FluidGridProps) {
  const { layoutMode } = useAppLayout();
  
  const getGridCols = () => {
    switch (layoutMode) {
      case 'mobile': return cols.mobile || 1;
      case 'tablet': return cols.tablet || 2;
      case 'desktop': return cols.desktop || 3;
      case 'wide': return cols.wide || 4;
    }
  };

  const gridCols = getGridCols();
  
  return (
    <div 
      className={`grid ${className}`}
      style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gap: layoutMode === 'mobile' ? '0.75rem' : layoutMode === 'tablet' ? '1rem' : '1.25rem',
      }}
    >
      {children}
    </div>
  );
}

interface FluidStackProps {
  children: ReactNode;
  className?: string;
  horizontal?: boolean;
}

export function FluidStack({ children, className = '', horizontal = false }: FluidStackProps) {
  const { layoutMode } = useAppLayout();
  
  const getGap = () => {
    switch (layoutMode) {
      case 'mobile': return '0.5rem';
      case 'tablet': return '0.75rem';
      case 'desktop': return '1rem';
      case 'wide': return '1.25rem';
    }
  };

  return (
    <div 
      className={`flex ${horizontal ? 'flex-row flex-wrap' : 'flex-col'} ${className}`}
      style={{ gap: getGap() }}
    >
      {children}
    </div>
  );
}

interface FluidCardGridProps {
  children: ReactNode;
  minCardWidth?: number;
  className?: string;
}

export function FluidCardGrid({ children, minCardWidth = 280, className = '' }: FluidCardGridProps) {
  const { layoutMode, containerWidth } = useAppLayout();
  
  const adjustedMinWidth = layoutMode === 'mobile' 
    ? Math.min(minCardWidth, containerWidth - 24) 
    : minCardWidth;
  
  return (
    <div 
      className={`grid ${className}`}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${adjustedMinWidth}px, 1fr))`,
        gap: layoutMode === 'mobile' ? '0.75rem' : layoutMode === 'tablet' ? '1rem' : '1.25rem',
      }}
    >
      {children}
    </div>
  );
}

interface ResponsiveTextProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
}

export function ResponsiveText({ 
  children, 
  as: Component = 'p', 
  size = 'base',
  className = '' 
}: ResponsiveTextProps) {
  const { layoutMode } = useAppLayout();
  
  const sizeMap: Record<typeof size, Record<typeof layoutMode, string>> = {
    'xs': { mobile: 'text-[10px]', tablet: 'text-xs', desktop: 'text-xs', wide: 'text-xs' },
    'sm': { mobile: 'text-xs', tablet: 'text-sm', desktop: 'text-sm', wide: 'text-sm' },
    'base': { mobile: 'text-sm', tablet: 'text-base', desktop: 'text-base', wide: 'text-base' },
    'lg': { mobile: 'text-base', tablet: 'text-lg', desktop: 'text-lg', wide: 'text-xl' },
    'xl': { mobile: 'text-lg', tablet: 'text-xl', desktop: 'text-xl', wide: 'text-2xl' },
    '2xl': { mobile: 'text-xl', tablet: 'text-2xl', desktop: 'text-2xl', wide: 'text-3xl' },
    '3xl': { mobile: 'text-2xl', tablet: 'text-3xl', desktop: 'text-3xl', wide: 'text-4xl' },
  };

  return (
    <Component className={`${sizeMap[size][layoutMode]} ${className}`}>
      {children}
    </Component>
  );
}
