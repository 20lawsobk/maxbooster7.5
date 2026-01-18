import { useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  Repeat,
  ChevronUp,
  ChevronDown,
  Volume2,
  Metronome,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { studioOneTheme } from '@/lib/studioOneTheme';

interface MobileTransportProps {
  isPlaying: boolean;
  isRecording: boolean;
  isPaused: boolean;
  isLooping: boolean;
  currentTime: string;
  bpm: number;
  metronomeEnabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onRewind: () => void;
  onForward: () => void;
  onToggleLoop: () => void;
  onToggleMetronome?: () => void;
  onBpmChange?: (bpm: number) => void;
  className?: string;
}

export function MobileTransport({
  isPlaying,
  isRecording,
  isPaused,
  isLooping,
  currentTime,
  bpm,
  metronomeEnabled = false,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onRewind,
  onForward,
  onToggleLoop,
  onToggleMetronome,
  onBpmChange,
  className,
}: MobileTransportProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const TransportButton = useCallback(({
    onClick,
    active,
    danger,
    children,
    size = 'normal',
  }: {
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
    children: React.ReactNode;
    size?: 'small' | 'normal' | 'large';
  }) => {
    const sizeClasses = {
      small: 'w-10 h-10',
      normal: 'w-12 h-12',
      large: 'w-14 h-14',
    };

    return (
      <button
        onClick={onClick}
        className={cn(
          'flex items-center justify-center rounded-full transition-all touch-manipulation',
          sizeClasses[size],
          active && !danger && 'bg-blue-500 text-white',
          danger && 'bg-red-500 text-white',
          !active && !danger && 'bg-white/10 hover:bg-white/20 active:bg-white/30'
        )}
        style={{
          color: !active && !danger ? studioOneTheme.colors.text.primary : undefined,
        }}
      >
        {children}
      </button>
    );
  }, []);

  return (
    <div
      className={cn('flex flex-col', className)}
      style={{ background: studioOneTheme.colors.bg.secondary }}
    >
      <div
        className="flex items-center justify-between px-3"
        style={{ height: 56 }}
      >
        <div className="flex items-center gap-2">
          <TransportButton onClick={onRewind} size="small">
            <SkipBack className="w-4 h-4" />
          </TransportButton>
          
          <TransportButton onClick={onStop} size="small">
            <Square className="w-4 h-4" />
          </TransportButton>
          
          <TransportButton
            onClick={isPlaying && !isPaused ? onPause : onPlay}
            active={isPlaying && !isPaused}
            size="large"
          >
            {isPlaying && !isPaused ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </TransportButton>
          
          <TransportButton onClick={onRecord} danger={isRecording} size="normal">
            <Circle className="w-5 h-5" fill={isRecording ? 'currentColor' : 'none'} />
          </TransportButton>
          
          <TransportButton onClick={onForward} size="small">
            <SkipForward className="w-4 h-4" />
          </TransportButton>
        </div>
        
        <div className="flex items-center gap-3">
          <div
            className="font-mono text-lg tabular-nums px-3 py-1 rounded"
            style={{
              background: studioOneTheme.colors.bg.deep,
              color: studioOneTheme.colors.text.primary,
              minWidth: 100,
              textAlign: 'center',
            }}
          >
            {currentTime}
          </div>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-lg hover:bg-white/10 active:bg-white/20 touch-manipulation"
            style={{ color: studioOneTheme.colors.text.secondary }}
          >
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronUp className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div
          className="flex items-center justify-between px-4 py-2 border-t"
          style={{ borderColor: studioOneTheme.colors.border.primary }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleLoop}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg touch-manipulation transition-colors',
                isLooping ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10'
              )}
              style={{ color: isLooping ? undefined : studioOneTheme.colors.text.secondary }}
            >
              <Repeat className="w-4 h-4" />
              <span className="text-xs font-medium">Loop</span>
            </button>
            
            {onToggleMetronome && (
              <button
                onClick={onToggleMetronome}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg touch-manipulation transition-colors',
                  metronomeEnabled ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10'
                )}
                style={{ color: metronomeEnabled ? undefined : studioOneTheme.colors.text.secondary }}
              >
                <Timer className="w-4 h-4" />
                <span className="text-xs font-medium">Metro</span>
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ color: studioOneTheme.colors.text.muted }}
            >
              BPM
            </span>
            <div className="flex items-center">
              <button
                onClick={() => onBpmChange?.(bpm - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-l-lg bg-white/5 hover:bg-white/10 active:bg-white/20 touch-manipulation"
                style={{ color: studioOneTheme.colors.text.secondary }}
              >
                -
              </button>
              <div
                className="px-3 h-8 flex items-center justify-center font-mono text-sm"
                style={{
                  background: studioOneTheme.colors.bg.deep,
                  color: studioOneTheme.colors.text.primary,
                  minWidth: 50,
                }}
              >
                {bpm}
              </div>
              <button
                onClick={() => onBpmChange?.(bpm + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-r-lg bg-white/5 hover:bg-white/10 active:bg-white/20 touch-manipulation"
                style={{ color: studioOneTheme.colors.text.secondary }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
