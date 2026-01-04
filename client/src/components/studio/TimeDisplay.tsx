import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Clock, Music2, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStudioStore } from '@/lib/studioStore';

type TimeDisplayMode = 'smpte' | 'musical' | 'samples' | 'dual';

interface TimeDisplayProps {
  currentTime: number;
  duration?: number;
  tempo: number;
  timeSignature: string;
  sampleRate?: number;
  mode?: TimeDisplayMode;
  onModeChange?: (mode: TimeDisplayMode) => void;
  size?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  editable?: boolean;
  onTimeChange?: (time: number) => void;
}

export function TimeDisplay({
  currentTime,
  duration = 0,
  tempo,
  timeSignature,
  sampleRate = 44100,
  mode = 'dual',
  onModeChange,
  size = 'md',
  showLabels = true,
  editable = false,
  onTimeChange,
}: TimeDisplayProps) {
  const [displayMode, setDisplayMode] = useState<TimeDisplayMode>(mode);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const formatSMPTE = useCallback((seconds: number, fps: number = 30) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * fps);
    return {
      hours: hours.toString().padStart(2, '0'),
      minutes: minutes.toString().padStart(2, '0'),
      seconds: secs.toString().padStart(2, '0'),
      frames: frames.toString().padStart(2, '0'),
      full: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`,
    };
  }, []);

  const formatMusicalTime = useCallback((seconds: number) => {
    const [numerator] = timeSignature.split('/').map(Number);
    const beatsPerBar = numerator || 4;
    const beatDuration = 60 / tempo;

    const totalBeats = seconds / beatDuration;
    const bar = Math.floor(totalBeats / beatsPerBar) + 1;
    const beat = Math.floor(totalBeats % beatsPerBar) + 1;
    const tick = Math.floor((totalBeats % 1) * 960);

    return {
      bar: bar.toString(),
      beat: beat.toString(),
      tick: tick.toString().padStart(3, '0'),
      full: `${bar}.${beat}.${tick.toString().padStart(3, '0')}`,
    };
  }, [tempo, timeSignature]);

  const formatSamples = useCallback((seconds: number) => {
    const samples = Math.floor(seconds * sampleRate);
    return samples.toLocaleString();
  }, [sampleRate]);

  const handleModeChange = (newMode: TimeDisplayMode) => {
    setDisplayMode(newMode);
    onModeChange?.(newMode);
  };

  const handleEditStart = () => {
    if (!editable) return;
    setIsEditing(true);
    setEditValue(formatSMPTE(currentTime).full);
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    const parts = editValue.split(':').map(Number);
    if (parts.length === 4) {
      const [hours, minutes, seconds, frames] = parts;
      const newTime = hours * 3600 + minutes * 60 + seconds + frames / 30;
      onTimeChange?.(newTime);
    }
  };

  const sizeClasses = {
    sm: { main: 'text-sm', sub: 'text-[9px]', padding: 'px-2 py-1' },
    md: { main: 'text-lg', sub: 'text-xs', padding: 'px-3 py-1.5' },
    lg: { main: 'text-2xl', sub: 'text-sm', padding: 'px-4 py-2' },
  };

  const classes = sizeClasses[size];
  const smpte = formatSMPTE(currentTime);
  const musical = formatMusicalTime(currentTime);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <motion.div
          className={`flex flex-col items-end ${classes.padding} rounded-md cursor-pointer select-none`}
          style={{
            background: 'var(--studio-surface)',
            border: '1px solid var(--studio-border-subtle)',
            boxShadow: 'var(--studio-shadow-inner)',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {displayMode === 'dual' && (
            <>
              <div className="flex items-center gap-1">
                {isEditing ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleEditComplete}
                    onKeyDown={(e) => e.key === 'Enter' && handleEditComplete()}
                    className={`${classes.main} font-mono font-bold tracking-widest bg-transparent outline-none`}
                    style={{ color: 'var(--studio-text)', width: '10ch' }}
                    autoFocus
                  />
                ) : (
                  <span
                    className={`${classes.main} font-mono font-bold tracking-widest`}
                    style={{ color: 'var(--studio-text)' }}
                    onDoubleClick={handleEditStart}
                  >
                    {smpte.full}
                  </span>
                )}
                {showLabels && (
                  <span
                    className={`${classes.sub} ml-1`}
                    style={{ color: 'var(--studio-text-muted)' }}
                  >
                    SMPTE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`${classes.sub} font-mono tracking-wide`}
                  style={{ color: 'var(--studio-text-subtle)' }}
                >
                  {musical.full}
                </span>
                {showLabels && (
                  <span
                    className={`${classes.sub} ml-1`}
                    style={{ color: 'var(--studio-text-muted)' }}
                  >
                    BAR.BEAT.TICK
                  </span>
                )}
              </div>
            </>
          )}

          {displayMode === 'smpte' && (
            <div className="flex items-baseline gap-0.5">
              <DigitGroup value={smpte.hours} label="H" size={size} />
              <Separator size={size} />
              <DigitGroup value={smpte.minutes} label="M" size={size} />
              <Separator size={size} />
              <DigitGroup value={smpte.seconds} label="S" size={size} />
              <Separator size={size} />
              <DigitGroup value={smpte.frames} label="F" size={size} />
            </div>
          )}

          {displayMode === 'musical' && (
            <div className="flex items-baseline gap-1">
              <DigitGroup value={musical.bar} label="BAR" size={size} />
              <span className={`${classes.main} font-mono`} style={{ color: 'var(--studio-text-muted)' }}>.</span>
              <DigitGroup value={musical.beat} label="BEAT" size={size} />
              <span className={`${classes.main} font-mono`} style={{ color: 'var(--studio-text-muted)' }}>.</span>
              <DigitGroup value={musical.tick} label="TICK" size={size} />
            </div>
          )}

          {displayMode === 'samples' && (
            <div className="flex flex-col items-end">
              <span
                className={`${classes.main} font-mono font-bold`}
                style={{ color: 'var(--studio-text)' }}
              >
                {formatSamples(currentTime)}
              </span>
              <span className={classes.sub} style={{ color: 'var(--studio-text-muted)' }}>
                samples @ {sampleRate / 1000}kHz
              </span>
            </div>
          )}
        </motion.div>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleModeChange('dual')}>
          <Clock className="h-3.5 w-3.5 mr-2" />
          Dual Display (SMPTE + Musical)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleModeChange('smpte')}>
          <Clock className="h-3.5 w-3.5 mr-2" />
          SMPTE Timecode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleModeChange('musical')}>
          <Music2 className="h-3.5 w-3.5 mr-2" />
          Musical Time (Bars.Beats.Ticks)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleModeChange('samples')}>
          Samples
        </DropdownMenuItem>
        {duration > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Duration: {formatSMPTE(duration).full}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DigitGroup({ value, label, size }: { value: string; label: string; size: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: { main: 'text-sm', label: 'text-[7px]' },
    md: { main: 'text-lg', label: 'text-[8px]' },
    lg: { main: 'text-2xl', label: 'text-[9px]' },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-center">
      <span
        className={`${classes.main} font-mono font-bold leading-none`}
        style={{ color: 'var(--studio-text)' }}
      >
        {value}
      </span>
    </div>
  );
}

function Separator({ size }: { size: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <span
      className={`${sizeClasses[size]} font-mono font-bold`}
      style={{ color: 'var(--studio-text-muted)' }}
    >
      :
    </span>
  );
}

interface TempoDisplayProps {
  tempo: number;
  onTempoChange?: (tempo: number) => void;
  timeSignature: string;
  onTimeSignatureChange?: (sig: string) => void;
  size?: 'sm' | 'md' | 'lg';
}

export function TempoDisplay({
  tempo,
  onTempoChange,
  timeSignature,
  onTimeSignatureChange,
  size = 'md',
}: TempoDisplayProps) {
  const sizeClasses = {
    sm: { main: 'text-base', sub: 'text-[9px]', padding: 'px-2 py-1', input: 'w-12 h-5' },
    md: { main: 'text-xl', sub: 'text-[10px]', padding: 'px-3 py-1.5', input: 'w-14 h-6' },
    lg: { main: 'text-2xl', sub: 'text-xs', padding: 'px-4 py-2', input: 'w-16 h-7' },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex flex-col items-center ${classes.padding} rounded-md`}
        style={{
          background: 'var(--studio-surface)',
          border: '1px solid var(--studio-border-subtle)',
          boxShadow: 'var(--studio-shadow-inner)',
        }}
      >
        <input
          type="number"
          value={tempo}
          onChange={(e) => onTempoChange?.(Number(e.target.value))}
          className={`${classes.input} ${classes.main} font-mono font-bold text-center outline-none border-none`}
          style={{
            background: 'transparent',
            color: 'var(--studio-text)',
          }}
          min="20"
          max="300"
        />
        <span
          className={`${classes.sub} font-medium tracking-wider`}
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          BPM
        </span>
      </div>

      <div
        className={`${classes.padding} rounded-md font-mono ${classes.main} font-bold`}
        style={{
          background: 'var(--studio-surface)',
          color: 'var(--studio-text)',
          border: '1px solid var(--studio-border-subtle)',
          boxShadow: 'var(--studio-shadow-inner)',
        }}
      >
        {timeSignature}
      </div>
    </div>
  );
}
