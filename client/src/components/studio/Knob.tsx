import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, useSpring, useMotionValue, useTransform } from 'framer-motion';

interface KnobProps {
  value: number; // -1 to 1 or 0 to 1 depending on bipolar
  onChange: (value: number) => void;
  onDoubleClick?: () => void;
  label?: string;
  size?: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  bipolar?: boolean; // If true, center is 0, range is -1 to 1
  displayValue?: string;
  unit?: string;
  color?: string;
  className?: string;
}

/**
 * TODO: Add function documentation
 */
export function Knob({
  value,
  onChange,
  onDoubleClick,
  label,
  size = 48,
  min = 0,
  max = 1,
  defaultValue = 0,
  bipolar = false,
  displayValue,
  unit = '',
  color = 'var(--knob-indicator)',
  className = '',
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showValue, setShowValue] = useState(false);

  // Convert value to rotation angle
  const normalizedValue = bipolar
    ? (value + 1) / 2 // Convert -1 to 1 range to 0 to 1
    : (value - min) / (max - min);

  const rotationAngle = useMotionValue(normalizedValue * 270 - 135);
  const springRotation = useSpring(rotationAngle, {
    stiffness: 400,
    damping: 30,
  });

  useEffect(() => {
    const normalized = bipolar ? (value + 1) / 2 : (value - min) / (max - min);
    rotationAngle.set(normalized * 270 - 135);
  }, [value, min, max, bipolar, rotationAngle]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setShowValue(true);

      const rect = knobRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      const startValue = value;

      const handleMouseMove = (e: MouseEvent) => {
        const currentAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        let deltaAngle = currentAngle - startAngle;

        // Handle angle wrapping
        if (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
        if (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;

        const multiplier = e.shiftKey ? 0.1 : 1; // Fine-tuning with shift
        const deltaValue = (deltaAngle / (Math.PI * 1.5)) * (max - min) * multiplier;

        let newValue = startValue + deltaValue;

        if (bipolar) {
          newValue = Math.max(-1, Math.min(1, newValue));
        } else {
          newValue = Math.max(min, Math.min(max, newValue));
        }

        onChange(newValue);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        setTimeout(() => setShowValue(false), 1000);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [value, onChange, min, max, bipolar]
  );

  const handleDoubleClick = useCallback(() => {
    onChange(defaultValue);
    onDoubleClick?.();
  }, [onChange, defaultValue, onDoubleClick]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.01 : 0.01;
      const multiplier = e.shiftKey ? 0.1 : 1;

      let newValue = value + delta * (max - min) * multiplier;

      if (bipolar) {
        newValue = Math.max(-1, Math.min(1, newValue));
      } else {
        newValue = Math.max(min, Math.min(max, newValue));
      }

      onChange(newValue);
      setShowValue(true);
      setTimeout(() => setShowValue(false), 1000);
    },
    [value, onChange, min, max, bipolar]
  );

  // Format display value
  const getDisplayValue = () => {
    if (displayValue) return displayValue;

    if (bipolar) {
      if (Math.abs(value) < 0.01) return 'C';
      if (value < 0) return `L${Math.abs(value * 100).toFixed(0)}`;
      return `R${(value * 100).toFixed(0)}`;
    }

    const scaledValue = value * (max - min) + min;
    return `${scaledValue.toFixed(1)}${unit}`;
  };

  return (
    <div
      ref={knobRef}
      className={`flex flex-col items-center gap-1 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Knob Container */}
      <div
        className="relative cursor-grab active:cursor-grabbing"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
      >
        {/* Outer Ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'var(--knob-ring)',
            boxShadow: isDragging
              ? 'var(--knob-hover-glow), inset 0 2px 4px rgba(0,0,0,0.5)'
              : isHovered
                ? '0 0 8px rgba(0, 204, 255, 0.2), inset 0 2px 4px rgba(0,0,0,0.5)'
                : 'inset 0 2px 4px rgba(0,0,0,0.5)',
            transition: 'box-shadow 0.2s ease',
          }}
        />

        {/* Arc Track */}
        <svg
          className="absolute inset-0"
          viewBox="0 0 100 100"
          style={{ transform: 'rotate(-90deg)' }}
        >
          {/* Background Arc */}
          <path
            d={`M 25 75 A 35 35 0 1 1 75 75`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.1)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Value Arc */}
          <motion.path
            d={`M 25 75 A 35 35 0 ${normalizedValue > 0.5 ? '1' : '0'} 1 ${
              50 + 35 * Math.cos(((normalizedValue * 270 - 135) * Math.PI) / 180)
            } ${50 + 35 * Math.sin(((normalizedValue * 270 - 135) * Math.PI) / 180)}`}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 3px currentColor)' }}
          />
        </svg>

        {/* Inner Knob */}
        <motion.div
          className="absolute inset-2 rounded-full"
          style={{
            background: 'var(--knob-bg)',
            boxShadow: 'var(--knob-shadow)',
            rotate: springRotation,
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Indicator Dot */}
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
            style={{
              background: color,
              boxShadow: `0 0 6px ${color}`,
            }}
          />
        </motion.div>

        {/* Tick Marks */}
        {bipolar && (
          <>
            {/* Center tick */}
            <div
              className="absolute w-0.5 h-2"
              style={{
                top: '-6px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--studio-text-muted)',
              }}
            />
            {/* Left tick */}
            <div
              className="absolute w-0.5 h-2"
              style={{
                top: '50%',
                left: '-6px',
                transform: 'translateY(-50%) rotate(90deg)',
                background: 'var(--studio-text-muted)',
              }}
            />
            {/* Right tick */}
            <div
              className="absolute w-0.5 h-2"
              style={{
                top: '50%',
                right: '-6px',
                transform: 'translateY(-50%) rotate(90deg)',
                background: 'var(--studio-text-muted)',
              }}
            />
          </>
        )}
      </div>

      {/* Label */}
      {label && (
        <div
          className="text-[10px] font-medium text-center"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {label}
        </div>
      )}

      {/* Value Display */}
      <motion.div
        className="text-[9px] font-mono text-center"
        style={{
          color: 'var(--studio-text)',
          minHeight: '12px',
        }}
        animate={{ opacity: showValue || isDragging ? 1 : 0.5 }}
        transition={{ duration: 0.2 }}
      >
        {getDisplayValue()}
      </motion.div>
    </div>
  );
}
