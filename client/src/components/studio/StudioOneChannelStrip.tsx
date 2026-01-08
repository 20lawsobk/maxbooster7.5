import { useState, useEffect, useCallback, useRef } from 'react';
import { Volume2, VolumeX, Headphones, Mic, ChevronDown, ChevronUp, Plus, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { studioOneTheme } from '@/lib/studioOneTheme';
import { useStudioLayoutStore } from '@/lib/studioLayoutStore';

interface InsertEffect {
  id: string;
  name: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'distortion' | 'chorus';
  bypass: boolean;
  params?: Record<string, number>;
}

interface SendEffect {
  id: string;
  targetBusId: string;
  targetBusName: string;
  level: number;
  preFader: boolean;
}

interface StudioOneChannelStripProps {
  id: string;
  name: string;
  trackNumber: number;
  color: string;
  trackType: 'audio' | 'midi' | 'instrument' | 'bus' | 'fx' | 'master';
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed?: boolean;
  inputSource?: string;
  outputBus?: string;
  inserts?: InsertEffect[];
  sends?: SendEffect[];
  meterLevels?: [number, number];
  peakLevels?: [number, number];
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmedToggle?: () => void;
  onInsertChange?: (insertId: string, params: Record<string, unknown>) => void;
  onSendChange?: (sendId: string, level: number) => void;
  onAddInsert?: () => void;
  onAddSend?: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

function VUMeterBar({ level, peak, height = 200 }: { level: number; peak: number; height?: number }) {
  const levelPercent = Math.min(100, Math.max(0, level * 100));
  const peakPercent = Math.min(100, Math.max(0, peak * 100));
  
  const getGradient = () => {
    return `linear-gradient(to top, 
      ${studioOneTheme.colors.meter.low} 0%, 
      ${studioOneTheme.colors.meter.low} 60%, 
      ${studioOneTheme.colors.meter.mid} 75%, 
      ${studioOneTheme.colors.meter.high} 90%, 
      ${studioOneTheme.colors.meter.clip} 100%
    )`;
  };

  return (
    <div 
      className="relative w-2 rounded-sm overflow-hidden"
      style={{ 
        height,
        background: studioOneTheme.colors.bg.deep,
        border: `1px solid ${studioOneTheme.colors.border.subtle}`,
      }}
    >
      {/* Level bar */}
      <div
        className="absolute bottom-0 left-0 right-0 transition-all duration-50"
        style={{
          height: `${levelPercent}%`,
          background: getGradient(),
          opacity: 0.9,
        }}
      />
      {/* Peak indicator */}
      <div
        className="absolute left-0 right-0 h-0.5"
        style={{
          bottom: `${peakPercent}%`,
          background: peakPercent > 95 ? studioOneTheme.colors.meter.clip : studioOneTheme.colors.text.primary,
        }}
      />
      {/* Scale marks */}
      {[0, 25, 50, 75, 100].map((mark) => (
        <div
          key={mark}
          className="absolute left-0 right-0 h-px opacity-30"
          style={{
            bottom: `${mark}%`,
            background: studioOneTheme.colors.border.secondary,
          }}
        />
      ))}
    </div>
  );
}

function PanKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    e.preventDefault();
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = (startY.current - e.clientY) / 100;
      const newValue = Math.max(-1, Math.min(1, startValue.current + delta));
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]);

  const rotation = value * 135;
  const displayValue = value === 0 ? 'C' : value < 0 ? `${Math.abs(value * 100).toFixed(0)}L` : `${(value * 100).toFixed(0)}R`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-8 h-8 rounded-full cursor-pointer relative"
        style={{
          background: `conic-gradient(from 225deg, ${studioOneTheme.colors.bg.tertiary} 0deg, ${studioOneTheme.colors.bg.tertiary} 270deg, ${studioOneTheme.colors.bg.tertiary} 270deg)`,
          border: `2px solid ${studioOneTheme.colors.border.secondary}`,
          boxShadow: isDragging ? studioOneTheme.effects.glow.blue : 'none',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onChange(0)}
      >
        <div
          className="absolute top-1 left-1/2 w-0.5 h-2 rounded-full"
          style={{
            background: studioOneTheme.colors.accent.blue,
            transformOrigin: 'bottom center',
            transform: `translateX(-50%) rotate(${rotation}deg)`,
          }}
        />
      </div>
      <span 
        className="text-[9px] font-mono"
        style={{ color: studioOneTheme.colors.text.muted }}
      >
        {displayValue}
      </span>
    </div>
  );
}

