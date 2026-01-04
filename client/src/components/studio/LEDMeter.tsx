import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface LEDMeterProps {
  level: number;
  peak?: number;
  width?: number;
  height?: number;
  segments?: number;
  orientation?: 'vertical' | 'horizontal';
  stereo?: boolean;
  leftLevel?: number;
  rightLevel?: number;
  showScale?: boolean;
  showPeakHold?: boolean;
  peakHoldTime?: number;
  className?: string;
}

const DB_MARKS = [-60, -48, -36, -24, -18, -12, -6, -3, 0, 3];

export function LEDMeter({
  level,
  peak,
  width = 24,
  height = 200,
  segments = 30,
  orientation = 'vertical',
  stereo = false,
  leftLevel,
  rightLevel,
  showScale = true,
  showPeakHold = true,
  peakHoldTime = 2000,
  className = '',
}: LEDMeterProps) {
  const [peakHoldLevel, setPeakHoldLevel] = useState<number>(-60);
  const [leftPeakHold, setLeftPeakHold] = useState<number>(-60);
  const [rightPeakHold, setRightPeakHold] = useState<number>(-60);
  const peakTimeoutRef = useRef<NodeJS.Timeout>();
  const leftPeakTimeoutRef = useRef<NodeJS.Timeout>();
  const rightPeakTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!showPeakHold) return;

    const currentLevel = peak ?? level;
    if (currentLevel > peakHoldLevel) {
      setPeakHoldLevel(currentLevel);
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current);
      peakTimeoutRef.current = setTimeout(() => {
        setPeakHoldLevel(-60);
      }, peakHoldTime);
    }

    return () => {
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current);
    };
  }, [level, peak, peakHoldLevel, peakHoldTime, showPeakHold]);

  useEffect(() => {
    if (!showPeakHold || !stereo) return;

    if (leftLevel !== undefined && leftLevel > leftPeakHold) {
      setLeftPeakHold(leftLevel);
      if (leftPeakTimeoutRef.current) clearTimeout(leftPeakTimeoutRef.current);
      leftPeakTimeoutRef.current = setTimeout(() => {
        setLeftPeakHold(-60);
      }, peakHoldTime);
    }

    if (rightLevel !== undefined && rightLevel > rightPeakHold) {
      setRightPeakHold(rightLevel);
      if (rightPeakTimeoutRef.current) clearTimeout(rightPeakTimeoutRef.current);
      rightPeakTimeoutRef.current = setTimeout(() => {
        setRightPeakHold(-60);
      }, peakHoldTime);
    }

    return () => {
      if (leftPeakTimeoutRef.current) clearTimeout(leftPeakTimeoutRef.current);
      if (rightPeakTimeoutRef.current) clearTimeout(rightPeakTimeoutRef.current);
    };
  }, [leftLevel, rightLevel, leftPeakHold, rightPeakHold, peakHoldTime, showPeakHold, stereo]);

  const getSegmentColor = (segmentDb: number, isActive: boolean): string => {
    if (!isActive) {
      if (segmentDb > 0) return 'rgba(239, 68, 68, 0.15)';
      if (segmentDb > -6) return 'rgba(234, 179, 8, 0.15)';
      return 'rgba(34, 197, 94, 0.15)';
    }

    if (segmentDb > 0) return '#ef4444';
    if (segmentDb > -6) return '#eab308';
    if (segmentDb > -12) return '#84cc16';
    return '#22c55e';
  };

  const getSegmentGlow = (segmentDb: number): string => {
    if (segmentDb > 0) return '0 0 8px rgba(239, 68, 68, 0.8)';
    if (segmentDb > -6) return '0 0 6px rgba(234, 179, 8, 0.6)';
    return '0 0 4px rgba(34, 197, 94, 0.5)';
  };

  const dbToSegment = (db: number): number => {
    const normalized = Math.max(-60, Math.min(3, db));
    return Math.floor(((normalized + 60) / 63) * segments);
  };

  const segmentToDb = (segment: number): number => {
    return (segment / segments) * 63 - 60;
  };

  const renderMeter = (meterLevel: number, meterPeakHold: number, key?: string, channelLabel?: string) => {
    const activeSegments = dbToSegment(meterLevel);
    const peakSegment = dbToSegment(meterPeakHold);
    const meterWidth = stereo ? (width - 4) / 2 : width;
    const isClipping = meterLevel > 0;

    return (
      <div
        key={key}
        className="flex flex-col-reverse gap-[1px]"
        style={{ width: meterWidth, height }}
        role="meter"
        aria-label={channelLabel ? `${channelLabel} channel level meter` : 'Audio level meter'}
        aria-valuenow={Math.round(meterLevel)}
        aria-valuemin={-60}
        aria-valuemax={3}
        aria-valuetext={`${Math.round(meterLevel)} dB${isClipping ? ', CLIPPING' : ''}`}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const segmentDb = segmentToDb(i);
          const isActive = i < activeSegments;
          const isPeakHold = showPeakHold && i === peakSegment && peakSegment > 0;

          return (
            <motion.div
              key={i}
              className="rounded-[1px]"
              style={{
                height: (height - segments) / segments,
                background: isPeakHold ? '#ffffff' : getSegmentColor(segmentDb, isActive),
                boxShadow: isActive || isPeakHold ? getSegmentGlow(segmentDb) : 'none',
              }}
              initial={false}
              animate={{
                opacity: isActive || isPeakHold ? 1 : 0.3,
                scale: isActive ? 1 : 0.95,
              }}
              transition={{ duration: 0.05 }}
            />
          );
        })}
      </div>
    );
  };

  const renderScale = () => {
    if (!showScale) return null;

    return (
      <div
        className="flex flex-col justify-between text-[8px] font-mono ml-1"
        style={{ height, color: 'var(--studio-text-muted)' }}
      >
        {DB_MARKS.slice().reverse().map((db) => {
          const position = ((db + 60) / 63) * 100;
          return (
            <div
              key={db}
              className="flex items-center"
              style={{
                position: 'relative',
                color: db > 0 ? '#ef4444' : db > -6 ? '#eab308' : 'var(--studio-text-muted)',
              }}
            >
              <span className="w-6 text-right">{db}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`flex items-start gap-1 ${className}`}>
      <div
        className="flex gap-[2px] p-1 rounded"
        style={{
          background: 'var(--studio-bg-deep)',
          border: '1px solid var(--studio-border)',
        }}
      >
        {stereo ? (
          <>
            {renderMeter(leftLevel ?? level, leftPeakHold, 'left', 'Left')}
            {renderMeter(rightLevel ?? level, rightPeakHold, 'right', 'Right')}
          </>
        ) : (
          renderMeter(level, peakHoldLevel, undefined, undefined)
        )}
      </div>
      {showScale && renderScale()}
    </div>
  );
}

interface ClipIndicatorProps {
  isClipping: boolean;
  onReset?: () => void;
}

export function ClipIndicator({ isClipping, onReset }: ClipIndicatorProps) {
  const [hasClipped, setHasClipped] = useState(false);

  useEffect(() => {
    if (isClipping) {
      setHasClipped(true);
    }
  }, [isClipping]);

  const handleReset = () => {
    setHasClipped(false);
    onReset?.();
  };

  return (
    <motion.button
      onClick={handleReset}
      className="min-w-[44px] min-h-[44px] px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider touch-manipulation"
      style={{
        background: hasClipped ? '#ef4444' : 'var(--studio-bg-deep)',
        color: hasClipped ? '#ffffff' : 'var(--studio-text-muted)',
        border: '1px solid var(--studio-border)',
      }}
      animate={{
        boxShadow: hasClipped ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={hasClipped ? 'Audio clipping detected. Click to reset indicator.' : 'Clip indicator - no clipping'}
      aria-live="polite"
    >
      CLIP
    </motion.button>
  );
}

interface LoudnessMeterProps {
  lufs: number;
  lufsRange?: { min: number; max: number };
  target?: number;
  width?: number;
  height?: number;
}

export function LoudnessMeter({
  lufs,
  lufsRange = { min: -60, max: 0 },
  target = -14,
  width = 60,
  height = 200,
}: LoudnessMeterProps) {
  const normalizedLufs = Math.max(lufsRange.min, Math.min(lufsRange.max, lufs));
  const percentage = ((normalizedLufs - lufsRange.min) / (lufsRange.max - lufsRange.min)) * 100;
  const targetPercentage = ((target - lufsRange.min) / (lufsRange.max - lufsRange.min)) * 100;

  const getColor = () => {
    if (lufs > target + 2) return '#ef4444';
    if (lufs > target - 1) return '#22c55e';
    if (lufs > target - 4) return '#eab308';
    return '#3b82f6';
  };

  const getLoudnessDescription = () => {
    if (lufs > target + 2) return 'above target (too loud)';
    if (lufs > target - 1) return 'within target range';
    if (lufs > target - 4) return 'slightly below target';
    return 'below target (too quiet)';
  };

  return (
    <div
      className="flex flex-col items-center gap-2 p-2 rounded"
      style={{
        background: 'var(--studio-bg-deep)',
        border: '1px solid var(--studio-border)',
      }}
      role="meter"
      aria-label="LUFS loudness meter"
      aria-valuenow={lufs}
      aria-valuemin={lufsRange.min}
      aria-valuemax={lufsRange.max}
      aria-valuetext={`${lufs.toFixed(1)} LUFS, ${getLoudnessDescription()}, target ${target} LUFS`}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--studio-text-muted)' }}>
        LUFS
      </span>
      
      <div
        className="relative rounded overflow-hidden"
        style={{
          width,
          height,
          background: 'var(--studio-surface)',
        }}
        aria-hidden="true"
      >
        <motion.div
          className="absolute bottom-0 left-0 right-0 rounded-t"
          style={{ background: getColor() }}
          animate={{ height: `${percentage}%` }}
          transition={{ duration: 0.1 }}
        />
        
        <div
          className="absolute left-0 right-0 h-[2px]"
          style={{
            bottom: `${targetPercentage}%`,
            background: '#ffffff',
            boxShadow: '0 0 4px rgba(255, 255, 255, 0.5)',
          }}
        />
        
        <div
          className="absolute left-full ml-1 text-[8px] font-mono whitespace-nowrap"
          style={{
            bottom: `${targetPercentage}%`,
            transform: 'translateY(50%)',
            color: 'var(--studio-text-muted)',
          }}
        >
          {target} (target)
        </div>
      </div>
      
      <div
        className="font-mono text-sm font-bold"
        style={{ color: getColor() }}
      >
        {lufs.toFixed(1)}
      </div>
    </div>
  );
}
