import { useState, useEffect, useCallback } from 'react';
import { X, Power, RotateCcw, ChevronDown, Save, Folder } from 'lucide-react';

export interface PluginParameter {
  id: string;
  name: string;
  type: 'float' | 'int' | 'bool' | 'choice';
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
  category: 'instrument' | 'effect';
  type: string;
  version: string;
  description: string;
  author: string;
  parameters: PluginParameter[];
  defaultPreset: Record<string, number | boolean | string>;
}

interface PluginDialogProps {
  plugin: PluginDefinition;
  instanceId: string;
  values: Record<string, number | boolean | string>;
  bypassed: boolean;
  onClose: () => void;
  onParameterChange: (paramId: string, value: number | boolean | string) => void;
  onBypassToggle: () => void;
  onReset: () => void;
}

function Knob({ 
  value, 
  min, 
  max, 
  onChange, 
  label, 
  unit,
  size = 48,
  color = '#10b981'
}: { 
  value: number; 
  min: number; 
  max: number; 
  onChange: (v: number) => void; 
  label: string;
  unit?: string;
  size?: number;
  color?: string;
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
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, startY, startValue, min, max, onChange]);
  
  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`;
    if (Math.abs(v) < 1) return v.toFixed(2);
    if (Math.abs(v) < 10) return v.toFixed(1);
    return Math.round(v).toString();
  };
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div 
        className={`relative cursor-pointer ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onChange((min + max) / 2)}
      >
        <svg viewBox="0 0 40 40" className="w-full h-full">
          <circle cx="20" cy="20" r="18" fill="#1e293b" stroke="#334155" strokeWidth="1" />
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
          />
          <line 
            x1="20" y1="8" x2="20" y2="14"
            stroke="#e2e8f0"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 20 20)`}
          />
        </svg>
      </div>
      <span className="text-[10px] text-slate-300 font-medium text-center truncate w-full">{label}</span>
      <span className="text-[9px] text-emerald-400 font-mono">{formatValue(value)}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  onChange,
  label,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
  unit?: string;
}) {
  const formatValue = (v: number) => {
    if (Math.abs(v) >= 1000) return `${(v/1000).toFixed(1)}k`;
    if (Math.abs(v) < 1) return v.toFixed(2);
    return v.toFixed(1);
  };
  
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-slate-400">{label}</span>
        <span className="text-[9px] text-emerald-400 font-mono">{formatValue(value)}{unit ? ` ${unit}` : ''}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={(max - min) / 100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded appearance-none cursor-pointer accent-emerald-500"
      />
    </div>
  );
}

function Toggle({
  value,
  onChange,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
        value 
          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
          : 'bg-slate-800 border-slate-600 text-slate-400'
      }`}
    >
      <div className={`w-3 h-3 rounded-full ${value ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      <span className="text-xs">{label}</span>
    </button>
  );
}

function Select({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-slate-400">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-600 rounded text-sm text-slate-200 outline-none appearance-none cursor-pointer hover:border-slate-500"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

export function PluginDialog({
  plugin,
  instanceId,
  values,
  bypassed,
  onClose,
  onParameterChange,
  onBypassToggle,
  onReset,
}: PluginDialogProps) {
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      reverb: '#8b5cf6', delay: '#3b82f6', chorus: '#06b6d4', flanger: '#06b6d4',
      phaser: '#f59e0b', compressor: '#10b981', eq: '#3b82f6', limiter: '#ef4444',
      gate: '#6366f1', distortion: '#ef4444', piano: '#1e1e1e', strings: '#8b5cf6',
      drums: '#ef4444', bass: '#f97316', pad: '#a855f7', synth: '#f59e0b',
      analog: '#f59e0b', fm: '#3b82f6', wavetable: '#8b5cf6', sampler: '#06b6d4',
    };
    return colors[type] || '#64748b';
  };
  
  const knobParams = plugin.parameters.filter(p => p.type === 'float' || p.type === 'int');
  const boolParams = plugin.parameters.filter(p => p.type === 'bool');
  const choiceParams = plugin.parameters.filter(p => p.type === 'choice');
  
  const knobsPerRow = 6;
  const knobRows = [];
  for (let i = 0; i < knobParams.length; i += knobsPerRow) {
    knobRows.push(knobParams.slice(i, i + knobsPerRow));
  }
  
  return (
    <div 
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className={`bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl border border-slate-700 shadow-2xl min-w-[400px] max-w-[700px] ${bypassed ? 'opacity-60' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="flex items-center justify-between px-4 py-3 border-b border-slate-700 rounded-t-xl"
          style={{ background: `linear-gradient(to right, ${getTypeColor(plugin.type)}20, transparent)` }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: getTypeColor(plugin.type) }}
            />
            <div>
              <h3 className="text-lg font-semibold text-white">{plugin.name}</h3>
              <p className="text-[10px] text-slate-400">{plugin.description}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onBypassToggle}
              className={`p-1.5 rounded transition-colors ${
                bypassed ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}
              title={bypassed ? 'Enable Plugin' : 'Bypass Plugin'}
            >
              <Power className="w-4 h-4" />
            </button>
            <button
              onClick={onReset}
              className="p-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
              title="Reset to Default"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {knobRows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-4 flex-wrap">
              {row.map((param) => (
                <Knob
                  key={param.id}
                  value={Number(values[param.id] ?? param.defaultValue)}
                  min={param.minValue ?? 0}
                  max={param.maxValue ?? 1}
                  onChange={(v) => onParameterChange(param.id, param.type === 'int' ? Math.round(v) : v)}
                  label={param.name}
                  unit={param.unit}
                  color={getTypeColor(plugin.type)}
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
                  onChange={(v) => onParameterChange(param.id, v)}
                  label={param.name}
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
                  onChange={(v) => onParameterChange(param.id, v)}
                  label={param.name}
                />
              ))}
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700 bg-slate-900/50 rounded-b-xl">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span>{plugin.author}</span>
            <span>v{plugin.version}</span>
            <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">{plugin.type}</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs">
              <Folder className="w-3 h-3" />
              Presets
            </button>
            <button className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-xs">
              <Save className="w-3 h-3" />
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PluginDialog;
