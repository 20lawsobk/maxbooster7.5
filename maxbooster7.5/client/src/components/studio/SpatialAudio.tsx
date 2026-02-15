import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Knob } from './Knob';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Volume2,
  Headphones,
  Speaker,
  Layers,
  Move3d,
  Box,
  CircleDot,
  ArrowUpDown,
  RotateCcw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';

export type SpeakerConfiguration = 'stereo' | '5.1' | '7.1' | '9.1.6';
export type MonitoringMode = 'speakers' | 'binaural';
export type ObjectType = 'bed' | 'object';

export interface SpatialObject {
  id: string;
  name: string;
  type: ObjectType;
  azimuth: number;
  elevation: number;
  distance: number;
  width: number;
  lfeLevel: number;
  heightLayer: 'floor' | 'mid' | 'ceiling';
  busId: string;
  mute: boolean;
  solo: boolean;
  color: string;
}

export interface SpatialBus {
  id: string;
  name: string;
  color: string;
}

export interface RoomSettings {
  size: 'small' | 'medium' | 'large' | 'hall';
  reflections: number;
  damping: number;
}

export interface SpatialAudioState {
  speakerConfig: SpeakerConfiguration;
  monitoringMode: MonitoringMode;
  masterLfe: number;
  objects: SpatialObject[];
  buses: SpatialBus[];
  room: RoomSettings;
  binauralEnabled: boolean;
}

export interface SpatialAudioProps {
  value: SpatialAudioState;
  onChange: (state: SpatialAudioState) => void;
  audioContext?: AudioContext;
  sourceNodes?: Map<string, AudioNode>;
  destinationNode?: AudioNode;
  compact?: boolean;
}

const defaultBuses: SpatialBus[] = [
  { id: 'bus-main', name: 'Main', color: '#00ccff' },
  { id: 'bus-height', name: 'Height', color: '#ff6b6b' },
  { id: 'bus-lfe', name: 'LFE', color: '#ffa500' },
];

const defaultObject: Omit<SpatialObject, 'id'> = {
  name: 'Object',
  type: 'object',
  azimuth: 0,
  elevation: 0,
  distance: 1,
  width: 0,
  lfeLevel: 0,
  heightLayer: 'mid',
  busId: 'bus-main',
  mute: false,
  solo: false,
  color: '#00ccff',
};

const defaultState: SpatialAudioState = {
  speakerConfig: '7.1',
  monitoringMode: 'speakers',
  masterLfe: 0,
  objects: [],
  buses: defaultBuses,
  room: {
    size: 'medium',
    reflections: 0.5,
    damping: 0.5,
  },
  binauralEnabled: false,
};

const speakerConfigs: Record<SpeakerConfiguration, { label: string; channels: number }> = {
  'stereo': { label: 'Stereo', channels: 2 },
  '5.1': { label: '5.1 Surround', channels: 6 },
  '7.1': { label: '7.1 Surround', channels: 8 },
  '9.1.6': { label: '9.1.6 Atmos', channels: 16 },
};

const roomSizes: Record<RoomSettings['size'], { label: string; refDistance: number }> = {
  'small': { label: 'Small Room', refDistance: 1 },
  'medium': { label: 'Medium Room', refDistance: 2 },
  'large': { label: 'Large Room', refDistance: 4 },
  'hall': { label: 'Concert Hall', refDistance: 8 },
};

interface PannerNodesRef {
  panners: Map<string, PannerNode>;
  lfeGains: Map<string, GainNode>;
}

