import { useRef, useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { studioOneTheme } from "@/lib/studioOneTheme";

interface TouchFaderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  height?: number;
  width?: number;
  meterLevel?: number;
  label?: string;
  color?: string;
  className?: string;
}

export function TouchFader({
  value,
  min = 0,
  max = 100,
  onChange,
  height = 160,
  width = 44,
  meterLevel = 0,
  label,
  color,
  className,
}: TouchFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(value);

  const normalizedValue = (value - min) / (max - min);
  // meterLevel can range from 0-100+ for high gain, normalize to 0-1 with full range support
  const normalizedMeter = Math.max(0, Math.min(1, meterLevel / max));

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setStartY(e.touches[0].clientY);
      setStartValue(value);
    },
    [value],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !trackRef.current) return;

      const deltaY = startY - e.touches[0].clientY;
      const trackHeight = trackRef.current.offsetHeight - 24;
      const deltaValue = (deltaY / trackHeight) * (max - min);
      const newValue = Math.min(max, Math.max(min, startValue + deltaValue));

      onChange(Math.round(newValue));
    },
    [isDragging, startY, startValue, min, max, onChange],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      window.addEventListener("touchcancel", handleTouchEnd);

      return () => {
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
        window.removeEventListener("touchcancel", handleTouchEnd);
      };
    }
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const trackHeight = rect.height - 24;
      const clickY = e.clientY - rect.top - 12;
      const newValue = max - (clickY / trackHeight) * (max - min);

      onChange(Math.min(max, Math.max(min, Math.round(newValue))));
    },
    [min, max, onChange],
  );

  return (
    <div
      className={cn("flex flex-col items-center", className)}
      style={{ width }}
    >
      <div
        ref={trackRef}
        className="relative rounded-lg cursor-pointer touch-none overflow-hidden"
        style={{
          width: width - 8,
          height,
          background: studioOneTheme.colors.bg.deep,
        }}
        onClick={handleClick}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b-lg transition-all"
          style={{
            height: `${Math.min(100, normalizedMeter * 100)}%`,
            maxHeight: "100%",
            background: `linear-gradient(to top, ${studioOneTheme.colors.accent.green}, ${studioOneTheme.colors.accent.yellow})`,
            opacity: 0.3,
          }}
        />

        <div
          className="absolute left-1 right-1 flex items-center justify-center rounded touch-manipulation select-none"
          style={{
            height: 24,
            bottom: `calc(${normalizedValue * 100}% - 12px)`,
            background: color || studioOneTheme.colors.accent.blue,
            boxShadow: isDragging
              ? "0 0 12px rgba(59, 130, 246, 0.6)"
              : "0 2px 4px rgba(0,0,0,0.4)",
            transition: isDragging ? "none" : "box-shadow 0.2s",
          }}
          onTouchStart={handleTouchStart}
        >
          <div
            className="w-full h-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.5)" }}
          />
        </div>

        <div
          className="absolute left-0 w-full flex flex-col justify-between py-2 pointer-events-none"
          style={{ height: "100%" }}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <div
              key={tick}
              className="flex items-center gap-0.5"
              style={{ opacity: 0.4 }}
            >
              <div
                className="w-1 h-px"
                style={{ background: studioOneTheme.colors.text.muted }}
              />
              <span
                className="text-[8px]"
                style={{ color: studioOneTheme.colors.text.muted }}
              >
                {tick === 100
                  ? ""
                  : tick === 75
                    ? "0"
                    : tick === 50
                      ? "-12"
                      : tick === 25
                        ? "-24"
                        : "-∞"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {label && (
        <span
          className="mt-1 text-[10px] font-medium truncate w-full text-center"
          style={{ color: studioOneTheme.colors.text.secondary }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

interface TouchPanKnobProps {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  className?: string;
}

export function TouchPanKnob({
  value,
  onChange,
  size = 40,
  className,
}: TouchPanKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startValue, setStartValue] = useState(value);

  const normalizedValue = (value + 100) / 200;
  const rotation = (normalizedValue - 0.5) * 270;

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      setIsDragging(true);
      setStartX(e.touches[0].clientX);
      setStartValue(value);
    },
    [value],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging) return;

      const deltaX = e.touches[0].clientX - startX;
      const deltaValue = (deltaX / 100) * 200;
      const newValue = Math.min(100, Math.max(-100, startValue + deltaValue));

      onChange(Math.round(newValue));
    },
    [isDragging, startX, startValue, onChange],
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);

      return () => {
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isDragging, handleTouchMove, handleTouchEnd]);

  const handleDoubleClick = useCallback(() => {
    onChange(0);
  }, [onChange]);

  return (
    <div
      ref={knobRef}
      className={cn(
        "relative rounded-full cursor-pointer touch-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: studioOneTheme.colors.bg.deep,
        boxShadow: "inset 0 2px 4px rgba(0,0,0,0.4)",
      }}
      onTouchStart={handleTouchStart}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className="absolute inset-1 rounded-full flex items-center justify-center"
        style={{
          background: studioOneTheme.colors.bg.tertiary,
          transform: `rotate(${rotation}deg)`,
          transition: isDragging ? "none" : "transform 0.1s",
        }}
      >
        <div
          className="absolute top-1 w-1 h-2 rounded"
          style={{ background: studioOneTheme.colors.accent.blue }}
        />
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center text-[8px] font-mono pointer-events-none"
        style={{ color: studioOneTheme.colors.text.muted }}
      >
        {value === 0 ? "C" : value > 0 ? `R${value}` : `L${Math.abs(value)}`}
      </div>
    </div>
  );
}
