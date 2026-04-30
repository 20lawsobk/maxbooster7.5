import { useRef, useState, useCallback, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface ResponsiveTimelineProps {
  children: ReactNode;
  zoomLevel: number;
  scrollX: number;
  scrollY: number;
  onZoomChange: (zoom: number) => void;
  onScrollChange: (x: number, y: number) => void;
  totalBars?: number;
  bpm?: number;
  pixelsPerBar?: number;
  className?: string;
}

const TRACK_HEIGHT = 80;

export function ResponsiveTimeline({
  children,
  zoomLevel,
  scrollX,
  scrollY,
  onZoomChange,
  onScrollChange,
  totalBars = 100,
  bpm = 120,
  pixelsPerBar = 100,
  className,
}: ResponsiveTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchZoomEnabled = false;
  
  const [isPinching, setIsPinching] = useState(false);
  const [initialPinchDistance, setInitialPinchDistance] = useState(0);
  const [initialZoom, setInitialZoom] = useState(zoomLevel);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  const getPinchDistance = useCallback((touches: TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchZoomEnabled) {
      setIsPinching(true);
      setInitialPinchDistance(getPinchDistance(e.touches));
      setInitialZoom(zoomLevel);
    } else if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      setScrollStart({ x: scrollX, y: scrollY });
    }
  }, [pinchZoomEnabled, getPinchDistance, zoomLevel, scrollX, scrollY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPinching && e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getPinchDistance(e.touches);
      const scale = currentDistance / initialPinchDistance;
      const newZoom = Math.min(5, Math.max(0.25, initialZoom * scale));
      onZoomChange(newZoom);
    } else if (isDragging && e.touches.length === 1) {
      const dx = dragStart.x - e.touches[0].clientX;
      const dy = dragStart.y - e.touches[0].clientY;
      onScrollChange(
        Math.max(0, scrollStart.x + dx),
        Math.max(0, scrollStart.y + dy)
      );
    }
  }, [isPinching, isDragging, getPinchDistance, initialPinchDistance, initialZoom, dragStart, scrollStart, onZoomChange, onScrollChange]);

  const handleTouchEnd = useCallback(() => {
    setIsPinching(false);
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.min(5, Math.max(0.25, zoomLevel * delta));
      onZoomChange(newZoom);
    } else {
      onScrollChange(
        Math.max(0, scrollX + e.deltaX),
        Math.max(0, scrollY + e.deltaY)
      );
    }
  }, [zoomLevel, scrollX, scrollY, onZoomChange, onScrollChange]);

  const trackHeight = TRACK_HEIGHT;
  const effectivePixelsPerBar = pixelsPerBar * zoomLevel;

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden touch-none', className)}
      style={{ background: studioOneTheme.colors.bg.deep }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onWheel={handleWheel}
    >
      <TimelineRuler
        zoomLevel={zoomLevel}
        scrollX={scrollX}
        totalBars={totalBars}
        bpm={bpm}
        pixelsPerBar={effectivePixelsPerBar}
      />
      
      <div
        className="relative"
        style={{
          transform: `translate(${-scrollX}px, ${-scrollY}px)`,
        }}
      >
        {children}
      </div>
      
    </div>
  );
}

interface TimelineRulerProps {
  zoomLevel: number;
  scrollX: number;
  totalBars: number;
  bpm: number;
  pixelsPerBar: number;
}

function TimelineRuler({
  zoomLevel,
  scrollX,
  totalBars,
  bpm,
  pixelsPerBar,
}: TimelineRulerProps) {
  const rulerHeight = 20;
  
  const bars = [];
  const visibleBars = Math.ceil(1200 / pixelsPerBar) + 2;
  const startBar = Math.floor(scrollX / pixelsPerBar);
  
  for (let i = startBar; i < Math.min(startBar + visibleBars, totalBars); i++) {
    const x = i * pixelsPerBar - scrollX;
    bars.push(
      <div
        key={i}
        className="absolute flex flex-col items-start"
        style={{ left: x }}
      >
        <div
          className="h-full w-px"
          style={{ background: studioOneTheme.colors.border.primary }}
        />
        <span
          className="absolute top-1 text-[10px] font-mono"
          style={{ color: studioOneTheme.colors.text.muted }}
        >
          {i + 1}
        </span>
      </div>
    );
  }

  return (
    <div
      className="sticky top-0 z-10 border-b"
      style={{
        height: rulerHeight,
        background: studioOneTheme.colors.bg.tertiary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      {bars}
    </div>
  );
}

interface ResponsiveTrackRowProps {
  id: string;
  name: string;
  color: string;
  selected?: boolean;
  mute?: boolean;
  solo?: boolean;
  armed?: boolean;
  onSelect: () => void;
  onMuteToggle?: () => void;
  onSoloToggle?: () => void;
  onArmedToggle?: () => void;
  children?: ReactNode;
  className?: string;
}

export function ResponsiveTrackRow({
  id,
  name,
  color,
  selected,
  mute,
  solo,
  armed,
  onSelect,
  onMuteToggle,
  onSoloToggle,
  onArmedToggle,
  children,
  className,
}: ResponsiveTrackRowProps) {
  const trackHeight = TRACK_HEIGHT;
  const touchSize = 44;

  return (
    <div
      className={cn(
        'flex border-b transition-colors',
        selected && 'ring-1 ring-inset ring-blue-500/50',
        className
      )}
      style={{
        height: trackHeight,
        background: selected ? studioOneTheme.colors.bg.tertiary : studioOneTheme.colors.bg.secondary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
      onClick={onSelect}
    >
      <div
        className="shrink-0 flex items-center gap-1 px-2 border-r"
        style={{
          width: 150,
          borderColor: studioOneTheme.colors.border.primary,
          borderLeft: `3px solid ${color}`,
        }}
      >
        <span
          className="flex-1 text-xs font-medium truncate"
          style={{ color: studioOneTheme.colors.text.primary }}
        >
          {name}
        </span>
        
        <div className="flex gap-0.5">
            <button
              onClick={(e) => { e.stopPropagation(); onMuteToggle?.(); }}
              className={cn(
                'rounded text-[10px] font-bold touch-manipulation',
                mute ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'
              )}
              style={{
                width: touchSize * 0.7,
                height: touchSize * 0.7,
                color: mute ? undefined : studioOneTheme.colors.text.secondary,
              }}
            >
              M
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSoloToggle?.(); }}
              className={cn(
                'rounded text-[10px] font-bold touch-manipulation',
                solo ? 'bg-yellow-500 text-black' : 'bg-white/10 hover:bg-white/20'
              )}
              style={{
                width: touchSize * 0.7,
                height: touchSize * 0.7,
                color: solo ? undefined : studioOneTheme.colors.text.secondary,
              }}
            >
              S
            </button>
          </div>
      </div>
      
      <div className="flex-1 relative overflow-hidden">
        {children}
      </div>
    </div>
  );
}
