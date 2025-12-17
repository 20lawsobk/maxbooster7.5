import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Play, Pause, Square, SkipBack, SkipForward, Circle, Plus, Minus, Mic } from 'lucide-react';

interface TransportProps {
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
}

/**
 * TODO: Add function documentation
 */
export function Transport({
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
}: TransportProps) {
  const formatTimeDetailed = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${ms.toString().padStart(3, '0')}`;
  };

  const formatMusicalTime = (seconds: number, bpm: number, timeSig: string) => {
    const [numerator] = timeSig.split('/').map(Number);
    const beatsPerBar = numerator;
    const beatDuration = 60 / bpm;

    const totalBeats = seconds / beatDuration;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const tick = Math.floor((totalBeats % 1) * 960);

    return `${bar}.${beat}.${tick.toString().padStart(3, '0')}`;
  };

  return (
    <div
      className="h-full flex items-center justify-between px-6"
      style={{
        background: 'var(--studio-transport)',
        borderColor: 'var(--studio-border)',
      }}
    >
      {/* Transport Controls */}
      <div className="flex items-center gap-2">
        <button
          className="studio-btn h-9 w-9 rounded-md flex items-center justify-center"
          onClick={onSkipBack}
          data-testid="button-skip-back"
          title="Skip Back (,)"
        >
          <SkipBack className="h-4 w-4" />
        </button>

        <button
          className="studio-btn h-9 w-9 rounded-md flex items-center justify-center"
          onClick={onStop}
          data-testid="button-transport-stop"
          title="Stop (Enter)"
        >
          <Square className="h-4 w-4" />
        </button>

        <button
          className={`studio-btn-play h-12 w-12 rounded-lg flex items-center justify-center ml-1 ${isPlaying ? 'playing' : ''}`}
          style={{ color: isPlaying ? 'white' : 'var(--studio-text)' }}
          onClick={() => (isPlaying ? onPause() : onPlay())}
          data-testid="button-transport-play"
          title="Play/Pause (Space)"
        >
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
        </button>

        <button
          className={`studio-btn-record h-9 w-9 rounded-md flex items-center justify-center ml-1 ${isRecording ? 'recording animate-pulse' : ''}`}
          onClick={() => (isRecording ? onStopRecording() : onRecord())}
          data-testid="button-transport-record"
          title={`Record (R) - ${armedTracksCount} armed`}
        >
          <Circle className="h-4 w-4" fill={isRecording ? 'currentColor' : 'none'} />
        </button>

        {armedTracksCount > 0 && (
          <div
            className="ml-2 px-2 h-6 rounded flex items-center gap-1.5 text-xs font-medium"
            style={{
              background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
              color: '#fca5a5',
              border: '1px solid #991b1b',
              boxShadow: '0 0 10px rgba(239, 68, 68, 0.2)',
            }}
            data-testid="badge-armed-tracks"
          >
            <Mic className="h-3 w-3" />
            {armedTracksCount}
          </div>
        )}

        <button
          className="studio-btn h-9 w-9 rounded-md flex items-center justify-center"
          onClick={onSkipForward}
          data-testid="button-skip-forward"
          title="Skip Forward (.)"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {/* Time Display */}
      <div className="flex items-center gap-6">
        <div
          className="flex flex-col items-end px-4 py-2 rounded-md"
          style={{
            background: 'var(--studio-surface)',
            border: '1px solid var(--studio-border-subtle)',
            boxShadow: 'var(--studio-shadow-inner)',
          }}
        >
          <div
            className="text-base font-mono font-semibold tracking-wider"
            style={{ color: 'var(--studio-text)' }}
            data-testid="text-current-time"
          >
            {formatTimeDetailed(currentTime)}
          </div>
          <div
            className="text-xs font-mono tracking-wide"
            style={{ color: 'var(--studio-text-subtle)' }}
            data-testid="text-musical-time"
          >
            {formatMusicalTime(currentTime, tempo, timeSignature)}
          </div>
        </div>

        <div className="h-8 w-px" style={{ background: 'var(--studio-border)' }} />

        {/* Loop Control */}
        <button
          className={`studio-btn h-8 px-4 rounded-md text-xs font-medium ${loopEnabled ? 'studio-btn-accent' : ''}`}
          onClick={onToggleLoop}
          data-testid="button-transport-loop"
          title="Toggle Loop (L)"
        >
          LOOP
        </button>

        {/* Metronome Control */}
        <button
          className={`studio-btn h-8 px-4 rounded-md text-xs font-medium ${metronomeEnabled ? 'studio-btn-metronome active' : ''}`}
          onClick={onToggleMetronome}
          data-testid="button-transport-metronome"
          title="Toggle Metronome (M)"
        >
          CLICK
        </button>

        <div className="h-8 w-px" style={{ background: 'var(--studio-border)' }} />

        {/* Tempo Controls */}
        <div className="flex items-center gap-2">
          <button
            className="studio-btn h-7 w-7 rounded flex items-center justify-center"
            onClick={onDecrementTempo}
            data-testid="button-tempo-decrease"
          >
            <Minus className="h-3 w-3" />
          </button>

          <div
            className="flex flex-col items-center px-3 py-1 rounded-md"
            style={{
              background: 'var(--studio-surface)',
              border: '1px solid var(--studio-border-subtle)',
              boxShadow: 'var(--studio-shadow-inner)',
            }}
          >
            <input
              type="number"
              value={tempo}
              onChange={(e) => onSetTempo(Number(e.target.value))}
              className="w-12 h-5 text-sm font-mono font-semibold text-center outline-none border-none"
              style={{
                background: 'transparent',
                color: 'var(--studio-text)',
              }}
              data-testid="text-tempo"
              min="40"
              max="240"
            />
            <span
              className="text-[9px] font-medium tracking-wider"
              style={{ color: 'var(--studio-text-subtle)' }}
            >
              BPM
            </span>
          </div>

          <button
            className="studio-btn h-7 w-7 rounded flex items-center justify-center"
            onClick={onIncrementTempo}
            data-testid="button-tempo-increase"
          >
            <Plus className="h-3 w-3" />
          </button>

          <button
            className="studio-btn h-7 px-3 rounded text-[10px] font-bold tracking-wider"
            onClick={onTapTempo}
            data-testid="button-tap-tempo"
            title="Tap Tempo"
          >
            TAP
          </button>
        </div>

        {/* Time Signature */}
        <div
          className="px-3 py-1 rounded-md font-mono text-sm font-semibold"
          style={{
            background: 'var(--studio-surface)',
            color: 'var(--studio-text)',
            border: '1px solid var(--studio-border-subtle)',
            boxShadow: 'var(--studio-shadow-inner)',
          }}
          data-testid="text-time-signature"
        >
          {timeSignature}
        </div>
      </div>

      {/* Right side placeholder */}
      <div className="w-48" />
    </div>
  );
}
