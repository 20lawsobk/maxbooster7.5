import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flag,
  Plus,
  Trash2,
  Edit2,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Copy,
  Lock,
  Unlock,
  Palette,
  Music,
  Repeat,
  SkipForward,
  SkipBack,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useMarkers } from '@/hooks/useMarkers';
import { useStudioStore } from '@/lib/studioStore';

type MarkerType = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'breakdown' | 'drop' | 'outro' | 'custom';

interface Marker {
  id: string;
  name: string;
  type: MarkerType;
  time: number;
  duration: number;
  color: string;
  isLocked: boolean;
  notes: string;
}

interface FlowStateArrangementMarkersProps {
  projectId?: string;
  projectDuration?: number;
  currentTime?: number;
  onSeekToMarker?: (time: number) => void;
  onUpdateMarkers?: (markers: Marker[]) => void;
  className?: string;
}

const MARKER_TYPES: { type: MarkerType; label: string; color: string; defaultDuration: number }[] = [
  { type: 'intro', label: 'Intro', color: '#3b82f6', defaultDuration: 8 },
  { type: 'verse', label: 'Verse', color: '#22c55e', defaultDuration: 16 },
  { type: 'prechorus', label: 'Pre-Chorus', color: '#eab308', defaultDuration: 8 },
  { type: 'chorus', label: 'Chorus', color: '#ef4444', defaultDuration: 16 },
  { type: 'bridge', label: 'Bridge', color: '#8b5cf6', defaultDuration: 8 },
  { type: 'breakdown', label: 'Breakdown', color: '#06b6d4', defaultDuration: 8 },
  { type: 'drop', label: 'Drop', color: '#f97316', defaultDuration: 16 },
  { type: 'outro', label: 'Outro', color: '#6b7280', defaultDuration: 8 },
  { type: 'custom', label: 'Custom', color: '#ec4899', defaultDuration: 8 },
];

const COLORS = [
  '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#6b7280', '#14b8a6'
];

