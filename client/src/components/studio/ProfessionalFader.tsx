import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';

interface ProfessionalFaderProps {
  value: number; // 0 to 1
  onChange: (value: number) => void;
  onDoubleClick?: () => void;
  label?: string;
  height?: number;
  showMeter?: boolean;
  meterLevel?: number; // in dB
  peakLevel?: number; // in dB
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  'data-testid'?: string;
}

const DB_MARKS = [
  { db: '+6', position: 1 },
  { db: '0', position: 0.75 },
  { db: '-5', position: 0.65 },
  { db: '-10', position: 0.5 },
  { db: '-20', position: 0.3 },
  { db: '-∞', position: 0 },
];

/**
 * TODO: Add function documentation
 */
function valueToDb(value: number): number {
  if (value === 0) return -Infinity;
  // Map 0-1 to -60 to +6 dB
  const db = value * 66 - 60;
  return Math.max(-60, Math.min(6, db));
}

/**
 * TODO: Add function documentation
 */
function dbToValue(db: number): number {
  if (db === -Infinity) return 0;
  // Map -60 to +6 dB to 0-1
  return Math.max(0, Math.min(1, (db + 60) / 66));
}

/**
 * TODO: Add function documentation
 */
export function ProfessionalFader({
  value,
  onChange,
  onDoubleClick,
  label,
  height = 200,
  showMeter = true,
  meterLevel = -60,
  peakLevel = -60,
  orientation = 'vertical',
  className = '',
  'data-testid': dataTestId,
}: ProfessionalFaderProps) {
  const faderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [peakHold, setPeakHold] = useState(peakLevel);
  const peakHoldTimeRef = useRef<number>(Date.now());

  const faderPosition = useMotionValue(value);
  const springPosition = useSpring(faderPosition, {
    stiffness: 400,
    damping: 30,
  });

  const faderY = useTransform(
    springPosition,
    [0, 1],
    orientation === 'vertical' ? [height - 30, 0] : [0, height - 30]
  );

  // Update peak hold
  useEffect(() => {
    if (peakLevel > peakHold) {
      setPeakHold(peakLevel);
      peakHoldTimeRef.current = Date.now();
    } else if (Date.now() - peakHoldTimeRef.current > 2000) {
      setPeakHold((prev) => Math.max(prev - 0.5, peakLevel));
    }
  }, [peakLevel, peakHold]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startY = e.clientY;
      const startValue = value;

      const handleMouseMove = (e: MouseEvent) => {
        if (!faderRef.current) return;

        const deltaY =
          orientation === 'vertical'
            ? (startY - e.clientY) / height
            : (e.clientX - startY) / height;

        const multiplier = e.shiftKey ? 0.1 : 1; // Fine-tuning with shift
        let newValue = startValue + deltaY * multiplier;
        newValue = Math.max(0, Math.min(1, newValue));

        faderPosition.set(newValue);
        onChange(newValue);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [value, onChange, height, orientation, faderPosition]
  );

  const handleDoubleClick = useCallback(() => {
    const defaultValue = 0.75; // 0dB position
    faderPosition.set(defaultValue);
    onChange(defaultValue);
    onDoubleClick?.();
  }, [onChange, onDoubleClick, faderPosition]);

  const renderMeter = () => {
    if (!showMeter) return null;

    const meterHeight = height;
    const levelHeight = Math.max(0, ((meterLevel + 60) / 66) * meterHeight);
    const peakHeight = Math.max(0, ((peakHold + 60) / 66) * meterHeight);

    return (
      <div
        className="absolute left-0 w-2 rounded-sm overflow-hidden"
        style={{
          height: `${meterHeight}px`,
          background: 'var(--meter-background)',
        }}
      >
        {/* LED segments */}
        {Array.from({ length: 20 }).map((_, i) => {
          const segmentHeight = meterHeight / 20;
          const segmentY = meterHeight - (i + 1) * segmentHeight;
          const segmentDb = ((i + 1) / 20) * 66 - 60;
          const isActive = levelHeight > i * segmentHeight;

          let color = '#2a2a2a';
          if (isActive) {
            if (segmentDb < -18) color = 'var(--meter-green)';
            else if (segmentDb < -6) color = 'var(--meter-yellow)';
            else color = 'var(--meter-red)';
          }

          return (
            <div
              key={i}
              className="absolute w-full"
              style={{
                top: `${segmentY}px`,
                height: `${segmentHeight - 1}px`,
                background: color,
                opacity: isActive ? 1 : 0.3,
                transition: 'all 0.05s ease-out',
              }}
            />
          );
        })}

        {/* Peak hold indicator */}
        <motion.div
          className="absolute w-full h-0.5 bg-white"
          style={{
            bottom: `${peakHeight}px`,
            boxShadow: '0 0 4px rgba(255,255,255,0.8)',
          }}
          animate={{ opacity: [1, 0.8, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        />
      </div>
    );
  };

  return (
    <div
      ref={faderRef}
      className={`relative flex items-center gap-2 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-testid={dataTestId}
    >
      {/* Meter */}
      {showMeter && renderMeter()}

      {/* Fader Track */}
      <div
        className="relative ml-3"
        style={{
          width: orientation === 'vertical' ? '40px' : `${height}px`,
          height: orientation === 'vertical' ? `${height}px` : '40px',
        }}
      >
        {/* Track Background */}
        <div
          className="absolute rounded"
          style={{
            left: orientation === 'vertical' ? '18px' : '0',
            top: orientation === 'vertical' ? '0' : '18px',
            width: orientation === 'vertical' ? '4px' : '100%',
            height: orientation === 'vertical' ? '100%' : '4px',
            background: 'var(--fader-track-bg)',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
          }}
        />

        {/* dB Markings */}
        {orientation === 'vertical' &&
          DB_MARKS.map((mark) => (
            <div
              key={mark.db}
              className="absolute flex items-center"
              style={{
                top: `${(1 - mark.position) * height}px`,
                left: '26px',
                transform: 'translateY(-50%)',
              }}
            >
              <div className="w-2 h-px bg-gray-500" style={{ marginRight: '4px' }} />
              <span
                className="text-[8px] font-mono"
                style={{
                  color: 'var(--studio-text-muted)',
                  minWidth: '20px',
                }}
              >
                {mark.db}
              </span>
            </div>
          ))}

        {/* Fader Cap */}
        <motion.div
          className="absolute cursor-grab active:cursor-grabbing"
          style={{
            left: orientation === 'vertical' ? '10px' : faderY,
            top: orientation === 'vertical' ? faderY : '10px',
            width: '20px',
            height: '30px',
            background: 'var(--fader-cap-bg)',
            borderRadius: '2px',
            border: '1px solid #5a5a5f',
            boxShadow: isDragging
              ? 'var(--knob-hover-glow), var(--knob-shadow)'
              : isHovered
                ? '0 0 8px rgba(0, 204, 255, 0.2), var(--knob-shadow)'
                : 'var(--knob-shadow)',
            transition: 'box-shadow 0.2s ease',
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Fader cap indicator line */}
          <div
            className="absolute w-full h-px top-1/2 -translate-y-1/2"
            style={{
              background: 'var(--knob-indicator)',
              boxShadow: '0 0 3px var(--knob-indicator)',
            }}
          />
        </motion.div>

        {/* Current Value Display */}
        {isDragging && (
          <motion.div
            className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-xs font-mono"
            style={{
              background: 'var(--studio-bg-deep)',
              border: '1px solid var(--studio-border)',
              color: 'var(--studio-text)',
            }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
          >
            {valueToDb(value).toFixed(1)} dB
          </motion.div>
        )}
      </div>

      {/* Label */}
      {label && (
        <div
          className="text-xs font-medium writing-mode-vertical"
          style={{
            color: 'var(--studio-text-muted)',
            writingMode: orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
            transform: orientation === 'vertical' ? 'rotate(180deg)' : 'none',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
