import { useRef, useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  Maximize, 
  Minimize, 
  Volume2, 
  VolumeX,
  SkipBack,
  SkipForward,
  RefreshCw,
  Music,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RenderOrchestrator, OrchestratorState } from '@/lib/video/RenderOrchestrator';

interface VideoPreviewProps {
  orchestrator: RenderOrchestrator | null;
  audioUrl?: string;
  onTimeUpdate?: (time: number) => void;
  onStateChange?: (state: OrchestratorState) => void;
}

export function VideoPreview({ 
  orchestrator,
  audioUrl,
  onTimeUpdate,
  onStateChange,
}: VideoPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [orchestratorState, setOrchestratorState] = useState<OrchestratorState>('idle');

  useEffect(() => {
    if (!orchestrator) return;

    const canvas = orchestrator.getCanvas();
    if (canvas instanceof HTMLCanvasElement && canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = '';
      canvas.className = 'absolute inset-0 w-full h-full object-contain';
      canvasContainerRef.current.appendChild(canvas);
    }

    setDuration(orchestrator.getDuration() || 10);
    setOrchestratorState(orchestrator.getState());
    
    orchestrator.renderFrame(0);
  }, [orchestrator]);

  useEffect(() => {
    if (audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.volume = volume / 100;
      audioRef.current.addEventListener('loadeddata', () => setAudioLoaded(true));
      audioRef.current.addEventListener('ended', () => {
        setIsPlaying(false);
        setCurrentTime(0);
        orchestrator?.stop();
      });
      
      if (orchestrator) {
        orchestrator.setAudioElement(audioRef.current);
      }
      
      return () => {
        audioRef.current?.pause();
        audioRef.current = null;
      };
    } else {
      setAudioLoaded(false);
    }
  }, [audioUrl, orchestrator]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (!orchestrator) return;

    let animationId: number;
    
    const updateTime = () => {
      if (orchestrator) {
        const time = orchestrator.getCurrentTime();
        setCurrentTime(time);
        onTimeUpdate?.(time);
        
        const state = orchestrator.getState();
        if (state !== orchestratorState) {
          setOrchestratorState(state);
          onStateChange?.(state);
        }
        
        if (state === 'playing') {
          animationId = requestAnimationFrame(updateTime);
        }
      }
    };

    if (isPlaying) {
      animationId = requestAnimationFrame(updateTime);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [isPlaying, orchestrator, orchestratorState, onTimeUpdate, onStateChange]);

  const handlePlayPause = useCallback(() => {
    if (!orchestrator) return;

    if (isPlaying) {
      orchestrator.pause();
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      orchestrator.play();
      if (audioRef.current && audioLoaded) {
        audioRef.current.currentTime = orchestrator.getCurrentTime();
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  }, [orchestrator, isPlaying, audioLoaded]);

  const handleSeek = useCallback((value: number[]) => {
    if (!orchestrator) return;
    
    const newTime = value[0];
    orchestrator.seek(newTime);
    setCurrentTime(newTime);
    
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    
    onTimeUpdate?.(newTime);
  }, [orchestrator, onTimeUpdate]);

  const handleSkipBack = useCallback(() => {
    const newTime = Math.max(0, currentTime - 5);
    handleSeek([newTime]);
  }, [currentTime, handleSeek]);

  const handleSkipForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 5);
    handleSeek([newTime]);
  }, [currentTime, duration, handleSeek]);

  const handleRestart = useCallback(() => {
    handleSeek([0]);
    if (!isPlaying && orchestrator) {
      orchestrator.play();
      if (audioRef.current && audioLoaded) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      setIsPlaying(true);
    }
  }, [handleSeek, isPlaying, orchestrator, audioLoaded]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const isLoading = orchestratorState === 'loading';
  const isReady = orchestratorState === 'ready' || orchestratorState === 'playing' || orchestratorState === 'paused';

  return (
    <div 
      ref={containerRef}
      className="relative bg-black rounded-lg overflow-hidden group h-full"
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(isPlaying ? false : true)}
    >
      <div className="aspect-video relative">
        <div 
          ref={canvasContainerRef}
          className="absolute inset-0 w-full h-full"
        />
        
        {!orchestrator && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <div className="text-center text-muted-foreground">
              <Play className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select a template to preview</p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
              <p className="text-sm">Loading...</p>
            </div>
          </div>
        )}

        {audioUrl && audioLoaded && (
          <div className="absolute top-3 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
            <Music className="w-4 h-4 text-green-400" />
            <span className="text-xs text-white">Audio synced</span>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showControls && isReady && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent p-4 space-y-3"
          >
            <Slider
              value={[currentTime]}
              max={duration}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRestart}
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSkipBack}
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <SkipBack className="w-4 h-4" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePlayPause}
                  className="h-10 w-10 text-white hover:bg-white/20 bg-white/10"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSkipForward}
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  <SkipForward className="w-4 h-4" />
                </Button>

                <span className="text-sm text-white/80 ml-2 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 group/volume">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMuted(!isMuted)}
                    className="h-8 w-8 text-white hover:bg-white/20"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </Button>
                  <div className="w-0 overflow-hidden group-hover/volume:w-20 transition-all duration-300">
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={100}
                      step={1}
                      onValueChange={(v) => {
                        setVolume(v[0]);
                        setIsMuted(false);
                      }}
                      className="w-20"
                    />
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="h-8 w-8 text-white hover:bg-white/20"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
