import { useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Flame,
  Power,
  RotateCcw,
  Settings,
  Maximize2,
  Minimize2,
  Volume2,
  Thermometer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Knob } from './Knob';

export type SaturationModel = 
  | 'tube' 
  | 'tape' 
  | 'transistor' 
  | 'transformer' 
  | 'console' 
  | 'triode'
  | 'pentode';

export type TapeFormulation = 'type-1' | 'type-2' | 'type-3' | 'modern' | 'vintage';

export interface AnalogWarmthConfig {
  enabled: boolean;
  model: SaturationModel;
  drive: number;
  mix: number;
  outputLevel: number;
  
  tubeParams: {
    bias: number;
    harmonics: number;
    oddEvenBalance: number;
    sagAmount: number;
    plateVoltage: number;
  };
  
  tapeParams: {
    formulation: TapeFormulation;
    speed: number;
    saturation: number;
    hiss: number;
    flutter: number;
    wowDepth: number;
    headBump: number;
    highFreqRolloff: number;
  };
  
  transformerParams: {
    inputImpedance: number;
    coreType: 'nickel' | 'steel' | 'amorphous';
    saturation: number;
    lowFreqEnhance: number;
    highFreqSoftening: number;
  };
  
  consoleParams: {
    consoleType: 'neve' | 'ssl' | 'api' | 'trident';
    preampGain: number;
    eqColor: number;
    crosstalk: number;
  };
}

interface AnalogWarmthProcessorProps {
  trackId: string;
  audioContext?: AudioContext | null;
  inputNode?: AudioNode | null;
  outputNode?: AudioNode | null;
  onConfigChange?: (config: AnalogWarmthConfig) => void;
  className?: string;
}

const defaultConfig: AnalogWarmthConfig = {
  enabled: true,
  model: 'tube',
  drive: 30,
  mix: 100,
  outputLevel: 0,
  
  tubeParams: {
    bias: 50,
    harmonics: 50,
    oddEvenBalance: 50,
    sagAmount: 20,
    plateVoltage: 250,
  },
  
  tapeParams: {
    formulation: 'vintage',
    speed: 15,
    saturation: 40,
    hiss: 0,
    flutter: 0,
    wowDepth: 0,
    headBump: 30,
    highFreqRolloff: 60,
  },
  
  transformerParams: {
    inputImpedance: 600,
    coreType: 'nickel',
    saturation: 30,
    lowFreqEnhance: 20,
    highFreqSoftening: 15,
  },
  
  consoleParams: {
    consoleType: 'neve',
    preampGain: 40,
    eqColor: 50,
    crosstalk: 5,
  },
};

const SATURATION_MODELS: { value: SaturationModel; label: string; description: string }[] = [
  { value: 'tube', label: 'Tube', description: 'Classic vacuum tube warmth' },
  { value: 'tape', label: 'Tape', description: 'Analog tape saturation' },
  { value: 'transistor', label: 'Transistor', description: 'Solid-state character' },
  { value: 'transformer', label: 'Transformer', description: 'Iron core coloration' },
  { value: 'console', label: 'Console', description: 'Vintage console emulation' },
  { value: 'triode', label: 'Triode', description: 'Single triode tube stage' },
  { value: 'pentode', label: 'Pentode', description: 'Pentode tube harmonics' },
];

