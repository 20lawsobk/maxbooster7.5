import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Power,
  RotateCcw,
  ChevronDown,
  Save,
  Folder,
  Volume2,
  Activity,
  Waves,
  Music,
  Sliders as SlidersIcon,
} from "lucide-react";

export interface PluginParameter {
  id: string;
  name: string;
  type: "float" | "int" | "bool" | "choice";
  defaultValue: number | boolean | string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  choices?: string[];
  unit?: string;
  automatable: boolean;
}

export interface PluginDefinition {
  id: string;
  slug: string;
  name: string;
  category: "instrument" | "effect";
  type: string;
  version: string;
  description: string;
  author: string;
  parameters: PluginParameter[];
  defaultPreset: Record<string, number | boolean | string>;
  envelope?: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  oscillators?: Array<{ type: string; detune: number; gain: number }>;
}

interface PluginDialogProps {
  plugin: PluginDefinition;
  instanceId: string;
  values: Record<string, number | boolean | string>;
  bypassed: boolean;
  onClose: () => void;
  onParameterChange: (
    paramId: string,
    value: number | boolean | string,
  ) => void;
  onBypassToggle: () => void;
  onReset: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  reverb: "#8b5cf6",
  delay: "#3b82f6",
  chorus: "#06b6d4",
  flanger: "#06b6d4",
  phaser: "#f59e0b",
  compressor: "#10b981",
  eq: "#3b82f6",
  limiter: "#ef4444",
  gate: "#6366f1",
  distortion: "#ef4444",
  piano: "#64748b",
  strings: "#8b5cf6",
  drums: "#ef4444",
  bass: "#f97316",
  pad: "#a855f7",
  synth: "#f59e0b",
  analog: "#f59e0b",
  fm: "#3b82f6",
  wavetable: "#8b5cf6",
  sampler: "#06b6d4",
  organ: "#22c55e",
  brass: "#eab308",
  lead: "#ec4899",
  guitar: "#b45309",
  vocal: "#f472b6",
  default: "#64748b",
};

function Knob({
  value,
  min,
  max,
  onChange,
  label,
  unit,
  size = 56,
  color = "#10b981",
  showValue = true,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
  size?: number;
  color?: string;
  showValue?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(value);

  const normalized = (value - min) / (max - min);
  const angle = -135 + normalized * 270;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = (startY - e.clientY) / 100;
      const range = max - min;
      const newValue = Math.max(min, Math.min(max, startValue + delta * range));
      onChange(newValue);
    };
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, startY, startValue, min, max, onChange]);

  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Math.abs(v) < 0.01) return v.toFixed(3);
    if (Math.abs(v) < 1) return v.toFixed(2);
    if (Math.abs(v) < 10) return v.toFixed(1);
    return Math.round(v).toString();
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`relative ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onChange((min + max) / 2)}
      >
        <svg viewBox="0 0 40 40" className="w-full h-full drop-shadow-lg">
          <defs>
            <linearGradient
              id={`knob-grad-${label}`}
              x1="0%"
              y1="0%"
              x2="0%"
              y2="100%"
            >
              <stop offset="0%" stopColor="#374151" />
              <stop offset="100%" stopColor="#1f2937" />
            </linearGradient>
          </defs>
          <circle
            cx="20"
            cy="20"
            r="18"
            fill={`url(#knob-grad-${label})`}
            stroke="#475569"
            strokeWidth="1"
          />
          <circle cx="20" cy="20" r="15" fill="#1e293b" />
          <path
            d="M 20 6 A 14 14 0 1 1 6 20"
            fill="none"
            stroke="#334155"
            strokeWidth="3"
            strokeLinecap="round"
            transform="rotate(-45 20 20)"
          />
          <path
            d="M 20 6 A 14 14 0 1 1 6 20"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${normalized * 88} 88`}
            transform="rotate(-45 20 20)"
            className="drop-shadow-sm"
            style={{ filter: `drop-shadow(0 0 3px ${color}40)` }}
          />
          <line
            x1="20"
            y1="8"
            x2="20"
            y2="14"
            stroke="#e2e8f0"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 20 20)`}
          />
        </svg>
      </div>
      <span className="text-[10px] text-slate-400 font-medium text-center truncate w-full">
        {label}
      </span>
      {showValue && (
        <span className="text-[9px] font-mono" style={{ color }}>
          {formatValue(value)}
          {unit ? ` ${unit}` : ""}
        </span>
      )}
    </div>
  );
}

