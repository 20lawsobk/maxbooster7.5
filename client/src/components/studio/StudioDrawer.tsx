import { ReactNode, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface StudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  position: 'left' | 'right' | 'bottom';
  size?: number;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function StudioDrawer({
  isOpen,
  onClose,
  position,
  size,
  title,
  children,
  className,
}: StudioDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const startTouchRef = useRef<{ x: number; y: number } | null>(null);
  const currentTouchRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    startTouchRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    currentTouchRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!startTouchRef.current || !currentTouchRef.current) return;

    const deltaX = currentTouchRef.current.x - startTouchRef.current.x;
    const deltaY = currentTouchRef.current.y - startTouchRef.current.y;
    const threshold = 80;

    if (position === 'left' && deltaX < -threshold) {
      onClose();
    } else if (position === 'right' && deltaX > threshold) {
      onClose();
    } else if (position === 'bottom' && deltaY > threshold) {
      onClose();
    }

    startTouchRef.current = null;
    currentTouchRef.current = null;
  }, [position, onClose]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer || !isOpen) return;

    drawer.addEventListener('touchstart', handleTouchStart, { passive: true });
    drawer.addEventListener('touchmove', handleTouchMove, { passive: true });
    drawer.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      drawer.removeEventListener('touchstart', handleTouchStart);
      drawer.removeEventListener('touchmove', handleTouchMove);
      drawer.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen, handleTouchStart, handleTouchMove, handleTouchEnd]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const getDrawerStyles = () => {
    const defaultSize = position === 'bottom' ? 320 : 280;
    const actualSize = size || defaultSize;
    
    const base = {
      background: studioOneTheme.colors.bg.panel,
      borderColor: studioOneTheme.colors.border.primary,
      transition: 'transform 0.3s ease-out',
    };

    switch (position) {
      case 'left':
        return {
          ...base,
          top: 0,
          left: 0,
          bottom: 0,
          width: actualSize,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          borderRightWidth: 1,
        };
      case 'right':
        return {
          ...base,
          top: 0,
          right: 0,
          bottom: 0,
          width: actualSize,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          borderLeftWidth: 1,
        };
      case 'bottom':
        return {
          ...base,
          left: 0,
          right: 0,
          bottom: 0,
          height: actualSize,
          maxHeight: '80vh',
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
          borderTopWidth: 1,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
        };
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 touch-none"
          onClick={onClose}
          style={{ backdropFilter: 'blur(2px)' }}
        />
      )}
      
      <div
        ref={drawerRef}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden',
          className
        )}
        style={getDrawerStyles()}
      >
        {title && (
          <div
            className="flex items-center justify-between px-4 shrink-0"
            style={{
              height: 48,
              borderBottom: `1px solid ${studioOneTheme.colors.border.primary}`,
              background: studioOneTheme.colors.bg.secondary,
            }}
          >
            <span
              className="font-medium text-sm"
              style={{ color: studioOneTheme.colors.text.primary }}
            >
              {title}
            </span>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 transition-colors touch-manipulation"
              style={{ color: studioOneTheme.colors.text.secondary }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {position === 'bottom' && !title && (
          <div
            className="flex justify-center py-2 shrink-0"
            style={{ background: studioOneTheme.colors.bg.secondary }}
          >
            <div
              className="w-10 h-1 rounded-full"
              style={{ background: studioOneTheme.colors.text.muted }}
            />
          </div>
        )}
        
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </>
  );
}

interface DrawerTriggerButtonProps {
  onClick: () => void;
  icon: ReactNode;
  label: string;
  active?: boolean;
  className?: string;
}

export function DrawerTriggerButton({
  onClick,
  icon,
  label,
  active,
  className,
}: DrawerTriggerButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 p-2 rounded-lg transition-all touch-manipulation',
        active ? 'bg-blue-500/20' : 'hover:bg-white/10 active:bg-white/20',
        className
      )}
      style={{
        minWidth: 44,
        minHeight: 44,
        color: active ? studioOneTheme.colors.accent.blue : studioOneTheme.colors.text.secondary,
      }}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
