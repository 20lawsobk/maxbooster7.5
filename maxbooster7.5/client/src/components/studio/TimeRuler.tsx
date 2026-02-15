import { useCallback, useMemo, useRef } from 'react';
import { useStudioStore } from '@/lib/studioStore';

interface TimeRulerProps {
  duration: number;
  tempo: number;
  timeSignature: string;
  loopEnabled: boolean;
  loopStart: number;
  loopEnd: number;
  onTimelineClick: (time: number) => void;
}

/**
 * TODO: Add function documentation
 */
export function TimeRuler({
  duration,
  tempo,
  timeSignature,
  loopEnabled,
  loopStart,
  loopEnd,
  onTimelineClick,
}: TimeRulerProps) {
  const { currentTime, zoom, snapEnabled, snapResolution } = useStudioStore();
  const rulerRef = useRef<HTMLDivElement>(null);

  const [numerator, denominator] = timeSignature.split('/').map(Number);

  // Calculate visible time range based on zoom
  const visibleDuration = duration / zoom;

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const beatDuration = 60 / tempo;
    const barDuration = beatDuration * numerator;

    // Determine marker interval based on zoom level
    let interval: number;
    if (zoom >= 4) {
      interval = beatDuration / 4; // Show 1/16 notes at high zoom
    } else if (zoom >= 2) {
      interval = beatDuration; // Show beats at medium zoom
    } else {
      interval = barDuration; // Show bars at low zoom
    }

    const markers: Array<{ time: number; isBar: boolean; isBeat: boolean; label: string }> = [];
    let time = 0;
    let barCount = 1;
    let beatCount = 1;

    while (time <= visibleDuration) {
      const isBar = time % barDuration < 0.001;
      const isBeat = time % beatDuration < 0.001;

      markers.push({
        time,
        isBar,
        isBeat,
        label: isBar ? barCount.toString() : isBeat ? beatCount.toString() : '',
      });

      if (isBar) {
        barCount++;
        beatCount = 1;
      } else if (isBeat) {
        beatCount++;
      }

      time += interval;
    }

    return markers;
  }, [tempo, numerator, zoom, visibleDuration]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!rulerRef.current) return;

      const rect = rulerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let clickTime = (x / rect.width) * visibleDuration;

      // Apply snap if enabled
      if (snapEnabled) {
        clickTime = Math.round(clickTime / snapResolution) * snapResolution;
      }

      onTimelineClick(Math.max(0, Math.min(clickTime, duration)));
    },
    [visibleDuration, snapEnabled, snapResolution, duration, onTimelineClick]
  );

  return (
    <div
      ref={rulerRef}
      className="h-10 border-b relative cursor-pointer select-none"
      style={{
        borderColor: 'var(--studio-border)',
        backgroundColor: 'var(--studio-bg-medium)',
      }}
      onClick={handleClick}
    >
      {/* Grid Markers */}
      <div className="absolute inset-0 flex">
        {timeMarkers.map((marker, index) => {
          const position = (marker.time / visibleDuration) * 100;

          return (
            <div
              key={index}
              className="absolute top-0 bottom-0"
              style={{
                left: `${position}%`,
                borderLeft: marker.isBar
                  ? '2px solid var(--studio-border)'
                  : marker.isBeat
                    ? '1px solid var(--studio-border-subtle)'
                    : '1px solid var(--studio-bg-deep)',
              }}
            >
              {marker.label && (
                <div
                  className={`pl-1 pt-1 text-xs ${marker.isBar ? 'font-semibold' : 'font-normal'}`}
                  style={{
                    color: marker.isBar ? 'var(--studio-text)' : 'var(--studio-text-muted)',
                  }}
                >
                  {marker.label}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Loop Region */}
      {loopEnabled && (
        <div
          className="absolute top-0 bottom-0 bg-blue-500/20 border-l-2 border-r-2 border-blue-500 pointer-events-none"
          style={{
            left: `${(loopStart / visibleDuration) * 100}%`,
            width: `${((loopEnd - loopStart) / visibleDuration) * 100}%`,
          }}
        >
          <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] px-1 font-semibold">
            LOOP
          </div>
        </div>
      )}

      {/* Playhead */}
      {visibleDuration > 0 && currentTime <= visibleDuration && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
          style={{
            left: `${(currentTime / visibleDuration) * 100}%`,
          }}
        >
          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rotate-45" />
        </div>
      )}

      {/* Snap Indicator */}
      {snapEnabled && (
        <div className="absolute bottom-0 right-0 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-tl font-mono">
          {snapResolution < 1 ? `1/${Math.round(1 / snapResolution)}` : `${snapResolution}s`}
        </div>
      )}
    </div>
  );
}
