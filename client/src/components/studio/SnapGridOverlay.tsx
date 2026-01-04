import { useMemo } from 'react';
import { useStudioStore } from '@/lib/studioStore';

interface SnapGridOverlayProps {
  width: number;
  height: number;
  duration: number;
  tempo: number;
  timeSignature: string;
  showBeatLines?: boolean;
  showBarLines?: boolean;
  showSubdivisions?: boolean;
}

export function SnapGridOverlay({
  width,
  height,
  duration,
  tempo,
  timeSignature,
  showBeatLines = true,
  showBarLines = true,
  showSubdivisions = true,
}: SnapGridOverlayProps) {
  const { zoom, snapEnabled, snapResolution } = useStudioStore();

  const gridLines = useMemo(() => {
    const lines: {
      type: 'bar' | 'beat' | 'subdivision';
      position: number;
      label?: string;
    }[] = [];

    const [numerator] = timeSignature.split('/').map(Number);
    const beatsPerBar = numerator || 4;
    const beatDuration = 60 / tempo;
    const barDuration = beatDuration * beatsPerBar;

    const pixelsPerSecond = (width / duration) * zoom;
    const totalBars = Math.ceil(duration / barDuration);

    for (let bar = 0; bar <= totalBars; bar++) {
      const barTime = bar * barDuration;
      if (barTime > duration) break;

      const barPosition = barTime * pixelsPerSecond;
      
      if (showBarLines) {
        lines.push({
          type: 'bar',
          position: barPosition,
          label: `${bar + 1}`,
        });
      }

      if (showBeatLines) {
        for (let beat = 1; beat < beatsPerBar; beat++) {
          const beatTime = barTime + beat * beatDuration;
          if (beatTime > duration) break;
          
          const beatPosition = beatTime * pixelsPerSecond;
          lines.push({
            type: 'beat',
            position: beatPosition,
          });
        }
      }

      if (showSubdivisions && snapEnabled && snapResolution < 1) {
        const getSubdivisionCount = (resolution: number): number => {
          const denominators = [
            { value: 1/2, count: 2 },
            { value: 2/3, count: 3 },
            { value: 1/3, count: 3 },
            { value: 1/4, count: 4 },
            { value: 1/6, count: 6 },
            { value: 1/8, count: 8 },
            { value: 1/12, count: 12 },
            { value: 1/16, count: 16 },
            { value: 1/24, count: 24 },
            { value: 1/32, count: 32 },
            { value: 3/4, count: 4 },
            { value: 3/8, count: 8 },
          ];
          
          for (const d of denominators) {
            if (Math.abs(resolution - d.value) < 0.01) {
              return d.count;
            }
          }
          
          const calculated = 1 / resolution;
          if (calculated >= 2 && calculated <= 64) {
            return Math.round(calculated);
          }
          
          return 4;
        };
        
        const subdivisionsPerBeat = getSubdivisionCount(snapResolution);
        const subdivisionDuration = beatDuration / subdivisionsPerBeat;

        for (let beat = 0; beat < beatsPerBar; beat++) {
          for (let sub = 1; sub < subdivisionsPerBeat; sub++) {
            const subTime = barTime + beat * beatDuration + sub * subdivisionDuration;
            if (subTime > duration) break;

            const subPosition = subTime * pixelsPerSecond;
            
            lines.push({
              type: 'subdivision',
              position: subPosition,
            });
          }
        }
      }
    }

    return lines;
  }, [width, height, duration, tempo, timeSignature, zoom, snapEnabled, snapResolution, showBeatLines, showBarLines, showSubdivisions]);

  const getLineStyle = (type: 'bar' | 'beat' | 'subdivision') => {
    switch (type) {
      case 'bar':
        return {
          background: 'rgba(255, 255, 255, 0.2)',
          width: 1,
        };
      case 'beat':
        return {
          background: 'rgba(255, 255, 255, 0.1)',
          width: 1,
        };
      case 'subdivision':
        return {
          background: 'rgba(255, 255, 255, 0.05)',
          width: 1,
        };
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {gridLines.map((line, index) => {
        const style = getLineStyle(line.type);
        return (
          <div
            key={`${line.type}-${index}`}
            className="absolute top-0 bottom-0"
            style={{
              left: line.position,
              width: style.width,
              background: style.background,
            }}
          >
            {line.label && (
              <span
                className="absolute top-0 left-1 text-[9px] font-mono"
                style={{ color: 'rgba(255, 255, 255, 0.3)' }}
              >
                {line.label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PlayheadProps {
  position: number;
  height: number;
  pixelsPerSecond: number;
}

export function Playhead({ position, height, pixelsPerSecond }: PlayheadProps) {
  const xPosition = position * pixelsPerSecond;

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-20"
      style={{ left: xPosition }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '8px solid #ef4444',
        }}
      />
      <div
        className="absolute top-2 w-[2px] -translate-x-1/2"
        style={{
          height: height - 8,
          background: '#ef4444',
          boxShadow: '0 0 8px rgba(239, 68, 68, 0.5)',
        }}
      />
    </div>
  );
}

interface LoopRegionProps {
  startTime: number;
  endTime: number;
  height: number;
  pixelsPerSecond: number;
  enabled: boolean;
}

export function LoopRegion({ startTime, endTime, height, pixelsPerSecond, enabled }: LoopRegionProps) {
  if (!enabled) return null;

  const left = startTime * pixelsPerSecond;
  const width = (endTime - startTime) * pixelsPerSecond;

  return (
    <div
      className="absolute top-0 pointer-events-none"
      style={{
        left,
        width,
        height,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(59, 130, 246, 0.1)',
          borderLeft: '2px solid rgba(59, 130, 246, 0.6)',
          borderRight: '2px solid rgba(59, 130, 246, 0.6)',
        }}
      />
      
      <div
        className="absolute top-0 left-0 right-0 h-3"
        style={{
          background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.4), rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.4))',
        }}
      />
      
      <div
        className="absolute left-1 top-0.5 text-[8px] font-bold uppercase"
        style={{ color: 'rgba(59, 130, 246, 0.8)' }}
      >
        Loop
      </div>
    </div>
  );
}

interface SelectionRegionProps {
  startTime: number;
  endTime: number;
  height: number;
  pixelsPerSecond: number;
}

export function SelectionRegion({ startTime, endTime, height, pixelsPerSecond }: SelectionRegionProps) {
  const left = Math.min(startTime, endTime) * pixelsPerSecond;
  const width = Math.abs(endTime - startTime) * pixelsPerSecond;

  if (width < 1) return null;

  return (
    <div
      className="absolute top-0 pointer-events-none z-10"
      style={{
        left,
        width,
        height,
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px dashed rgba(255, 255, 255, 0.3)',
      }}
    />
  );
}
