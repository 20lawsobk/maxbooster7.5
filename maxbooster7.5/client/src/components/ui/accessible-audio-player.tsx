import { useRef, useState, useEffect, useCallback, KeyboardEvent } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export interface AccessibleAudioPlayerProps {
  src: string;
  title?: string;
  artist?: string;
  artwork?: string;
  autoPlay?: boolean;
  loop?: boolean;
  showWaveform?: boolean;
  waveformData?: number[];
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function AccessibleAudioPlayer({
  src,
  title = 'Audio Track',
  artist,
  artwork,
  autoPlay = false,
  loop = false,
  showWaveform = false,
  waveformData,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onError,
  className,
}: AccessibleAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(loop);
  const [error, setError] = useState<string | null>(null);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      onPause?.();
    } else {
      audio.play().catch((e) => {
        setError('Failed to play audio');
        onError?.(e);
      });
      onPlay?.();
    }
  }, [isPlaying, onPlay, onPause, onError]);

  const handleSeek = useCallback((value: number[]) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const newTime = (value[0] / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, [duration]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newVolume = value[0] / 100;
    audio.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleLoop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.loop = !isLooping;
    setIsLooping(!isLooping);
  }, [isLooping]);

  const skipBack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }, []);

  const skipForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.min(duration, audio.currentTime + 10);
  }, [duration]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    switch (e.key) {
      case ' ':
      case 'k':
        e.preventDefault();
        handlePlayPause();
        break;
      case 'ArrowLeft':
      case 'j':
        e.preventDefault();
        skipBack();
        break;
      case 'ArrowRight':
      case 'l':
        e.preventDefault();
        skipForward();
        break;
      case 'ArrowUp':
        e.preventDefault();
        handleVolumeChange([Math.min(100, volume * 100 + 10)]);
        break;
      case 'ArrowDown':
        e.preventDefault();
        handleVolumeChange([Math.max(0, volume * 100 - 10)]);
        break;
      case 'm':
        e.preventDefault();
        toggleMute();
        break;
      case 'Home':
        e.preventDefault();
        audio.currentTime = 0;
        break;
      case 'End':
        e.preventDefault();
        audio.currentTime = duration;
        break;
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
        e.preventDefault();
        audio.currentTime = (parseInt(e.key) / 10) * duration;
        break;
    }
  }, [handlePlayPause, skipBack, skipForward, handleVolumeChange, toggleMute, volume, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime, audio.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    const handleError = () => {
      setError('Failed to load audio file');
      setIsLoading(false);
      onError?.(new Error('Failed to load audio'));
    };

    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [onTimeUpdate, onEnded, onError]);

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'bg-card rounded-lg border p-4 focus-within:ring-2 focus-within:ring-primary',
        className
      )}
      role="region"
      aria-label={`Audio player: ${title}${artist ? ` by ${artist}` : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        loop={isLooping}
        preload="metadata"
        aria-hidden="true"
      />

      {error && (
        <div
          role="alert"
          className="text-destructive text-sm mb-2 p-2 bg-destructive/10 rounded"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-4">
        {artwork && (
          <img
            src={artwork}
            alt={`Album artwork for ${title}`}
            className="w-16 h-16 rounded object-cover"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="mb-2">
            <h3 className="font-medium truncate" id="audio-title">
              {title}
            </h3>
            {artist && (
              <p className="text-sm text-muted-foreground truncate">{artist}</p>
            )}
          </div>

          {showWaveform && waveformData && waveformData.length > 0 && (
            <div
              ref={progressRef}
              className="h-12 flex items-end gap-px mb-2"
              role="presentation"
            >
              {waveformData.slice(0, 100).map((value, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex-1 min-w-[2px] rounded-sm transition-colors',
                    i < (progress / 100) * waveformData.slice(0, 100).length
                      ? 'bg-primary'
                      : 'bg-muted'
                  )}
                  style={{ height: `${Math.max(4, value * 100)}%` }}
                />
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Slider
              value={[progress]}
              onValueChange={handleSeek}
              max={100}
              step={0.1}
              className="cursor-pointer"
              aria-label="Seek position"
              aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            />

            <div className="flex justify-between text-xs text-muted-foreground">
              <span aria-hidden="true">{formatTime(currentTime)}</span>
              <span aria-hidden="true">{formatTime(duration)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={skipBack}
            aria-label="Skip back 10 seconds"
            title="Skip back 10 seconds (J or Left Arrow)"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="default"
            size="icon"
            onClick={handlePlayPause}
            disabled={isLoading && !isPlaying}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause (Space or K)' : 'Play (Space or K)'}
            className="h-10 w-10"
          >
            {isLoading && !isPlaying ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 ml-0.5" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={skipForward}
            aria-label="Skip forward 10 seconds"
            title="Skip forward 10 seconds (L or Right Arrow)"
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLoop}
            aria-label={isLooping ? 'Disable loop' : 'Enable loop'}
            aria-pressed={isLooping}
            title="Toggle loop"
            className={cn(isLooping && 'text-primary')}
          >
            <Repeat className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>

          <Slider
            value={[isMuted ? 0 : volume * 100]}
            onValueChange={handleVolumeChange}
            max={100}
            step={1}
            className="w-24 cursor-pointer"
            aria-label="Volume"
            aria-valuetext={`${Math.round(isMuted ? 0 : volume * 100)}%`}
          />
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {isPlaying ? `Playing ${title}` : `Paused ${title}`}
        {currentTime > 0 && ` at ${formatTime(currentTime)}`}
      </div>
    </div>
  );
}

export default AccessibleAudioPlayer;
