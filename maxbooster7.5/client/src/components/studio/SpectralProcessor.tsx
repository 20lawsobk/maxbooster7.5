import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Waves,
  Zap,
  Settings,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  Activity,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Brush,
  Eraser,
  Move,
  ZoomIn,
  ZoomOut,
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Knob } from './Knob';

export interface SpectralBand {
  id: string;
  startFreq: number;
  endFreq: number;
  startTime: number;
  endTime: number;
  gain: number;
  selected: boolean;
}

export interface SpectralProcessorConfig {
  fftSize: 512 | 1024 | 2048 | 4096 | 8192 | 16384;
  windowType: 'hanning' | 'hamming' | 'blackman' | 'kaiser';
  overlap: number;
  hopSize: number;
  useGPU: boolean;
  gpuBackend: 'webgl' | 'webgpu' | 'cpu';
}

interface SpectralProcessorProps {
  trackId: string;
  audioBuffer?: AudioBuffer | null;
  onProcessComplete?: (processedBuffer: AudioBuffer) => void;
  onBandSelect?: (bands: SpectralBand[]) => void;
  className?: string;
}

type EditTool = 'brush' | 'eraser' | 'select' | 'move';

const FFT_SIZES = [512, 1024, 2048, 4096, 8192, 16384] as const;
const WINDOW_TYPES = ['hanning', 'hamming', 'blackman', 'kaiser'] as const;

