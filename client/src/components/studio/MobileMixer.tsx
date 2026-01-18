import { useState, useRef, useCallback } from 'react';
import { Volume2, VolumeX, Mic, Headphones, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { studioOneTheme } from '@/lib/studioOneTheme';
import { TouchFader, TouchPanKnob } from './TouchFader';

interface MixerTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  meterLevel?: number;
}

interface MobileMixerProps {
  tracks: MixerTrack[];
  masterVolume: number;
  masterMeterLevel?: number;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onTrackMuteToggle: (trackId: string) => void;
  onTrackSoloToggle: (trackId: string) => void;
  onTrackArmedToggle: (trackId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddTrack?: () => void;
  className?: string;
}

export function MobileMixer({
  tracks,
  masterVolume,
  masterMeterLevel = 0,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackArmedToggle,
  onMasterVolumeChange,
  onAddTrack,
  className,
}: MobileMixerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const MixerButton = useCallback(({
    onClick,
    active,
    activeColor,
    children,
    className: btnClassName,
  }: {
    onClick: () => void;
    active?: boolean;
    activeColor?: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'w-8 h-8 rounded flex items-center justify-center touch-manipulation transition-colors',
        active ? '' : 'bg-white/5 hover:bg-white/10 active:bg-white/20',
        btnClassName
      )}
      style={{
        background: active ? activeColor : undefined,
        color: active ? '#fff' : studioOneTheme.colors.text.secondary,
      }}
    >
      {children}
    </button>
  ), []);

  return (
    <div
      className={cn('flex flex-col h-full', className)}
      style={{ background: studioOneTheme.colors.bg.panel }}
    >
      <div className="flex-1 flex overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden touch-pan-x"
        >
          <div
            className="flex gap-1 p-2"
            style={{ minWidth: 'max-content' }}
          >
            {tracks.map((track) => (
              <div
                key={track.id}
                className="flex flex-col items-center p-2 rounded-lg"
                style={{
                  width: 64,
                  background: studioOneTheme.colors.bg.secondary,
                  borderTop: `3px solid ${track.color}`,
                }}
              >
                <TouchPanKnob
                  value={track.pan}
                  onChange={(v) => onTrackPanChange(track.id, v)}
                  size={36}
                />
                
                <div className="my-2">
                  <TouchFader
                    value={track.volume}
                    onChange={(v) => onTrackVolumeChange(track.id, v)}
                    meterLevel={track.meterLevel}
                    height={140}
                    width={40}
                    color={track.color}
                  />
                </div>
                
                <div className="flex gap-1">
                  <MixerButton
                    onClick={() => onTrackMuteToggle(track.id)}
                    active={track.mute}
                    activeColor={studioOneTheme.colors.accent.red}
                  >
                    <span className="text-[10px] font-bold">M</span>
                  </MixerButton>
                  <MixerButton
                    onClick={() => onTrackSoloToggle(track.id)}
                    active={track.solo}
                    activeColor={studioOneTheme.colors.accent.yellow}
                  >
                    <span className="text-[10px] font-bold">S</span>
                  </MixerButton>
                </div>
                
                <button
                  onClick={() => onTrackArmedToggle(track.id)}
                  className={cn(
                    'mt-1 w-full h-7 rounded flex items-center justify-center touch-manipulation',
                    track.armed ? 'bg-red-500' : 'bg-white/5 hover:bg-white/10'
                  )}
                >
                  <Mic className="w-3 h-3" />
                </button>
                
                <span
                  className="mt-1 text-[10px] font-medium truncate w-full text-center"
                  style={{ color: studioOneTheme.colors.text.secondary }}
                >
                  {track.name}
                </span>
              </div>
            ))}
            
            {onAddTrack && (
              <button
                onClick={onAddTrack}
                className="flex flex-col items-center justify-center p-2 rounded-lg border-2 border-dashed touch-manipulation"
                style={{
                  width: 64,
                  minHeight: 280,
                  borderColor: studioOneTheme.colors.border.primary,
                  color: studioOneTheme.colors.text.muted,
                }}
              >
                <Plus className="w-6 h-6" />
                <span className="text-[10px] mt-1">Add Track</span>
              </button>
            )}
          </div>
        </div>
        
        <div
          className="shrink-0 flex flex-col items-center p-2 border-l"
          style={{
            width: 72,
            background: studioOneTheme.colors.bg.tertiary,
            borderColor: studioOneTheme.colors.border.primary,
          }}
        >
          <span
            className="text-[10px] font-bold mb-2"
            style={{ color: studioOneTheme.colors.text.primary }}
          >
            MASTER
          </span>
          
          <TouchFader
            value={masterVolume}
            onChange={onMasterVolumeChange}
            meterLevel={masterMeterLevel}
            height={180}
            width={48}
            color={studioOneTheme.colors.accent.purple}
          />
          
          <div
            className="mt-2 px-2 py-1 rounded font-mono text-xs"
            style={{
              background: studioOneTheme.colors.bg.deep,
              color: studioOneTheme.colors.text.primary,
            }}
          >
            {masterVolume > 75 ? `+${Math.round((masterVolume - 75) * 0.5)}` : 
             masterVolume === 75 ? '0' : 
             `-${Math.round((75 - masterVolume) * 0.5)}`}dB
          </div>
        </div>
      </div>
    </div>
  );
}
