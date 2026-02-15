import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface VUMeterProps {
  level: number; // in dB, typically -60 to +3
  peak?: number; // Peak level in dB
  width?: number;
  height?: number;
  showScale?: boolean;
  style?: 'classic' | 'modern';
  className?: string;
}

/**
 * TODO: Add function documentation
 */
export function VUMeter({
  level,
  peak = level,
  width = 200,
  height = 60,
  showScale = true,
  style = 'modern',
  className = '',
}: VUMeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const needleAngleRef = useRef<number>(-45);
  const targetAngleRef = useRef<number>(-45);

  // Spring animation for smooth needle movement
  const springLevel = useSpring(level, {
    stiffness: 200,
    damping: 15,
  });

  const needleRotation = useTransform(springLevel, [-60, 0, 3], [-45, 0, 45]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution
    canvas.width = width;
    canvas.height = height;

    const centerX = width / 2;
    const centerY = height - 10;
    const radius = height - 20;

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw meter background
      if (style === 'classic') {
        drawClassicMeter(ctx, centerX, centerY, radius);
      } else {
        drawModernMeter(ctx, centerX, centerY, radius);
      }

      // Update needle angle with smoothing
      const dbToAngle = (db: number) => {
        const normalized = Math.max(-60, Math.min(3, db));
        return ((normalized + 60) / 63) * 90 - 45;
      };

      targetAngleRef.current = dbToAngle(level);
      const diff = targetAngleRef.current - needleAngleRef.current;
      needleAngleRef.current += diff * 0.15; // Smooth animation

      // Draw needle
      drawNeedle(ctx, centerX, centerY, radius * 0.9, needleAngleRef.current);

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [level, width, height, style]);

  const drawClassicMeter = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ) => {
    // Draw classic VU meter background gradient
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, '#2a2a2f');
    gradient.addColorStop(1, '#1a1a1f');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    // Draw scale arc
    ctx.strokeStyle = '#4a4a4f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.85, Math.PI * 0.75, Math.PI * 0.25);
    ctx.stroke();

    // Draw VU scale markings
    const marks = [
      { value: -20, label: '-20', color: '#22c55e' },
      { value: -10, label: '-10', color: '#22c55e' },
      { value: -7, label: '-7', color: '#22c55e' },
      { value: -5, label: '-5', color: '#22c55e' },
      { value: -3, label: '-3', color: '#eab308' },
      { value: 0, label: '0', color: '#ef4444' },
      { value: 3, label: '+3', color: '#ef4444' },
    ];

    marks.forEach((mark) => {
      const angle = ((mark.value + 60) / 63) * 90 - 45;
      const radians = ((angle - 90) * Math.PI) / 180;
      const tickLength = mark.value === 0 ? 12 : 8;

      // Draw tick
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = mark.value === 0 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(
        centerX + Math.cos(radians) * (radius * 0.85 - tickLength),
        centerY + Math.sin(radians) * (radius * 0.85 - tickLength)
      );
      ctx.lineTo(
        centerX + Math.cos(radians) * radius * 0.85,
        centerY + Math.sin(radians) * radius * 0.85
      );
      ctx.stroke();

      // Draw label
      if (showScale) {
        ctx.fillStyle = mark.color;
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          mark.label,
          centerX + Math.cos(radians) * (radius * 0.65),
          centerY + Math.sin(radians) * (radius * 0.65) + 3
        );
      }
    });

    // Draw red zone
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.85, 0, Math.PI * 0.25);
    ctx.stroke();
  };

  const drawModernMeter = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number
  ) => {
    // Draw modern meter background
    ctx.fillStyle = 'var(--meter-background)';
    ctx.fillRect(0, 0, width, height);

    // Draw gradient arc segments
    const segments = 30;
    for (let i = 0; i < segments; i++) {
      const startAngle = Math.PI * 0.75 + (i / segments) * (Math.PI * 0.5);
      const endAngle = Math.PI * 0.75 + ((i + 1) / segments) * (Math.PI * 0.5);
      const db = (i / segments) * 63 - 60;

      let color: string;
      if (db < -18) color = 'var(--meter-green)';
      else if (db < -6) color = 'var(--meter-yellow)';
      else color = 'var(--meter-red)';

      const opacity = level > db ? 1 : 0.2;

      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.8, startAngle, endAngle);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // Draw digital readout
    ctx.fillStyle = 'var(--studio-text)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${level.toFixed(1)} dB`, centerX, height - 2);
  };

  const drawNeedle = (
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    length: number,
    angle: number
  ) => {
    const radians = ((angle - 90) * Math.PI) / 180;

    // Draw needle shadow
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX + 1, centerY + 1);
    ctx.lineTo(centerX + Math.cos(radians) * length + 1, centerY + Math.sin(radians) * length + 1);
    ctx.stroke();

    // Draw needle
    const gradient = ctx.createLinearGradient(
      centerX,
      centerY,
      centerX + Math.cos(radians) * length,
      centerY + Math.sin(radians) * length
    );
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.5, '#ff6666');
    gradient.addColorStop(1, '#ffaaaa');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(radians) * length, centerY + Math.sin(radians) * length);
    ctx.stroke();

    // Draw needle pivot
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#666';
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div className={`relative ${className}`}>
      <canvas ref={canvasRef} style={{ width: `${width}px`, height: `${height}px` }} />

      {/* Peak indicator LED */}
      {peak > 0 && (
        <motion.div
          className="absolute top-1 right-1 w-2 h-2 rounded-full"
          style={{
            background: 'var(--meter-red)',
            boxShadow: `0 0 8px var(--meter-red)`,
          }}
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 0.3, repeat: Infinity }}
        />
      )}
    </div>
  );
}
