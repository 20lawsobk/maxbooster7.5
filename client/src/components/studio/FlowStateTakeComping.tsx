import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Check,
  CheckCheck,
  Star,
  StarOff,
  Trash2,
  Play,
  Pause,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Mic,
  Volume2,
  VolumeX,
  Scissors,
  Copy,
  Wand2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TakeRegion {
  id: string;
  takeId: string;
  startTime: number;
  endTime: number;
}

interface Take {
  id: string;
  name: string;
  number: number;
  timestamp: Date;
  duration: number;
  isFavorite: boolean;
  isMuted: boolean;
  waveform: number[];
  rating: number;
  notes: string;
}

interface FlowStateTakeCompingProps {
  trackName?: string;
  duration?: number;
  onExportComp?: (regions: TakeRegion[]) => void;
  className?: string;
}

const generateWaveform = (seed: number): number[] => {
  const waveform: number[] = [];
  for (let i = 0; i < 200; i++) {
    const x = i / 200;
    let val = Math.sin(x * Math.PI * 4 + seed) * 0.3;
    val += Math.sin(x * Math.PI * 8 + seed * 2) * 0.2;
    val += Math.sin(x * Math.PI * 16 + seed * 3) * 0.15;
    val += (Math.sin(seed * 100 + i) * 0.5 + 0.5) * 0.1;
    waveform.push(Math.abs(val) + 0.1);
  }
  return waveform;
};

