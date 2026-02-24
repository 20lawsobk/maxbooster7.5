import { useState, useRef, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Repeat,
  Shuffle,
  Heart,
  Share2,
  Download,
  MoreHorizontal,
  Loader2,
} from 'lucide-react';

interface WaveformAudioPlayerProps {
  audioUrl: string;
  title: string;
  artist?: string;
  coverArt?: string;
  duration?: number;
  bpm?: number;
  musicalKey?: string;
  waveformData?: number[];
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (time: number) => void;
  onLike?: () => void;
  onShare?: () => void;
  onDownload?: () => void;
  isLiked?: boolean;
  showControls?: boolean;
  compact?: boolean;
  className?: string;
}

export function WaveformAudioPlayer({
  audioUrl,
  title,
  artist,
  coverArt,
  duration: initialDuration,
  bpm,
  musicalKey,
  waveformData,
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onLike,
  onShare,
  onDownload,
  isLiked = false,
  showControls = true,
  compact = false,
  className,
}: WaveformAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [generatedWaveform, setGeneratedWaveform] = useState<number[]>([]);

  useEffect(() => {
    if (!waveformData || waveformData.length === 0) {
      const bars = 100;
      const generated = Array.from({ length: bars }, () => 
        0.2 + Math.random() * 0.6 + Math.sin(Math.random() * Math.PI) * 0.2
      );
      setGeneratedWaveform(generated);
    }
  }, [waveformData]);

  const waveform = waveformData && waveformData.length > 0 ? waveformData : generatedWaveform;

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveform.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const barWidth = width / waveform.length;
    const progressRatio = duration > 0 ? currentTime / duration : 0;
    const progressX = progressRatio * width;

    ctx.clearRect(0, 0, width, height);

    waveform.forEach((value, index) => {
      const x = index * barWidth;
      const barHeight = value * height * 0.8;
      const y = (height - barHeight) / 2;

      const isPast = x < progressX;
      
      if (isPast) {
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, '#8b5cf6');
        gradient.addColorStop(1, '#6366f1');
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(barWidth - 1, 1), barHeight, 1);
      ctx.fill();
    });

    if (progressRatio > 0 && progressRatio < 1) {
      ctx.fillStyle = '#8b5cf6';
      ctx.fillRect(progressX - 1, 0, 2, height);
    }
  }, [waveform, currentTime, duration]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const audio = new Audio(audioUrl);
    audioRef.current = audio;

    audio.addEventListener('loadstart', () => setIsLoading(true));
    audio.addEventListener('canplay', () => setIsLoading(false));
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    });
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      if (isRepeat) {
        audio.currentTime = 0;
        audio.play();
        setIsPlaying(true);
      } else {
        onEnded?.();
      }
    });
    audio.addEventListener('error', () => {
      setIsLoading(false);
      setIsPlaying(false);
    });

    audio.volume = volume;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [audioUrl, isRepeat]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      onPause?.();
    } else {
      try {
        setIsLoading(true);
        await audio.play();
        setIsPlaying(true);
        setIsLoading(false);
        onPlay?.();
      } catch (error) {
        setIsLoading(false);
        logger.error('Playback failed:', error);
      }
    }
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newTime = (value[0] / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || duration === 0) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    const newTime = ratio * duration;
    
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0] / 100;
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume > 0) setIsMuted(false);
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const skipBackward = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.max(0, audio.currentTime - 10);
    }
  };

  const skipForward = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Math.min(duration, audio.currentTime + 10);
    }
  };

  if (compact) {
    return (
      <div className={cn('flex items-center gap-3 p-3 bg-card border rounded-lg', className)}>
        <Button
          size="sm"
          variant="ghost"
          className="h-10 w-10 p-0 rounded-full"
          onClick={togglePlay}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>
        
        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            className="w-full h-8 cursor-pointer"
            onClick={handleCanvasClick}
          />
        </div>

        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-card border rounded-xl overflow-hidden', className)}>
      <div className="flex flex-col md:flex-row">
        {coverArt && (
          <div className="relative w-full md:w-48 h-48 flex-shrink-0">
            <img
              src={coverArt}
              alt={title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-3 left-3 right-3">
              <h3 className="font-bold text-white truncate">{title}</h3>
              {artist && (
                <p className="text-sm text-white/80 truncate">{artist}</p>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 p-4 space-y-4">
          {!coverArt && (
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{title}</h3>
                {artist && <p className="text-sm text-muted-foreground">{artist}</p>}
              </div>
              <div className="flex gap-2">
                {bpm && (
                  <Badge variant="secondary">{bpm} BPM</Badge>
                )}
                {musicalKey && (
                  <Badge variant="outline">{musicalKey}</Badge>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              className="w-full h-16 cursor-pointer rounded-lg"
              onClick={handleCanvasClick}
            />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {showControls && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={skipBackward}
                >
                  <SkipBack className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  className={cn(
                    'h-12 w-12 rounded-full',
                    'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700'
                  )}
                  onClick={togglePlay}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  ) : isPlaying ? (
                    <Pause className="h-6 w-6 text-white" />
                  ) : (
                    <Play className="h-6 w-6 text-white ml-1" />
                  )}
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={skipForward}
                >
                  <SkipForward className="h-4 w-4" />
                </Button>

                <Button
                  size="icon"
                  variant="ghost"
                  className={cn('h-8 w-8', isRepeat && 'text-purple-600')}
                  onClick={() => setIsRepeat(!isRepeat)}
                >
                  <Repeat className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={toggleMute}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume * 100]}
                    max={100}
                    step={1}
                    className="w-20"
                    onValueChange={handleVolumeChange}
                  />
                </div>

                <div className="flex items-center gap-1">
                  {onLike && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onLike}
                    >
                      <Heart
                        className={cn(
                          'h-4 w-4',
                          isLiked && 'fill-pink-500 text-pink-500'
                        )}
                      />
                    </Button>
                  )}
                  {onShare && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onShare}
                    >
                      <Share2 className="h-4 w-4" />
                    </Button>
                  )}
                  {onDownload && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={onDownload}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WaveformAudioPlayer;