export function AnalogWarmthProcessor({
  trackId,
  audioContext,
  inputNode,
  outputNode,
  onConfigChange,
  className = '',
}: AnalogWarmthProcessorProps) {
  const waveShaperRef = useRef<WaveShaperNode | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [config, setConfig] = useState<AnalogWarmthConfig>(defaultConfig);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [currentHarmonics, setCurrentHarmonics] = useState<number[]>([]);

  useEffect(() => {
    if (!audioContext) return;

    const waveShaper = audioContext.createWaveShaper();
    const dryGain = audioContext.createGain();
    const wetGain = audioContext.createGain();
    const outputGain = audioContext.createGain();

    waveShaperRef.current = waveShaper;
    dryGainRef.current = dryGain;
    wetGainRef.current = wetGain;
    outputGainRef.current = outputGain;

    updateSaturationCurve();
    updateMixLevels();

    return () => {
      waveShaper.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      outputGain.disconnect();
    };
  }, [audioContext]);

  useEffect(() => {
    updateSaturationCurve();
    updateMixLevels();
    onConfigChange?.(config);
  }, [config, onConfigChange]);

  const updateMixLevels = useCallback(() => {
    if (!dryGainRef.current || !wetGainRef.current || !outputGainRef.current) return;
    
    const wetAmount = config.mix / 100;
    const dryAmount = 1 - wetAmount;
    
    dryGainRef.current.gain.value = config.enabled ? dryAmount : 1;
    wetGainRef.current.gain.value = config.enabled ? wetAmount : 0;
    outputGainRef.current.gain.value = Math.pow(10, config.outputLevel / 20);
  }, [config.mix, config.outputLevel, config.enabled]);

  const updateSaturationCurve = useCallback(() => {
    if (!waveShaperRef.current) return;

    const samples = 4096;
    const curve = new Float32Array(samples);
    const drive = config.drive / 100;
    
    switch (config.model) {
      case 'tube':
        generateTubeCurve(curve, drive, config.tubeParams);
        break;
      case 'tape':
        generateTapeCurve(curve, drive, config.tapeParams);
        break;
      case 'transistor':
        generateTransistorCurve(curve, drive);
        break;
      case 'transformer':
        generateTransformerCurve(curve, drive, config.transformerParams);
        break;
      case 'console':
        generateConsoleCurve(curve, drive, config.consoleParams);
        break;
      case 'triode':
        generateTriodeCurve(curve, drive);
        break;
      case 'pentode':
        generatePentodeCurve(curve, drive);
        break;
    }

    waveShaperRef.current.curve = curve;
    waveShaperRef.current.oversample = '4x';

    drawTransferFunction(curve);
    analyzeHarmonics(curve);
  }, [config]);

  const generateTubeCurve = (
    curve: Float32Array,
    drive: number,
    params: typeof config.tubeParams
  ) => {
    const samples = curve.length;
    const bias = (params.bias - 50) / 100;
    const oddEven = params.oddEvenBalance / 100;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      const biasedX = x + bias * 0.1;
      
      const driveAmount = 1 + drive * 10;
      let y = Math.tanh(biasedX * driveAmount);
      
      const oddHarmonics = Math.tanh(biasedX * driveAmount * 1.5);
      const evenHarmonics = Math.tanh((biasedX + 0.1) * driveAmount) - Math.tanh(0.1 * driveAmount);
      
      y = y * oddEven + evenHarmonics * (1 - oddEven) * 0.5;
      
      const sag = 1 - params.sagAmount / 100 * 0.1 * Math.abs(x);
      y *= sag;
      
      curve[i] = y;
    }
  };

  const generateTapeCurve = (
    curve: Float32Array,
    drive: number,
    params: typeof config.tapeParams
  ) => {
    const samples = curve.length;
    const saturation = params.saturation / 100;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const k = 1 + drive * 5 * saturation;
      let y = x * (Math.abs(x) + k) / (x * x + (k - 1) * Math.abs(x) + 1);
      
      const softKnee = 0.1;
      if (Math.abs(y) > 1 - softKnee) {
        const excess = Math.abs(y) - (1 - softKnee);
        y = Math.sign(y) * (1 - softKnee + softKnee * Math.tanh(excess / softKnee));
      }
      
      const highFreqRoll = 1 - (params.highFreqRolloff / 100) * 0.1 * Math.pow(Math.abs(x), 2);
      y *= highFreqRoll;
      
      curve[i] = y;
    }
  };

  const generateTransistorCurve = (curve: Float32Array, drive: number) => {
    const samples = curve.length;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const k = 2 + drive * 8;
      let y;
      
      if (x >= 0) {
        y = 1 - Math.exp(-k * x);
      } else {
        y = -(1 - Math.exp(k * x));
      }
      
      curve[i] = y;
    }
  };

  const generateTransformerCurve = (
    curve: Float32Array,
    drive: number,
    params: typeof config.transformerParams
  ) => {
    const samples = curve.length;
    const saturation = params.saturation / 100;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const k = 1 + drive * 3 * saturation;
      let y = x;
      
      const magneticSat = Math.tanh(x * k);
      y = y * (1 - saturation * 0.5) + magneticSat * saturation * 0.5;
      
      const asymmetry = 0.05 * saturation;
      y += asymmetry * x * Math.abs(x);
      
      curve[i] = Math.max(-1, Math.min(1, y));
    }
  };

  const generateConsoleCurve = (
    curve: Float32Array,
    drive: number,
    params: typeof config.consoleParams
  ) => {
    const samples = curve.length;
    
    let character = { softness: 0.5, asymmetry: 0.1, harmonics: 0.3 };
    
    switch (params.consoleType) {
      case 'neve':
        character = { softness: 0.7, asymmetry: 0.15, harmonics: 0.4 };
        break;
      case 'ssl':
        character = { softness: 0.3, asymmetry: 0.05, harmonics: 0.2 };
        break;
      case 'api':
        character = { softness: 0.5, asymmetry: 0.2, harmonics: 0.35 };
        break;
      case 'trident':
        character = { softness: 0.6, asymmetry: 0.1, harmonics: 0.45 };
        break;
    }
    
    const preamp = params.preampGain / 100;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const driven = x * (1 + preamp * drive * 5);
      let y = Math.tanh(driven * (1 + character.softness));
      
      y += character.asymmetry * driven * Math.abs(driven);
      
      const harmonic = character.harmonics * Math.sin(driven * Math.PI) * 0.1;
      y += harmonic;
      
      curve[i] = Math.max(-1, Math.min(1, y));
    }
  };

  const generateTriodeCurve = (curve: Float32Array, drive: number) => {
    const samples = curve.length;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const k = 1 + drive * 8;
      let y;
      
      if (x >= 0) {
        y = Math.pow(x, 1.5 - drive * 0.3) * Math.tanh(x * k);
      } else {
        y = -Math.pow(Math.abs(x), 1.2) * Math.tanh(Math.abs(x) * k * 0.8);
      }
      
      curve[i] = Math.max(-1, Math.min(1, y));
    }
  };

  const generatePentodeCurve = (curve: Float32Array, drive: number) => {
    const samples = curve.length;
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      
      const k = 2 + drive * 10;
      let y = Math.tanh(x * k);
      
      const oddHarmonic = 0.1 * drive * Math.sin(x * Math.PI * 3);
      y += oddHarmonic;
      
      const hardClip = 0.95;
      if (Math.abs(y) > hardClip) {
        y = Math.sign(y) * (hardClip + (1 - hardClip) * Math.tanh((Math.abs(y) - hardClip) * 10));
      }
      
      curve[i] = Math.max(-1, Math.min(1, y));
    }
  };

  const drawTransferFunction = (curve: Float32Array) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#ef4444');
    gradient.addColorStop(0.5, '#f59e0b');
    gradient.addColorStop(1, '#22c55e');
    
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < curve.length; i++) {
      const x = (i / curve.length) * width;
      const y = height / 2 - (curve[i] * height / 2);
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };

  const analyzeHarmonics = (curve: Float32Array) => {
    const harmonics: number[] = [];
    const fundamental = 1;
    
    for (let h = 1; h <= 10; h++) {
      let sum = 0;
      for (let i = 0; i < curve.length; i++) {
        const x = (i * 2) / curve.length - 1;
        sum += curve[i] * Math.sin(h * Math.PI * x);
      }
      harmonics.push(Math.abs(sum / curve.length) * 100);
    }
    
    const max = Math.max(...harmonics);
    setCurrentHarmonics(harmonics.map(h => (h / max) * 100));
  };

  const updateConfig = useCallback(<K extends keyof AnalogWarmthConfig>(
    key: K,
    value: AnalogWarmthConfig[K]
  ) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetToDefault = useCallback(() => {
    setConfig(defaultConfig);
  }, []);

  const modelInfo = SATURATION_MODELS.find(m => m.value === config.model);

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
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
            Analog Warmth
          </span>
          <Badge 
            variant={config.enabled ? 'default' : 'secondary'}
            className="text-[9px]"
          >
            {modelInfo?.label || config.model}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => updateConfig('enabled', checked)}
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className={`${isExpanded ? 'h-[450px]' : 'h-48'} transition-all duration-200`}>
        <div className="flex h-full">
          <div className="flex-1 p-3 space-y-3">
            <div className="flex gap-3">
              <div className="w-32">
                <Label className="text-[10px] text-gray-400 mb-1 block">Saturation Model</Label>
                <Select
                  value={config.model}
                  onValueChange={(v) => updateConfig('model', v as SaturationModel)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SATURATION_MODELS.map(m => (
                      <SelectItem key={m.value} value={m.value}>
                        <div className="flex flex-col">
                          <span>{m.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[9px] text-gray-500 mt-1">{modelInfo?.description}</p>
              </div>

              <div className="flex gap-4 items-start">
                <div className="flex flex-col items-center">
                  <Knob
                    value={config.drive}
                    onChange={(v) => updateConfig('drive', v)}
                    min={0}
                    max={100}
                    size={48}
                    label="Drive"
                    color="#f59e0b"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <Knob
                    value={config.mix}
                    onChange={(v) => updateConfig('mix', v)}
                    min={0}
                    max={100}
                    size={48}
                    label="Mix"
                    color="#22c55e"
                  />
                </div>
                <div className="flex flex-col items-center">
                  <Knob
                    value={config.outputLevel}
                    onChange={(v) => updateConfig('outputLevel', v)}
                    min={-12}
                    max={12}
                    size={48}
                    label="Output"
                    color="#3b82f6"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="text-[10px] text-gray-400 mb-1 block">Transfer Function</Label>
                <div className="h-24 bg-black/30 rounded border border-gray-800 overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={200}
                    height={96}
                    className="w-full h-full"
                  />
                </div>
              </div>
              
              <div className="w-32">
                <Label className="text-[10px] text-gray-400 mb-1 block">Harmonics</Label>
                <div className="h-24 bg-black/30 rounded border border-gray-800 p-2 flex items-end gap-0.5">
                  {currentHarmonics.slice(0, 10).map((level, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${level}%`,
                        background: idx % 2 === 0 
                          ? 'linear-gradient(to top, #ef4444, #f59e0b)'
                          : 'linear-gradient(to top, #3b82f6, #22c55e)',
                        minHeight: '2px',
                      }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[8px] text-gray-500 mt-1">
                  <span>2nd</span>
                  <span>5th</span>
                  <span>10th</span>
                </div>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t pt-3" style={{ borderColor: 'var(--studio-border)' }}>
                <Tabs defaultValue="model" className="w-full">
                  <TabsList className="h-7 mb-2">
                    <TabsTrigger value="model" className="h-5 text-[10px] px-2">
                      Model Settings
                    </TabsTrigger>
                    <TabsTrigger value="advanced" className="h-5 text-[10px] px-2">
                      Advanced
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="model" className="mt-0">
                    {config.model === 'tube' && (
                      <div className="grid grid-cols-5 gap-2">
                        <div className="flex flex-col items-center">
                          <Knob
                            value={config.tubeParams.bias}
                            onChange={(v) => updateConfig('tubeParams', { ...config.tubeParams, bias: v })}
                            min={0}
                            max={100}
                            size={36}
                            label="Bias"
                            color="#ef4444"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Knob
                            value={config.tubeParams.harmonics}
                            onChange={(v) => updateConfig('tubeParams', { ...config.tubeParams, harmonics: v })}
                            min={0}
                            max={100}
                            size={36}
                            label="Harmonics"
                            color="#f59e0b"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Knob
                            value={config.tubeParams.oddEvenBalance}
                            onChange={(v) => updateConfig('tubeParams', { ...config.tubeParams, oddEvenBalance: v })}
                            min={0}
                            max={100}
                            size={36}
                            label="Odd/Even"
                            color="#22c55e"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Knob
                            value={config.tubeParams.sagAmount}
                            onChange={(v) => updateConfig('tubeParams', { ...config.tubeParams, sagAmount: v })}
                            min={0}
                            max={100}
                            size={36}
                            label="Sag"
                            color="#8b5cf6"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <Knob
                            value={config.tubeParams.plateVoltage}
                            onChange={(v) => updateConfig('tubeParams', { ...config.tubeParams, plateVoltage: v })}
                            min={100}
                            max={400}
                            size={36}
                            label="Plate V"
                            color="#06b6d4"
                          />
                        </div>
                      </div>
                    )}
                    
                    {config.model === 'tape' && (
                      <div className="space-y-3">
                        <div className="flex gap-3 items-center">
                          <div>
                            <Label className="text-[10px]">Formulation</Label>
                            <Select
                              value={config.tapeParams.formulation}
                              onValueChange={(v) => updateConfig('tapeParams', { 
                                ...config.tapeParams, 
                                formulation: v as TapeFormulation 
                              })}
                            >
                              <SelectTrigger className="h-7 w-24 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vintage">Vintage</SelectItem>
                                <SelectItem value="modern">Modern</SelectItem>
                                <SelectItem value="type-1">Type I</SelectItem>
                                <SelectItem value="type-2">Type II</SelectItem>
                                <SelectItem value="type-3">Type III</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px]">Speed</Label>
                            <Select
                              value={config.tapeParams.speed.toString()}
                              onValueChange={(v) => updateConfig('tapeParams', { 
                                ...config.tapeParams, 
                                speed: parseInt(v) 
                              })}
                            >
                              <SelectTrigger className="h-7 w-20 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="7.5">7.5 ips</SelectItem>
                                <SelectItem value="15">15 ips</SelectItem>
                                <SelectItem value="30">30 ips</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-6 gap-2">
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.saturation}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, saturation: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="Sat"
                              color="#ef4444"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.hiss}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, hiss: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="Hiss"
                              color="#64748b"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.flutter}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, flutter: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="Flutter"
                              color="#3b82f6"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.wowDepth}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, wowDepth: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="Wow"
                              color="#8b5cf6"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.headBump}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, headBump: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="Bump"
                              color="#f59e0b"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.tapeParams.highFreqRolloff}
                              onChange={(v) => updateConfig('tapeParams', { ...config.tapeParams, highFreqRolloff: v })}
                              min={0}
                              max={100}
                              size={32}
                              label="HF Roll"
                              color="#22c55e"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {config.model === 'console' && (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-[10px]">Console Type</Label>
                          <Select
                            value={config.consoleParams.consoleType}
                            onValueChange={(v) => updateConfig('consoleParams', { 
                              ...config.consoleParams, 
                              consoleType: v as typeof config.consoleParams.consoleType 
                            })}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="neve">Neve 1073</SelectItem>
                              <SelectItem value="ssl">SSL 4000</SelectItem>
                              <SelectItem value="api">API 512</SelectItem>
                              <SelectItem value="trident">Trident A</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.consoleParams.preampGain}
                              onChange={(v) => updateConfig('consoleParams', { ...config.consoleParams, preampGain: v })}
                              min={0}
                              max={100}
                              size={40}
                              label="Preamp"
                              color="#ef4444"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.consoleParams.eqColor}
                              onChange={(v) => updateConfig('consoleParams', { ...config.consoleParams, eqColor: v })}
                              min={0}
                              max={100}
                              size={40}
                              label="EQ Color"
                              color="#f59e0b"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.consoleParams.crosstalk}
                              onChange={(v) => updateConfig('consoleParams', { ...config.consoleParams, crosstalk: v })}
                              min={0}
                              max={20}
                              size={40}
                              label="Crosstalk"
                              color="#8b5cf6"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {config.model === 'transformer' && (
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div>
                            <Label className="text-[10px]">Core Type</Label>
                            <Select
                              value={config.transformerParams.coreType}
                              onValueChange={(v) => updateConfig('transformerParams', { 
                                ...config.transformerParams, 
                                coreType: v as typeof config.transformerParams.coreType 
                              })}
                            >
                              <SelectTrigger className="h-7 w-28 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="nickel">Nickel</SelectItem>
                                <SelectItem value="steel">Steel</SelectItem>
                                <SelectItem value="amorphous">Amorphous</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.transformerParams.saturation}
                              onChange={(v) => updateConfig('transformerParams', { ...config.transformerParams, saturation: v })}
                              min={0}
                              max={100}
                              size={36}
                              label="Sat"
                              color="#ef4444"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.transformerParams.lowFreqEnhance}
                              onChange={(v) => updateConfig('transformerParams', { ...config.transformerParams, lowFreqEnhance: v })}
                              min={0}
                              max={100}
                              size={36}
                              label="LF Enh"
                              color="#f59e0b"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.transformerParams.highFreqSoftening}
                              onChange={(v) => updateConfig('transformerParams', { ...config.transformerParams, highFreqSoftening: v })}
                              min={0}
                              max={100}
                              size={36}
                              label="HF Soft"
                              color="#22c55e"
                            />
                          </div>
                          <div className="flex flex-col items-center">
                            <Knob
                              value={config.transformerParams.inputImpedance}
                              onChange={(v) => updateConfig('transformerParams', { ...config.transformerParams, inputImpedance: v })}
                              min={150}
                              max={2400}
                              size={36}
                              label="Imped"
                              color="#8b5cf6"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="advanced" className="mt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Oversampling: 4x</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={resetToDefault}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Reset
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