export function FlowStateTakeComping({
  trackName = 'Lead Vocals',
  duration = 16,
  onExportComp,
  className
}: FlowStateTakeCompingProps) {
  const { toast } = useToast();
  const [takes, setTakes] = useState<Take[]>([
    { id: 't1', name: 'Take 1', number: 1, timestamp: new Date(Date.now() - 3600000), duration, isFavorite: false, isMuted: false, waveform: generateWaveform(1), rating: 3, notes: 'Good energy, pitch issues on verse' },
    { id: 't2', name: 'Take 2', number: 2, timestamp: new Date(Date.now() - 3000000), duration, isFavorite: true, isMuted: false, waveform: generateWaveform(2), rating: 5, notes: 'Best chorus' },
    { id: 't3', name: 'Take 3', number: 3, timestamp: new Date(Date.now() - 2400000), duration, isFavorite: false, isMuted: false, waveform: generateWaveform(3), rating: 4, notes: 'Clean performance' },
    { id: 't4', name: 'Take 4', number: 4, timestamp: new Date(Date.now() - 1800000), duration, isFavorite: true, isMuted: false, waveform: generateWaveform(4), rating: 5, notes: 'Perfect bridge section' },
    { id: 't5', name: 'Take 5', number: 5, timestamp: new Date(Date.now() - 1200000), duration, isFavorite: false, isMuted: true, waveform: generateWaveform(5), rating: 2, notes: 'Rough take' },
  ]);

  const [selectedRegions, setSelectedRegions] = useState<TakeRegion[]>([
    { id: 'r1', takeId: 't2', startTime: 0, endTime: 4 },
    { id: 'r2', takeId: 't3', startTime: 4, endTime: 8 },
    { id: 'r3', takeId: 't4', startTime: 8, endTime: 12 },
    { id: 'r4', takeId: 't2', startTime: 12, endTime: 16 },
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [expandedTakes, setExpandedTakes] = useState<string[]>(['t2']);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [soloTake, setSoloTake] = useState<string | null>(null);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [crossfadeLength, setCrossfadeLength] = useState([50]);

  const filteredTakes = useMemo(() => 
    showOnlyFavorites ? takes.filter(t => t.isFavorite) : takes,
    [takes, showOnlyFavorites]
  );

  const toggleFavorite = (takeId: string) => {
    setTakes(prev => prev.map(t =>
      t.id === takeId ? { ...t, isFavorite: !t.isFavorite } : t
    ));
  };

  const toggleMute = (takeId: string) => {
    setTakes(prev => prev.map(t =>
      t.id === takeId ? { ...t, isMuted: !t.isMuted } : t
    ));
  };

  const deleteTake = (takeId: string) => {
    setTakes(prev => prev.filter(t => t.id !== takeId));
    setSelectedRegions(prev => prev.filter(r => r.takeId !== takeId));
    toast({ title: 'Take deleted' });
  };

  const toggleExpand = (takeId: string) => {
    setExpandedTakes(prev =>
      prev.includes(takeId)
        ? prev.filter(id => id !== takeId)
        : [...prev, takeId]
    );
  };

  const selectRegion = (takeId: string, startTime: number, endTime: number) => {
    const newRegion: TakeRegion = {
      id: `r${Date.now()}`,
      takeId,
      startTime: Math.min(startTime, endTime),
      endTime: Math.max(startTime, endTime)
    };

    setSelectedRegions(prev => {
      const filtered = prev.filter(r =>
        r.endTime <= newRegion.startTime || r.startTime >= newRegion.endTime
      );
      
      const adjusted = prev
        .filter(r => !(r.endTime <= newRegion.startTime || r.startTime >= newRegion.endTime))
        .flatMap(r => {
          const results: TakeRegion[] = [];
          if (r.startTime < newRegion.startTime) {
            results.push({ ...r, id: `${r.id}-left`, endTime: newRegion.startTime });
          }
          if (r.endTime > newRegion.endTime) {
            results.push({ ...r, id: `${r.id}-right`, startTime: newRegion.endTime });
          }
          return results;
        });

      return [...filtered, ...adjusted, newRegion].sort((a, b) => a.startTime - b.startTime);
    });
  };

  const handleWaveformClick = (takeId: string, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration;

    if (e.shiftKey && selectionStart !== null) {
      selectRegion(takeId, selectionStart, time);
      setSelectionStart(null);
    } else {
      setSelectionStart(time);
    }
  };

  const autoComp = () => {
    const bestTakes = takes
      .filter(t => !t.isMuted)
      .sort((a, b) => b.rating - a.rating);

    if (bestTakes.length === 0) {
      toast({ title: 'No takes available', variant: 'destructive' });
      return;
    }

    const segmentDuration = duration / 4;
    const newRegions: TakeRegion[] = [];

    for (let i = 0; i < 4; i++) {
      const takeForSegment = bestTakes[i % bestTakes.length];
      newRegions.push({
        id: `r${Date.now()}-${i}`,
        takeId: takeForSegment.id,
        startTime: i * segmentDuration,
        endTime: (i + 1) * segmentDuration
      });
    }

    setSelectedRegions(newRegions);
    toast({ title: 'Auto-comp applied', description: 'Best takes selected for each section' });
  };

  const clearComp = () => {
    setSelectedRegions([]);
    toast({ title: 'Comp cleared' });
  };

  const exportComp = () => {
    onExportComp?.(selectedRegions);
    toast({ title: 'Comp exported', description: `${selectedRegions.length} regions` });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getRegionForTime = (time: number): TakeRegion | undefined => {
    return selectedRegions.find(r => time >= r.startTime && time < r.endTime);
  };

  const getTakeColor = (takeId: string): string => {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 
      'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'
    ];
    const idx = takes.findIndex(t => t.id === takeId);
    return colors[idx % colors.length];
  };

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
            <Layers className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="font-semibold">Take Comping</h2>
            <p className="text-xs text-zinc-500">{trackName} • {takes.length} takes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={autoComp}>
            <Wand2 className="w-4 h-4 mr-1" />
            Auto-Comp
          </Button>
          <Button variant="outline" size="sm" onClick={clearComp}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Clear
          </Button>
          <Button size="sm" className="bg-purple-500 hover:bg-purple-600" onClick={exportComp}>
            <CheckCheck className="w-4 h-4 mr-1" />
            Export Comp
          </Button>
        </div>
      </div>

      {/* Comp Preview */}
      <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-sm font-medium">Composite Preview</span>
          <Badge variant="secondary">{selectedRegions.length} regions</Badge>
        </div>
        <div className="h-12 bg-zinc-900 rounded relative overflow-hidden">
          {/* Grid */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} className="flex-1 border-r border-zinc-800 last:border-r-0" />
            ))}
          </div>

          {/* Selected regions */}
          {selectedRegions.map(region => {
            const take = takes.find(t => t.id === region.takeId);
            if (!take) return null;
            const left = (region.startTime / duration) * 100;
            const width = ((region.endTime - region.startTime) / duration) * 100;

            return (
              <div
                key={region.id}
                className={cn("absolute top-1 bottom-1 rounded", getTakeColor(region.takeId))}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white/80">
                  {take.name}
                </span>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-zinc-500">
          <span>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Takes List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Takes</h3>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-zinc-400">Favorites only</Label>
            <Switch checked={showOnlyFavorites} onCheckedChange={setShowOnlyFavorites} />
          </div>
        </div>

        <div className="space-y-2">
          {filteredTakes.map(take => {
            const isExpanded = expandedTakes.includes(take.id);
            const isSoloed = soloTake === take.id;
            const takeRegions = selectedRegions.filter(r => r.takeId === take.id);

            return (
              <Card
                key={take.id}
                className={cn(
                  "bg-zinc-900 border-zinc-800 overflow-hidden transition-all",
                  isSoloed && "border-yellow-500/50"
                )}
              >
                {/* Take Header */}
                <div className="flex items-center gap-3 p-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => toggleExpand(take.id)}
                  >
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </Button>

                  <div className={cn("w-3 h-3 rounded-full shrink-0", getTakeColor(take.id))} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{take.name}</span>
                      {take.isFavorite && (
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      )}
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              i < take.rating ? "bg-yellow-400" : "bg-zinc-700"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{take.notes}</p>
                  </div>

                  {takeRegions.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {takeRegions.length} selected
                    </Badge>
                  )}

                  <TooltipProvider>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn("h-7 w-7", isSoloed && "text-yellow-400")}
                            onClick={() => setSoloTake(isSoloed ? null : take.id)}
                          >
                            <Mic className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Solo</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn("h-7 w-7", take.isMuted && "text-red-400")}
                            onClick={() => toggleMute(take.id)}
                          >
                            {take.isMuted ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{take.isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn("h-7 w-7", take.isFavorite && "text-yellow-400")}
                            onClick={() => toggleFavorite(take.id)}
                          >
                            {take.isFavorite ? (
                              <Star className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <StarOff className="w-3.5 h-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Favorite</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-400"
                            onClick={() => deleteTake(take.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                </div>

                {/* Expanded Waveform */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div
                        className={cn(
                          "h-20 bg-zinc-950 mx-3 mb-3 rounded cursor-crosshair relative",
                          take.isMuted && "opacity-50"
                        )}
                        onClick={(e) => handleWaveformClick(take.id, e)}
                      >
                        {/* Grid */}
                        <div className="absolute inset-0 flex">
                          {Array.from({ length: 16 }, (_, i) => (
                            <div key={i} className="flex-1 border-r border-zinc-800/50 last:border-r-0" />
                          ))}
                        </div>

                        {/* Waveform */}
                        <div className="absolute inset-0 flex items-center px-1">
                          {take.waveform.map((v, i) => (
                            <div
                              key={i}
                              className={cn("flex-1 mx-px rounded-sm", getTakeColor(take.id))}
                              style={{ height: `${v * 80}%`, opacity: 0.7 }}
                            />
                          ))}
                        </div>

                        {/* Selected regions from this take */}
                        {takeRegions.map(region => {
                          const left = (region.startTime / duration) * 100;
                          const width = ((region.endTime - region.startTime) / duration) * 100;
                          return (
                            <div
                              key={region.id}
                              className="absolute top-0 bottom-0 bg-white/20 border-x-2 border-white"
                              style={{ left: `${left}%`, width: `${width}%` }}
                            >
                              <div className="absolute top-1 right-1">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            </div>
                          );
                        })}

                        {/* Help text */}
                        <div className="absolute bottom-1 left-1 text-[10px] text-zinc-500">
                          Click to set start, Shift+Click to select region
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              size="icon"
              variant={isPlaying ? 'default' : 'outline'}
              className={cn(isPlaying && "bg-green-500 hover:bg-green-600")}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <span className="font-mono text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Label className="text-xs text-zinc-400">Crossfade: {crossfadeLength[0]}ms</Label>
            <Slider
              value={crossfadeLength}
              onValueChange={setCrossfadeLength}
              min={0}
              max={200}
              step={10}
              className="w-32"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlowStateTakeComping;