export function SpectralProcessor({
  trackId,
  audioBuffer,
  onProcessComplete,
  onBandSelect,
  className = '',
}: SpectralProcessorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramRef = useRef<ImageData | null>(null);
  const animationRef = useRef<number>();
  const gpuContextRef = useRef<WebGLRenderingContext | GPU | null>(null);

  const [config, setConfig] = useState<SpectralProcessorConfig>({
    fftSize: 2048,
    windowType: 'hanning',
    overlap: 0.75,
    hopSize: 512,
    useGPU: true,
    gpuBackend: 'webgl',
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [gpuAvailable, setGpuAvailable] = useState({ webgl: false, webgpu: false });
  const [selectedBands, setSelectedBands] = useState<SpectralBand[]>([]);
  const [editTool, setEditTool] = useState<EditTool>('brush');
  const [brushSize, setBrushSize] = useState(20);
  const [brushIntensity, setBrushIntensity] = useState(0.5);
  const [isLocked, setIsLocked] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });

  const [spectralParams, setSpectralParams] = useState({
    noiseReduction: 0,
    deReverb: 0,
    transientShaping: 0,
    harmonicEnhance: 0,
    spectralGate: -60,
    frequencyShift: 0,
  });

  useEffect(() => {
    const checkGPUSupport = async () => {
      const webglAvailable = !!document.createElement('canvas').getContext('webgl2');
      let webgpuAvailable = false;
      
      if ('gpu' in navigator) {
        try {
          const adapter = await (navigator as any).gpu?.requestAdapter();
          webgpuAvailable = !!adapter;
        } catch {
          webgpuAvailable = false;
        }
      }

      setGpuAvailable({ webgl: webglAvailable, webgpu: webgpuAvailable });
      
      if (webgpuAvailable) {
        setConfig(prev => ({ ...prev, gpuBackend: 'webgpu' }));
      } else if (webglAvailable) {
        setConfig(prev => ({ ...prev, gpuBackend: 'webgl' }));
      } else {
        setConfig(prev => ({ ...prev, useGPU: false, gpuBackend: 'cpu' }));
      }
    };

    checkGPUSupport();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !audioBuffer) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    generateSpectrogram(audioBuffer, ctx, canvas.width, canvas.height);
  }, [audioBuffer, config.fftSize, config.windowType]);

  const generateSpectrogram = useCallback(async (
    buffer: AudioBuffer,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    setIsProcessing(true);

    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const fftSize = config.fftSize;
    const hopSize = Math.floor(fftSize * (1 - config.overlap));
    const numFrames = Math.floor((channelData.length - fftSize) / hopSize);

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, width, height);

    const imageData = ctx.createImageData(width, height);
    const colormap = generateColormap();

    for (let frame = 0; frame < numFrames; frame++) {
      const startIdx = frame * hopSize;
      const frameData = channelData.slice(startIdx, startIdx + fftSize);
      const windowedData = applyWindow(frameData, config.windowType);
      const spectrum = computeFFT(windowedData);

      const x = Math.floor((frame / numFrames) * width);
      
      for (let bin = 0; bin < fftSize / 2; bin++) {
        const magnitude = Math.log10(spectrum[bin] + 1e-10);
        const normalized = Math.max(0, Math.min(1, (magnitude + 4) / 4));
        const y = height - 1 - Math.floor((bin / (fftSize / 2)) * height);
        
        const colorIdx = Math.floor(normalized * 255) * 4;
        const pixelIdx = (y * width + x) * 4;
        
        imageData.data[pixelIdx] = colormap[colorIdx];
        imageData.data[pixelIdx + 1] = colormap[colorIdx + 1];
        imageData.data[pixelIdx + 2] = colormap[colorIdx + 2];
        imageData.data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    spectrogramRef.current = imageData;
    setIsProcessing(false);
  }, [config.fftSize, config.overlap, config.windowType]);

  const generateColormap = (): Uint8Array => {
    const colormap = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      if (t < 0.25) {
        colormap[i * 4] = 0;
        colormap[i * 4 + 1] = Math.floor(t * 4 * 100);
        colormap[i * 4 + 2] = Math.floor(50 + t * 4 * 150);
      } else if (t < 0.5) {
        colormap[i * 4] = Math.floor((t - 0.25) * 4 * 200);
        colormap[i * 4 + 1] = 100 + Math.floor((t - 0.25) * 4 * 100);
        colormap[i * 4 + 2] = 200 - Math.floor((t - 0.25) * 4 * 100);
      } else if (t < 0.75) {
        colormap[i * 4] = 200 + Math.floor((t - 0.5) * 4 * 55);
        colormap[i * 4 + 1] = 200 - Math.floor((t - 0.5) * 4 * 100);
        colormap[i * 4 + 2] = 100 - Math.floor((t - 0.5) * 4 * 100);
      } else {
        colormap[i * 4] = 255;
        colormap[i * 4 + 1] = 100 + Math.floor((t - 0.75) * 4 * 155);
        colormap[i * 4 + 2] = Math.floor((t - 0.75) * 4 * 255);
      }
      colormap[i * 4 + 3] = 255;
    }
    return colormap;
  };

  const applyWindow = (data: Float32Array, windowType: string): Float32Array => {
    const windowed = new Float32Array(data.length);
    const N = data.length;
    
    for (let i = 0; i < N; i++) {
      let windowValue = 1;
      switch (windowType) {
        case 'hanning':
          windowValue = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
          break;
        case 'hamming':
          windowValue = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (N - 1));
          break;
        case 'blackman':
          windowValue = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)) 
                       + 0.08 * Math.cos(4 * Math.PI * i / (N - 1));
          break;
        case 'kaiser':
          const alpha = 3;
          const x = 2 * i / (N - 1) - 1;
          windowValue = besselI0(Math.PI * alpha * Math.sqrt(1 - x * x)) / besselI0(Math.PI * alpha);
          break;
      }
      windowed[i] = data[i] * windowValue;
    }
    return windowed;
  };

  const besselI0 = (x: number): number => {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 25; k++) {
      term *= (x / 2 / k) ** 2;
      sum += term;
    }
    return sum;
  };

  const computeFFT = (data: Float32Array): Float32Array => {
    const N = data.length;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    real.set(data);

    const bits = Math.log2(N);
    for (let i = 0; i < N; i++) {
      const j = reverseBits(i, bits);
      if (j > i) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }

    for (let size = 2; size <= N; size *= 2) {
      const halfSize = size / 2;
      const angle = -2 * Math.PI / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const cos = Math.cos(angle * j);
          const sin = Math.sin(angle * j);
          const idx1 = i + j;
          const idx2 = i + j + halfSize;
          const tr = real[idx2] * cos - imag[idx2] * sin;
          const ti = real[idx2] * sin + imag[idx2] * cos;
          real[idx2] = real[idx1] - tr;
          imag[idx2] = imag[idx1] - ti;
          real[idx1] += tr;
          imag[idx1] += ti;
        }
      }
    }

    const magnitudes = new Float32Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] ** 2 + imag[i] ** 2);
    }
    return magnitudes;
  };

  const reverseBits = (n: number, bits: number): number => {
    let result = 0;
    for (let i = 0; i < bits; i++) {
      result = (result << 1) | (n & 1);
      n >>= 1;
    }
    return result;
  };

  const processSpectralEdit = useCallback(async () => {
    if (!audioBuffer || selectedBands.length === 0) return;
    
    setIsProcessing(true);
    
    const offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const filters: BiquadFilterNode[] = [];
    selectedBands.forEach(band => {
      const filter = offlineCtx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = (band.startFreq + band.endFreq) / 2;
      filter.Q.value = (band.endFreq - band.startFreq) / ((band.startFreq + band.endFreq) / 2);
      filter.gain.value = band.gain;
      filters.push(filter);
    });

    let lastNode: AudioNode = source;
    filters.forEach(filter => {
      lastNode.connect(filter);
      lastNode = filter;
    });
    lastNode.connect(offlineCtx.destination);

    source.start();
    const processedBuffer = await offlineCtx.startRendering();
    
    setIsProcessing(false);
    onProcessComplete?.(processedBuffer);
  }, [audioBuffer, selectedBands, onProcessComplete]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isLocked || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const timeRatio = x / canvas.width;
    const freqRatio = 1 - (y / canvas.height);
    const maxFreq = audioBuffer?.sampleRate ? audioBuffer.sampleRate / 2 : 22050;
    const freq = freqRatio * maxFreq;
    const time = audioBuffer ? timeRatio * audioBuffer.duration : 0;

    if (editTool === 'brush' || editTool === 'select') {
      const bandWidth = brushSize * maxFreq / canvas.height;
      const newBand: SpectralBand = {
        id: `band-${Date.now()}`,
        startFreq: Math.max(0, freq - bandWidth / 2),
        endFreq: Math.min(maxFreq, freq + bandWidth / 2),
        startTime: Math.max(0, time - 0.1),
        endTime: Math.min(audioBuffer?.duration || 0, time + 0.1),
        gain: brushIntensity * 12 - 6,
        selected: true,
      };

      setSelectedBands(prev => [...prev, newBand]);
      onBandSelect?.([...selectedBands, newBand]);
    }
  }, [isLocked, audioBuffer, editTool, brushSize, brushIntensity, selectedBands, onBandSelect]);

  const gpuStatus = useMemo(() => {
    if (!config.useGPU) return { label: 'CPU', color: 'text-gray-400' };
    if (config.gpuBackend === 'webgpu' && gpuAvailable.webgpu) {
      return { label: 'WebGPU', color: 'text-green-400' };
    }
    if (config.gpuBackend === 'webgl' && gpuAvailable.webgl) {
      return { label: 'WebGL', color: 'text-blue-400' };
    }
    return { label: 'Fallback CPU', color: 'text-yellow-400' };
  }, [config.useGPU, config.gpuBackend, gpuAvailable]);

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
          <Waves className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
            Spectral Processor
          </span>
          <Badge variant="outline" className={`text-[9px] ${gpuStatus.color}`}>
            <Cpu className="h-3 w-3 mr-1" />
            {gpuStatus.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {isProcessing && (
            <Badge variant="secondary" className="text-[9px]">
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              Processing
            </Badge>
          )}
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

      <div className={`${isExpanded ? 'h-[500px]' : 'h-64'} transition-all duration-200`}>
        <div className="flex h-full">
          <div className="w-10 border-r flex flex-col items-center gap-1 py-2"
               style={{ borderColor: 'var(--studio-border)' }}>
            <Button
              size="icon"
              variant={editTool === 'brush' ? 'secondary' : 'ghost'}
              className="h-7 w-7"
              onClick={() => setEditTool('brush')}
            >
              <Brush className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={editTool === 'eraser' ? 'secondary' : 'ghost'}
              className="h-7 w-7"
              onClick={() => setEditTool('eraser')}
            >
              <Eraser className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant={editTool === 'select' ? 'secondary' : 'ghost'}
              className="h-7 w-7"
              onClick={() => setEditTool('select')}
            >
              <Move className="h-3.5 w-3.5" />
            </Button>
            <Separator className="my-1 w-6" />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom(z => Math.min(4, z * 1.5))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setZoom(z => Math.max(0.5, z / 1.5))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
            <div className="flex-1" />
            <Button
              size="icon"
              variant={isLocked ? 'secondary' : 'ghost'}
              className="h-7 w-7"
              onClick={() => setIsLocked(!isLocked)}
            >
              {isLocked ? (
                <Lock className="h-3.5 w-3.5 text-yellow-400" />
              ) : (
                <Unlock className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 relative bg-black/50 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={800}
                height={300}
                className="w-full h-full cursor-crosshair"
                onClick={handleCanvasClick}
                style={{ 
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center',
                }}
              />
              
              {selectedBands.length > 0 && (
                <div className="absolute top-2 left-2 flex gap-1">
                  <Badge variant="secondary" className="text-[9px]">
                    {selectedBands.length} selections
                  </Badge>
                </div>
              )}
              
              <div className="absolute bottom-2 right-2 text-[10px] text-gray-500">
                Zoom: {(zoom * 100).toFixed(0)}%
              </div>
            </div>

            {isExpanded && (
              <div className="h-32 border-t" style={{ borderColor: 'var(--studio-border)' }}>
                <Tabs defaultValue="settings" className="h-full">
                  <TabsList className="h-8 px-2">
                    <TabsTrigger value="settings" className="h-6 text-xs">Settings</TabsTrigger>
                    <TabsTrigger value="processing" className="h-6 text-xs">Processing</TabsTrigger>
                    <TabsTrigger value="gpu" className="h-6 text-xs">GPU</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="settings" className="p-2">
                    <div className="flex gap-4">
                      <div className="space-y-2">
                        <Label className="text-[10px]">FFT Size</Label>
                        <Select
                          value={config.fftSize.toString()}
                          onValueChange={(v) => setConfig(prev => ({ 
                            ...prev, 
                            fftSize: parseInt(v) as typeof config.fftSize 
                          }))}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FFT_SIZES.map(size => (
                              <SelectItem key={size} value={size.toString()}>
                                {size}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-[10px]">Window</Label>
                        <Select
                          value={config.windowType}
                          onValueChange={(v) => setConfig(prev => ({ 
                            ...prev, 
                            windowType: v as typeof config.windowType 
                          }))}
                        >
                          <SelectTrigger className="h-7 w-24 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {WINDOW_TYPES.map(type => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2 flex-1">
                        <Label className="text-[10px]">Brush Size: {brushSize}px</Label>
                        <Slider
                          value={[brushSize]}
                          onValueChange={([v]) => setBrushSize(v)}
                          min={5}
                          max={100}
                          step={1}
                        />
                      </div>
                      
                      <div className="space-y-2 flex-1">
                        <Label className="text-[10px]">Intensity: {(brushIntensity * 100).toFixed(0)}%</Label>
                        <Slider
                          value={[brushIntensity]}
                          onValueChange={([v]) => setBrushIntensity(v)}
                          min={0}
                          max={1}
                          step={0.01}
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="processing" className="p-2">
                    <div className="grid grid-cols-6 gap-3">
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.noiseReduction}
                          onChange={(v) => setSpectralParams(p => ({ ...p, noiseReduction: v }))}
                          min={0}
                          max={100}
                          size={36}
                          label="Denoise"
                          color="#22c55e"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.deReverb}
                          onChange={(v) => setSpectralParams(p => ({ ...p, deReverb: v }))}
                          min={0}
                          max={100}
                          size={36}
                          label="De-Reverb"
                          color="#3b82f6"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.transientShaping}
                          onChange={(v) => setSpectralParams(p => ({ ...p, transientShaping: v }))}
                          min={-50}
                          max={50}
                          size={36}
                          label="Transient"
                          color="#f59e0b"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.harmonicEnhance}
                          onChange={(v) => setSpectralParams(p => ({ ...p, harmonicEnhance: v }))}
                          min={0}
                          max={100}
                          size={36}
                          label="Harmonics"
                          color="#8b5cf6"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.spectralGate}
                          onChange={(v) => setSpectralParams(p => ({ ...p, spectralGate: v }))}
                          min={-80}
                          max={0}
                          size={36}
                          label="Gate"
                          color="#ef4444"
                        />
                      </div>
                      <div className="flex flex-col items-center">
                        <Knob
                          value={spectralParams.frequencyShift}
                          onChange={(v) => setSpectralParams(p => ({ ...p, frequencyShift: v }))}
                          min={-12}
                          max={12}
                          size={36}
                          label="Shift"
                          color="#06b6d4"
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="gpu" className="p-2">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={config.useGPU}
                          onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useGPU: checked }))}
                          disabled={!gpuAvailable.webgl && !gpuAvailable.webgpu}
                        />
                        <Label className="text-xs">Enable GPU Acceleration</Label>
                      </div>
                      
                      {config.useGPU && (
                        <Select
                          value={config.gpuBackend}
                          onValueChange={(v) => setConfig(prev => ({ 
                            ...prev, 
                            gpuBackend: v as typeof config.gpuBackend 
                          }))}
                        >
                          <SelectTrigger className="h-7 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="webgpu" disabled={!gpuAvailable.webgpu}>
                              WebGPU {!gpuAvailable.webgpu && '(N/A)'}
                            </SelectItem>
                            <SelectItem value="webgl" disabled={!gpuAvailable.webgl}>
                              WebGL {!gpuAvailable.webgl && '(N/A)'}
                            </SelectItem>
                            <SelectItem value="cpu">CPU</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      
                      <div className="flex-1" />
                      
                      <div className="text-[10px] text-gray-500">
                        WebGPU: {gpuAvailable.webgpu ? '✓' : '✗'} | 
                        WebGL: {gpuAvailable.webgl ? '✓' : '✗'}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="h-10 px-3 flex items-center justify-between border-t"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              setSelectedBands([]);
              onBandSelect?.([]);
            }}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={processSpectralEdit}
            disabled={isProcessing || selectedBands.length === 0}
          >
            {isProcessing ? (
              <>
                <Activity className="h-3 w-3 mr-1 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-3 w-3 mr-1" />
                Apply
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
