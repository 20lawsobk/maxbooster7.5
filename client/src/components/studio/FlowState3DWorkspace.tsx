import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FlowStateTrack } from "@/hooks/useFlowStateAdapter";

interface FlowState3DWorkspaceProps {
  tracks?: FlowStateTrack[];
  projectId?: string | null;
  isPlaying?: boolean;
  currentTime?: number;
  onTrackSelect?: (trackId: string) => void;
  selectedTrackIds?: string[];
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  trackId: string;
}

interface TrackNode {
  id: string;
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  color: string;
  name: string;
  meterLevel: number;
  isSelected: boolean;
}

export function FlowState3DWorkspace({
  tracks = [],
  _projectId,
  isPlaying = false,
  _currentTime = 0,
  onTrackSelect = () => {},
  selectedTrackIds = [],
}: FlowState3DWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Particle[]>([]);
  const trackNodesRef = useRef<Map<string, TrackNode>>(new Map());

  const [cameraAngle, setCameraAngle] = useState({ x: 0.3, y: 0 });
  const [cameraDistance, setCameraDistance] = useState(15);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [hoveredTrack, _setHoveredTrack] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"spatial" | "circular" | "grid">(
    "spatial",
  );

  const colors = useMemo(
    () => ({
      background: { r: 10, g: 12, b: 20 },
      grid: "rgba(100, 120, 255, 0.1)",
      trackActive: "rgba(129, 140, 248, 0.9)",
      trackInactive: "rgba(100, 116, 139, 0.6)",
      particleColors: [
        "rgba(139, 92, 246, 0.8)",
        "rgba(59, 130, 246, 0.8)",
        "rgba(6, 182, 212, 0.8)",
        "rgba(34, 197, 94, 0.8)",
        "rgba(249, 115, 22, 0.8)",
      ],
    }),
    [],
  );

  const project3D = useCallback(
    (x: number, y: number, z: number, width: number, height: number) => {
      const cosX = Math.cos(cameraAngle.x);
      const sinX = Math.sin(cameraAngle.x);
      const cosY = Math.cos(cameraAngle.y);
      const sinY = Math.sin(cameraAngle.y);

      let rotatedX = x * cosY - z * sinY;
      let rotatedZ = x * sinY + z * cosY;
      let rotatedY = y * cosX - rotatedZ * sinX;
      rotatedZ = y * sinX + rotatedZ * cosX;

      const perspective = cameraDistance / (cameraDistance + rotatedZ);
      const screenX = width / 2 + rotatedX * perspective * 50;
      const screenY = height / 2 - rotatedY * perspective * 50;

      return { x: screenX, y: screenY, scale: perspective, depth: rotatedZ };
    },
    [cameraAngle, cameraDistance],
  );

  const initializeTrackNodes = useCallback(() => {
    const trackList = tracks || [];
    const selectedIds = selectedTrackIds || [];
    const trackCount = trackList.length || 1;

    trackList.forEach((track, index) => {
      const existing = trackNodesRef.current.get(track.id);

      let targetX: number, targetY: number, targetZ: number;

      switch (viewMode) {
        case "circular":
          const angle = (index / trackCount) * Math.PI * 2;
          const radius = 6;
          targetX = Math.cos(angle) * radius;
          targetY = 0;
          targetZ = Math.sin(angle) * radius;
          break;
        case "grid":
          const cols = Math.ceil(Math.sqrt(trackCount));
          targetX = ((index % cols) - cols / 2) * 3;
          targetY = 0;
          targetZ =
            (Math.floor(index / cols) - Math.floor(trackCount / cols) / 2) * 3;
          break;
        case "spatial":
        default:
          targetX = (track.pan ?? 0) * 6;
          targetY = ((track.volume ?? 0.8) - 0.5) * 4;
          targetZ = index * 2 - trackCount;
          break;
      }

      const meterLevelArr = track.meterLevel || [0, 0];

      if (existing) {
        existing.targetX = targetX;
        existing.targetY = targetY;
        existing.targetZ = targetZ;
        existing.color = track.color;
        existing.name = track.name;
        existing.meterLevel = Math.max(meterLevelArr[0], meterLevelArr[1]);
        existing.isSelected = selectedIds.includes(track.id);
      } else {
        trackNodesRef.current.set(track.id, {
          id: track.id,
          x: targetX,
          y: targetY,
          z: targetZ,
          targetX,
          targetY,
          targetZ,
          color: track.color,
          name: track.name,
          meterLevel: 0,
          isSelected: selectedIds.includes(track.id),
        });
      }
    });

    const validIds = new Set(trackList.map((t) => t.id));
    trackNodesRef.current.forEach((_, id) => {
      if (!validIds.has(id)) {
        trackNodesRef.current.delete(id);
      }
    });
  }, [tracks, viewMode, selectedTrackIds]);

  const spawnParticles = useCallback(
    (trackNode: TrackNode, count: number) => {
      const colorIndex = Math.floor(
        Math.random() * colors.particleColors.length,
      );

      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: trackNode.x + (Math.random() - 0.5) * 0.5,
          y: trackNode.y + (Math.random() - 0.5) * 0.5,
          z: trackNode.z + (Math.random() - 0.5) * 0.5,
          vx: (Math.random() - 0.5) * 0.1,
          vy: Math.random() * 0.15 + 0.05,
          vz: (Math.random() - 0.5) * 0.1,
          life: 1,
          maxLife: 1,
          size: Math.random() * 4 + 2,
          color: colors.particleColors[colorIndex],
          trackId: trackNode.id,
        });
      }

      if (particlesRef.current.length > 500) {
        particlesRef.current = particlesRef.current.slice(-400);
      }
    },
    [colors],
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const { background } = colors;
    ctx.fillStyle = `rgb(${background.r}, ${background.g}, ${background.b})`;
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width / 2,
    );
    gradient.addColorStop(0, "rgba(99, 102, 241, 0.15)");
    gradient.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    const gridExtent = 10;

    for (let x = -gridExtent; x <= gridExtent; x++) {
      const start = project3D(x * 2, -3, -gridExtent * 2, width, height);
      const end = project3D(x * 2, -3, gridExtent * 2, width, height);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    for (let z = -gridExtent; z <= gridExtent; z++) {
      const start = project3D(-gridExtent * 2, -3, z * 2, width, height);
      const end = project3D(gridExtent * 2, -3, z * 2, width, height);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    particlesRef.current = particlesRef.current.filter((p) => p.life > 0);

    particlesRef.current.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.z += particle.vz;
      particle.vy *= 0.98;
      particle.life -= 0.02;

      const proj = project3D(particle.x, particle.y, particle.z, width, height);
      const alpha = particle.life * 0.8;
      const size = particle.size * proj.scale;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
      ctx.fillStyle = particle.color.replace("0.8", String(alpha));
      ctx.fill();
    });

    const sortedNodes = Array.from(trackNodesRef.current.values())
      .map((node) => ({
        ...node,
        projected: project3D(node.x, node.y, node.z, width, height),
      }))
      .sort((a, b) => b.projected.depth - a.projected.depth);

    sortedNodes.forEach((node) => {
      node.x += (node.targetX - node.x) * 0.1;
      node.y += (node.targetY - node.y) * 0.1;
      node.z += (node.targetZ - node.z) * 0.1;

      const proj = node.projected;
      const baseSize = 25 * proj.scale;
      const meterBoost = node.meterLevel * 15 * proj.scale;
      const size = baseSize + meterBoost;

      if (node.isSelected || node.id === hoveredTrack) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 30;
      }

      const nodeGradient = ctx.createRadialGradient(
        proj.x,
        proj.y,
        0,
        proj.x,
        proj.y,
        size,
      );
      nodeGradient.addColorStop(0, node.color);
      nodeGradient.addColorStop(
        0.7,
        node.color.replace(")", ", 0.6)").replace("rgb", "rgba"),
      );
      nodeGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, size, 0, Math.PI * 2);
      ctx.fillStyle = nodeGradient;
      ctx.fill();

      if (node.isSelected) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;

      if (isPlaying && node.meterLevel > 0.1) {
        spawnParticles(node, Math.floor(node.meterLevel * 3));
      }

      ctx.font = `${12 * proj.scale}px Inter, sans-serif`;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.textAlign = "center";
      ctx.fillText(node.name, proj.x, proj.y + size + 15 * proj.scale);
    });

    trackNodesRef.current.forEach((node, id) => {
      const track = (tracks || []).find((t) => t.id === id);
      if (track) {
        const meterArr = track.meterLevel || [0, 0];
        node.meterLevel = Math.max(meterArr[0], meterArr[1]);
      }
    });

    animationRef.current = requestAnimationFrame(render);
  }, [colors, project3D, isPlaying, hoveredTrack, spawnParticles, tracks]);

  useEffect(() => {
    initializeTrackNodes();
  }, [initializeTrackNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    updateSize();
    window.addEventListener("resize", updateSize);

    animationRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", updateSize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;

    setCameraAngle((prev) => ({
      x: Math.max(-Math.PI / 3, Math.min(Math.PI / 3, prev.x + deltaY * 0.005)),
      y: prev.y + deltaX * 0.005,
    }));

    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setCameraDistance((prev) =>
      Math.max(5, Math.min(30, prev + e.deltaY * 0.01)),
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * window.devicePixelRatio;
    const y = (e.clientY - rect.top) * window.devicePixelRatio;

    let closestTrack: string | null = null;
    let closestDist = Infinity;

    trackNodesRef.current.forEach((node, id) => {
      const proj = project3D(
        node.x,
        node.y,
        node.z,
        canvas.width,
        canvas.height,
      );
      const dist = Math.hypot(proj.x - x, proj.y - y);
      if (dist < 50 && dist < closestDist) {
        closestDist = dist;
        closestTrack = id;
      }
    });

    if (closestTrack) {
      onTrackSelect(closestTrack);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
      />

      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {(["spatial", "circular", "grid"] as const).map((mode) => (
          <motion.button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-all ${
              viewMode === mode
                ? "bg-indigo-600 text-white"
                : "bg-black/40 text-white/70 hover:bg-black/60"
            }`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </motion.button>
        ))}
      </div>

      <div className="absolute bottom-4 left-4 text-xs text-white/50 backdrop-blur-sm bg-black/20 px-3 py-2 rounded-lg">
        <div>Drag to rotate • Scroll to zoom • Click to select</div>
        <div className="mt-1 text-white/30">
          {(tracks || []).length} tracks in 3D space
        </div>
      </div>

      <AnimatePresence>
        {hoveredTrack && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute top-4 right-4 bg-black/60 backdrop-blur-md rounded-lg p-3 text-white text-sm"
          >
            {(tracks || []).find((t) => t.id === hoveredTrack)?.name}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
