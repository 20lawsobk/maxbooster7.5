import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { useSwipeGesture, triggerHapticFeedback, usePinchZoom } from '@/hooks/useTouchGestures';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Music,
  Trash2,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  Headphones,
  Mic,
} from 'lucide-react';

interface MobileStudioProps {
  projectId?: string;
}

interface Track {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
}

interface SwipeableTrackProps {
  track: Track;
  onMute: (id: string) => void;
  onSolo: (id: string) => void;
  onDelete: (id: string) => void;
  onVolumeChange: (id: string, volume: number) => void;
}

function SwipeableTrack({ track, onMute, onSolo, onDelete, onVolumeChange }: SwipeableTrackProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [showActions, setShowActions] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - startX.current;
    const clampedOffset = Math.max(-120, Math.min(0, deltaX));
    setSwipeOffset(clampedOffset);
  };

  const handleTouchEnd = () => {
    if (swipeOffset < -60) {
      setShowActions(true);
      setSwipeOffset(-120);
    } else {
      setShowActions(false);
      setSwipeOffset(0);
    }
  };

  const handleAction = (action: () => void) => {
    triggerHapticFeedback('medium');
    action();
    setShowActions(false);
    setSwipeOffset(0);
  };

  return (
    <div className="relative overflow-hidden rounded-lg mb-2">
      <div
        className="absolute right-0 top-0 bottom-0 flex items-stretch"
        style={{ width: 120 }}
      >
        <button
          type="button"
          onClick={() => handleAction(() => onMute(track.id))}
          className={cn(
            'flex-1 flex items-center justify-center',
            track.mute ? 'bg-yellow-500' : 'bg-yellow-400'
          )}
        >
          <VolumeX className="w-5 h-5 text-white" />
        </button>
        <button
          type="button"
          onClick={() => handleAction(() => onSolo(track.id))}
          className={cn(
            'flex-1 flex items-center justify-center',
            track.solo ? 'bg-blue-500' : 'bg-blue-400'
          )}
        >
          <Headphones className="w-5 h-5 text-white" />
        </button>
        <button
          type="button"
          onClick={() => handleAction(() => onDelete(track.id))}
          className="flex-1 flex items-center justify-center bg-red-500"
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>

      <div
        ref={trackRef}
        className="relative bg-card border rounded-lg p-3 touch-manipulation transition-transform"
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: track.color + '20' }}
          >
            <Music className="w-5 h-5" style={{ color: track.color }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm truncate">{track.name}</span>
              {track.mute && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">M</Badge>
              )}
              {track.solo && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-500/10">S</Badge>
              )}
              {track.armed && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                  <Circle className="w-2 h-2 mr-0.5 fill-current" />
                  REC
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Volume2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
              <Slider
                value={[track.volume]}
                max={100}
                step={1}
                className="flex-1"
                onValueChange={([value]) => onVolumeChange(track.id, value)}
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">
                {track.volume}%
              </span>
            </div>
          </div>

          <button
            type="button"
            className="p-2 touch-manipulation"
            onClick={() => {
              triggerHapticFeedback('light');
              setSwipeOffset(showActions ? 0 : -120);
              setShowActions(!showActions);
            }}
          >
            <MoreVertical className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="mt-2 h-8 bg-muted/50 rounded overflow-hidden">
          <div
            className="h-full opacity-60"
            style={{
              background: `linear-gradient(90deg, ${track.color}40 0%, ${track.color}80 25%, ${track.color}40 50%, ${track.color}80 75%, ${track.color}40 100%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

interface TransportControlsProps {
  isPlaying: boolean;
  isRecording: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  currentTime: string;
}

function TransportControls({
  isPlaying,
  isRecording,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onSkipBack,
  onSkipForward,
  currentTime,
}: TransportControlsProps) {
  const handleAction = (action: () => void) => {
    triggerHapticFeedback('medium');
    action();
  };

  return (
    <Card className="sticky bottom-0 z-10 border-t-2">
      <CardContent className="p-4">
        <div className="flex items-center justify-center gap-1 mb-3">
          <span className="text-2xl font-mono font-bold tracking-wider">{currentTime}</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full"
            onClick={() => handleAction(onSkipBack)}
          >
            <SkipBack className="w-5 h-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full"
            onClick={() => handleAction(onStop)}
          >
            <Square className="w-5 h-5" />
          </Button>

          <Button
            variant={isPlaying ? 'secondary' : 'default'}
            size="icon"
            className="w-16 h-16 rounded-full"
            onClick={() => handleAction(isPlaying ? onPause : onPlay)}
          >
            {isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </Button>

          <Button
            variant={isRecording ? 'destructive' : 'ghost'}
            size="icon"
            className="w-12 h-12 rounded-full"
            onClick={() => handleAction(onRecord)}
          >
            <Circle className={cn('w-5 h-5', isRecording && 'fill-current animate-pulse')} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-12 h-12 rounded-full"
            onClick={() => handleAction(onSkipForward)}
          >
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MobileStudio({ projectId }: MobileStudioProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState('00:00:00');
  const [isFullscreenMixer, setIsFullscreenMixer] = useState(false);
  const waveformRef = useRef<HTMLDivElement>(null);

  const { scale, resetZoom } = usePinchZoom(waveformRef, {
    minScale: 0.5,
    maxScale: 4,
    onZoomChange: (newScale) => {
      triggerHapticFeedback('light');
    },
  });

  const { data: projectData, isLoading } = useQuery({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  const [tracks, setTracks] = useState<Track[]>([
    { id: '1', name: 'Vocals', volume: 80, pan: 0, mute: false, solo: false, armed: false, color: '#4ade80' },
    { id: '2', name: 'Drums', volume: 75, pan: 0, mute: false, solo: false, armed: false, color: '#60a5fa' },
    { id: '3', name: 'Bass', volume: 70, pan: 0, mute: false, solo: false, armed: false, color: '#f87171' },
    { id: '4', name: 'Synth Lead', volume: 65, pan: 0, mute: false, solo: false, armed: false, color: '#fbbf24' },
    { id: '5', name: 'Pads', volume: 55, pan: 0, mute: false, solo: false, armed: true, color: '#a78bfa' },
  ]);

  const handleMute = useCallback((id: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, mute: !t.mute } : t))
    );
  }, []);

  const handleSolo = useCallback((id: string) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setTracks((prev) => prev.filter((t) => t.id !== id));
    toast({
      title: 'Track deleted',
      description: 'Track has been removed from the project.',
    });
  }, [toast]);

  const handleVolumeChange = useCallback((id: string, volume: number) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, volume } : t))
    );
  }, []);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);
  const handleStop = () => {
    setIsPlaying(false);
    setIsRecording(false);
    setCurrentTime('00:00:00');
  };
  const handleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
    } else {
      setIsRecording(true);
      setIsPlaying(true);
    }
  };
  const handleSkipBack = () => setCurrentTime('00:00:00');
  const handleSkipForward = () => setCurrentTime('00:00:30');

  const project = (projectData as any)?.data || { title: 'Untitled Project' };

  if (isFullscreenMixer) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-bold">Mixer</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              triggerHapticFeedback('light');
              setIsFullscreenMixer(false);
            }}
          >
            <Minimize className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 min-w-max">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="w-20 flex flex-col items-center gap-2 p-3 bg-muted/50 rounded-lg"
              >
                <div
                  className="w-8 h-8 rounded-full"
                  style={{ backgroundColor: track.color }}
                />
                <span className="text-xs font-medium text-center truncate w-full">
                  {track.name}
                </span>
                <div className="h-32 w-2 bg-muted rounded-full relative">
                  <div
                    className="absolute bottom-0 w-full rounded-full transition-all"
                    style={{
                      height: `${track.volume}%`,
                      backgroundColor: track.color,
                    }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {track.volume}%
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleMute(track.id)}
                    className={cn(
                      'w-7 h-7 rounded text-[10px] font-bold',
                      track.mute ? 'bg-yellow-500 text-white' : 'bg-muted'
                    )}
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSolo(track.id)}
                    className={cn(
                      'w-7 h-7 rounded text-[10px] font-bold',
                      track.solo ? 'bg-blue-500 text-white' : 'bg-muted'
                    )}
                  >
                    S
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <TransportControls
          isPlaying={isPlaying}
          isRecording={isRecording}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onRecord={handleRecord}
          onSkipBack={handleSkipBack}
          onSkipForward={handleSkipForward}
          currentTime={currentTime}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex-1 min-w-0">
          <h1 className="font-bold truncate">{project.title}</h1>
          <p className="text-xs text-muted-foreground">
            {tracks.length} tracks • {isRecording ? 'Recording' : isPlaying ? 'Playing' : 'Stopped'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            triggerHapticFeedback('light');
            setIsFullscreenMixer(true);
          }}
          className="flex-shrink-0"
        >
          <Maximize className="w-4 h-4 mr-1" />
          Mixer
        </Button>
      </div>

      <div
        ref={waveformRef}
        className="h-24 bg-muted/30 border-b overflow-hidden touch-manipulation"
        style={{ transform: `scaleX(${scale})`, transformOrigin: 'left center' }}
      >
        <div className="flex items-center h-full px-4">
          {tracks.map((track, i) => (
            <div
              key={track.id}
              className="flex-1 h-full flex items-center"
              style={{ opacity: track.mute ? 0.3 : 1 }}
            >
              <div
                className="w-full h-1/2 rounded-sm"
                style={{
                  background: `linear-gradient(90deg, transparent 0%, ${track.color}60 20%, ${track.color}80 50%, ${track.color}60 80%, transparent 100%)`,
                }}
              />
            </div>
          ))}
        </div>
        <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
          Pinch to zoom • {Math.round(scale * 100)}%
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Tracks</h2>
          <span className="text-xs text-muted-foreground">Swipe left for actions</span>
        </div>

        {tracks.map((track) => (
          <SwipeableTrack
            key={track.id}
            track={track}
            onMute={handleMute}
            onSolo={handleSolo}
            onDelete={handleDelete}
            onVolumeChange={handleVolumeChange}
          />
        ))}

        <Button
          variant="outline"
          className="w-full mt-4 border-dashed"
          onClick={() => {
            triggerHapticFeedback('light');
            const colors = ['#4ade80', '#60a5fa', '#f87171', '#fbbf24', '#a78bfa', '#fb923c'];
            setTracks([
              ...tracks,
              {
                id: Date.now().toString(),
                name: `Track ${tracks.length + 1}`,
                volume: 70,
                pan: 0,
                mute: false,
                solo: false,
                armed: false,
                color: colors[tracks.length % colors.length],
              },
            ]);
          }}
        >
          <Music className="w-4 h-4 mr-2" />
          Add Track
        </Button>
      </div>

      <TransportControls
        isPlaying={isPlaying}
        isRecording={isRecording}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={handleRecord}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        currentTime={currentTime}
      />
    </div>
  );
}
