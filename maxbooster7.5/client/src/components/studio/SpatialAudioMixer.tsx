import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Box,
  Headphones,
  Volume2,
  Move3d,
  RotateCcw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Settings2,
  Speaker,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Knob } from './Knob';

export type SpeakerConfiguration = '2.0' | '5.1' | '7.1' | '7.1.4' | 'atmos';

export interface AudioObject {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
  mute: boolean;
  solo: boolean;
  volume: number;
}

export interface SpeakerPosition {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  type: 'front' | 'rear' | 'side' | 'height' | 'sub';
}

const SPEAKER_CONFIGS: Record<SpeakerConfiguration, SpeakerPosition[]> = {
  '2.0': [
    { id: 'L', label: 'Left', x: -0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'R', label: 'Right', x: 0.7, y: 0.7, z: 0, type: 'front' },
  ],
  '5.1': [
    { id: 'L', label: 'Left', x: -0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'C', label: 'Center', x: 0, y: 0.8, z: 0, type: 'front' },
    { id: 'R', label: 'Right', x: 0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'LS', label: 'Left Surround', x: -0.8, y: -0.3, z: 0, type: 'rear' },
    { id: 'RS', label: 'Right Surround', x: 0.8, y: -0.3, z: 0, type: 'rear' },
    { id: 'LFE', label: 'Subwoofer', x: 0, y: 0.6, z: -0.3, type: 'sub' },
  ],
  '7.1': [
    { id: 'L', label: 'Left', x: -0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'C', label: 'Center', x: 0, y: 0.8, z: 0, type: 'front' },
    { id: 'R', label: 'Right', x: 0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'LSS', label: 'Left Side', x: -0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'RSS', label: 'Right Side', x: 0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'LRS', label: 'Left Rear', x: -0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'RRS', label: 'Right Rear', x: 0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'LFE', label: 'Subwoofer', x: 0, y: 0.6, z: -0.3, type: 'sub' },
  ],
  '7.1.4': [
    { id: 'L', label: 'Left', x: -0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'C', label: 'Center', x: 0, y: 0.8, z: 0, type: 'front' },
    { id: 'R', label: 'Right', x: 0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'LSS', label: 'Left Side', x: -0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'RSS', label: 'Right Side', x: 0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'LRS', label: 'Left Rear', x: -0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'RRS', label: 'Right Rear', x: 0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'LFE', label: 'Subwoofer', x: 0, y: 0.6, z: -0.3, type: 'sub' },
    { id: 'TFL', label: 'Top Front Left', x: -0.5, y: 0.5, z: 0.8, type: 'height' },
    { id: 'TFR', label: 'Top Front Right', x: 0.5, y: 0.5, z: 0.8, type: 'height' },
    { id: 'TRL', label: 'Top Rear Left', x: -0.5, y: -0.4, z: 0.8, type: 'height' },
    { id: 'TRR', label: 'Top Rear Right', x: 0.5, y: -0.4, z: 0.8, type: 'height' },
  ],
  'atmos': [
    { id: 'L', label: 'Left', x: -0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'C', label: 'Center', x: 0, y: 0.8, z: 0, type: 'front' },
    { id: 'R', label: 'Right', x: 0.7, y: 0.7, z: 0, type: 'front' },
    { id: 'LSS', label: 'Left Side', x: -0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'RSS', label: 'Right Side', x: 0.9, y: 0.1, z: 0, type: 'side' },
    { id: 'LRS', label: 'Left Rear', x: -0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'RRS', label: 'Right Rear', x: 0.7, y: -0.6, z: 0, type: 'rear' },
    { id: 'LFE', label: 'Subwoofer', x: 0, y: 0.6, z: -0.3, type: 'sub' },
    { id: 'TFL', label: 'Top Front Left', x: -0.5, y: 0.5, z: 0.8, type: 'height' },
    { id: 'TFR', label: 'Top Front Right', x: 0.5, y: 0.5, z: 0.8, type: 'height' },
    { id: 'TML', label: 'Top Mid Left', x: -0.5, y: 0, z: 0.8, type: 'height' },
    { id: 'TMR', label: 'Top Mid Right', x: 0.5, y: 0, z: 0.8, type: 'height' },
    { id: 'TRL', label: 'Top Rear Left', x: -0.5, y: -0.4, z: 0.8, type: 'height' },
    { id: 'TRR', label: 'Top Rear Right', x: 0.5, y: -0.4, z: 0.8, type: 'height' },
  ],
};

