import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface Track {
  id: string;
  name: string;
  type: 'audio' | 'midi';
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
}

interface FlowStateSpatialVisualizerProps {
  tracks: Track[];
  isPlaying: boolean;
}

export function FlowStateSpatialVisualizer({ tracks, isPlaying }: FlowStateSpatialVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    size: number;
    color: string;
    intensity: number;
  }>>([]);

  const activeTracks = useMemo(() => 
    tracks.filter(t => !t.mute && (tracks.every(tr => !tr.solo) || t.solo)),
    [tracks]
  );

  useEffect(() => {
    particlesRef.current = activeTracks.flatMap(track => {
      const baseX = 0.5 + (track.pan * 0.4);
      return Array.from({ length: 8 }, () => ({
        x: baseX + (Math.random() - 0.5) * 0.2,
        y: 0.3 + Math.random() * 0.4,
        z: Math.random(),
        vx: (Math.random() - 0.5) * 0.002,
        vy: (Math.random() - 0.5) * 0.002,
        size: 4 + Math.random() * 8,
        color: track.color,
        intensity: track.volume,
      }));
    });
  }, [activeTracks]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const animate = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.fillStyle = 'rgba(5, 5, 8, 0.95)';
      ctx.fillRect(0, 0, rect.width, rect.height);

      const gridSize = 40;
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.lineWidth = 1;

      for (let x = 0; x < rect.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rect.height);
        ctx.stroke();
      }
      for (let y = 0; y < rect.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      ctx.beginPath();
      ctx.arc(centerX, centerY, 60, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, 120, 0, Math.PI * 2);
      ctx.stroke();

      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 80);
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 80, 0, Math.PI * 2);
      ctx.fill();

      particlesRef.current.forEach((particle, i) => {
        if (isPlaying) {
          particle.x += particle.vx;
          particle.y += particle.vy;
          particle.intensity = Math.min(1, particle.intensity + (Math.random() - 0.5) * 0.1);

          if (particle.x < 0.1 || particle.x > 0.9) particle.vx *= -1;
          if (particle.y < 0.1 || particle.y > 0.9) particle.vy *= -1;
        }

        const px = particle.x * rect.width;
        const py = particle.y * rect.height;
        const size = particle.size * (0.5 + particle.z * 0.5) * (isPlaying ? 1 + Math.sin(Date.now() / 200 + i) * 0.2 : 1);

        const glow = ctx.createRadialGradient(px, py, 0, px, py, size * 3);
        glow.addColorStop(0, particle.color + Math.floor(particle.intensity * 80).toString(16).padStart(2, '0'));
        glow.addColorStop(1, particle.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = particle.color;
        ctx.globalAlpha = particle.intensity;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      ctx.fillStyle = '#fff';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('L', 30, rect.height / 2);
      ctx.fillText('R', rect.width - 30, rect.height / 2);
      ctx.fillText('FRONT', centerX, 20);
      ctx.fillText('REAR', centerX, rect.height - 10);

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, activeTracks]);

  return (
    <div className="flow-spatial-viz relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: 'block' }}
      />
      
      {/* Track Legend */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
        {activeTracks.map(track => (
          <motion.div
            key={track.id}
            className="flex items-center gap-2 px-2 py-1 rounded-full bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: track.color }}
            />
            <span className="text-[10px] text-white font-medium">{track.name}</span>
          </motion.div>
        ))}
      </div>

      {/* Playback Status */}
      <div className="absolute top-3 right-3">
        <motion.div
          className={`px-2 py-1 rounded-full text-[10px] font-medium ${
            isPlaying 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-slate-500/20 text-slate-400'
          }`}
          animate={isPlaying ? { opacity: [1, 0.7, 1] } : {}}
          transition={{ repeat: Infinity, duration: 1 }}
        >
          {isPlaying ? '● LIVE' : '○ PAUSED'}
        </motion.div>
      </div>
    </div>
  );
}
