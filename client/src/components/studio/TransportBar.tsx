import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useStudioStore } from '@/lib/studioStore';
import {
  Play,
  Pause,
  Square,
  Circle,
  SkipBack,
  SkipForward,
  Repeat,
  Plus,
  Minus,
  Music2,
  RotateCcw,
  RotateCw,
  Activity,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { AIMixer } from '@/lib/audio/AIMixer';
import { AIMastering } from '@/lib/audio/AIMastering';
import { useToast } from '@/hooks/use-toast';
import AudioEngine from '@/lib/audioEngine';

interface TransportBarProps {
  armedTracksCount?: number;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onStop?: () => void;
  onRecord?: () => void;
  onSeek?: (time: number) => void;
}

/**
 * TODO: Add function documentation
 */
export function TransportBar({
  armedTracksCount = 0,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onPlay,
  onPause,
  onStop,
  onRecord,
  onSeek,
}: TransportBarProps) {
  const {
    currentTime,
    isPlaying,
    isRecording,
    loopEnabled,
    loopStart,
    loopEnd,
    tempo,
    timeSignature,
    metronomeEnabled,
    setLoopEnabled,
    setLoopStart,
    setLoopEnd,
    setTempo,
    setMetronomeEnabled,
  } = useStudioStore();

  const [tapTempoTimes, setTapTempoTimes] = useState<number[]>([]);

  const formatSMPTE = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  const formatMusicalTime = (seconds: number) => {
    const [numerator] = timeSignature.split('/').map(Number);
    const beatsPerBar = numerator;
    const beatDuration = 60 / tempo;

    const totalBeats = seconds / beatDuration;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const tick = Math.floor((totalBeats % 1) * 960);

    return `${bar}.${beat}.${tick.toString().padStart(3, '0')}`;
  };

  const handlePlay = useCallback(() => {
    if (isPlaying && onPause) {
      onPause();
    } else if (!isPlaying && onPlay) {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleStop = useCallback(() => {
    if (onStop) {
      onStop();
    }
  }, [onStop]);

  const handleRecord = useCallback(() => {
    if (onRecord) {
      onRecord();
    }
  }, [onRecord]);

  const handleSkipBack = useCallback(() => {
    if (onSeek) {
      onSeek(Math.max(0, currentTime - 1));
    }
  }, [currentTime, onSeek]);

  const handleSkipForward = useCallback(() => {
    if (onSeek) {
      onSeek(currentTime + 1);
    }
  }, [currentTime, onSeek]);

  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    const newTimes = [...tapTempoTimes, now].slice(-4);
    setTapTempoTimes(newTimes);

    if (newTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < newTimes.length; i++) {
        intervals.push(newTimes[i] - newTimes[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newTempo = Math.round(60000 / avgInterval);
      if (newTempo >= 40 && newTempo <= 240) {
        setTempo(newTempo);
      }
    }

    setTimeout(() => setTapTempoTimes([]), 3000);
  }, [tapTempoTimes, setTempo]);

  return (
    <div
      className="h-20 flex items-center justify-between px-6 border-b"
      style={{
        background:
          'linear-gradient(180deg, var(--studio-bg-medium) 0%, var(--studio-bg-deep) 100%)',
        borderColor: 'var(--studio-border)',
      }}
    >
      <TooltipProvider>
        {/* Left: Transport Controls */}
        <div className="flex items-center gap-3">
          {/* Skip Back */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="studio-btn h-10 w-10 rounded-md flex items-center justify-center"
                onClick={handleSkipBack}
              >
                <SkipBack className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Skip Back (,)</TooltipContent>
          </Tooltip>

          {/* Stop */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="studio-btn h-10 w-10 rounded-md flex items-center justify-center"
                onClick={handleStop}
              >
                <Square className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Stop (Enter)</TooltipContent>
          </Tooltip>

          {/* Play/Pause */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`h-14 w-14 rounded-lg flex items-center justify-center transition-all ${
                  isPlaying ? 'studio-btn-play playing' : 'studio-btn-play'
                }`}
                onClick={handlePlay}
              >
                {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>Play/Pause (Space)</TooltipContent>
          </Tooltip>

          {/* Record */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn-record h-10 w-10 rounded-md flex items-center justify-center ${
                  isRecording ? 'recording animate-pulse' : ''
                }`}
                onClick={handleRecord}
              >
                <Circle className="h-4 w-4" fill={isRecording ? 'currentColor' : 'none'} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Record (R)</TooltipContent>
          </Tooltip>

          {/* Skip Forward */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="studio-btn h-10 w-10 rounded-md flex items-center justify-center"
                onClick={handleSkipForward}
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Skip Forward (.)</TooltipContent>
          </Tooltip>

          {/* Armed Tracks Badge */}
          {armedTracksCount > 0 && (
            <div
              className="ml-2 px-3 h-7 rounded flex items-center gap-1.5 text-xs font-medium"
              style={{
                background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
                color: '#fca5a5',
                border: '1px solid #991b1b',
                boxShadow: '0 0 10px rgba(239, 68, 68, 0.2)',
              }}
            >
              <Circle className="h-3 w-3 fill-current" />
              {armedTracksCount} Armed
            </div>
          )}
        </div>

        {/* Center: Time Display & Loop Controls */}
        <div className="flex items-center gap-6">
          {/* SMPTE Timecode */}
          <div
            className="flex flex-col items-end px-4 py-2 rounded-md"
            style={{
              background: 'var(--studio-surface)',
              border: '1px solid var(--studio-border-subtle)',
              boxShadow: 'var(--studio-shadow-inner)',
            }}
          >
            <div
              className="text-lg font-mono font-bold tracking-widest"
              style={{ color: 'var(--studio-text)' }}
            >
              {formatSMPTE(currentTime)}
            </div>
            <div
              className="text-xs font-mono tracking-wide"
              style={{ color: 'var(--studio-text-subtle)' }}
            >
              {formatMusicalTime(currentTime)}
            </div>
          </div>

          <div className="h-8 w-px" style={{ background: 'var(--studio-border)' }} />

          {/* Loop Controls */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={`studio-btn h-9 px-4 rounded-md text-xs font-bold flex items-center gap-2 ${
                    loopEnabled ? 'studio-btn-accent' : ''
                  }`}
                  onClick={() => setLoopEnabled(!loopEnabled)}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  LOOP
                </button>
              </TooltipTrigger>
              <TooltipContent>Toggle Loop (L)</TooltipContent>
            </Tooltip>

            {loopEnabled && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={loopStart}
                  onChange={(e) => setLoopStart(Number(e.target.value))}
                  className="w-16 h-7 text-xs"
                  min={0}
                />
                <span style={{ color: 'var(--studio-text-muted)' }}>to</span>
                <Input
                  type="number"
                  value={loopEnd}
                  onChange={(e) => setLoopEnd(Number(e.target.value))}
                  className="w-16 h-7 text-xs"
                  min={loopStart + 1}
                />
              </div>
            )}
          </div>

          <div className="h-8 w-px" style={{ background: 'var(--studio-border)' }} />

          {/* Metronome */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className={`studio-btn-metronome h-9 px-4 rounded-md text-xs font-bold flex items-center gap-2 ${
                  metronomeEnabled ? 'active' : ''
                }`}
                onClick={() => setMetronomeEnabled(!metronomeEnabled)}
              >
                <Activity className="h-3.5 w-3.5" />
                CLICK
              </button>
            </TooltipTrigger>
            <TooltipContent>Metronome (M)</TooltipContent>
          </Tooltip>
        </div>

        {/* Right: Tempo & Undo/Redo */}
        <div className="flex items-center gap-4">
          {/* Tempo Controls */}
          <div className="flex items-center gap-2">
            <button
              className="studio-btn h-8 w-8 rounded flex items-center justify-center"
              onClick={() => setTempo(tempo - 1)}
            >
              <Minus className="h-3 w-3" />
            </button>

            <div
              className="flex flex-col items-center px-4 py-1.5 rounded-md"
              style={{
                background: 'var(--studio-surface)',
                border: '1px solid var(--studio-border-subtle)',
                boxShadow: 'var(--studio-shadow-inner)',
              }}
            >
              <input
                type="number"
                value={tempo}
                onChange={(e) => setTempo(Number(e.target.value))}
                className="w-14 h-6 text-base font-mono font-bold text-center outline-none border-none"
                style={{
                  background: 'transparent',
                  color: 'var(--studio-text)',
                }}
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
              className="studio-btn h-8 w-8 rounded flex items-center justify-center"
              onClick={() => setTempo(tempo + 1)}
            >
              <Plus className="h-3 w-3" />
            </button>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="studio-btn h-8 px-3 rounded text-[10px] font-bold tracking-wider"
                  onClick={handleTapTempo}
                >
                  TAP
                </button>
              </TooltipTrigger>
              <TooltipContent>Tap Tempo</TooltipContent>
            </Tooltip>
          </div>

          {/* Time Signature */}
          <div
            className="px-3 py-1.5 rounded-md font-mono text-base font-bold"
            style={{
              background: 'var(--studio-surface)',
              color: 'var(--studio-text)',
              border: '1px solid var(--studio-border-subtle)',
              boxShadow: 'var(--studio-shadow-inner)',
            }}
          >
            {timeSignature}
          </div>

          <div className="h-8 w-px" style={{ background: 'var(--studio-border)' }} />

          {/* Undo/Redo */}
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-1">
              {onUndo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={onUndo}
                      disabled={!canUndo}
                      style={{ opacity: canUndo ? 1 : 0.5 }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
                </Tooltip>
              )}

              {onRedo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="studio-btn h-8 w-8 rounded flex items-center justify-center"
                      onClick={onRedo}
                      disabled={!canRedo}
                      style={{ opacity: canRedo ? 1 : 0.5 }}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Redo (Ctrl+Y)</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
}
