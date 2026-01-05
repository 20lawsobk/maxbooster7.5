import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Waves,
  Plus,
  Trash2,
  Link,
  Unlink,
  Play,
  Pause,
  Settings,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Copy,
  Clipboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Knob } from './Knob';

export type LFOWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square' | 'random' | 'sample-hold';
export type EnvelopeType = 'adsr' | 'ahdsr' | 'ad' | 'ar';

export interface LFOConfig {
  id: string;
  name: string;
  waveform: LFOWaveform;
  frequency: number;
  phase: number;
  amount: number;
  offset: number;
  sync: boolean;
  syncDivision: string;
  retrigger: boolean;
  enabled: boolean;
}

export interface EnvelopeConfig {
  id: string;
  name: string;
  type: EnvelopeType;
  attack: number;
  hold: number;
  decay: number;
  sustain: number;
  release: number;
  curve: number;
  amount: number;
  enabled: boolean;
}

export interface ModulationRoute {
  id: string;
  sourceType: 'lfo' | 'envelope' | 'velocity' | 'keytrack' | 'aftertouch' | 'modwheel';
  sourceId: string;
  targetParameter: string;
  targetTrackId?: string;
  amount: number;
  bipolar: boolean;
  enabled: boolean;
}

interface ModulationMatrixProps {
  trackId: string;
  availableParameters: { id: string; name: string; group: string }[];
  onRoutesChange?: (routes: ModulationRoute[]) => void;
  onLFOsChange?: (lfos: LFOConfig[]) => void;
  onEnvelopesChange?: (envelopes: EnvelopeConfig[]) => void;
  className?: string;
}

const SYNC_DIVISIONS = [
  '1/1', '1/2', '1/2T', '1/4', '1/4T', '1/8', '1/8T', 
  '1/16', '1/16T', '1/32', '1/32T', '1/64',
];