function VSlider({
  value,
  min,
  max,
  onChange,
  label,
  unit,
  height = 100,
  color = "#10b981",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
  height?: number;
  color?: string;
}) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const normalized = (value - min) / (max - min);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updateValue(e.clientY);
  };

  const updateValue = (clientY: number) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const normalized =
      1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    onChange(min + normalized * (max - min));
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => updateValue(e.clientY);
    const handleMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Math.abs(v) < 1) return v.toFixed(2);
    return v.toFixed(1);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[9px] text-slate-500">{label}</span>
      <div
        ref={sliderRef}
        className="relative w-4 rounded-full bg-slate-800 border border-slate-700 cursor-pointer"
        style={{ height }}
        onMouseDown={handleMouseDown}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-all"
          style={{
            height: `${normalized * 100}%`,
            backgroundColor: `${color}40`,
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 w-6 h-3 rounded bg-slate-300 border border-slate-400 shadow-md"
          style={{ bottom: `calc(${normalized * 100}% - 6px)` }}
        />
      </div>
      <span className="text-[9px] font-mono" style={{ color }}>
        {formatValue(value)}
        {unit}
      </span>
    </div>
  );
}

function HSlider({
  value,
  min,
  max,
  onChange,
  label,
  unit,
  width = 120,
  color = "#10b981",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
  width?: number;
  color?: string;
}) {
  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
    if (Math.abs(v) < 1) return v.toFixed(2);
    return v.toFixed(1);
  };

  return (
    <div className="flex flex-col gap-1" style={{ width }}>
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-slate-400">{label}</span>
        <span className="text-[9px] font-mono" style={{ color }}>
          {formatValue(value)}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: color }}
      />
    </div>
  );
}