function generateObjectId(): string {
  return `obj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getRandomColor(): string {
  const colors = ['#00ccff', '#ff6b6b', '#ffa500', '#4ade80', '#a78bfa', '#fb923c', '#ec4899', '#22d3ee'];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function SpatialAudio({
  value = defaultState,
  onChange,
  audioContext,
  sourceNodes,
  destinationNode,
  compact = false,
}: SpatialAudioProps) {
  const nodesRef = useRef<PannerNodesRef>({
    panners: new Map(),
    lfeGains: new Map(),
  });

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'top' | 'side'>('top');
  const [showObjectList, setShowObjectList] = useState(true);

  const selectedObject = useMemo(
    () => value.objects.find((obj) => obj.id === selectedObjectId) || null,
    [value.objects, selectedObjectId]
  );

  const updateValue = useCallback(
    (updates: Partial<SpatialAudioState>) => {
      onChange({ ...value, ...updates });
    },
    [value, onChange]
  );

  const updateObject = useCallback(
    (objectId: string, updates: Partial<SpatialObject>) => {
      const updatedObjects = value.objects.map((obj) =>
        obj.id === objectId ? { ...obj, ...updates } : obj
      );
      updateValue({ objects: updatedObjects });
    },
    [value.objects, updateValue]
  );

  const addObject = useCallback(
    (type: ObjectType) => {
      const newObject: SpatialObject = {
        ...defaultObject,
        id: generateObjectId(),
        name: `${type === 'bed' ? 'Bed' : 'Object'} ${value.objects.length + 1}`,
        type,
        color: getRandomColor(),
      };
      updateValue({ objects: [...value.objects, newObject] });
      setSelectedObjectId(newObject.id);
    },
    [value.objects, updateValue]
  );

  const removeObject = useCallback(
    (objectId: string) => {
      updateValue({ objects: value.objects.filter((obj) => obj.id !== objectId) });
      if (selectedObjectId === objectId) {
        setSelectedObjectId(null);
      }
    },
    [value.objects, selectedObjectId, updateValue]
  );

  useEffect(() => {
    if (!audioContext || !destinationNode) return;

    const nodes = nodesRef.current;

    value.objects.forEach((obj) => {
      let panner = nodes.panners.get(obj.id);
      let lfeGain = nodes.lfeGains.get(obj.id);

      if (!panner) {
        panner = audioContext.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = roomSizes[value.room.size].refDistance;
        panner.maxDistance = 10000;
        panner.rolloffFactor = 1;
        panner.coneInnerAngle = 360;
        panner.coneOuterAngle = 360;
        nodes.panners.set(obj.id, panner);
      }

      if (!lfeGain) {
        lfeGain = audioContext.createGain();
        nodes.lfeGains.set(obj.id, lfeGain);
      }

      const azimuthRad = (obj.azimuth * Math.PI) / 180;
      const elevationRad = (obj.elevation * Math.PI) / 180;
      const x = obj.distance * Math.sin(azimuthRad) * Math.cos(elevationRad);
      const y = obj.distance * Math.sin(elevationRad);
      const z = -obj.distance * Math.cos(azimuthRad) * Math.cos(elevationRad);

      panner.positionX.setValueAtTime(x, audioContext.currentTime);
      panner.positionY.setValueAtTime(y, audioContext.currentTime);
      panner.positionZ.setValueAtTime(z, audioContext.currentTime);

      const lfeLevel = obj.mute ? 0 : Math.pow(10, (obj.lfeLevel + value.masterLfe) / 20);
      lfeGain.gain.setValueAtTime(lfeLevel, audioContext.currentTime);

      const sourceNode = sourceNodes?.get(obj.id);
      if (sourceNode) {
        try {
          sourceNode.disconnect();
          sourceNode.connect(panner);
          panner.connect(destinationNode);
        } catch {
        }
      }
    });

    return () => {
      nodes.panners.forEach((panner) => {
        try {
          panner.disconnect();
        } catch {
        }
      });
      nodes.lfeGains.forEach((gain) => {
        try {
          gain.disconnect();
        } catch {
        }
      });
    };
  }, [audioContext, sourceNodes, destinationNode, value]);

  const TopDownView = useMemo(() => {
    const size = compact ? 180 : 240;
    const center = size / 2;
    const maxRadius = (size / 2) - 20;

    return (
      <svg width={size} height={size} className="mx-auto">
        <defs>
          <radialGradient id="roomGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,204,255,0.1)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        <circle cx={center} cy={center} r={maxRadius} fill="url(#roomGradient)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx={center} cy={center} r={maxRadius * 0.66} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx={center} cy={center} r={maxRadius * 0.33} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />

        <line x1={center} y1={10} x2={center} y2={size - 10} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <line x1={10} y1={center} x2={size - 10} y2={center} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />

        <text x={center} y={15} fontSize="8" fill="rgba(255,255,255,0.4)" textAnchor="middle">FRONT</text>
        <text x={center} y={size - 6} fontSize="8" fill="rgba(255,255,255,0.4)" textAnchor="middle">REAR</text>
        <text x={10} y={center + 3} fontSize="8" fill="rgba(255,255,255,0.4)">L</text>
        <text x={size - 14} y={center + 3} fontSize="8" fill="rgba(255,255,255,0.4)">R</text>

        <circle cx={center} cy={center} r={6} fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
        <text x={center} y={center + 20} fontSize="7" fill="rgba(255,255,255,0.4)" textAnchor="middle">LISTENER</text>

        {value.objects.map((obj) => {
          if (obj.mute) return null;
          
          const azimuthRad = (obj.azimuth * Math.PI) / 180;
          const normalizedDist = Math.min(obj.distance / 5, 1);
          const x = center + Math.sin(azimuthRad) * maxRadius * normalizedDist;
          const y = center - Math.cos(azimuthRad) * maxRadius * normalizedDist;
          const isSelected = obj.id === selectedObjectId;
          const objSize = obj.type === 'bed' ? 10 : 8;

          return (
            <g key={obj.id} onClick={() => setSelectedObjectId(obj.id)} style={{ cursor: 'pointer' }}>
              {obj.type === 'bed' ? (
                <rect
                  x={x - objSize / 2}
                  y={y - objSize / 2}
                  width={objSize}
                  height={objSize}
                  fill={obj.color}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={2}
                  rx={2}
                  style={{ filter: `drop-shadow(0 0 ${isSelected ? 8 : 4}px ${obj.color})` }}
                />
              ) : (
                <motion.circle
                  cx={x}
                  cy={y}
                  r={objSize / 2}
                  fill={obj.color}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={2}
                  animate={{ cx: x, cy: y }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  style={{ filter: `drop-shadow(0 0 ${isSelected ? 8 : 4}px ${obj.color})` }}
                />
              )}
              <text
                x={x}
                y={y + objSize + 8}
                fontSize="7"
                fill="rgba(255,255,255,0.6)"
                textAnchor="middle"
              >
                {obj.name}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }, [value.objects, selectedObjectId, compact]);

  const SideView = useMemo(() => {
    const size = compact ? 180 : 240;
    const width = size;
    const height = size * 0.6;
    const centerX = width / 2;
    const maxWidth = width - 40;
    const maxHeight = height - 30;

    return (
      <svg width={width} height={height} className="mx-auto">
        <rect x={20} y={10} width={maxWidth} height={maxHeight} fill="rgba(0,204,255,0.05)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" rx="4" />

        <line x1={20} y1={10 + maxHeight / 3} x2={20 + maxWidth} y2={10 + maxHeight / 3} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={20} y1={10 + (maxHeight * 2) / 3} x2={20 + maxWidth} y2={10 + (maxHeight * 2) / 3} stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="4 4" />

        <text x={8} y={18} fontSize="7" fill="rgba(255,255,255,0.3)">TOP</text>
        <text x={8} y={height - 8} fontSize="7" fill="rgba(255,255,255,0.3)">BTM</text>
        <text x={20} y={height - 2} fontSize="7" fill="rgba(255,255,255,0.3)">FRONT</text>
        <text x={width - 35} y={height - 2} fontSize="7" fill="rgba(255,255,255,0.3)">REAR</text>

        <circle cx={centerX} cy={10 + maxHeight / 2} r={5} fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />

        {value.objects.map((obj) => {
          if (obj.mute) return null;

          const azimuthRad = (obj.azimuth * Math.PI) / 180;
          const normalizedDist = Math.min(obj.distance / 5, 1);
          const x = centerX - Math.cos(azimuthRad) * (maxWidth / 2) * normalizedDist;
          const elevationNorm = (obj.elevation + 90) / 180;
          const y = 10 + maxHeight * (1 - elevationNorm);
          const isSelected = obj.id === selectedObjectId;
          const objSize = obj.type === 'bed' ? 8 : 6;

          return (
            <g key={obj.id} onClick={() => setSelectedObjectId(obj.id)} style={{ cursor: 'pointer' }}>
              {obj.type === 'bed' ? (
                <rect
                  x={x - objSize / 2}
                  y={y - objSize / 2}
                  width={objSize}
                  height={objSize}
                  fill={obj.color}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={2}
                  rx={2}
                  style={{ filter: `drop-shadow(0 0 ${isSelected ? 6 : 3}px ${obj.color})` }}
                />
              ) : (
                <motion.circle
                  cx={x}
                  cy={y}
                  r={objSize / 2}
                  fill={obj.color}
                  stroke={isSelected ? '#fff' : 'none'}
                  strokeWidth={2}
                  animate={{ cx: x, cy: y }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  style={{ filter: `drop-shadow(0 0 ${isSelected ? 6 : 3}px ${obj.color})` }}
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  }, [value.objects, selectedObjectId, compact]);

  const SpeakerLayoutView = useMemo(() => {
    const size = 120;
    const center = size / 2;
    const radius = size / 2 - 15;

    type SpeakerPos = { angle: number; label: string; height?: 'top' | 'mid' | 'bottom' };
    const speakerPositions: Record<SpeakerConfiguration, SpeakerPos[]> = {
      'stereo': [
        { angle: -30, label: 'L' },
        { angle: 30, label: 'R' },
      ],
      '5.1': [
        { angle: -30, label: 'L' },
        { angle: 30, label: 'R' },
        { angle: 0, label: 'C' },
        { angle: -110, label: 'Ls' },
        { angle: 110, label: 'Rs' },
      ],
      '7.1': [
        { angle: -30, label: 'L' },
        { angle: 30, label: 'R' },
        { angle: 0, label: 'C' },
        { angle: -90, label: 'Lss' },
        { angle: 90, label: 'Rss' },
        { angle: -135, label: 'Lrs' },
        { angle: 135, label: 'Rrs' },
      ],
      '9.1.6': [
        { angle: -30, label: 'L' },
        { angle: 30, label: 'R' },
        { angle: 0, label: 'C' },
        { angle: -60, label: 'Lw' },
        { angle: 60, label: 'Rw' },
        { angle: -90, label: 'Lss' },
        { angle: 90, label: 'Rss' },
        { angle: -135, label: 'Lrs' },
        { angle: 135, label: 'Rrs' },
        { angle: -30, label: 'Ltf', height: 'top' },
        { angle: 30, label: 'Rtf', height: 'top' },
        { angle: -90, label: 'Ltm', height: 'top' },
        { angle: 90, label: 'Rtm', height: 'top' },
        { angle: -135, label: 'Ltr', height: 'top' },
        { angle: 135, label: 'Rtr', height: 'top' },
      ],
    };

    const speakers = speakerPositions[value.speakerConfig] || speakerPositions['stereo'];

    return (
      <svg width={size} height={size}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <circle cx={center} cy={center} r={4} fill="rgba(255,255,255,0.3)" />

        {speakers.map((speaker, i) => {
          const angleRad = ((speaker.angle - 90) * Math.PI) / 180;
          const speakerRadius = speaker.height === 'top' ? radius * 0.7 : radius;
          const x = center + Math.cos(angleRad) * speakerRadius;
          const y = center + Math.sin(angleRad) * speakerRadius;
          const isHeight = speaker.height === 'top';

          return (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r={isHeight ? 4 : 6}
                fill={isHeight ? '#ffa500' : '#00ccff'}
                style={{ filter: `drop-shadow(0 0 3px ${isHeight ? '#ffa500' : '#00ccff'})` }}
              />
              <text
                x={x}
                y={y + (isHeight ? 10 : 12)}
                fontSize="6"
                fill="rgba(255,255,255,0.6)"
                textAnchor="middle"
              >
                {speaker.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }, [value.speakerConfig]);

  return (
    <div
      className="flex flex-col h-full rounded-lg overflow-hidden"
      style={{
        background: 'var(--studio-bg-medium)',
        border: '1px solid var(--studio-border)',
      }}
    >
      <div
        className="h-12 px-4 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <div className="flex items-center gap-3">
          <Move3d className="h-5 w-5" style={{ color: 'var(--studio-accent)' }} />
          <h2 className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
            SPATIAL AUDIO
          </h2>
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{
              borderColor: 'var(--studio-accent)',
              color: 'var(--studio-accent)',
            }}
          >
            {speakerConfigs[value.speakerConfig].label}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 ${value.binauralEnabled ? 'bg-cyan-500/20' : ''}`}
                  onClick={() => updateValue({ binauralEnabled: !value.binauralEnabled, monitoringMode: value.binauralEnabled ? 'speakers' : 'binaural' })}
                >
                  <Headphones className="h-4 w-4" style={{ color: value.binauralEnabled ? '#00ccff' : 'var(--studio-text-muted)' }} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Binaural Monitoring</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Select
            value={value.speakerConfig}
            onValueChange={(config: SpeakerConfiguration) => updateValue({ speakerConfig: config })}
          >
            <SelectTrigger
              className="h-7 w-28 text-[10px]"
              style={{
                background: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stereo">Stereo</SelectItem>
              <SelectItem value="5.1">5.1</SelectItem>
              <SelectItem value="7.1">7.1</SelectItem>
              <SelectItem value="9.1.6">9.1.6 Atmos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div
          className="w-48 flex flex-col border-r"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <div
            className="px-3 py-2 flex items-center justify-between border-b"
            style={{ borderColor: 'var(--studio-border)' }}
          >
            <span className="text-[10px] font-semibold" style={{ color: 'var(--studio-text-muted)' }}>
              OBJECTS
            </span>
            <div className="flex gap-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => addObject('bed')}
                    >
                      <Box className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add Bed Channel</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => addObject('object')}
                    >
                      <CircleDot className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add Object</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {value.objects.map((obj) => (
                <div
                  key={obj.id}
                  className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
                    selectedObjectId === obj.id ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                  onClick={() => setSelectedObjectId(obj.id)}
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full" style={{ background: obj.color }} />
                    <span
                      className="text-[11px] flex-1 truncate"
                      style={{ color: 'var(--studio-text)' }}
                    >
                      {obj.name}
                    </span>
                    {obj.type === 'bed' && (
                      <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">BED</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-5 w-5 p-0 ${obj.mute ? 'text-yellow-500' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateObject(obj.id, { mute: !obj.mute });
                      }}
                    >
                      {obj.mute ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 text-red-400 hover:text-red-300"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeObject(obj.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              {value.objects.length === 0 && (
                <div className="text-center py-4 text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                  No objects added.<br />
                  Click + to add beds or objects.
                </div>
              )}
            </div>
          </ScrollArea>

          <div
            className="p-3 border-t space-y-3"
            style={{ borderColor: 'var(--studio-border)' }}
          >
            <div>
              <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                MASTER LFE: {value.masterLfe.toFixed(1)} dB
              </Label>
              <Slider
                value={[value.masterLfe]}
                onValueChange={([v]) => updateValue({ masterLfe: v })}
                min={-12}
                max={12}
                step={0.5}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          <Tabs defaultValue="position" className="flex-1 flex flex-col">
            <TabsList
              className="h-9 mx-3 mt-2 justify-start"
              style={{ background: 'var(--studio-bg-deep)' }}
            >
              <TabsTrigger value="position" className="text-[10px]">3D Position</TabsTrigger>
              <TabsTrigger value="routing" className="text-[10px]">Routing</TabsTrigger>
              <TabsTrigger value="room" className="text-[10px]">Room</TabsTrigger>
            </TabsList>

            <TabsContent value="position" className="flex-1 p-3 m-0">
              <div className="flex gap-4 h-full">
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-semibold" style={{ color: 'var(--studio-text-muted)' }}>
                      {viewMode === 'top' ? 'TOP VIEW' : 'SIDE VIEW'}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-[9px] ${viewMode === 'top' ? 'bg-white/10' : ''}`}
                        onClick={() => setViewMode('top')}
                      >
                        Top
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-6 px-2 text-[9px] ${viewMode === 'side' ? 'bg-white/10' : ''}`}
                        onClick={() => setViewMode('side')}
                      >
                        Side
                      </Button>
                    </div>
                  </div>

                  <div
                    className="flex-1 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    {viewMode === 'top' ? TopDownView : SideView}
                  </div>
                </div>

                <div className="w-56 flex flex-col gap-3">
                  <div
                    className="p-3 rounded-lg"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--studio-text-muted)' }}>
                      SPEAKER LAYOUT
                    </div>
                    {SpeakerLayoutView}
                  </div>

                  {selectedObject && (
                    <div
                      className="flex-1 p-3 rounded-lg space-y-3"
                      style={{ background: 'var(--studio-bg-deep)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold" style={{ color: 'var(--studio-text)' }}>
                          {selectedObject.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0"
                          onClick={() => updateObject(selectedObject.id, { azimuth: 0, elevation: 0, distance: 1 })}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex justify-around">
                        <Knob
                          value={selectedObject.azimuth}
                          onChange={(v) => updateObject(selectedObject.id, { azimuth: v })}
                          min={-180}
                          max={180}
                          defaultValue={0}
                          label="AZIMUTH"
                          size={36}
                          color={selectedObject.color}
                          displayValue={`${selectedObject.azimuth.toFixed(0)}°`}
                        />
                        <Knob
                          value={selectedObject.elevation}
                          onChange={(v) => updateObject(selectedObject.id, { elevation: v })}
                          min={-90}
                          max={90}
                          defaultValue={0}
                          label="ELEVATION"
                          size={36}
                          color={selectedObject.color}
                          displayValue={`${selectedObject.elevation.toFixed(0)}°`}
                        />
                      </div>

                      <div>
                        <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                          Distance: {selectedObject.distance.toFixed(2)}m
                        </Label>
                        <Slider
                          value={[selectedObject.distance]}
                          onValueChange={([v]) => updateObject(selectedObject.id, { distance: v })}
                          min={0.1}
                          max={10}
                          step={0.1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                          Width (Spread): {selectedObject.width.toFixed(0)}°
                        </Label>
                        <Slider
                          value={[selectedObject.width]}
                          onValueChange={([v]) => updateObject(selectedObject.id, { width: v })}
                          min={0}
                          max={180}
                          step={1}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                          LFE Send: {selectedObject.lfeLevel.toFixed(1)} dB
                        </Label>
                        <Slider
                          value={[selectedObject.lfeLevel]}
                          onValueChange={([v]) => updateObject(selectedObject.id, { lfeLevel: v })}
                          min={-60}
                          max={0}
                          step={0.5}
                          className="mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[9px] mb-1 block" style={{ color: 'var(--studio-text-muted)' }}>
                          HEIGHT LAYER
                        </Label>
                        <Select
                          value={selectedObject.heightLayer}
                          onValueChange={(v: 'floor' | 'mid' | 'ceiling') =>
                            updateObject(selectedObject.id, { heightLayer: v })
                          }
                        >
                          <SelectTrigger
                            className="h-7 text-[10px]"
                            style={{
                              background: 'var(--studio-bg-medium)',
                              borderColor: 'var(--studio-border)',
                              color: 'var(--studio-text)',
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="floor">Floor</SelectItem>
                            <SelectItem value="mid">Mid-Level</SelectItem>
                            <SelectItem value="ceiling">Ceiling/Height</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {!selectedObject && (
                    <div
                      className="flex-1 p-3 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--studio-bg-deep)' }}
                    >
                      <span className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                        Select an object to edit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="routing" className="flex-1 p-3 m-0">
              <div className="h-full flex flex-col gap-3">
                <div className="text-[10px] font-semibold" style={{ color: 'var(--studio-text-muted)' }}>
                  OBJECT ROUTING TO SPATIAL BUSES
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-2">
                    {value.objects.map((obj) => (
                      <div
                        key={obj.id}
                        className="p-3 rounded-lg flex items-center gap-3"
                        style={{ background: 'var(--studio-bg-deep)' }}
                      >
                        <div className="h-3 w-3 rounded-full" style={{ background: obj.color }} />
                        <span
                          className="text-[11px] flex-1"
                          style={{ color: 'var(--studio-text)' }}
                        >
                          {obj.name}
                        </span>
                        <Select
                          value={obj.busId}
                          onValueChange={(busId) => updateObject(obj.id, { busId })}
                        >
                          <SelectTrigger
                            className="h-7 w-32 text-[10px]"
                            style={{
                              background: 'var(--studio-bg-medium)',
                              borderColor: 'var(--studio-border)',
                              color: 'var(--studio-text)',
                            }}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {value.buses.map((bus) => (
                              <SelectItem key={bus.id} value={bus.id}>
                                <div className="flex items-center gap-2">
                                  <div className="h-2 w-2 rounded-full" style={{ background: bus.color }} />
                                  {bus.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}

                    {value.objects.length === 0 && (
                      <div className="text-center py-8 text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                        No objects to route
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div
                  className="p-3 rounded-lg"
                  style={{ background: 'var(--studio-bg-deep)' }}
                >
                  <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--studio-text-muted)' }}>
                    SPATIAL BUSES
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {value.buses.map((bus) => (
                      <Badge
                        key={bus.id}
                        variant="outline"
                        className="text-[10px]"
                        style={{ borderColor: bus.color, color: bus.color }}
                      >
                        <div className="h-2 w-2 rounded-full mr-1.5" style={{ background: bus.color }} />
                        {bus.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="room" className="flex-1 p-3 m-0">
              <div className="h-full flex gap-4">
                <div className="flex-1 space-y-4">
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--studio-text-muted)' }}>
                    ROOM SIMULATION
                  </div>

                  <div
                    className="p-4 rounded-lg space-y-4"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    <div>
                      <Label className="text-[9px] mb-2 block" style={{ color: 'var(--studio-text-muted)' }}>
                        ROOM SIZE
                      </Label>
                      <Select
                        value={value.room.size}
                        onValueChange={(size: RoomSettings['size']) =>
                          updateValue({ room: { ...value.room, size } })
                        }
                      >
                        <SelectTrigger
                          className="h-8 text-[11px]"
                          style={{
                            background: 'var(--studio-bg-medium)',
                            borderColor: 'var(--studio-border)',
                            color: 'var(--studio-text)',
                          }}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="small">Small Room</SelectItem>
                          <SelectItem value="medium">Medium Room</SelectItem>
                          <SelectItem value="large">Large Room</SelectItem>
                          <SelectItem value="hall">Concert Hall</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                        Reflections: {(value.room.reflections * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[value.room.reflections]}
                        onValueChange={([v]) => updateValue({ room: { ...value.room, reflections: v } })}
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                        Damping: {(value.room.damping * 100).toFixed(0)}%
                      </Label>
                      <Slider
                        value={[value.room.damping]}
                        onValueChange={([v]) => updateValue({ room: { ...value.room, damping: v } })}
                        min={0}
                        max={1}
                        step={0.01}
                        className="mt-1"
                      />
                    </div>
                  </div>

                  <div
                    className="p-4 rounded-lg"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-[10px] font-semibold" style={{ color: 'var(--studio-text-muted)' }}>
                        BINAURAL MONITORING
                      </Label>
                      <Switch
                        checked={value.binauralEnabled}
                        onCheckedChange={(checked) =>
                          updateValue({
                            binauralEnabled: checked,
                            monitoringMode: checked ? 'binaural' : 'speakers',
                          })
                        }
                      />
                    </div>
                    <p className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                      Enable HRTF-based binaural rendering for headphone monitoring of spatial audio content.
                    </p>
                  </div>
                </div>

                <div className="w-48">
                  <div className="text-[10px] font-semibold mb-2" style={{ color: 'var(--studio-text-muted)' }}>
                    ROOM PREVIEW
                  </div>
                  <div
                    className="aspect-square rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    <svg width="140" height="140">
                      <defs>
                        <pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse">
                          <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
                        </pattern>
                      </defs>

                      <rect width="140" height="140" fill="url(#grid)" />

                      {(() => {
                        const sizes = { small: 40, medium: 60, large: 80, hall: 110 };
                        const roomSize = sizes[value.room.size];
                        const offset = (140 - roomSize) / 2;
                        return (
                          <>
                            <rect
                              x={offset}
                              y={offset}
                              width={roomSize}
                              height={roomSize}
                              fill="rgba(0,204,255,0.1)"
                              stroke="rgba(0,204,255,0.3)"
                              strokeWidth="1"
                              rx="2"
                            />
                            <circle
                              cx={70}
                              cy={70}
                              r={4}
                              fill="#00ccff"
                              style={{ filter: 'drop-shadow(0 0 4px #00ccff)' }}
                            />
                            <text
                              x={70}
                              y={85}
                              fontSize="7"
                              fill="rgba(255,255,255,0.5)"
                              textAnchor="middle"
                            >
                              Listener
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                  <div className="mt-2 text-center text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                    {roomSizes[value.room.size].label}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
