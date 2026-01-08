import { useState, useRef, useCallback, useEffect } from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, ChevronUp, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import { StudioOneChannelStrip } from './StudioOneChannelStrip';
import { ConsoleNavColumn } from './ConsoleNavColumn';
import { studioOneTheme } from '@/lib/studioOneTheme';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';

interface StudioTrack {
  id: string;
  name: string;
  trackType: 'audio' | 'midi' | 'instrument';
  trackNumber: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
  outputBus: string;
  inserts?: Array<{
    id: string;
    name: string;
    type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'chorus';
    bypass: boolean;
    params?: Record<string, number>;
  }>;
  sends?: Array<{
    id: string;
    targetBusId: string;
    targetBusName: string;
    level: number;
    preFader: boolean;
  }>;
}

interface MixBus {
  id: string;
  name: string;
  color: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

interface StudioOneConsoleProps {
  tracks: StudioTrack[];
  busses: MixBus[];
  masterVolume: number;
  onTrackVolumeChange: (trackId: string, volume: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onTrackMuteToggle: (trackId: string) => void;
  onTrackSoloToggle: (trackId: string) => void;
  onTrackArmedToggle: (trackId: string) => void;
  onBusVolumeChange: (busId: string, volume: number) => void;
  onBusPanChange: (busId: string, pan: number) => void;
  onBusMuteToggle: (busId: string) => void;
  onBusSoloToggle: (busId: string) => void;
  onMasterVolumeChange: (volume: number) => void;
  onAddTrack: () => void;
  onAddBus: () => void;
  selectedTrackId?: string;
  onTrackSelect: (trackId: string) => void;
}

export function StudioOneConsole({
  tracks,
  busses,
  masterVolume,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackMuteToggle,
  onTrackSoloToggle,
  onTrackArmedToggle,
  onBusVolumeChange,
  onBusPanChange,
  onBusMuteToggle,
  onBusSoloToggle,
  onMasterVolumeChange,
  onAddTrack,
  onAddBus,
  selectedTrackId,
  onTrackSelect,
}: StudioOneConsoleProps) {
  const { consolePanel, setPanelHeight, consoleSections } = useStudioLayoutStore();
  const [isResizing, setIsResizing] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    setStartY(e.clientY);
    setStartHeight(consolePanel.height || 300);
    e.preventDefault();
  }, [consolePanel.height]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(600, startHeight + delta));
      setPanelHeight('console', newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, startY, startHeight, setPanelHeight]);

  if (!consolePanel.visible) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col border-t"
      style={{
        height: consolePanel.height || 300,
        background: studioOneTheme.colors.bg.primary,
        borderColor: studioOneTheme.colors.border.primary,
      }}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-blue-500/30 transition-colors shrink-0"
        style={{ background: studioOneTheme.colors.border.primary }}
        onMouseDown={handleResizeStart}
      />

      {/* Console content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Navigation column */}
        <ConsoleNavColumn />

        {/* Channel strips */}
        <ScrollArea className="flex-1">
          <div className="flex h-full">
            {/* Audio/MIDI/Instrument tracks */}
            {tracks.map((track) => (
              <StudioOneChannelStrip
                key={track.id}
                id={track.id}
                name={track.name}
                trackNumber={track.trackNumber}
                color={track.color}
                trackType={track.trackType}
                volume={track.volume}
                pan={track.pan}
                mute={track.mute}
                solo={track.solo}
                armed={track.armed}
                inserts={track.inserts}
                sends={track.sends}
                outputBus={track.outputBus}
                onVolumeChange={(v) => onTrackVolumeChange(track.id, v)}
                onPanChange={(v) => onTrackPanChange(track.id, v)}
                onMuteToggle={() => onTrackMuteToggle(track.id)}
                onSoloToggle={() => onTrackSoloToggle(track.id)}
                onArmedToggle={() => onTrackArmedToggle(track.id)}
                isSelected={selectedTrackId === track.id}
                onSelect={() => onTrackSelect(track.id)}
              />
            ))}

            {/* Add track button */}
            <div
              className="w-10 h-full flex items-center justify-center shrink-0 border-r cursor-pointer hover:bg-white/5"
              style={{
                background: studioOneTheme.colors.bg.secondary,
                borderColor: studioOneTheme.colors.border.subtle,
              }}
              onClick={onAddTrack}
            >
              <Plus className="h-5 w-5" style={{ color: studioOneTheme.colors.text.muted }} />
            </div>

            {/* Separator */}
            <div
              className="w-1 h-full shrink-0"
              style={{ background: studioOneTheme.colors.border.primary }}
            />

            {/* Bus channels */}
            {busses.map((bus) => (
              <StudioOneChannelStrip
                key={bus.id}
                id={bus.id}
                name={bus.name}
                trackNumber={0}
                color={bus.color}
                trackType="bus"
                volume={bus.volume}
                pan={bus.pan}
                mute={bus.mute}
                solo={bus.solo}
                onVolumeChange={(v) => onBusVolumeChange(bus.id, v)}
                onPanChange={(v) => onBusPanChange(bus.id, v)}
                onMuteToggle={() => onBusMuteToggle(bus.id)}
                onSoloToggle={() => onBusSoloToggle(bus.id)}
                isSelected={false}
                onSelect={() => {}}
              />
            ))}

            {/* Add bus button */}
            <div
              className="w-10 h-full flex items-center justify-center shrink-0 border-r cursor-pointer hover:bg-white/5"
              style={{
                background: studioOneTheme.colors.bg.secondary,
                borderColor: studioOneTheme.colors.border.subtle,
              }}
              onClick={onAddBus}
            >
              <Plus className="h-5 w-5" style={{ color: studioOneTheme.colors.accent.cyan }} />
            </div>

            {/* Separator */}
            <div
              className="w-1 h-full shrink-0"
              style={{ background: studioOneTheme.colors.border.primary }}
            />

            {/* Master channel */}
            <StudioOneChannelStrip
              id="master"
              name="Master"
              trackNumber={0}
              color={studioOneTheme.colors.accent.green}
              trackType="master"
              volume={masterVolume}
              pan={0}
              mute={false}
              solo={false}
              onVolumeChange={onMasterVolumeChange}
              onPanChange={() => {}}
              onMuteToggle={() => {}}
              onSoloToggle={() => {}}
              isSelected={false}
              onSelect={() => {}}
            />
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