function Toggle({
  value,
  onChange,
  label,
  color = "#10b981",
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${value ? "border-opacity-50" : "bg-slate-800 border-slate-600 text-slate-400"}`}
      style={
        value
          ? { backgroundColor: `${color}20`, borderColor: `${color}80`, color }
          : {}
      }
    >
      <div
        className={`w-3 h-3 rounded-full transition-colors`}
        style={{ backgroundColor: value ? color : "#475569" }}
      />
      <span className="text-xs">{label}</span>
    </button>
  );
}

function Select({
  value,
  options,
  onChange,
  label,
  color = "#10b981",
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none appearance-none cursor-pointer hover:border-slate-500"
          style={{ borderColor: `${color}40` }}
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

function GainReductionMeter({
  value,
  color,
}: {
  value: number;
  color: string;
}) {
  const dbValue = Math.max(-24, Math.min(0, value));
  const normalized = 1 - dbValue / -24;
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] text-slate-500">GR</span>
      <div className="w-4 h-20 bg-slate-800 rounded-sm border border-slate-700 relative overflow-hidden">
        <div
          className="absolute top-0 left-0 right-0 transition-all"
          style={{
            height: `${normalized * 100}%`,
            backgroundColor: normalized > 0.5 ? "#ef4444" : color,
          }}
        />
      </div>
      <span className="text-[9px] font-mono text-slate-400">
        {dbValue.toFixed(1)}
      </span>
    </div>
  );
}

function FrequencyVisualizer({
  bands,
  color,
}: {
  bands: number[];
  color: string;
}) {
  return (
    <div className="flex items-end justify-center gap-0.5 h-16 bg-slate-900/50 rounded-lg p-2 border border-slate-700/50">
      {bands.map((v, i) => (
        <div
          key={i}
          className="w-2 rounded-t transition-all"
          style={{
            height: `${Math.max(5, v * 100)}%`,
            backgroundColor: `${color}${Math.floor(40 + v * 60).toString(16)}`,
          }}
        />
      ))}
    </div>
  );
}

function ADSRVisualizer({
  attack,
  decay,
  sustain,
  release,
  color,
}: {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  color: string;
}) {
  const total = attack + decay + release + 0.5;
  const aX = (attack / total) * 100;
  const dX = ((attack + decay) / total) * 100;
  const sX = dX + 20;
  const rX = 100;
  const sY = 100 - sustain * 100;
  const path = `M 0 100 L ${aX} 0 L ${dX} ${sY} L ${sX} ${sY} L ${rX} 100`;

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
      <svg viewBox="0 0 100 100" className="w-full h-16">
        <defs>
          <linearGradient id="adsr-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.5" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#adsr-grad)" />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={aX} cy="0" r="3" fill={color} />
        <circle cx={dX} cy={sY} r="3" fill={color} />
        <circle cx={sX} cy={sY} r="3" fill={color} />
      </svg>
      <div className="flex justify-between text-[8px] text-slate-500 mt-1">
        <span>A</span>
        <span>D</span>
        <span>S</span>
        <span>R</span>
      </div>
    </div>
  );
}

function CompressorCurve({
  threshold,
  ratio,
  knee,
  color,
}: {
  threshold: number;
  ratio: number;
  knee: number;
  color: string;
}) {
  const thresholdNorm = (threshold + 60) / 60;
  const kneeWidth = knee / 60;

  return (
    <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
      <svg viewBox="0 0 100 100" className="w-full h-20">
        <line
          x1="0"
          y1="100"
          x2="100"
          y2="0"
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4 2"
        />
        <line
          x1={thresholdNorm * 100}
          y1="0"
          x2={thresholdNorm * 100}
          y2="100"
          stroke="#475569"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <path
          d={`M 0 100 L ${thresholdNorm * 100 - kneeWidth * 50} ${100 - thresholdNorm * 100 + kneeWidth * 50} Q ${thresholdNorm * 100} ${100 - thresholdNorm * 100} ${thresholdNorm * 100 + kneeWidth * 50} ${100 - thresholdNorm * 100 - (kneeWidth * 50) / ratio} L 100 ${100 - thresholdNorm * 100 - ((1 - thresholdNorm) * 100) / ratio}`}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text
          x={thresholdNorm * 100}
          y="95"
          fill="#64748b"
          fontSize="8"
          textAnchor="middle"
        >
          {threshold}dB
        </text>
      </svg>
    </div>
  );
}

function EQSection({
  params,
  values,
  onChange,
  color,
}: {
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const freqParams = params.filter(
    (p) => p.id.includes("freq") || p.id.includes("frequency"),
  );
  const gainParams = params.filter(
    (p) => p.id.includes("gain") && !p.id.includes("makeup"),
  );
  const qParams = params.filter(
    (p) => p.id.includes("q") || p.id.includes("bandwidth"),
  );
  const hasEQBands = freqParams.length > 0;

  if (!hasEQBands) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs text-slate-400 font-medium flex items-center gap-2">
        <Activity className="w-3 h-3" />
        Frequency Response
      </h4>
      <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
        <svg viewBox="0 0 300 80" className="w-full h-20 mb-3">
          <line
            x1="0"
            y1="40"
            x2="300"
            y2="40"
            stroke="#334155"
            strokeWidth="1"
          />
          {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map(
            (freq, i) => (
              <g key={freq}>
                <line
                  x1={i * 33}
                  y1="0"
                  x2={i * 33}
                  y2="80"
                  stroke="#1e293b"
                  strokeWidth="1"
                />
                <text
                  x={i * 33}
                  y="78"
                  fill="#475569"
                  fontSize="6"
                  textAnchor="middle"
                >
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </text>
              </g>
            ),
          )}
          <path
            d="M 0 40 Q 50 35, 100 40 T 200 38 T 300 40"
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
        </svg>
        <div className="grid grid-cols-3 gap-4">
          {freqParams.slice(0, 3).map((param, i) => (
            <div key={param.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[10px] text-slate-400">Band {i + 1}</span>
              </div>
              <Knob
                value={Number(values[param.id] ?? param.defaultValue)}
                min={param.minValue ?? 20}
                max={param.maxValue ?? 20000}
                onChange={(v) => onChange(param.id, v)}
                label="Freq"
                unit="Hz"
                size={40}
                color={color}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompressorSection({
  params,
  values,
  onChange,
  color,
}: {
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const threshold = Number(values["threshold"] ?? -24);
  const ratio = Number(values["ratio"] ?? 4);
  const attack = Number(values["attack"] ?? 10);
  const release = Number(values["release"] ?? 100);
  const knee = Number(values["knee"] ?? 0);
  const makeup = Number(values["makeup"] ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="flex-1">
          <CompressorCurve
            threshold={threshold}
            ratio={ratio}
            knee={knee}
            color={color}
          />
        </div>
        <GainReductionMeter value={-6} color={color} />
      </div>
      <div className="grid grid-cols-6 gap-3">
        <Knob
          value={threshold}
          min={-60}
          max={0}
          onChange={(v) => onChange("threshold", v)}
          label="Threshold"
          unit="dB"
          size={52}
          color={color}
        />
        <Knob
          value={ratio}
          min={1}
          max={20}
          onChange={(v) => onChange("ratio", v)}
          label="Ratio"
          unit=":1"
          size={52}
          color={color}
        />
        <Knob
          value={attack}
          min={0.1}
          max={100}
          onChange={(v) => onChange("attack", v)}
          label="Attack"
          unit="ms"
          size={52}
          color={color}
        />
        <Knob
          value={release}
          min={10}
          max={2000}
          onChange={(v) => onChange("release", v)}
          label="Release"
          unit="ms"
          size={52}
          color={color}
        />
        <Knob
          value={knee}
          min={0}
          max={12}
          onChange={(v) => onChange("knee", v)}
          label="Knee"
          unit="dB"
          size={52}
          color={color}
        />
        <Knob
          value={makeup}
          min={0}
          max={24}
          onChange={(v) => onChange("makeup", v)}
          label="Makeup"
          unit="dB"
          size={52}
          color={color}
        />
      </div>
    </div>
  );
}

function ReverbSection({
  params,
  values,
  onChange,
  color,
}: {
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const decay = Number(values["decay"] ?? values["time"] ?? 2);
  const predelay = Number(values["predelay"] ?? values["preDelay"] ?? 20);
  const diffusion = Number(values["diffusion"] ?? 50);
  const size = Number(values["size"] ?? values["roomSize"] ?? 50);
  const damping = Number(values["damping"] ?? values["highDamp"] ?? 50);
  const mix = Number(values["mix"] ?? values["wet"] ?? 30);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
        <svg viewBox="0 0 200 60" className="w-full h-14">
          <defs>
            <linearGradient id="reverb-tail" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.8" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect x={predelay / 2} y="10" width="3" height="40" fill={color} />
          <path
            d={`M ${predelay / 2 + 5} 10 Q ${50 + decay * 10} 15, ${100 + decay * 20} 50 L ${100 + decay * 20} 50 L ${predelay / 2 + 5} 50 Z`}
            fill="url(#reverb-tail)"
            opacity="0.5"
          />
          {[...Array(8)].map((_, i) => (
            <rect
              key={i}
              x={predelay / 2 + 10 + i * (decay * 3 + 5)}
              y={15 + i * 4}
              width="2"
              height={35 - i * 4}
              fill={color}
              opacity={0.8 - i * 0.1}
            />
          ))}
          <text x="5" y="55" fill="#64748b" fontSize="8">
            Early Ref
          </text>
          <text x="100" y="55" fill="#64748b" fontSize="8">
            Tail
          </text>
        </svg>
      </div>
      <div className="grid grid-cols-6 gap-3">
        <Knob
          value={decay}
          min={0.1}
          max={10}
          onChange={(v) => onChange("decay", v)}
          label="Decay"
          unit="s"
          size={52}
          color={color}
        />
        <Knob
          value={predelay}
          min={0}
          max={200}
          onChange={(v) => onChange("predelay", v)}
          label="Pre-Delay"
          unit="ms"
          size={52}
          color={color}
        />
        <Knob
          value={size}
          min={0}
          max={100}
          onChange={(v) => onChange("size", v)}
          label="Size"
          unit="%"
          size={52}
          color={color}
        />
        <Knob
          value={diffusion}
          min={0}
          max={100}
          onChange={(v) => onChange("diffusion", v)}
          label="Diffusion"
          unit="%"
          size={52}
          color={color}
        />
        <Knob
          value={damping}
          min={0}
          max={100}
          onChange={(v) => onChange("damping", v)}
          label="Damping"
          unit="%"
          size={52}
          color={color}
        />
        <Knob
          value={mix}
          min={0}
          max={100}
          onChange={(v) => onChange("mix", v)}
          label="Mix"
          unit="%"
          size={52}
          color={color}
        />
      </div>
    </div>
  );
}

function DelaySection({
  params,
  values,
  onChange,
  color,
}: {
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const time = Number(values["time"] ?? values["delayTime"] ?? 250);
  const feedback = Number(values["feedback"] ?? 50);
  const mix = Number(values["mix"] ?? values["wet"] ?? 30);
  const pingPong = Boolean(values["pingPong"] ?? false);
  const sync = Boolean(values["sync"] ?? false);
  const modRate = Number(values["modRate"] ?? values["modulation"] ?? 0.5);
  const modDepth = Number(values["modDepth"] ?? 10);
  const hiCut = Number(values["hiCut"] ?? values["highCut"] ?? 12000);
  const loCut = Number(values["loCut"] ?? values["lowCut"] ?? 20);

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50 h-16 flex items-center justify-center gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex flex-col items-center">
            <div
              className="w-1 rounded-full transition-all"
              style={{
                height: `${40 - i * 6}px`,
                backgroundColor: pingPong
                  ? i % 2 === 0
                    ? color
                    : "#3b82f6"
                  : color,
                opacity: 1 - i * 0.15,
              }}
            />
            <span className="text-[7px] text-slate-600 mt-1">
              {Math.round(time * (i + 1))}ms
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Knob
          value={time}
          min={1}
          max={2000}
          onChange={(v) => onChange("time", v)}
          label="Time"
          unit="ms"
          size={52}
          color={color}
        />
        <Knob
          value={feedback}
          min={0}
          max={100}
          onChange={(v) => onChange("feedback", v)}
          label="Feedback"
          unit="%"
          size={52}
          color={color}
        />
        <Knob
          value={mix}
          min={0}
          max={100}
          onChange={(v) => onChange("mix", v)}
          label="Mix"
          unit="%"
          size={52}
          color={color}
        />
        <div className="flex flex-col gap-2">
          <Toggle
            value={pingPong}
            onChange={(v) => onChange("pingPong", v)}
            label="Ping Pong"
            color={color}
          />
          <Toggle
            value={sync}
            onChange={(v) => onChange("sync", v)}
            label="Sync"
            color={color}
          />
        </div>
      </div>
      <div className="border-t border-slate-700/50 pt-3">
        <h5 className="text-[10px] text-slate-500 mb-2">Modulation</h5>
        <div className="grid grid-cols-4 gap-3">
          <Knob
            value={modRate}
            min={0}
            max={10}
            onChange={(v) => onChange("modRate", v)}
            label="Rate"
            unit="Hz"
            size={44}
            color={color}
          />
          <Knob
            value={modDepth}
            min={0}
            max={100}
            onChange={(v) => onChange("modDepth", v)}
            label="Depth"
            unit="%"
            size={44}
            color={color}
          />
          <Knob
            value={hiCut}
            min={1000}
            max={20000}
            onChange={(v) => onChange("hiCut", v)}
            label="Hi-Cut"
            unit="Hz"
            size={44}
            color={color}
          />
          <Knob
            value={loCut}
            min={20}
            max={1000}
            onChange={(v) => onChange("loCut", v)}
            label="Lo-Cut"
            unit="Hz"
            size={44}
            color={color}
          />
        </div>
      </div>
    </div>
  );
}

function SynthSection({
  plugin,
  params,
  values,
  onChange,
  color,
}: {
  plugin: PluginDefinition;
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const attack = Number(values["attack"] ?? 0.01);
  const decay = Number(values["decay"] ?? 0.2);
  const sustain = Number(values["sustain"] ?? 0.7);
  const release = Number(values["release"] ?? 0.3);
  const cutoff = Number(values["cutoff"] ?? values["filterCutoff"] ?? 2000);
  const resonance = Number(
    values["resonance"] ?? values["filterResonance"] ?? 0.5,
  );
  const detune = Number(values["detune"] ?? 0);
  const volume = Number(values["volume"] ?? 0.8);

  const oscTypes = ["sine", "sawtooth", "square", "triangle"];
  const oscType = String(values["waveform"] ?? values["oscType"] ?? "sawtooth");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h5 className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
            <Waves className="w-3 h-3" />
            Oscillator
          </h5>
          <div className="bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
            <div className="flex gap-1 mb-3">
              {oscTypes.map((type) => (
                <button
                  key={type}
                  onClick={() => onChange("waveform", type)}
                  className={`flex-1 py-1 text-[9px] rounded transition-all ${oscType === type ? "text-white" : "bg-slate-800 text-slate-500 hover:text-slate-300"}`}
                  style={oscType === type ? { backgroundColor: color } : {}}
                >
                  {type.slice(0, 3).toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex justify-center gap-4">
              <Knob
                value={detune}
                min={-100}
                max={100}
                onChange={(v) => onChange("detune", v)}
                label="Detune"
                unit="ct"
                size={44}
                color={color}
              />
              <Knob
                value={volume}
                min={0}
                max={1}
                onChange={(v) => onChange("volume", v)}
                label="Volume"
                size={44}
                color={color}
              />
            </div>
          </div>
        </div>
        <div>
          <h5 className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Envelope
          </h5>
          <ADSRVisualizer
            attack={attack}
            decay={decay}
            sustain={sustain}
            release={release}
            color={color}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Knob
          value={attack}
          min={0.001}
          max={2}
          onChange={(v) => onChange("attack", v)}
          label="Attack"
          unit="s"
          size={48}
          color={color}
        />
        <Knob
          value={decay}
          min={0.01}
          max={2}
          onChange={(v) => onChange("decay", v)}
          label="Decay"
          unit="s"
          size={48}
          color={color}
        />
        <Knob
          value={sustain}
          min={0}
          max={1}
          onChange={(v) => onChange("sustain", v)}
          label="Sustain"
          size={48}
          color={color}
        />
        <Knob
          value={release}
          min={0.01}
          max={5}
          onChange={(v) => onChange("release", v)}
          label="Release"
          unit="s"
          size={48}
          color={color}
        />
      </div>
      <div className="border-t border-slate-700/50 pt-3">
        <h5 className="text-[10px] text-slate-500 mb-2 flex items-center gap-1">
          <SlidersIcon className="w-3 h-3" />
          Filter
        </h5>
        <div className="flex justify-center gap-6">
          <Knob
            value={cutoff}
            min={20}
            max={20000}
            onChange={(v) => onChange("cutoff", v)}
            label="Cutoff"
            unit="Hz"
            size={56}
            color={color}
          />
          <Knob
            value={resonance}
            min={0}
            max={1}
            onChange={(v) => onChange("resonance", v)}
            label="Resonance"
            size={56}
            color={color}
          />
        </div>
      </div>
    </div>
  );
}

function GenericSection({
  params,
  values,
  onChange,
  color,
}: {
  params: PluginParameter[];
  values: Record<string, number | boolean | string>;
  onChange: (id: string, v: number | boolean | string) => void;
  color: string;
}) {
  const knobParams = params.filter(
    (p) => p.type === "float" || p.type === "int",
  );
  const boolParams = params.filter((p) => p.type === "bool");
  const choiceParams = params.filter((p) => p.type === "choice");

  const knobsPerRow = 6;
  const knobRows = [];
  for (let i = 0; i < knobParams.length; i += knobsPerRow) {
    knobRows.push(knobParams.slice(i, i + knobsPerRow));
  }

  return (
    <div className="space-y-4">
      {knobRows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex justify-center gap-4 flex-wrap">
          {row.map((param) => (
            <Knob
              key={param.id}
              value={Number(values[param.id] ?? param.defaultValue)}
              min={param.minValue ?? 0}
              max={param.maxValue ?? 1}
              onChange={(v) =>
                onChange(param.id, param.type === "int" ? Math.round(v) : v)
              }
              label={param.name}
              unit={param.unit}
              size={52}
              color={color}
            />
          ))}
        </div>
      ))}
      {choiceParams.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/50">
          {choiceParams.map((param) => (
            <Select
              key={param.id}
              value={String(values[param.id] ?? param.defaultValue)}
              options={param.choices || []}
              onChange={(v) => onChange(param.id, v)}
              label={param.name}
              color={color}
            />
          ))}
        </div>
      )}
      {boolParams.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/50">
          {boolParams.map((param) => (
            <Toggle
              key={param.id}
              value={Boolean(values[param.id] ?? param.defaultValue)}
              onChange={(v) => onChange(param.id, v)}
              label={param.name}
              color={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PluginDialogContent({
  plugin,
  instanceId,
  values,
  bypassed,
  onClose,
  onParameterChange,
  onBypassToggle,
  onReset,
}: PluginDialogProps) {
  const color = TYPE_COLORS[plugin.type] || TYPE_COLORS.default;
  const isCompressor =
    plugin.type === "compressor" ||
    plugin.type === "limiter" ||
    plugin.type === "gate";
  const isReverb = plugin.type === "reverb";
  const isDelay =
    plugin.type === "delay" ||
    plugin.type === "chorus" ||
    plugin.type === "flanger" ||
    plugin.type === "phaser";
  const isEQ = plugin.type === "eq";
  const isInstrument = plugin.category === "instrument";

  const getCategoryIcon = () => {
    if (isInstrument) return <Music className="w-4 h-4" />;
    if (isCompressor) return <Activity className="w-4 h-4" />;
    if (isReverb || isDelay) return <Waves className="w-4 h-4" />;
    return <SlidersIcon className="w-4 h-4" />;
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className={`bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl border shadow-2xl min-w-[480px] max-w-[720px] max-h-[85vh] overflow-hidden flex flex-col ${bypassed ? "opacity-60" : ""}`}
        style={{ borderColor: `${color}40` }}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <motion.div
          className="flex items-center justify-between px-4 py-3 border-b border-slate-700"
          style={{
            background: `linear-gradient(to right, ${color}15, transparent)`,
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center gap-3">
            <motion.div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${color}20`, color }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              {getCategoryIcon()}
            </motion.div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {plugin.name}
              </h3>
              <p className="text-[10px] text-slate-400">{plugin.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              onClick={onBypassToggle}
              className={`p-2 rounded-lg transition-colors ${bypassed ? "bg-amber-500/20 text-amber-400" : "text-emerald-400"}`}
              style={!bypassed ? { backgroundColor: `${color}20` } : {}}
              title={bypassed ? "Enable" : "Bypass"}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Power className="w-4 h-4" />
            </motion.button>
            <motion.button
              onClick={onReset}
              className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600"
              title="Reset"
              whileHover={{ scale: 1.1, rotate: -180 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <RotateCcw className="w-4 h-4" />
            </motion.button>
            <motion.button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>

        <motion.div
          className="flex-1 overflow-y-auto p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          {isCompressor && (
            <CompressorSection
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
          {isReverb && (
            <ReverbSection
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
          {isDelay && (
            <DelaySection
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
          {isEQ && (
            <EQSection
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
          {isInstrument && (
            <SynthSection
              plugin={plugin}
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
          {!isCompressor && !isReverb && !isDelay && !isEQ && !isInstrument && (
            <GenericSection
              params={plugin.parameters}
              values={values}
              onChange={onParameterChange}
              color={color}
            />
          )}
        </motion.div>

        <motion.div
          className="flex items-center justify-between px-4 py-2 border-t border-slate-700 bg-slate-900/50"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>{plugin.author}</span>
            <span className="text-slate-700">|</span>
            <span>v{plugin.version}</span>
            <motion.span
              className="px-1.5 py-0.5 rounded text-slate-400"
              style={{ backgroundColor: `${color}15`, color }}
              whileHover={{ scale: 1.05 }}
            >
              {plugin.type}
            </motion.span>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Folder className="w-3 h-3" />
              Presets
            </motion.button>
            <motion.button
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ backgroundColor: `${color}20`, color }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Save className="w-3 h-3" />
              Save
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

interface PluginDialogWrapperProps extends PluginDialogProps {
  isOpen: boolean;
}

export function PluginDialog({ isOpen, ...props }: PluginDialogWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      {isOpen && <PluginDialogContent key="plugin-dialog" {...props} />}
    </AnimatePresence>
  );
}

export { PluginDialogContent };
export default PluginDialog;
