import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdaptiveLayout } from '@/hooks/useAdaptiveLayout';
import { useSwipeGesture, triggerHapticFeedback, usePinchZoom } from '@/hooks/useTouchGestures';
import { SplitPane } from '@/components/ui/SplitPane';
import { MultiTouchMixer, MiniMixer } from './MultiTouchMixer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  FastForward,
  Rewind,
  Repeat,
  Shuffle,
  Volume2,
  Maximize,
  Minimize,
  PanelLeft,
  PanelRight,
  Music,
  Layers,
  Sliders,
  Waveform,
  Mic,
  Folder,
  ChevronUp,
  ChevronDown,
  Grid3X3,
  Settings,
  Save,
  Download,
} from 'lucide-react';

interface TabletStudioProps {
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

type ViewMode = 'split' | 'tracks' | 'timeline' | 'mixer';
type MixerMode = 'docked' | 'floating' | 'hidden';

function TouchTransport({
  isPlaying,
  isRecording,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onSkipBack,
  onSkipForward,
  onRewind,
  onFastForward,
  currentTime,
  duration,
  tempo,
}: {
  isPlaying: boolean;
  isRecording: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onRewind: () => void;
  onFastForward: () => void;
  currentTime: string;
  duration: string;
  tempo: number;
}) {
  const handleAction = (action: () => void) => {
    triggerHapticFeedback('medium');
    action();
  };

  return (
    <div className="flex items-center justify-between p-3 bg-card border-t">
      <div className="flex items-center gap-2">
        <div className="text-center min-w-[100px]">
          <p className="text-2xl font-mono font-bold tracking-wider">{currentTime}</p>
          <p className="text-xs text-muted-foreground">/ {duration}</p>
        </div>
        <div className="px-3 py-1 rounded-md bg-muted text-sm font-mono">
          {tempo} BPM
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onRewind)}
        >
          <Rewind className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onSkipBack)}
        >
          <SkipBack className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onStop)}
        >
          <Square className="w-4 h-4" />
        </Button>

        <Button
          variant={isPlaying ? 'secondary' : 'default'}
          size="icon"
          className="w-14 h-14 rounded-full touch-manipulation"
          onClick={() => handleAction(isPlaying ? onPause : onPlay)}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-1" />
          )}
        </Button>

        <Button
          variant={isRecording ? 'destructive' : 'ghost'}
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onRecord)}
        >
          <Circle className={cn('w-4 h-4', isRecording && 'fill-current animate-pulse')} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onSkipForward)}
        >
          <SkipForward className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="w-10 h-10 rounded-full touch-manipulation"
          onClick={() => handleAction(onFastForward)}
        >
          <FastForward className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="touch-manipulation">
          <Repeat className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="touch-manipulation">
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function TrackListPanel({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onMute,
  onSolo,
  onArm,
}: {
  tracks: Track[];
  selectedTrackId: string | null;
  onSelectTrack: (id: string) => void;
  onMute: (id: string) => void;
  onSolo: (id: string) => void;
  onArm: (id: string) => void;
}) {
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-semibold text-sm">Tracks</h3>
        <Button variant="ghost" size="sm" className="h-8 touch-manipulation">
          <Music className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tracks.map((track) => (
          <div
            key={track.id}
            onClick={() => {
              triggerHapticFeedback('light');
              onSelectTrack(track.id);
            }}
            className={cn(
              'flex items-center gap-2 p-3 border-b cursor-pointer touch-manipulation',
              'transition-colors hover:bg-muted/50 active:bg-muted',
              selectedTrackId === track.id && 'bg-primary/10 border-l-2 border-l-primary'
            )}
          >
            <div
              className="w-3 h-12 rounded-sm flex-shrink-0"
              style={{ backgroundColor: track.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-medium text-sm truncate">{track.name}</span>
                {track.mute && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-4">M</Badge>
                )}
                {track.solo && (
                  <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 bg-blue-500/10">S</Badge>
                )}
                {track.armed && (
                  <Badge variant="destructive" className="text-[8px] px-1 py-0 h-4 animate-pulse">REC</Badge>
                )}
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${track.volume}%`,
                    backgroundColor: track.color,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHapticFeedback('light');
                  onMute(track.id);
                }}
                className={cn(
                  'w-6 h-6 rounded text-[10px] font-bold touch-manipulation',
                  track.mute ? 'bg-yellow-500 text-white' : 'bg-muted'
                )}
              >
                M
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  triggerHapticFeedback('light');
                  onSolo(track.id);
                }}
                className={cn(
                  'w-6 h-6 rounded text-[10px] font-bold touch-manipulation',
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
  );
}

function TimelinePanel({
  tracks,
  zoom,
  onZoomChange,
}: {
  tracks: Track[];
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scale, resetZoom } = usePinchZoom(containerRef, {
    minScale: 0.5,
    maxScale: 4,
    onZoomChange: (newScale) => {
      onZoomChange(newScale);
      triggerHapticFeedback('light');
    },
  });

  const timeMarkers = useMemo(() => {
    const markers = [];
    for (let i = 0; i <= 32; i += 4) {
      markers.push(i);
    }
    return markers;
  }, []);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex gap-2">
          {timeMarkers.map((bar) => (
            <span
              key={bar}
              className="text-[10px] text-muted-foreground font-mono"
              style={{ minWidth: `${60 * zoom}px` }}
            >
              {bar + 1}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-auto touch-manipulation"
        style={{ transform: `scaleX(${scale})`, transformOrigin: 'left' }}
      >
        {tracks.map((track) => (
          <div
            key={track.id}
            className="h-16 border-b flex items-center"
            style={{ opacity: track.mute ? 0.4 : 1 }}
          >
            <div
              className="h-12 mx-2 rounded-md flex items-center px-2"
              style={{
                width: `${200 * zoom}px`,
                background: `linear-gradient(90deg, ${track.color}40 0%, ${track.color}80 50%, ${track.color}40 100%)`,
                border: `1px solid ${track.color}60`,
              }}
            >
              <Waveform className="w-4 h-4 mr-2" style={{ color: track.color }} />
              <span className="text-xs font-medium truncate">{track.name}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t bg-muted/30 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Pinch to zoom • {Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="sm" onClick={resetZoom} className="text-xs h-7">
          Reset
        </Button>
      </div>
    </div>
  );
}

function BrowserPanel({ onClose }: { onClose: () => void }) {
  const folders = ['Drums', 'Bass', 'Synths', 'Vocals', 'FX', 'Loops'];

  return (
    <div className="h-full flex flex-col bg-background border-l">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4" />
          <h3 className="font-semibold text-sm">Browser</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <PanelRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {folders.map((folder) => (
          <button
            key={folder}
            type="button"
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 touch-manipulation text-left"
            onClick={() => triggerHapticFeedback('light')}
          >
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm">{folder}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TabletStudio({ projectId }: TabletStudioProps) {
  const { layoutMode, orientation } = useAdaptiveLayout();
  const queryClient = useQueryClient();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState('00:00:00');
  const [tempo, setTempo] = useState(120);
  const [zoom, setZoom] = useState(1);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [mixerMode, setMixerMode] = useState<MixerMode>('docked');
  const [showBrowser, setShowBrowser] = useState(false);

  const [tracks, setTracks] = useState<Track[]>([
    { id: '1', name: 'Vocals', volume: 80, pan: 0, mute: false, solo: false, armed: false, color: '#4ade80' },
    { id: '2', name: 'Drums', volume: 75, pan: 0, mute: false, solo: false, armed: false, color: '#60a5fa' },
    { id: '3', name: 'Bass', volume: 70, pan: 0, mute: false, solo: false, armed: false, color: '#f87171' },
    { id: '4', name: 'Synth Lead', volume: 65, pan: 0, mute: false, solo: false, armed: false, color: '#fbbf24' },
    { id: '5', name: 'Pads', volume: 55, pan: 0, mute: false, solo: false, armed: true, color: '#a78bfa' },
    { id: '6', name: 'FX', volume: 45, pan: 0, mute: false, solo: false, armed: false, color: '#fb923c' },
  ]);

  const { data: projectData } = useQuery({
    queryKey: ['/api/projects', projectId],
    enabled: !!projectId,
  });

  const project = (projectData as any)?.data || { title: 'Untitled Project' };

  const handleVolumeChange = useCallback((id: string, volume: number) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, volume } : t)));
  }, []);

  const handlePanChange = useCallback((id: string, pan: number) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, pan: pan - 50 } : t)));
  }, []);

  const handleMute = useCallback((id: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, mute: !t.mute } : t)));
  }, []);

  const handleSolo = useCallback((id: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, solo: !t.solo } : t)));
  }, []);

  const handleArm = useCallback((id: string) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, armed: !t.armed } : t)));
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
  const handleRewind = () => {};
  const handleFastForward = () => {};

  const isLandscape = orientation === 'landscape';
  const defaultTrackListWidth = isLandscape ? 280 : 220;

  const renderContent = () => {
    if (viewMode === 'mixer') {
      return (
        <div className="flex-1 overflow-auto p-4">
          <MultiTouchMixer
            tracks={tracks}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onMute={handleMute}
            onSolo={handleSolo}
            onArm={handleArm}
          />
        </div>
      );
    }

    if (viewMode === 'tracks') {
      return (
        <TrackListPanel
          tracks={tracks}
          selectedTrackId={selectedTrackId}
          onSelectTrack={setSelectedTrackId}
          onMute={handleMute}
          onSolo={handleSolo}
          onArm={handleArm}
        />
      );
    }

    if (viewMode === 'timeline') {
      return (
        <TimelinePanel
          tracks={tracks}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      );
    }

    return (
      <SplitPane
        direction="horizontal"
        defaultSize={defaultTrackListWidth}
        minSize={180}
        maxSize={400}
        snapSizes={[180, 220, 280, 350]}
        primaryPane={
          <TrackListPanel
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            onSelectTrack={setSelectedTrackId}
            onMute={handleMute}
            onSolo={handleSolo}
            onArm={handleArm}
          />
        }
        secondaryPane={
          <div className="h-full flex flex-col">
            <TimelinePanel
              tracks={tracks}
              zoom={zoom}
              onZoomChange={setZoom}
            />
          </div>
        }
        className="h-full"
      />
    );
  };

  return (
    <div className="flex flex-col h-full bg-background" data-layout={layoutMode}>
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-3">
          <h1 className="font-bold truncate max-w-[200px]">{project.title}</h1>
          <Badge variant="outline" className="text-xs">
            {tracks.length} tracks
          </Badge>
          {isRecording && (
            <Badge variant="destructive" className="animate-pulse">
              <Circle className="w-2 h-2 mr-1 fill-current" />
              Recording
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'split' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('split')}
            className="touch-manipulation"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'tracks' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('tracks')}
            className="touch-manipulation"
          >
            <Layers className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('timeline')}
            className="touch-manipulation"
          >
            <Waveform className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'mixer' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('mixer')}
            className="touch-manipulation"
          >
            <Sliders className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          <Button
            variant={showBrowser ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowBrowser(!showBrowser)}
            className="touch-manipulation"
          >
            <Folder className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" className="touch-manipulation">
            <Save className="w-4 h-4" />
          </Button>

          <Button variant="ghost" size="sm" className="touch-manipulation">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderContent()}

          {mixerMode === 'docked' && viewMode !== 'mixer' && (
            <div className="border-t">
              <div className="flex items-center justify-between p-2 bg-muted/30">
                <span className="text-xs font-medium">Quick Mix</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setMixerMode('floating')}
                  >
                    <Maximize className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setMixerMode('hidden')}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
              <MiniMixer
                tracks={tracks}
                onVolumeChange={handleVolumeChange}
                onMute={handleMute}
                onSolo={handleSolo}
              />
            </div>
          )}

          {mixerMode === 'hidden' && viewMode !== 'mixer' && (
            <Button
              variant="outline"
              size="sm"
              className="mx-4 mb-2"
              onClick={() => setMixerMode('docked')}
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Show Mixer
            </Button>
          )}
        </div>

        {showBrowser && (
          <div className="w-64 flex-shrink-0">
            <BrowserPanel onClose={() => setShowBrowser(false)} />
          </div>
        )}
      </div>

      <TouchTransport
        isPlaying={isPlaying}
        isRecording={isRecording}
        onPlay={handlePlay}
        onPause={handlePause}
        onStop={handleStop}
        onRecord={handleRecord}
        onSkipBack={handleSkipBack}
        onSkipForward={handleSkipForward}
        onRewind={handleRewind}
        onFastForward={handleFastForward}
        currentTime={currentTime}
        duration="00:03:45"
        tempo={tempo}
      />

      {mixerMode === 'floating' && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-background border-t shadow-2xl animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between p-2 border-b">
            <span className="font-semibold text-sm">Mixer</span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setMixerMode('docked')}
              >
                <Minimize className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <MultiTouchMixer
            tracks={tracks}
            onVolumeChange={handleVolumeChange}
            onPanChange={handlePanChange}
            onMute={handleMute}
            onSolo={handleSolo}
            onArm={handleArm}
            compact
          />
        </div>
      )}
    </div>
  );
}