export function FlowStateArrangementMarkers({
  projectId,
  projectDuration = 180,
  currentTime = 0,
  onSeekToMarker,
  onUpdateMarkers,
  className
}: FlowStateArrangementMarkersProps) {
  const { toast } = useToast();
  const studioStore = useStudioStore();
  const currentProjectId = projectId || studioStore.currentProjectId;
  
  const defaultMarkers: Marker[] = [
    { id: 'm1', name: 'Intro', type: 'intro', time: 0, duration: 8, color: '#3b82f6', isLocked: false, notes: '' },
    { id: 'm2', name: 'Verse 1', type: 'verse', time: 8, duration: 16, color: '#22c55e', isLocked: false, notes: '' },
    { id: 'm3', name: 'Pre-Chorus', type: 'prechorus', time: 24, duration: 8, color: '#eab308', isLocked: false, notes: '' },
    { id: 'm4', name: 'Chorus 1', type: 'chorus', time: 32, duration: 16, color: '#ef4444', isLocked: true, notes: 'Main hook' },
    { id: 'm5', name: 'Verse 2', type: 'verse', time: 48, duration: 16, color: '#22c55e', isLocked: false, notes: '' },
    { id: 'm6', name: 'Pre-Chorus', type: 'prechorus', time: 64, duration: 8, color: '#eab308', isLocked: false, notes: '' },
    { id: 'm7', name: 'Chorus 2', type: 'chorus', time: 72, duration: 16, color: '#ef4444', isLocked: false, notes: '' },
    { id: 'm8', name: 'Bridge', type: 'bridge', time: 88, duration: 16, color: '#8b5cf6', isLocked: false, notes: '' },
    { id: 'm9', name: 'Drop', type: 'drop', time: 104, duration: 16, color: '#f97316', isLocked: false, notes: '' },
    { id: 'm10', name: 'Chorus 3', type: 'chorus', time: 120, duration: 16, color: '#ef4444', isLocked: false, notes: '' },
    { id: 'm11', name: 'Outro', type: 'outro', time: 136, duration: 16, color: '#6b7280', isLocked: false, notes: '' },
  ];
  
  const [demoMarkers, setDemoMarkers] = useState<Marker[]>(defaultMarkers);
  
  const {
    markers: apiMarkers,
    isLoading,
    error: markersError,
    createMarker,
    updateMarker: updateMarkerApi,
    deleteMarker: deleteMarkerApi
  } = useMarkers(currentProjectId);
  
  useEffect(() => {
    if (markersError) {
      toast({ title: 'Failed to load markers, using demo data', variant: 'destructive' });
    }
  }, [markersError, toast]);
  
  const markers: Marker[] = useMemo(() => {
    if (currentProjectId && apiMarkers && !markersError) {
      return apiMarkers.map((m: any) => ({
        id: m.id,
        name: m.name || 'Marker',
        type: (m.type || 'custom') as MarkerType,
        time: m.position ?? m.time ?? 0,
        duration: m.duration || 8,
        color: m.color || '#3b82f6',
        isLocked: m.isLocked ?? false,
        notes: m.notes || ''
      }));
    }
    return demoMarkers;
  }, [currentProjectId, apiMarkers, markersError, demoMarkers]);
  
  const setMarkers = currentProjectId ? () => {} : setDemoMarkers;

  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMarker, setEditingMarker] = useState<Marker | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopMarker, setLoopMarker] = useState<string | null>(null);

  const currentMarker = useMemo(() => 
    markers.find(m => currentTime >= m.time && currentTime < m.time + m.duration),
    [markers, currentTime]
  );

  const addMarker = useCallback((atTime?: number) => {
    const time = atTime ?? currentTime;
    const typeInfo = MARKER_TYPES.find(t => t.type === 'custom')!;
    
    const newMarkerData = {
      name: 'New Section',
      type: 'custom',
      time,
      position: time,
      duration: typeInfo.defaultDuration,
      color: typeInfo.color,
      isLocked: false,
      notes: ''
    };

    if (currentProjectId && createMarker) {
      createMarker(newMarkerData);
    } else {
      const newMarker: Marker = {
        id: `m${Date.now()}`,
        ...newMarkerData as any
      };
      setMarkers(prev => [...prev, newMarker].sort((a, b) => a.time - b.time));
      setEditingMarker(newMarker);
      setIsEditing(true);
      toast({ title: 'Marker added' });
    }
  }, [currentTime, currentProjectId, createMarker, toast]);

  const handleDeleteMarker = useCallback((markerId: string) => {
    const marker = markers.find(m => m.id === markerId);
    if (marker?.isLocked) {
      toast({ title: 'Cannot delete locked marker', variant: 'destructive' });
      return;
    }
    
    if (currentProjectId && deleteMarkerApi) {
      deleteMarkerApi(markerId);
    } else {
      setMarkers(prev => prev.filter(m => m.id !== markerId));
    }
    if (selectedMarker === markerId) setSelectedMarker(null);
  }, [markers, currentProjectId, deleteMarkerApi, selectedMarker, toast]);

  const updateMarker = useCallback((updates: Partial<Marker>) => {
    if (!editingMarker) return;
    
    const updated = { ...editingMarker, ...updates };
    setEditingMarker(updated);
  }, [editingMarker]);

  const saveMarker = () => {
    if (!editingMarker) return;

    if (currentProjectId && updateMarkerApi) {
      updateMarkerApi({
        id: editingMarker.id,
        updates: {
          name: editingMarker.name,
          type: editingMarker.type,
          position: editingMarker.time,
          color: editingMarker.color,
          isLocked: editingMarker.isLocked,
          notes: editingMarker.notes
        }
      });
    } else {
      setMarkers(prev => prev.map(m =>
        m.id === editingMarker.id ? editingMarker : m
      ).sort((a, b) => a.time - b.time));
      toast({ title: 'Marker updated' });
    }

    setIsEditing(false);
    setEditingMarker(null);
    onUpdateMarkers?.(markers);
  };

  const toggleLock = (markerId: string) => {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;
    
    if (currentProjectId && updateMarkerApi) {
      updateMarkerApi({
        id: markerId,
        updates: { isLocked: !marker.isLocked }
      });
    } else {
      setMarkers(prev => prev.map(m =>
        m.id === markerId ? { ...m, isLocked: !m.isLocked } : m
      ));
    }
  };

  const duplicateMarker = (markerId: string) => {
    const marker = markers.find(m => m.id === markerId);
    if (!marker) return;

    const newMarkerData = {
      name: `${marker.name} (copy)`,
      type: marker.type,
      time: marker.time + marker.duration,
      position: marker.time + marker.duration,
      duration: marker.duration,
      color: marker.color,
      isLocked: false,
      notes: marker.notes
    };

    if (currentProjectId && createMarker) {
      createMarker(newMarkerData);
      toast({ title: 'Marker duplicated' });
    } else {
      const newMarker: Marker = {
        ...marker,
        id: `m${Date.now()}`,
        name: `${marker.name} (copy)`,
        time: marker.time + marker.duration,
        isLocked: false
      };
      setMarkers(prev => [...prev, newMarker].sort((a, b) => a.time - b.time));
      toast({ title: 'Marker duplicated' });
    }
  };

  const navigateMarker = (direction: 'prev' | 'next') => {
    const sortedMarkers = [...markers].sort((a, b) => a.time - b.time);
    const currentIdx = sortedMarkers.findIndex(m => m.id === currentMarker?.id);

    if (direction === 'prev') {
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : sortedMarkers.length - 1;
      onSeekToMarker?.(sortedMarkers[prevIdx].time);
    } else {
      const nextIdx = currentIdx < sortedMarkers.length - 1 ? currentIdx + 1 : 0;
      onSeekToMarker?.(sortedMarkers[nextIdx].time);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatBars = (seconds: number, bpm: number = 120): string => {
    const beatsPerSecond = bpm / 60;
    const beats = seconds * beatsPerSecond;
    const bars = Math.floor(beats / 4) + 1;
    const beat = Math.floor(beats % 4) + 1;
    return `${bars}.${beat}`;
  };

  const selectedMarkerData = markers.find(m => m.id === selectedMarker);

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 text-white", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-lg">
            <Flag className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h2 className="font-semibold">Arrangement Markers</h2>
            <p className="text-xs text-zinc-500">{markers.length} sections</p>
          </div>
        </div>
        <Button onClick={() => addMarker()} className="bg-red-500 hover:bg-red-600">
          <Plus className="w-4 h-4 mr-1" />
          Add Marker
        </Button>
      </div>

      {/* Timeline View */}
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="relative h-16 bg-zinc-900 rounded-lg overflow-hidden">
          {/* Time grid */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: Math.ceil(projectDuration / 8) }, (_, i) => (
              <div
                key={i}
                className="border-r border-zinc-800"
                style={{ width: `${(8 / projectDuration) * 100}%` }}
              />
            ))}
          </div>

          {/* Markers */}
          {markers.map(marker => {
            const left = (marker.time / projectDuration) * 100;
            const width = (marker.duration / projectDuration) * 100;
            const isSelected = selectedMarker === marker.id;
            const isCurrent = currentMarker?.id === marker.id;

            return (
              <div
                key={marker.id}
                className={cn(
                  "absolute top-1 bottom-1 rounded cursor-pointer transition-all",
                  isSelected && "ring-2 ring-white",
                  isCurrent && "ring-2 ring-yellow-400"
                )}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: marker.color + '80'
                }}
                onClick={() => setSelectedMarker(marker.id)}
                onDoubleClick={() => {
                  setEditingMarker(marker);
                  setIsEditing(true);
                }}
              >
                <div className="px-2 py-1 truncate">
                  <span className="text-xs font-medium text-white drop-shadow">
                    {marker.name}
                  </span>
                </div>
                {marker.isLocked && (
                  <Lock className="absolute top-1 right-1 w-3 h-3 text-white/50" />
                )}
                {loopMarker === marker.id && (
                  <Repeat className="absolute bottom-1 right-1 w-3 h-3 text-yellow-400" />
                )}
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
            style={{ left: `${(currentTime / projectDuration) * 100}%` }}
          />
        </div>

        {/* Time labels */}
        <div className="flex justify-between mt-1 text-xs text-zinc-500">
          <span>0:00</span>
          <span>{formatTime(projectDuration / 4)}</span>
          <span>{formatTime(projectDuration / 2)}</span>
          <span>{formatTime(projectDuration * 3 / 4)}</span>
          <span>{formatTime(projectDuration)}</span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 py-3 border-b border-zinc-800">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={() => navigateMarker('prev')}>
                <SkipBack className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous Section</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 rounded-lg">
          {currentMarker && (
            <>
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: currentMarker.color }}
              />
              <span className="font-medium">{currentMarker.name}</span>
              <span className="text-xs text-zinc-500">
                ({formatTime(currentMarker.time)} - {formatTime(currentMarker.time + currentMarker.duration)})
              </span>
            </>
          )}
          {!currentMarker && <span className="text-zinc-500">No section</span>}
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="outline" onClick={() => navigateMarker('next')}>
                <SkipForward className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next Section</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Marker List */}
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-2">
          {markers.map((marker, idx) => (
            <Card
              key={marker.id}
              className={cn(
                "bg-zinc-900 border-zinc-800 p-3 cursor-pointer transition-all",
                selectedMarker === marker.id && "border-l-4",
                currentMarker?.id === marker.id && "bg-zinc-800/50"
              )}
              style={{
                borderLeftColor: selectedMarker === marker.id ? marker.color : undefined
              }}
              onClick={() => setSelectedMarker(marker.id)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                  style={{ backgroundColor: marker.color + '30', color: marker.color }}
                >
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{marker.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {MARKER_TYPES.find(t => t.type === marker.type)?.label}
                    </Badge>
                    {marker.isLocked && <Lock className="w-3 h-3 text-zinc-500" />}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500 mt-0.5">
                    <span>{formatTime(marker.time)} - {formatTime(marker.time + marker.duration)}</span>
                    <span>•</span>
                    <span>{marker.duration}s ({formatBars(marker.duration)} bars)</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeekToMarker?.(marker.time);
                          }}
                        >
                          <Play className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Go to marker</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("h-7 w-7", loopMarker === marker.id && "text-yellow-400")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLoopMarker(loopMarker === marker.id ? null : marker.id);
                          }}
                        >
                          <Repeat className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Loop section</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingMarker(marker);
                            setIsEditing(true);
                          }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateMarker(marker.id);
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Duplicate</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn("h-7 w-7", marker.isLocked && "text-yellow-400")}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLock(marker.id);
                          }}
                        >
                          {marker.isLocked ? (
                            <Lock className="w-3.5 h-3.5" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{marker.isLocked ? 'Unlock' : 'Lock'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMarker(marker.id);
                          }}
                          disabled={marker.isLocked}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Edit Marker</DialogTitle>
            <DialogDescription>
              Update the section details
            </DialogDescription>
          </DialogHeader>
          {editingMarker && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={editingMarker.name}
                  onChange={(e) => updateMarker({ name: e.target.value })}
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={editingMarker.type}
                    onValueChange={(v) => {
                      const typeInfo = MARKER_TYPES.find(t => t.type === v);
                      updateMarker({ type: v as MarkerType, color: typeInfo?.color || editingMarker.color });
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKER_TYPES.map(type => (
                        <SelectItem key={type.type} value={type.type}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <div className="flex gap-1">
                    {COLORS.map(color => (
                      <button
                        key={color}
                        className={cn(
                          "w-6 h-6 rounded transition-transform",
                          editingMarker.color === color && "ring-2 ring-white scale-110"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => updateMarker({ color })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Time (seconds)</Label>
                  <Input
                    type="number"
                    value={editingMarker.time}
                    onChange={(e) => updateMarker({ time: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration (seconds)</Label>
                  <Input
                    type="number"
                    value={editingMarker.duration}
                    onChange={(e) => updateMarker({ duration: parseFloat(e.target.value) || 8 })}
                    className="bg-zinc-800 border-zinc-700"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={editingMarker.notes}
                  onChange={(e) => updateMarker({ notes: e.target.value })}
                  placeholder="Optional notes..."
                  className="bg-zinc-800 border-zinc-700"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={saveMarker}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default FlowStateArrangementMarkers;
