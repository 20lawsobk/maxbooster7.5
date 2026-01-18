import { ReactNode, useRef } from 'react';
import { MobileNavigation, MobileNavigationSpacer } from './MobileNavigation';
import { TopBar } from './TopBar';
import { useIsMobile, useOrientation } from '@/hooks/use-mobile';
import { useSwipeGesture, triggerHapticFeedback } from '@/hooks/useTouchGestures';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils';

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  showNavigation?: boolean;
  enableSwipeNavigation?: boolean;
  noPadding?: boolean;
  className?: string;
}

const navigationOrder = [
  '/dashboard',
  '/studio',
  '/distribution',
  '/marketplace',
  '/settings',
];

export function MobileLayout({
  children,
  title,
  subtitle,
  showNavigation = true,
  enableSwipeNavigation = true,
  noPadding = false,
  className,
}: MobileLayoutProps) {
  const isMobile = useIsMobile();
  const orientation = useOrientation();
  const [location, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const currentIndex = navigationOrder.findIndex(
    (path) => location === path || location.startsWith(path + '/')
  );

  useSwipeGesture(containerRef, {
    onSwipeLeft: () => {
      if (!enableSwipeNavigation || !isMobile) return;
      if (currentIndex < navigationOrder.length - 1 && currentIndex >= 0) {
        setLocation(navigationOrder[currentIndex + 1]);
        triggerHapticFeedback('light');
      }
    },
    onSwipeRight: () => {
      if (!enableSwipeNavigation || !isMobile) return;
      if (currentIndex > 0) {
        setLocation(navigationOrder[currentIndex - 1]);
        triggerHapticFeedback('light');
      }
    },
  });

  if (!isMobile) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col min-h-[100dvh] bg-background',
        orientation === 'landscape' && 'landscape-mode',
        className
      )}
      data-orientation={orientation}
    >
      <TopBar title={title} subtitle={subtitle} onMenuClick={() => {}} />

      <main
        className={cn(
          'flex-1 overflow-y-auto overscroll-contain',
          !noPadding && 'p-4',
          orientation === 'landscape' && 'pb-2'
        )}
        style={{
          paddingBottom: showNavigation ? 'calc(56px + env(safe-area-inset-bottom))' : undefined,
        }}
      >
        {children}
      </main>

      {showNavigation && <MobileNavigation />}
    </div>
  );
}

interface MobileTouchTargetProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function MobileTouchTarget({
  children,
  className,
  onClick,
  disabled,
}: MobileTouchTargetProps) {
  const handleClick = () => {
    if (!disabled && onClick) {
      triggerHapticFeedback('light');
      onClick();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation',
        'active:scale-95 transition-transform duration-100',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  className,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const toggle = () => {
    setIsOpen(!isOpen);
    triggerHapticFeedback('light');
  };

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between p-4 bg-muted/50 min-h-[44px] touch-manipulation"
      >
        <span className="font-medium">{title}</span>
        <svg
          className={cn(
            'w-5 h-5 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={cn(
          'transition-all duration-200 overflow-hidden',
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

import { useState } from 'react';