function VerticalFader({ 
  value, 
  onChange, 
  height = 120,
  color 
}: { 
  value: number; 
  onChange: (v: number) => void; 
  height?: number;
  color: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updateValue(e);
  };

  const updateValue = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const percent = 1 - (y / rect.height);
    onChange(Math.max(0, Math.min(1, percent)));
  }, [onChange]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => updateValue(e);
    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, updateValue]);

  const thumbPosition = (1 - value) * 100;
  const dbValue = value === 0 ? '-∞' : (20 * Math.log10(value)).toFixed(1);

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        ref={trackRef}
        className="relative cursor-pointer rounded"
        style={{
          width: 24,
          height,
          background: studioOneTheme.colors.bg.deep,
          border: `1px solid ${studioOneTheme.colors.border.subtle}`,
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onChange(0.75)}
      >
        {/* Track fill */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-b transition-all"
          style={{
            height: `${value * 100}%`,
            background: `linear-gradient(to top, ${color}40, ${color}20)`,
          }}
        />
        {/* Unity mark (0dB) */}
        <div
          className="absolute left-0 right-0 h-px"
          style={{
            top: '25%',
            background: studioOneTheme.colors.accent.green,
          }}
        />
        {/* Thumb */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-6 h-3 rounded-sm shadow-md"
          style={{
            top: `${thumbPosition}%`,
            transform: `translate(-50%, -50%)`,
            background: `linear-gradient(180deg, ${studioOneTheme.colors.bg.elevated} 0%, ${studioOneTheme.colors.bg.tertiary} 100%)`,
            border: `1px solid ${studioOneTheme.colors.border.secondary}`,
            boxShadow: isDragging ? studioOneTheme.effects.glow.blue : studioOneTheme.effects.shadow.sm,
          }}
        >
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-0.5 rounded-full"
            style={{ background: color }}
          />
        </div>
        {/* Scale marks */}
        {[0, 25, 50, 75, 100].map((mark) => (
          <div
            key={mark}
            className="absolute left-0 w-1 h-px"
            style={{
              top: `${mark}%`,
              background: studioOneTheme.colors.border.secondary,
            }}
          />
        ))}
      </div>
      <span 
        className="text-[9px] font-mono"
        style={{ color: studioOneTheme.colors.text.muted }}
      >
        {dbValue}dB
      </span>
    </div>
  );
}

export function StudioOneChannelStrip({
  id,
  name,
  trackNumber,
  color,
  trackType,
  volume,
  pan,
  mute,
  solo,
  armed = false,
  inputSource,
  outputBus,
  inserts = [],
  sends = [],
  meterLevels = [0, 0],
  peakLevels = [0, 0],
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmedToggle,
  onInsertChange,
  onSendChange,
  onAddInsert,
  onAddSend,
  isSelected = false,
  onSelect,
}: StudioOneChannelStripProps) {
  const { consoleSections, channelWidth } = useStudioLayoutStore();
  const [localMeterLevels, setLocalMeterLevels] = useState<[number, number]>([0, 0]);
  const [localPeakLevels, setLocalPeakLevels] = useState<[number, number]>([0, 0]);
  const [showInserts, setShowInserts] = useState(true);
  const [showSends, setShowSends] = useState(true);

  const width = channelWidth === 'narrow' ? 60 : channelWidth === 'wide' ? 120 : 80;

  useEffect(() => {
    if (mute) {
      setLocalMeterLevels([0, 0]);
      return;
    }

    const interval = setInterval(() => {
      const baseLevel = volume * 0.7;
      const newL = Math.random() * 0.3 * volume + baseLevel;
      const newR = Math.random() * 0.3 * volume + baseLevel;
      setLocalMeterLevels([newL, newR]);
      setLocalPeakLevels((prev) => [
        Math.max(prev[0] * 0.98, newL),
        Math.max(prev[1] * 0.98, newR),
      ]);
    }, 50);

    return () => clearInterval(interval);
  }, [volume, mute]);

  const getTrackTypeLabel = () => {
    switch (trackType) {
      case 'audio': return 'A';
      case 'midi': return 'M';
      case 'instrument': return 'I';
      case 'bus': return 'B';
      case 'fx': return 'FX';
      case 'master': return 'MST';
      default: return '';
    }
  };

  return (
    <div
      className="flex flex-col h-full border-r transition-all"
      style={{
        width,
        minWidth: width,
        background: isSelected 
          ? `linear-gradient(180deg, ${studioOneTheme.colors.bg.secondary} 0%, ${studioOneTheme.colors.bg.primary} 100%)`
          : studioOneTheme.colors.bg.primary,
        borderColor: studioOneTheme.colors.border.subtle,
        boxShadow: isSelected ? `inset 0 0 0 1px ${studioOneTheme.colors.accent.blue}` : 'none',
      }}
      onClick={onSelect}
    >
      {/* Track Header */}
      <div
        className="p-1.5 flex flex-col gap-1 border-b"
        style={{
          background: `linear-gradient(180deg, ${color}20 0%, ${color}10 100%)`,
          borderColor: studioOneTheme.colors.border.subtle,
          borderBottom: `2px solid ${color}`,
        }}
      >
        <div className="flex items-center gap-1">
          <span 
            className="text-[9px] font-bold rounded px-1"
            style={{ 
              background: color + '40',
              color: studioOneTheme.colors.text.primary,
            }}
          >
            {trackNumber}
          </span>
          <span 
            className="text-[10px] font-medium truncate flex-1"
            style={{ color: studioOneTheme.colors.text.primary }}
            title={name}
          >
            {name}
          </span>
          <span 
            className="text-[8px] font-bold px-1 rounded"
            style={{ 
              background: studioOneTheme.colors.bg.deep,
              color: studioOneTheme.colors.text.muted,
            }}
          >
            {getTrackTypeLabel()}
          </span>
        </div>

        {/* Input/Output routing */}
        {consoleSections.inputs && channelWidth !== 'narrow' && (
          <div className="flex flex-col gap-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="w-full text-[8px] py-0.5 px-1 rounded text-left truncate hover:bg-white/10"
                  style={{ 
                    background: studioOneTheme.colors.bg.deep,
                    color: studioOneTheme.colors.text.muted,
                  }}
                >
                  {inputSource || 'No Input'}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Input 1</DropdownMenuItem>
                <DropdownMenuItem>Input 2</DropdownMenuItem>
                <DropdownMenuItem>Stereo In</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Inserts Section */}
      {consoleSections.inserts && (
        <div 
          className="border-b"
          style={{ borderColor: studioOneTheme.colors.border.subtle }}
        >
          <button
            onClick={() => setShowInserts(!showInserts)}
            className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-medium hover:bg-white/5"
            style={{ color: studioOneTheme.colors.text.muted }}
          >
            <span>INSERTS</span>
            {showInserts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showInserts && (
            <div className="p-1 space-y-0.5 max-h-20 overflow-y-auto">
              {inserts.length === 0 ? (
                <button
                  onClick={onAddInsert}
                  className="w-full text-[8px] py-1 rounded flex items-center justify-center gap-1 hover:bg-white/5"
                  style={{ 
                    color: studioOneTheme.colors.text.muted,
                    border: `1px dashed ${studioOneTheme.colors.border.subtle}`,
                  }}
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              ) : (
                inserts.map((insert) => (
                  <button
                    key={insert.id}
                    className="w-full text-[8px] py-0.5 px-1 rounded truncate hover:bg-white/10"
                    style={{
                      background: insert.bypass ? 'transparent' : `${color}20`,
                      color: insert.bypass ? studioOneTheme.colors.text.muted : studioOneTheme.colors.text.primary,
                      border: `1px solid ${insert.bypass ? studioOneTheme.colors.border.subtle : color}40`,
                    }}
                  >
                    {insert.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Sends Section */}
      {consoleSections.sends && (
        <div 
          className="border-b"
          style={{ borderColor: studioOneTheme.colors.border.subtle }}
        >
          <button
            onClick={() => setShowSends(!showSends)}
            className="w-full px-1.5 py-1 flex items-center justify-between text-[8px] font-medium hover:bg-white/5"
            style={{ color: studioOneTheme.colors.text.muted }}
          >
            <span>SENDS</span>
            {showSends ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showSends && (
            <div className="p-1 space-y-1 max-h-16 overflow-y-auto">
              {sends.length === 0 ? (
                <button
                  onClick={onAddSend}
                  className="w-full text-[8px] py-1 rounded flex items-center justify-center gap-1 hover:bg-white/5"
                  style={{ 
                    color: studioOneTheme.colors.text.muted,
                    border: `1px dashed ${studioOneTheme.colors.border.subtle}`,
                  }}
                >
                  <Plus className="h-2.5 w-2.5" />
                </button>
              ) : (
                sends.map((send) => (
                  <div key={send.id} className="flex items-center gap-1">
                    <span 
                      className="text-[7px] truncate flex-1"
                      style={{ color: studioOneTheme.colors.text.muted }}
                    >
                      {send.targetBusName}
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={send.level * 100}
                      onChange={(e) => onSendChange?.(send.id, Number(e.target.value) / 100)}
                      className="w-10 h-1"
                    />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Pan & Meters */}
      <div 
        className="flex-1 flex items-stretch gap-1 p-1.5 border-b"
        style={{ borderColor: studioOneTheme.colors.border.subtle }}
      >
        {/* Pan */}
        <div className="flex flex-col items-center justify-start">
          <PanKnob value={pan} onChange={onPanChange} />
        </div>

        {/* Meters */}
        {consoleSections.meters && (
          <div className="flex gap-0.5 flex-1 justify-center">
            <VUMeterBar level={localMeterLevels[0]} peak={localPeakLevels[0]} height={80} />
            <VUMeterBar level={localMeterLevels[1]} peak={localPeakLevels[1]} height={80} />
          </div>
        )}
      </div>

      {/* Fader Section */}
      {consoleSections.faders && (
        <div className="flex-1 flex flex-col items-center p-1.5 min-h-[140px]">
          <VerticalFader 
            value={volume} 
            onChange={onVolumeChange} 
            height={100}
            color={color}
          />
        </div>
      )}

      {/* Control Buttons */}
      <div 
        className="p-1.5 space-y-1"
        style={{ background: studioOneTheme.colors.bg.deep }}
      >
        {trackType === 'audio' && (
          <button
            onClick={onArmedToggle}
            className="w-full h-5 text-[9px] font-bold rounded transition-all flex items-center justify-center gap-1"
            style={{
              background: armed ? studioOneTheme.colors.button.record : studioOneTheme.colors.bg.tertiary,
              color: armed ? '#fff' : studioOneTheme.colors.text.muted,
              boxShadow: armed ? studioOneTheme.effects.glow.red : 'none',
            }}
          >
            <div className={`w-2 h-2 rounded-full ${armed ? 'animate-pulse' : ''}`} style={{ background: armed ? '#fff' : studioOneTheme.colors.button.record }} />
          </button>
        )}
        <button
          onClick={onMuteToggle}
          className="w-full h-5 text-[9px] font-bold rounded transition-all"
          style={{
            background: mute ? studioOneTheme.colors.button.mute : studioOneTheme.colors.bg.tertiary,
            color: mute ? '#000' : studioOneTheme.colors.text.muted,
          }}
        >
          M
        </button>
        <button
          onClick={onSoloToggle}
          className="w-full h-5 text-[9px] font-bold rounded transition-all"
          style={{
            background: solo ? studioOneTheme.colors.button.solo : studioOneTheme.colors.bg.tertiary,
            color: solo ? '#fff' : studioOneTheme.colors.text.muted,
          }}
        >
          S
        </button>
      </div>
    </div>
  );
}