interface SpatialAudioMixerProps {
  objects?: AudioObject[];
  onObjectUpdate?: (id: string, updates: Partial<AudioObject>) => void;
  onObjectAdd?: (object: AudioObject) => void;
  onObjectRemove?: (id: string) => void;
  speakerConfig?: SpeakerConfiguration;
  onSpeakerConfigChange?: (config: SpeakerConfiguration) => void;
}

export function SpatialAudioMixer({
  objects: initialObjects = [],
  onObjectUpdate,
  onObjectAdd,
  onObjectRemove,
  speakerConfig: initialConfig = '7.1.4',
  onSpeakerConfigChange,
}: SpatialAudioMixerProps) {
  const [objects, setObjects] = useState<AudioObject[]>(initialObjects);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [speakerConfig, setSpeakerConfig] = useState<SpeakerConfiguration>(initialConfig);
  const [binauralMode, setBinauralMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showHeight, setShowHeight] = useState(true);
  const [viewMode, setViewMode] = useState<'top' | 'front' | 'side'>('top');
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragObjectId = useRef<string | null>(null);
  
  const speakers = SPEAKER_CONFIGS[speakerConfig];
  const selectedObject = objects.find(o => o.id === selectedObjectId);
  
  useEffect(() => {
    setObjects(initialObjects);
  }, [initialObjects]);
  
  const handleSpeakerConfigChange = (config: SpeakerConfiguration) => {
    setSpeakerConfig(config);
    onSpeakerConfigChange?.(config);
  };
  
  const updateObject = useCallback((id: string, updates: Partial<AudioObject>) => {
    setObjects(prev => prev.map(obj => 
      obj.id === id ? { ...obj, ...updates } : obj
    ));
    onObjectUpdate?.(id, updates);
  }, [onObjectUpdate]);
  
  const addObject = useCallback(() => {
    const newObject: AudioObject = {
      id: `obj-${Date.now()}`,
      name: `Object ${objects.length + 1}`,
      x: 0,
      y: 0,
      z: 0,
      size: 0.1,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      mute: false,
      solo: false,
      volume: 1,
    };
    setObjects(prev => [...prev, newObject]);
    setSelectedObjectId(newObject.id);
    onObjectAdd?.(newObject);
  }, [objects.length, onObjectAdd]);
  
  const removeObject = useCallback((id: string) => {
    setObjects(prev => prev.filter(obj => obj.id !== id));
    if (selectedObjectId === id) {
      setSelectedObjectId(null);
    }
    onObjectRemove?.(id);
  }, [selectedObjectId, onObjectRemove]);
  
  const handleCanvasMouseDown = (e: React.MouseEvent, objectId: string) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragObjectId.current = objectId;
    setSelectedObjectId(objectId);
  };
  
  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !dragObjectId.current || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    
    if (viewMode === 'top') {
      updateObject(dragObjectId.current, { x: clampedX, y: clampedY });
    } else if (viewMode === 'front') {
      updateObject(dragObjectId.current, { x: clampedX, z: clampedY });
    } else {
      updateObject(dragObjectId.current, { y: clampedX, z: clampedY });
    }
  };
  
  const handleCanvasMouseUp = () => {
    isDragging.current = false;
    dragObjectId.current = null;
  };
  
  const resetObjectPosition = (id: string) => {
    updateObject(id, { x: 0, y: 0, z: 0 });
  };
  
  const getSpeakerTypeColor = (type: string): string => {
    switch (type) {
      case 'front': return '#3b82f6';
      case 'rear': return '#ef4444';
      case 'side': return '#22c55e';
      case 'height': return '#a855f7';
      case 'sub': return '#f59e0b';
      default: return '#6b7280';
    }
  };
  
  const getViewCoordinates = (obj: { x: number; y: number; z: number }) => {
    switch (viewMode) {
      case 'top':
        return { displayX: obj.x, displayY: obj.y };
      case 'front':
        return { displayX: obj.x, displayY: obj.z };
      case 'side':
        return { displayX: obj.y, displayY: obj.z };
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-gray-900/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <Move3d className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Spatial Audio Mixer</h2>
          <Badge variant="outline" className="text-xs">
            {speakerConfig === 'atmos' ? 'Dolby Atmos' : speakerConfig}
          </Badge>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="binaural" className="text-xs text-gray-400">Binaural</Label>
            <Switch
              id="binaural"
              checked={binauralMode}
              onCheckedChange={setBinauralMode}
            />
            <Headphones className={`w-4 h-4 ${binauralMode ? 'text-green-400' : 'text-gray-500'}`} />
          </div>
          
          <Select value={speakerConfig} onValueChange={(v) => handleSpeakerConfigChange(v as SpeakerConfiguration)}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2.0">Stereo (2.0)</SelectItem>
              <SelectItem value="5.1">5.1 Surround</SelectItem>
              <SelectItem value="7.1">7.1 Surround</SelectItem>
              <SelectItem value="7.1.4">7.1.4 Atmos</SelectItem>
              <SelectItem value="atmos">Dolby Atmos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex rounded-md overflow-hidden border border-gray-600">
              {(['top', 'front', 'side'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs capitalize ${
                    viewMode === mode
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGrid(!showGrid)}
              className="h-7"
            >
              {showGrid ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="ml-1 text-xs">Grid</span>
            </Button>
            
            {(speakerConfig === '7.1.4' || speakerConfig === 'atmos') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHeight(!showHeight)}
                className="h-7"
              >
                <Box className="w-4 h-4" />
                <span className="ml-1 text-xs">Height</span>
              </Button>
            )}
          </div>
          
          <div
            ref={canvasRef}
            className="flex-1 relative bg-gray-800/50 rounded-lg border border-gray-700 overflow-hidden"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
          >
            {showGrid && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                <circle cx="50%" cy="50%" r="30%" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              </svg>
            )}
            
            <div className="absolute top-2 left-2 text-xs text-gray-500 uppercase">
              {viewMode === 'top' && 'X/Y (Top View)'}
              {viewMode === 'front' && 'X/Z (Front View)'}
              {viewMode === 'side' && 'Y/Z (Side View)'}
            </div>
            
            {speakers.map((speaker) => {
              const { displayX, displayY } = getViewCoordinates(speaker);
              const isHeightSpeaker = speaker.type === 'height';
              
              if (isHeightSpeaker && !showHeight) return null;
              
              return (
                <motion.div
                  key={speaker.id}
                  className="absolute flex flex-col items-center"
                  style={{
                    left: `${(displayX + 1) * 50}%`,
                    top: `${(-displayY + 1) * 50}%`,
                    transform: 'translate(-50%, -50%)',
                    opacity: isHeightSpeaker ? 0.7 : 1,
                  }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center"
                    style={{ backgroundColor: getSpeakerTypeColor(speaker.type) }}
                  >
                    <Speaker className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1">{speaker.id}</span>
                </motion.div>
              );
            })}
            
            <AnimatePresence>
              {objects.map((obj) => {
                const { displayX, displayY } = getViewCoordinates(obj);
                
                return (
                  <motion.div
                    key={obj.id}
                    className={`absolute cursor-move ${
                      selectedObjectId === obj.id ? 'z-20' : 'z-10'
                    }`}
                    style={{
                      left: `${(displayX + 1) * 50}%`,
                      top: `${(-displayY + 1) * 50}%`,
                      transform: 'translate(-50%, -50%)',
                    }}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: selectedObjectId === obj.id ? 1.2 : 1,
                      opacity: obj.mute ? 0.3 : 1,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                    onMouseDown={(e) => handleCanvasMouseDown(e, obj.id)}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg ${
                        selectedObjectId === obj.id ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800' : ''
                      }`}
                      style={{
                        backgroundColor: obj.color,
                        borderColor: obj.solo ? '#fbbf24' : 'transparent',
                      }}
                    >
                      <Volume2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="absolute top-full left-1/2 -translate-x-1/2 mt-1 text-[10px] text-gray-300 whitespace-nowrap">
                      {obj.name}
                    </span>
                    {showHeight && viewMode === 'top' && obj.z !== 0 && (
                      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-purple-400">
                        Z: {obj.z.toFixed(2)}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            <div className="absolute bottom-2 left-2 flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[10px] text-gray-500">Front</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-[10px] text-gray-500">Rear</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-[10px] text-gray-500">Side</span>
              </div>
              {(speakerConfig === '7.1.4' || speakerConfig === 'atmos') && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-[10px] text-gray-500">Height</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="w-72 border-l border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <span className="text-sm font-medium text-white">Objects</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={addObject}
              className="h-7"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {objects.map((obj) => (
                <Card
                  key={obj.id}
                  className={`cursor-pointer transition-all ${
                    selectedObjectId === obj.id
                      ? 'ring-2 ring-purple-500 bg-gray-800/80'
                      : 'bg-gray-800/40 hover:bg-gray-800/60'
                  }`}
                  onClick={() => setSelectedObjectId(obj.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: obj.color }}
                        />
                        <span className="text-sm text-white">{obj.name}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeObject(obj.id);
                        }}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
                      <div>X: {obj.x.toFixed(2)}</div>
                      <div>Y: {obj.y.toFixed(2)}</div>
                      <div>Z: {obj.z.toFixed(2)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {objects.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No audio objects.
                  <br />
                  Click "Add" to create one.
                </div>
              )}
            </div>
          </ScrollArea>
          
          {selectedObject && (
            <div className="border-t border-gray-700 p-3 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">Position</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetObjectPosition(selectedObject.id)}
                  className="h-6"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">X (Left/Right)</Label>
                    <span className="text-xs text-gray-300">{selectedObject.x.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.01}
                    value={[selectedObject.x]}
                    onValueChange={([v]) => updateObject(selectedObject.id, { x: v })}
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">Y (Front/Back)</Label>
                    <span className="text-xs text-gray-300">{selectedObject.y.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.01}
                    value={[selectedObject.y]}
                    onValueChange={([v]) => updateObject(selectedObject.id, { y: v })}
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">Z (Height)</Label>
                    <span className="text-xs text-gray-300">{selectedObject.z.toFixed(2)}</span>
                  </div>
                  <Slider
                    min={-1}
                    max={1}
                    step={0.01}
                    value={[selectedObject.z]}
                    onValueChange={([v]) => updateObject(selectedObject.id, { z: v })}
                  />
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-gray-400">Volume</Label>
                    <span className="text-xs text-gray-300">{Math.round(selectedObject.volume * 100)}%</span>
                  </div>
                  <Slider
                    min={0}
                    max={1}
                    step={0.01}
                    value={[selectedObject.volume]}
                    onValueChange={([v]) => updateObject(selectedObject.id, { volume: v })}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="mute"
                    checked={selectedObject.mute}
                    onCheckedChange={(v) => updateObject(selectedObject.id, { mute: v })}
                  />
                  <Label htmlFor="mute" className="text-xs text-gray-400">Mute</Label>
                </div>
                
                <div className="flex items-center gap-2">
                  <Switch
                    id="solo"
                    checked={selectedObject.solo}
                    onCheckedChange={(v) => updateObject(selectedObject.id, { solo: v })}
                  />
                  <Label htmlFor="solo" className="text-xs text-gray-400">Solo</Label>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