const WAVEFORMS: { value: LFOWaveform; label: string }[] = [
  { value: 'sine', label: 'Sine' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sawtooth', label: 'Sawtooth' },
  { value: 'square', label: 'Square' },
  { value: 'random', label: 'Random' },
  { value: 'sample-hold', label: 'S&H' },
];

const DEFAULT_PARAMETERS = [
  { id: 'volume', name: 'Volume', group: 'Mixer' },
  { id: 'pan', name: 'Pan', group: 'Mixer' },
  { id: 'pitch', name: 'Pitch', group: 'Oscillator' },
  { id: 'filterCutoff', name: 'Filter Cutoff', group: 'Filter' },
  { id: 'filterResonance', name: 'Filter Resonance', group: 'Filter' },
  { id: 'filterEnvAmount', name: 'Filter Env', group: 'Filter' },
  { id: 'oscMix', name: 'Osc Mix', group: 'Oscillator' },
  { id: 'pwm', name: 'Pulse Width', group: 'Oscillator' },
  { id: 'reverbMix', name: 'Reverb', group: 'Effects' },
  { id: 'delayMix', name: 'Delay', group: 'Effects' },
  { id: 'chorusMix', name: 'Chorus', group: 'Effects' },
  { id: 'distortionDrive', name: 'Drive', group: 'Effects' },
];

export function ModulationMatrix({
  trackId,
  availableParameters = DEFAULT_PARAMETERS,
  onRoutesChange,
  onLFOsChange,
  onEnvelopesChange,
  className = '',
}: ModulationMatrixProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const [lfos, setLFOs] = useState<LFOConfig[]>([
    {
      id: 'lfo-1',
      name: 'LFO 1',
      waveform: 'sine',
      frequency: 1,
      phase: 0,
      amount: 1,
      offset: 0,
      sync: false,
      syncDivision: '1/4',
      retrigger: false,
      enabled: true,
    },
  ]);

  const [envelopes, setEnvelopes] = useState<EnvelopeConfig[]>([
    {
      id: 'env-1',
      name: 'Envelope 1',
      type: 'adsr',
      attack: 10,
      hold: 0,
      decay: 200,
      sustain: 0.7,
      release: 300,
      curve: 0,
      amount: 1,
      enabled: true,
    },
  ]);

  const [routes, setRoutes] = useState<ModulationRoute[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'lfos' | 'envelopes' | 'routes' | null>('lfos');

  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const draw = () => {
      ctx.fillStyle = 'rgba(10, 10, 26, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      lfos.filter(lfo => lfo.enabled).forEach((lfo, idx) => {
        ctx.strokeStyle = `hsl(${(idx * 60) % 360}, 70%, 60%)`;
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let x = 0; x < canvas.width; x++) {
          const t = (x / canvas.width) * 4 * Math.PI + phase * lfo.frequency;
          let y: number;
          
          switch (lfo.waveform) {
            case 'sine':
              y = Math.sin(t);
              break;
            case 'triangle':
              y = (2 / Math.PI) * Math.asin(Math.sin(t));
              break;
            case 'sawtooth':
              y = 2 * ((t / (2 * Math.PI)) % 1) - 1;
              break;
            case 'square':
              y = Math.sin(t) > 0 ? 1 : -1;
              break;
            case 'random':
              y = Math.sin(t * 10 + idx) * Math.cos(t * 3);
              break;
            case 'sample-hold':
              y = Math.floor(Math.sin(t * 2) * 4) / 4;
              break;
            default:
              y = Math.sin(t);
          }

          y = y * lfo.amount + lfo.offset;
          const canvasY = canvas.height / 2 - (y * canvas.height * 0.4);
          
          if (x === 0) {
            ctx.moveTo(x, canvasY);
          } else {
            ctx.lineTo(x, canvasY);
          }
        }
        ctx.stroke();
      });

      phase += 0.05;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, lfos]);

  const addLFO = useCallback(() => {
    const newLFO: LFOConfig = {
      id: `lfo-${Date.now()}`,
      name: `LFO ${lfos.length + 1}`,
      waveform: 'sine',
      frequency: 1,
      phase: 0,
      amount: 1,
      offset: 0,
      sync: false,
      syncDivision: '1/4',
      retrigger: false,
      enabled: true,
    };
    const updated = [...lfos, newLFO];
    setLFOs(updated);
    onLFOsChange?.(updated);
  }, [lfos, onLFOsChange]);

  const updateLFO = useCallback((id: string, updates: Partial<LFOConfig>) => {
    const updated = lfos.map(lfo => 
      lfo.id === id ? { ...lfo, ...updates } : lfo
    );
    setLFOs(updated);
    onLFOsChange?.(updated);
  }, [lfos, onLFOsChange]);

  const removeLFO = useCallback((id: string) => {
    const updated = lfos.filter(lfo => lfo.id !== id);
    setLFOs(updated);
    onLFOsChange?.(updated);
    setRoutes(prev => prev.filter(r => r.sourceId !== id));
  }, [lfos, onLFOsChange]);

  const addEnvelope = useCallback(() => {
    const newEnv: EnvelopeConfig = {
      id: `env-${Date.now()}`,
      name: `Envelope ${envelopes.length + 1}`,
      type: 'adsr',
      attack: 10,
      hold: 0,
      decay: 200,
      sustain: 0.7,
      release: 300,
      curve: 0,
      amount: 1,
      enabled: true,
    };
    const updated = [...envelopes, newEnv];
    setEnvelopes(updated);
    onEnvelopesChange?.(updated);
  }, [envelopes, onEnvelopesChange]);

  const updateEnvelope = useCallback((id: string, updates: Partial<EnvelopeConfig>) => {
    const updated = envelopes.map(env => 
      env.id === id ? { ...env, ...updates } : env
    );
    setEnvelopes(updated);
    onEnvelopesChange?.(updated);
  }, [envelopes, onEnvelopesChange]);

  const removeEnvelope = useCallback((id: string) => {
    const updated = envelopes.filter(env => env.id !== id);
    setEnvelopes(updated);
    onEnvelopesChange?.(updated);
    setRoutes(prev => prev.filter(r => r.sourceId !== id));
  }, [envelopes, onEnvelopesChange]);

  const addRoute = useCallback((sourceType: ModulationRoute['sourceType'], sourceId: string) => {
    const newRoute: ModulationRoute = {
      id: `route-${Date.now()}`,
      sourceType,
      sourceId,
      targetParameter: 'volume',
      targetTrackId: trackId,
      amount: 0.5,
      bipolar: true,
      enabled: true,
    };
    const updated = [...routes, newRoute];
    setRoutes(updated);
    onRoutesChange?.(updated);
  }, [routes, trackId, onRoutesChange]);

  const updateRoute = useCallback((id: string, updates: Partial<ModulationRoute>) => {
    const updated = routes.map(route => 
      route.id === id ? { ...route, ...updates } : route
    );
    setRoutes(updated);
    onRoutesChange?.(updated);
  }, [routes, onRoutesChange]);

  const removeRoute = useCallback((id: string) => {
    const updated = routes.filter(route => route.id !== id);
    setRoutes(updated);
    onRoutesChange?.(updated);
  }, [routes, onRoutesChange]);

  const getSourceName = useCallback((route: ModulationRoute): string => {
    if (route.sourceType === 'lfo') {
      return lfos.find(l => l.id === route.sourceId)?.name || 'Unknown LFO';
    }
    if (route.sourceType === 'envelope') {
      return envelopes.find(e => e.id === route.sourceId)?.name || 'Unknown Env';
    }
    return route.sourceType.charAt(0).toUpperCase() + route.sourceType.slice(1);
  }, [lfos, envelopes]);

  const renderLFOEditor = (lfo: LFOConfig) => (
    <motion.div
      key={lfo.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-3 rounded-lg border mb-2"
      style={{ 
        borderColor: 'var(--studio-border)',
        background: 'var(--studio-bg-deep)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={lfo.enabled}
            onCheckedChange={(checked) => updateLFO(lfo.id, { enabled: checked })}
          />
          <Input
            value={lfo.name}
            onChange={(e) => updateLFO(lfo.id, { name: e.target.value })}
            className="h-6 w-24 text-xs bg-transparent border-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => addRoute('lfo', lfo.id)}
          >
            <Link className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-red-400"
            onClick={() => removeLFO(lfo.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="col-span-2">
          <Label className="text-[10px] text-gray-400">Waveform</Label>
          <Select
            value={lfo.waveform}
            onValueChange={(v) => updateLFO(lfo.id, { waveform: v as LFOWaveform })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WAVEFORMS.map(w => (
                <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex flex-col items-center">
          <Knob
            value={lfo.frequency}
            onChange={(v) => updateLFO(lfo.id, { frequency: v })}
            min={0.01}
            max={20}
            size={40}
            label={lfo.sync ? '' : 'Rate'}
            color="#3b82f6"
          />
        </div>
        
        <div className="flex flex-col items-center">
          <Knob
            value={lfo.amount}
            onChange={(v) => updateLFO(lfo.id, { amount: v })}
            min={0}
            max={1}
            size={40}
            label="Amount"
            color="#22c55e"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={lfo.sync}
            onCheckedChange={(checked) => updateLFO(lfo.id, { sync: checked })}
          />
          <Label className="text-[10px]">Sync</Label>
        </div>
        
        {lfo.sync && (
          <Select
            value={lfo.syncDivision}
            onValueChange={(v) => updateLFO(lfo.id, { syncDivision: v })}
          >
            <SelectTrigger className="h-6 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SYNC_DIVISIONS.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        <div className="flex items-center gap-2">
          <Switch
            checked={lfo.retrigger}
            onCheckedChange={(checked) => updateLFO(lfo.id, { retrigger: checked })}
          />
          <Label className="text-[10px]">Retrig</Label>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-2">
          <Label className="text-[10px]">Phase</Label>
          <Slider
            value={[lfo.phase]}
            onValueChange={([v]) => updateLFO(lfo.id, { phase: v })}
            min={0}
            max={360}
            step={1}
            className="w-20"
          />
          <span className="text-[10px] w-8">{lfo.phase}°</span>
        </div>
      </div>
    </motion.div>
  );

  const renderEnvelopeEditor = (env: EnvelopeConfig) => (
    <motion.div
      key={env.id}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-3 rounded-lg border mb-2"
      style={{ 
        borderColor: 'var(--studio-border)',
        background: 'var(--studio-bg-deep)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Switch
            checked={env.enabled}
            onCheckedChange={(checked) => updateEnvelope(env.id, { enabled: checked })}
          />
          <Input
            value={env.name}
            onChange={(e) => updateEnvelope(env.id, { name: e.target.value })}
            className="h-6 w-24 text-xs bg-transparent border-none"
          />
        </div>
        <div className="flex items-center gap-1">
          <Select
            value={env.type}
            onValueChange={(v) => updateEnvelope(env.id, { type: v as EnvelopeType })}
          >
            <SelectTrigger className="h-6 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="adsr">ADSR</SelectItem>
              <SelectItem value="ahdsr">AHDSR</SelectItem>
              <SelectItem value="ad">AD</SelectItem>
              <SelectItem value="ar">AR</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => addRoute('envelope', env.id)}
          >
            <Link className="h-3 w-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-red-400"
            onClick={() => removeEnvelope(env.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 justify-center">
        <div className="flex flex-col items-center">
          <Knob
            value={env.attack}
            onChange={(v) => updateEnvelope(env.id, { attack: v })}
            min={0}
            max={2000}
            size={36}
            label="A"
            color="#ef4444"
          />
          <span className="text-[9px] text-gray-500">{env.attack}ms</span>
        </div>
        
        {(env.type === 'ahdsr') && (
          <div className="flex flex-col items-center">
            <Knob
              value={env.hold}
              onChange={(v) => updateEnvelope(env.id, { hold: v })}
              min={0}
              max={2000}
              size={36}
              label="H"
              color="#f59e0b"
            />
            <span className="text-[9px] text-gray-500">{env.hold}ms</span>
          </div>
        )}
        
        {(env.type === 'adsr' || env.type === 'ahdsr') && (
          <>
            <div className="flex flex-col items-center">
              <Knob
                value={env.decay}
                onChange={(v) => updateEnvelope(env.id, { decay: v })}
                min={0}
                max={5000}
                size={36}
                label="D"
                color="#22c55e"
              />
              <span className="text-[9px] text-gray-500">{env.decay}ms</span>
            </div>
            
            <div className="flex flex-col items-center">
              <Knob
                value={env.sustain * 100}
                onChange={(v) => updateEnvelope(env.id, { sustain: v / 100 })}
                min={0}
                max={100}
                size={36}
                label="S"
                color="#3b82f6"
              />
              <span className="text-[9px] text-gray-500">{(env.sustain * 100).toFixed(0)}%</span>
            </div>
          </>
        )}
        
        <div className="flex flex-col items-center">
          <Knob
            value={env.release}
            onChange={(v) => updateEnvelope(env.id, { release: v })}
            min={0}
            max={10000}
            size={36}
            label="R"
            color="#8b5cf6"
          />
          <span className="text-[9px] text-gray-500">{env.release}ms</span>
        </div>
        
        <div className="flex flex-col items-center">
          <Knob
            value={env.amount}
            onChange={(v) => updateEnvelope(env.id, { amount: v })}
            min={0}
            max={1}
            size={36}
            label="Amt"
            color="#06b6d4"
          />
        </div>
      </div>
    </motion.div>
  );

  return (
    <div
      className={`rounded-lg border ${className}`}
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <div
        className="h-10 px-3 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
            Modulation Matrix
          </span>
          <Badge variant="outline" className="text-[9px]">
            {routes.filter(r => r.enabled).length} Routes
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant={isPlaying ? 'secondary' : 'ghost'}
            className="h-7 w-7"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className="h-20 border-b relative" style={{ borderColor: 'var(--studio-border)' }}>
        <canvas
          ref={canvasRef}
          width={400}
          height={80}
          className="w-full h-full"
        />
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="text-xs text-gray-400">Click play to preview modulation</span>
          </div>
        )}
      </div>

      <ScrollArea className="h-[400px]">
        <div className="p-2">
          <div className="mb-2">
            <button
              onClick={() => setExpandedSection(expandedSection === 'lfos' ? null : 'lfos')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-blue-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  LFOs
                </span>
                <Badge variant="secondary" className="text-[9px]">{lfos.length}</Badge>
              </div>
              {expandedSection === 'lfos' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            
            <AnimatePresence>
              {expandedSection === 'lfos' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2">
                    {lfos.map(lfo => renderLFOEditor(lfo))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={addLFO}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add LFO
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-2" />

          <div className="mb-2">
            <button
              onClick={() => setExpandedSection(expandedSection === 'envelopes' ? null : 'envelopes')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M2 20L6 8L10 14L14 4L18 12L22 6" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  Envelopes
                </span>
                <Badge variant="secondary" className="text-[9px]">{envelopes.length}</Badge>
              </div>
              {expandedSection === 'envelopes' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            
            <AnimatePresence>
              {expandedSection === 'envelopes' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2">
                    {envelopes.map(env => renderEnvelopeEditor(env))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={addEnvelope}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Envelope
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <Separator className="my-2" />

          <div>
            <button
              onClick={() => setExpandedSection(expandedSection === 'routes' ? null : 'routes')}
              className="w-full flex items-center justify-between p-2 rounded hover:bg-white/5"
            >
              <div className="flex items-center gap-2">
                <Link className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold" style={{ color: 'var(--studio-text)' }}>
                  Routing
                </span>
                <Badge variant="secondary" className="text-[9px]">{routes.length}</Badge>
              </div>
              {expandedSection === 'routes' ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
            
            <AnimatePresence>
              {expandedSection === 'routes' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2 space-y-2">
                    {routes.length === 0 ? (
                      <div className="text-center py-4 text-xs text-gray-500">
                        No routes configured. Click the link icon on an LFO or Envelope to add a route.
                      </div>
                    ) : (
                      routes.map(route => (
                        <div
                          key={route.id}
                          className="flex items-center gap-2 p-2 rounded border"
                          style={{ 
                            borderColor: 'var(--studio-border)',
                            background: route.enabled ? 'var(--studio-bg-deep)' : 'transparent',
                            opacity: route.enabled ? 1 : 0.5,
                          }}
                        >
                          <Switch
                            checked={route.enabled}
                            onCheckedChange={(checked) => updateRoute(route.id, { enabled: checked })}
                          />
                          <Badge variant="outline" className="text-[9px]">
                            {getSourceName(route)}
                          </Badge>
                          <span className="text-gray-400">→</span>
                          <Select
                            value={route.targetParameter}
                            onValueChange={(v) => updateRoute(route.id, { targetParameter: v })}
                          >
                            <SelectTrigger className="h-6 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableParameters.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Slider
                            value={[route.amount]}
                            onValueChange={([v]) => updateRoute(route.id, { amount: v })}
                            min={0}
                            max={1}
                            step={0.01}
                            className="w-20"
                          />
                          <span className="text-[10px] w-8">{(route.amount * 100).toFixed(0)}%</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5 text-red-400"
                            onClick={() => removeRoute(route.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
