import { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX,
  Gauge,
  Music,
  Settings2,
  Loader2
} from 'lucide-react';
import { useAudioPreviewStore, MUSICAL_KEYS } from '@/lib/audioPreviewEngine';
import { cn } from '@/lib/utils';

interface BeatPreviewControlsProps {
  beatId: string;
  audioUrl: string;
  originalBpm?: number;
  originalKey?: string;
  compact?: boolean;
  className?: string;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onInteraction?: (type: 'play' | 'pause' | 'preview' | 'repeat') => void;
}

export function BeatPreviewControls({
  beatId,
  audioUrl,
  originalBpm = 120,
  originalKey = 'C',
  compact = false,
  className,
  onPlayStateChange,
  onInteraction,
}: BeatPreviewControlsProps) {
  const {
    isPlaying,
    isLoading,
    currentBeatId,
    targetBpm,
    targetKey,
    volume,
    playbackRate,
    pitchShift,
    loadBeat,
    play,
    pause,
    stop,
    setTargetBpm,
    setTargetKey,
    setVolume,
    setPlaybackRate,
    setPitchShift,
  } = useAudioPreviewStore();

  const [isMuted, setIsMuted] = useState(false);
  const [previousVolume, setPreviousVolume] = useState(volume);
  const isCurrentBeat = currentBeatId === beatId;
  const isThisPlaying = isPlaying && isCurrentBeat;

  useEffect(() => {
    onPlayStateChange?.(isThisPlaying);
  }, [isThisPlaying, onPlayStateChange]);

  const handlePlayPause = async () => {
    if (!isCurrentBeat) {
      await loadBeat(beatId, audioUrl, originalBpm, originalKey);
      play();
      onInteraction?.('play');
    } else if (isPlaying) {
      pause();
      onInteraction?.('pause');
    } else {
      play();
      onInteraction?.('repeat');
    }
  };

  const handleReset = () => {
    setTargetBpm(originalBpm);
    setTargetKey(originalKey);
    setPlaybackRate(1.0);
    setPitchShift(0);
  };

  const handleMuteToggle = () => {
    if (isMuted) {
      setVolume(previousVolume);
      setIsMuted(false);
    } else {
      setPreviousVolume(volume);
      setVolume(0);
      setIsMuted(true);
    }
  };

  const bpmDiff = targetBpm - originalBpm;
  const keyDiff = pitchShift;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={handlePlayPause}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isThisPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 bg-slate-900 border-slate-700" align="start">
            <PreviewControlsContent
              originalBpm={originalBpm}
              originalKey={originalKey}
              targetBpm={targetBpm}
              targetKey={targetKey}
              volume={volume}
              isMuted={isMuted}
              bpmDiff={bpmDiff}
              keyDiff={keyDiff}
              onBpmChange={setTargetBpm}
              onKeyChange={setTargetKey}
              onVolumeChange={setVolume}
              onMuteToggle={handleMuteToggle}
              onReset={handleReset}
            />
          </PopoverContent>
        </Popover>

        {(bpmDiff !== 0 || keyDiff !== 0) && (
          <div className="flex gap-1">
            {bpmDiff !== 0 && (
              <Badge variant="secondary" className="text-xs bg-cyan-500/20 text-cyan-400">
                {bpmDiff > 0 ? '+' : ''}{bpmDiff} BPM
              </Badge>
            )}
            {keyDiff !== 0 && (
              <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400">
                {keyDiff > 0 ? '+' : ''}{keyDiff} st
              </Badge>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-700', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handlePlayPause}
            disabled={isLoading}
            className="bg-cyan-600 hover:bg-cyan-500"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : isThisPlaying ? (
              <Pause className="h-4 w-4 mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isLoading ? 'Loading...' : isThisPlaying ? 'Pause' : 'Preview'}
          </Button>
          
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            className="text-slate-400 hover:text-white"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>

        {(bpmDiff !== 0 || keyDiff !== 0) && (
          <div className="flex gap-2">
            {bpmDiff !== 0 && (
              <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-400">
                {bpmDiff > 0 ? '+' : ''}{bpmDiff} BPM
              </Badge>
            )}
            {keyDiff !== 0 && (
              <Badge variant="secondary" className="bg-purple-500/20 text-purple-400">
                {keyDiff > 0 ? '+' : ''}{keyDiff} semitones
              </Badge>
            )}
          </div>
        )}
      </div>

      <PreviewControlsContent
        originalBpm={originalBpm}
        originalKey={originalKey}
        targetBpm={targetBpm}
        targetKey={targetKey}
        volume={volume}
        isMuted={isMuted}
        bpmDiff={bpmDiff}
        keyDiff={keyDiff}
        onBpmChange={setTargetBpm}
        onKeyChange={setTargetKey}
        onVolumeChange={setVolume}
        onMuteToggle={handleMuteToggle}
        onReset={handleReset}
      />
    </div>
  );
}

interface PreviewControlsContentProps {
  originalBpm: number;
  originalKey: string;
  targetBpm: number;
  targetKey: string;
  volume: number;
  isMuted: boolean;
  bpmDiff: number;
  keyDiff: number;
  onBpmChange: (bpm: number) => void;
  onKeyChange: (key: string) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onReset: () => void;
}

function PreviewControlsContent({
  originalBpm,
  originalKey,
  targetBpm,
  targetKey,
  volume,
  isMuted,
  onBpmChange,
  onKeyChange,
  onVolumeChange,
  onMuteToggle,
}: PreviewControlsContentProps) {
  const minBpm = Math.max(60, Math.floor(originalBpm * 0.5));
  const maxBpm = Math.min(200, Math.ceil(originalBpm * 2));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-slate-300 flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            Tempo (BPM)
          </Label>
          <span className="text-sm font-medium text-cyan-400">{targetBpm}</span>
        </div>
        <Slider
          value={[targetBpm]}
          min={minBpm}
          max={maxBpm}
          step={1}
          onValueChange={([value]) => onBpmChange(value)}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-slate-500">
          <span>{minBpm}</span>
          <span className="text-slate-400">Original: {originalBpm}</span>
          <span>{maxBpm}</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm text-slate-300 flex items-center gap-1">
          <Music className="h-3 w-3" />
          Key
        </Label>
        <Select value={targetKey} onValueChange={onKeyChange}>
          <SelectTrigger className="w-full bg-slate-800 border-slate-600">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-600">
            {MUSICAL_KEYS.map((key) => (
              <SelectItem key={key} value={key} className="text-slate-200">
                {key} {key === originalKey.replace(/m$|min$|minor$/i, '').trim() && '(Original)'}
              </SelectItem>
            ))}
            {MUSICAL_KEYS.map((key) => (
              <SelectItem key={`${key}m`} value={`${key}m`} className="text-slate-200">
                {key}m {`${key}m` === originalKey && '(Original)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">Original key: {originalKey}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm text-slate-300 flex items-center gap-1">
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
            Volume
          </Label>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={onMuteToggle}
          >
            {isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
          </Button>
        </div>
        <Slider
          value={[isMuted ? 0 : volume * 100]}
          min={0}
          max={100}
          step={1}
          onValueChange={([value]) => onVolumeChange(value / 100)}
          className="w-full"
        />
      </div>
    </div>
  );
}

export function BeatPreviewBadges({
  originalBpm,
  originalKey,
  className,
}: {
  originalBpm: number;
  originalKey: string;
  className?: string;
}) {
  const { targetBpm, pitchShift, currentBeatId } = useAudioPreviewStore();
  
  const bpmDiff = targetBpm - originalBpm;
  const hasChanges = bpmDiff !== 0 || pitchShift !== 0;

  if (!hasChanges) return null;

  return (
    <div className={cn('flex gap-1 flex-wrap', className)}>
      {bpmDiff !== 0 && (
        <Badge variant="secondary" className="text-xs bg-cyan-500/20 text-cyan-400 border-cyan-500/30">
          {bpmDiff > 0 ? '+' : ''}{Math.round(bpmDiff)} BPM
        </Badge>
      )}
      {pitchShift !== 0 && (
        <Badge variant="secondary" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
          {pitchShift > 0 ? '+' : ''}{pitchShift} semitones
        </Badge>
      )}
    </div>
  );
}
