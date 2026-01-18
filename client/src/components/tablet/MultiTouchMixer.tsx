import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { triggerHapticFeedback } from '@/hooks/useTouchGestures';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Music, VolumeX, Headphones, Mic } from 'lucide-react';

interface Track {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
}

interface TouchPoint {
  id: number;
  trackId: string;
  startY: number;
  startValue: number;
  type: 'fader' | 'pan';
}

interface MultiTouchMixerProps {
  tracks: Track[];
  onVolumeChange: (trackId: string, volume: number) => void;
  onPanChange: (trackId: string, pan: number) => void;
  onMute: (trackId: string) => void;
  onSolo: (trackId: string) => void;
  onArm: (trackId: string) => void;
  className?: string;
  compact?: boolean;
}

const TouchFader = memo(function TouchFader({
  trackId,
  value,
  color,
  isActive,
  onStart,
  onMove,
  onEnd,
  height = 160,
}: {
  trackId: string;
  value: number;
  color: string;
  isActive: boolean;
  onStart: (trackId: string, y: number, startValue: number) => void;
  onMove: (y: number) => void;
  onEnd: () => void;
  height?: number;
}) {
  const faderRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    onStart(trackId, touch.clientY, value);
    triggerHapticFeedback('light');
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isActive) return;
    const touch = e.touches[0];
    onMove(touch.clientY);
  };

  const handleTouchEnd = () => {
    onEnd();
    triggerHapticFeedback('light');
  };

  const fillHeight = (value / 100) * height;

  return (
    <div
      ref={faderRef}
      className={cn(
        'relative w-6 rounded-full bg-muted overflow-hidden cursor-pointer touch-none',
        isActive && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{ height }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-75 rounded-full"
        style={{
          height: fillHeight,
          backgroundColor: color,
          opacity: isActive ? 1 : 0.8,
        }}
      />
      <div
        className={cn(
          'absolute left-1/2 -translate-x-1/2 w-8 h-5 rounded-sm shadow-md transition-all',
          'bg-white border-2 flex items-center justify-center'
        )}
        style={{
          bottom: fillHeight - 10,
          borderColor: color,
        }}
      >
        <div
          className="w-4 h-0.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
});

const TouchPanKnob = memo(function TouchPanKnob({
  trackId,
  value,
  color,
  isActive,
  onStart,
  onMove,
  onEnd,
}: {
  trackId: string;
  value: number;
  color: string;
  isActive: boolean;
  onStart: (trackId: string, y: number, startValue: number) => void;
  onMove: (y: number) => void;
  onEnd: () => void;
}) {
  const knobRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    const touch = e.touches[0];
    onStart(trackId, touch.clientY, value);
    triggerHapticFeedback('light');
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isActive) return;
    const touch = e.touches[0];
    onMove(touch.clientY);
  };

  const handleTouchEnd = () => {
    onEnd();
    triggerHapticFeedback('light');
  };

  const rotation = (value / 100) * 270 - 135;
  const displayValue = Math.round((value - 50) * 2);
  const displayLabel = displayValue === 0 ? 'C' : displayValue > 0 ? `R${displayValue}` : `L${Math.abs(displayValue)}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={knobRef}
        className={cn(
          'w-10 h-10 rounded-full border-2 relative cursor-pointer touch-none',
          'bg-gradient-to-b from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800',
          isActive && 'ring-2 ring-primary ring-offset-1'
        )}
        style={{ borderColor: color }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="absolute top-1 left-1/2 w-1 h-3 rounded-full -translate-x-1/2 origin-bottom"
          style={{
            transform: `translateX(-50%) rotate(${rotation}deg)`,
            backgroundColor: color,
            transformOrigin: 'bottom center',
          }}
        />
        <div
          className="absolute inset-2 rounded-full"
          style={{ backgroundColor: `${color}20` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{displayLabel}</span>
    </div>
  );
});

export function MultiTouchMixer({
  tracks,
  onVolumeChange,
  onPanChange,
  onMute,
  onSolo,
  onArm,
  className,
  compact = false,
}: MultiTouchMixerProps) {
  const [activeTouches, setActiveTouches] = useState<Map<string, TouchPoint>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFaderStart = useCallback((trackId: string, y: number, startValue: number) => {
    setActiveTouches((prev) => {
      const next = new Map(prev);
      next.set(`fader-${trackId}`, {
        id: Date.now(),
        trackId,
        startY: y,
        startValue,
        type: 'fader',
      });
      return next;
    });
  }, []);

  const handleFaderMove = useCallback((trackId: string, currentY: number) => {
    const touchKey = `fader-${trackId}`;
    const touchPoint = activeTouches.get(touchKey);
    if (!touchPoint) return;

    const deltaY = touchPoint.startY - currentY;
    const sensitivity = 0.5;
    const newValue = Math.max(0, Math.min(100, touchPoint.startValue + deltaY * sensitivity));
    onVolumeChange(trackId, Math.round(newValue));
  }, [activeTouches, onVolumeChange]);

  const handleFaderEnd = useCallback((trackId: string) => {
    setActiveTouches((prev) => {
      const next = new Map(prev);
      next.delete(`fader-${trackId}`);
      return next;
    });
  }, []);

  const handlePanStart = useCallback((trackId: string, y: number, startValue: number) => {
    setActiveTouches((prev) => {
      const next = new Map(prev);
      next.set(`pan-${trackId}`, {
        id: Date.now(),
        trackId,
        startY: y,
        startValue,
        type: 'pan',
      });
      return next;
    });
  }, []);

  const handlePanMove = useCallback((trackId: string, currentY: number) => {
    const touchKey = `pan-${trackId}`;
    const touchPoint = activeTouches.get(touchKey);
    if (!touchPoint) return;

    const deltaY = touchPoint.startY - currentY;
    const sensitivity = 0.3;
    const newValue = Math.max(0, Math.min(100, touchPoint.startValue + deltaY * sensitivity));
    onPanChange(trackId, Math.round(newValue));
  }, [activeTouches, onPanChange]);

  const handlePanEnd = useCallback((trackId: string) => {
    setActiveTouches((prev) => {
      const next = new Map(prev);
      next.delete(`pan-${trackId}`);
      return next;
    });
  }, []);

  const handleButtonClick = useCallback((action: () => void) => {
    triggerHapticFeedback('medium');
    action();
  }, []);

  const faderHeight = compact ? 120 : 160;

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex gap-2 p-4 bg-card rounded-xl overflow-x-auto',
        className
      )}
    >
      {tracks.map((track) => {
        const isFaderActive = activeTouches.has(`fader-${track.id}`);
        const isPanActive = activeTouches.has(`pan-${track.id}`);

        return (
          <div
            key={track.id}
            className={cn(
              'flex flex-col items-center gap-3 p-3 rounded-lg bg-muted/30 min-w-[80px]',
              (isFaderActive || isPanActive) && 'bg-muted/50'
            )}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: `${track.color}30` }}
            >
              <Music className="w-4 h-4" style={{ color: track.color }} />
            </div>

            <span className="text-xs font-medium text-center truncate w-full">
              {track.name}
            </span>

            {!compact && (
              <TouchPanKnob
                trackId={track.id}
                value={track.pan + 50}
                color={track.color}
                isActive={isPanActive}
                onStart={handlePanStart}
                onMove={(y) => handlePanMove(track.id, y)}
                onEnd={() => handlePanEnd(track.id)}
              />
            )}

            <TouchFader
              trackId={track.id}
              value={track.volume}
              color={track.color}
              isActive={isFaderActive}
              onStart={handleFaderStart}
              onMove={(y) => handleFaderMove(track.id, y)}
              onEnd={() => handleFaderEnd(track.id)}
              height={faderHeight}
            />

            <span className="text-[10px] text-muted-foreground font-mono">
              {track.volume}%
            </span>

            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => handleButtonClick(() => onMute(track.id))}
                className={cn(
                  'w-8 h-8 rounded text-xs font-bold transition-colors touch-manipulation',
                  track.mute ? 'bg-yellow-500 text-white' : 'bg-muted hover:bg-muted/80'
                )}
              >
                M
              </button>
              <button
                type="button"
                onClick={() => handleButtonClick(() => onSolo(track.id))}
                className={cn(
                  'w-8 h-8 rounded text-xs font-bold transition-colors touch-manipulation',
                  track.solo ? 'bg-blue-500 text-white' : 'bg-muted hover:bg-muted/80'
                )}
              >
                S
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleButtonClick(() => onArm(track.id))}
              className={cn(
                'w-full h-8 rounded flex items-center justify-center gap-1 text-xs font-medium transition-colors touch-manipulation',
                track.armed ? 'bg-red-500 text-white animate-pulse' : 'bg-muted hover:bg-muted/80'
              )}
            >
              <Mic className="w-3 h-3" />
              {track.armed ? 'REC' : 'ARM'}
            </button>
          </div>
        );
      })}

      <div className="flex-shrink-0 w-px bg-border mx-2" />

      <div className="flex flex-col items-center gap-3 p-3 rounded-lg bg-primary/10 min-w-[80px]">
        <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center">
          <Headphones className="w-4 h-4 text-primary" />
        </div>
        <span className="text-xs font-medium text-center">Master</span>
        <TouchFader
          trackId="master"
          value={80}
          color="hsl(var(--primary))"
          isActive={activeTouches.has('fader-master')}
          onStart={handleFaderStart}
          onMove={(y) => handleFaderMove('master', y)}
          onEnd={() => handleFaderEnd('master')}
          height={faderHeight}
        />
        <span className="text-[10px] text-muted-foreground font-mono">80%</span>
      </div>

      {activeTouches.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-full text-xs font-medium shadow-lg z-50">
          {activeTouches.size} active touch{activeTouches.size > 1 ? 'es' : ''}
        </div>
      )}
    </div>
  );
}

export function MiniMixer({
  tracks,
  onVolumeChange,
  onMute,
  onSolo,
}: Pick<MultiTouchMixerProps, 'tracks' | 'onVolumeChange' | 'onMute' | 'onSolo'>) {
  return (
    <div className="flex gap-2 p-2 bg-card/50 rounded-lg overflow-x-auto">
      {tracks.map((track) => (
        <div
          key={track.id}
          className="flex items-center gap-2 p-2 rounded bg-muted/30 min-w-[120px]"
        >
          <div
            className="w-6 h-6 rounded-full flex-shrink-0"
            style={{ backgroundColor: track.color }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{track.name}</p>
            <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${track.volume}%`,
                  backgroundColor: track.color,
                }}
              />
            </div>
          </div>
          <div className="flex gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                onMute(track.id);
              }}
              className={cn(
                'w-6 h-6 rounded text-[10px] font-bold touch-manipulation',
                track.mute ? 'bg-yellow-500 text-white' : 'bg-muted'
              )}
            >
              M
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHapticFeedback('light');
                onSolo(track.id);
              }}
              className={cn(
                'w-6 h-6 rounded text-[10px] font-bold touch-manipulation',
                track.solo ? 'bg-blue-500 text-white' : 'bg-muted'
              )}
            >
              S
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
