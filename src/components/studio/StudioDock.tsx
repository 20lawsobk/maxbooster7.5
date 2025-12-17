import { Transport } from './Transport';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Activity, HardDrive } from 'lucide-react';

interface StudioDockProps {
  isPlaying: boolean;
  isRecording: boolean;
  currentTime: number;
  tempo: number;
  loopEnabled: boolean;
  metronomeEnabled: boolean;
  timeSignature: string;
  armedTracksCount: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onStopRecording: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onToggleLoop: () => void;
  onToggleMetronome: () => void;
  onSetTempo: (tempo: number) => void;
  onIncrementTempo: () => void;
  onDecrementTempo: () => void;
  onTapTempo: () => void;
  cpuUsage?: number;
  memoryUsage?: number;
}

/**
 * TODO: Add function documentation
 */
export function StudioDock({
  isPlaying,
  isRecording,
  currentTime,
  tempo,
  loopEnabled,
  metronomeEnabled,
  timeSignature,
  armedTracksCount,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onStopRecording,
  onSkipBack,
  onSkipForward,
  onToggleLoop,
  onToggleMetronome,
  onSetTempo,
  onIncrementTempo,
  onDecrementTempo,
  onTapTempo,
  cpuUsage = 0,
  memoryUsage = 0,
}: StudioDockProps) {
  return (
    <div
      className="h-full flex items-center justify-between px-4"
      style={{ backgroundColor: 'var(--studio-transport)' }}
    >
      {/* Left: Performance Monitors */}
      <div className="flex items-center gap-4 min-w-[180px]">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <div
                className="h-1 w-16 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--studio-bg-deep)' }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${cpuUsage}%`,
                    backgroundColor: cpuUsage > 80 ? '#ef4444' : 'var(--studio-accent)',
                  }}
                />
              </div>
              <span className="text-xs font-mono" style={{ color: 'var(--studio-text-muted)' }}>
                CPU
              </span>
            </div>
          </div>
        </div>

        <Separator
          orientation="vertical"
          className="h-8"
          style={{ backgroundColor: 'var(--studio-border)' }}
        />

        <div className="flex items-center gap-2">
          <HardDrive className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
          <Badge
            variant="outline"
            className="h-5 px-2 text-xs"
            style={{
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text-muted)',
              backgroundColor: 'transparent',
            }}
          >
            {memoryUsage.toFixed(0)} MB
          </Badge>
        </div>
      </div>

      {/* Center: Transport Controls */}
      <div className="flex-1 flex justify-center">
        <Transport
          isPlaying={isPlaying}
          isRecording={isRecording}
          currentTime={currentTime}
          tempo={tempo}
          loopEnabled={loopEnabled}
          metronomeEnabled={metronomeEnabled}
          timeSignature={timeSignature}
          armedTracksCount={armedTracksCount}
          onPlay={onPlay}
          onPause={onPause}
          onStop={onStop}
          onRecord={onRecord}
          onStopRecording={onStopRecording}
          onSkipBack={onSkipBack}
          onSkipForward={onSkipForward}
          onToggleLoop={onToggleLoop}
          onToggleMetronome={onToggleMetronome}
          onSetTempo={onSetTempo}
          onIncrementTempo={onIncrementTempo}
          onDecrementTempo={onDecrementTempo}
          onTapTempo={onTapTempo}
        />
      </div>

      {/* Right: Additional Info */}
      <div className="min-w-[180px] flex justify-end">
        {isRecording && (
          <Badge
            variant="destructive"
            className="h-6 px-3 animate-pulse"
            data-testid="badge-recording-status"
          >
            ● RECORDING
          </Badge>
        )}
      </div>
    </div>
  );
}
