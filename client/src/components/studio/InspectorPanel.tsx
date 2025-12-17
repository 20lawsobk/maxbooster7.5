import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useStudioStore } from '@/lib/studioStore';
import {
  Settings2,
  ChevronDown,
  ChevronUp,
  Volume2,
  Sliders,
  Zap,
  Music,
  FileAudio,
  GripVertical,
  X,
  Plus,
} from 'lucide-react';

interface InspectorPanelProps {
  selectedTrack?: any;
  selectedClip?: any;
  onTrackUpdate?: (trackId: string, updates: unknown) => void;
  onClipUpdate?: (clipId: string, updates: unknown) => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

/**
 * TODO: Add function documentation
 */
function CollapsibleSection({
  title,
  icon,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b" style={{ borderColor: 'var(--studio-border)' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon && <div style={{ color: 'var(--studio-text-muted)' }}>{icon}</div>}
          <span className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
        )}
      </button>
      {isExpanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

interface ParameterControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

/**
 * TODO: Add function documentation
 */
function ParameterControl({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
}: ParameterControlProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
          {label}
        </Label>
        <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
          {value}
          {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        onValueChange={([val]) => onChange(val)}
        min={min}
        max={max}
        step={step}
        className="cursor-pointer"
      />
    </div>
  );
}

/**
 * TODO: Add function documentation
 */
export function InspectorPanel({
  selectedTrack,
  selectedClip,
  onTrackUpdate,
  onClipUpdate,
}: InspectorPanelProps) {
  const { selectedTrackId, selectedClipId } = useStudioStore();

  const [effects, setEffects] = useState([
    { id: '1', name: 'EQ', type: 'eq', bypass: false },
    { id: '2', name: 'Compressor', type: 'compressor', bypass: false },
  ]);

  const hasSelection = selectedTrackId || selectedClipId;

  if (!hasSelection) {
    return (
      <div
        className="h-full flex flex-col border-l"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div
          className="h-12 px-4 flex items-center border-b"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <h3 className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
            INSPECTOR
          </h3>
        </div>
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3 p-6"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          <Settings2 className="h-16 w-16 opacity-30" />
          <p className="text-sm text-center">Select a track or clip to view properties</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col border-l"
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
      {/* Header */}
      <div
        className="h-12 px-4 flex items-center justify-between border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <h3 className="text-sm font-bold tracking-wide" style={{ color: 'var(--studio-text)' }}>
          INSPECTOR
        </h3>
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{
            borderColor: 'var(--studio-accent)',
            color: 'var(--studio-accent)',
          }}
        >
          {selectedTrackId ? 'Track' : 'Clip'}
        </Badge>
      </div>

      <ScrollArea className="flex-1">
        {/* General Properties */}
        <CollapsibleSection title="GENERAL" icon={<FileAudio className="h-4 w-4" />}>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                Name
              </Label>
              <Input
                value={selectedTrack?.name || selectedClip?.name || 'Untitled'}
                onChange={(e) => {
                  if (selectedTrackId && onTrackUpdate) {
                    onTrackUpdate(selectedTrackId, { name: e.target.value });
                  } else if (selectedClipId && onClipUpdate) {
                    onClipUpdate(selectedClipId, { name: e.target.value });
                  }
                }}
                className="h-8 text-sm"
                style={{
                  background: 'var(--studio-bg-deep)',
                  borderColor: 'var(--studio-border)',
                  color: 'var(--studio-text)',
                }}
              />
            </div>

            {selectedTrackId && (
              <div className="space-y-1.5">
                <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                  Color
                </Label>
                <Input
                  type="color"
                  value={selectedTrack?.color || '#4ade80'}
                  onChange={(e) => {
                    if (onTrackUpdate) {
                      onTrackUpdate(selectedTrackId, { color: e.target.value });
                    }
                  }}
                  className="h-8 w-full"
                />
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Track Controls */}
        {selectedTrackId && (
          <>
            <CollapsibleSection title="TRACK CONTROLS" icon={<Volume2 className="h-4 w-4" />}>
              <div className="space-y-4">
                <ParameterControl
                  label="Volume"
                  value={selectedTrack?.volume || 75}
                  min={0}
                  max={100}
                  onChange={(val) => onTrackUpdate?.(selectedTrackId, { volume: val })}
                  unit="%"
                />

                <ParameterControl
                  label="Pan"
                  value={selectedTrack?.pan || 0}
                  min={-100}
                  max={100}
                  onChange={(val) => onTrackUpdate?.(selectedTrackId, { pan: val })}
                  unit="%"
                />

                <Separator style={{ background: 'var(--studio-border)' }} />

                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Mute
                  </Label>
                  <Switch
                    checked={selectedTrack?.mute || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { mute: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Solo
                  </Label>
                  <Switch
                    checked={selectedTrack?.solo || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { solo: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Record Arm
                  </Label>
                  <Switch
                    checked={selectedTrack?.armed || false}
                    onCheckedChange={(checked) =>
                      onTrackUpdate?.(selectedTrackId, { armed: checked })
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            {/* Effect Chain */}
            <CollapsibleSection title="EFFECTS" icon={<Sliders className="h-4 w-4" />}>
              <div className="space-y-2">
                {effects.map((effect, index) => (
                  <div
                    key={effect.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-white/5"
                    style={{ background: 'var(--studio-bg-deep)' }}
                  >
                    <GripVertical
                      className="h-4 w-4 cursor-grab"
                      style={{ color: 'var(--studio-text-subtle)' }}
                    />
                    <Zap
                      className="h-4 w-4"
                      style={{
                        color: effect.bypass ? 'var(--studio-text-subtle)' : 'var(--studio-accent)',
                      }}
                    />
                    <span
                      className="flex-1 text-sm"
                      style={{
                        color: effect.bypass ? 'var(--studio-text-subtle)' : 'var(--studio-text)',
                      }}
                    >
                      {effect.name}
                    </span>
                    <Switch
                      checked={!effect.bypass}
                      onCheckedChange={(checked) => {
                        const newEffects = [...effects];
                        newEffects[index].bypass = !checked;
                        setEffects(newEffects);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => {
                        setEffects(effects.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs gap-2"
                  onClick={() => {
                    setEffects([
                      ...effects,
                      { id: Date.now().toString(), name: 'New Effect', type: 'fx', bypass: false },
                    ]);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add Effect
                </Button>
              </div>
            </CollapsibleSection>

            {/* Routing */}
            <CollapsibleSection title="ROUTING" icon={<Music className="h-4 w-4" />}>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Output Bus
                  </Label>
                  <select
                    value={selectedTrack?.outputBus || 'master'}
                    onChange={(e) =>
                      onTrackUpdate?.(selectedTrackId, { outputBus: e.target.value })
                    }
                    className="w-full h-8 px-2 text-sm rounded-md"
                    style={{
                      background: 'var(--studio-bg-deep)',
                      borderColor: 'var(--studio-border)',
                      color: 'var(--studio-text)',
                      border: '1px solid var(--studio-border)',
                    }}
                  >
                    <option value="master">Master</option>
                    <option value="bus-1">Bus 1</option>
                    <option value="bus-2">Bus 2</option>
                    <option value="bus-3">Bus 3</option>
                  </select>
                </div>
              </div>
            </CollapsibleSection>
          </>
        )}

        {/* Clip Properties */}
        {selectedClipId && (
          <CollapsibleSection title="CLIP" icon={<FileAudio className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <Label className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                    Start
                  </Label>
                  <div className="font-mono" style={{ color: 'var(--studio-text)' }}>
                    {selectedClip?.start || '0.00'}
                  </div>
                </div>
                <div>
                  <Label className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
                    Duration
                  </Label>
                  <div className="font-mono" style={{ color: 'var(--studio-text)' }}>
                    {selectedClip?.duration || '0.00'}
                  </div>
                </div>
              </div>

              <ParameterControl
                label="Gain"
                value={selectedClip?.gain || 0}
                min={-24}
                max={24}
                step={0.1}
                onChange={(val) => onClipUpdate?.(selectedClipId, { gain: val })}
                unit=" dB"
              />

              <ParameterControl
                label="Fade In"
                value={selectedClip?.fadeIn || 0}
                min={0}
                max={5}
                step={0.1}
                onChange={(val) => onClipUpdate?.(selectedClipId, { fadeIn: val })}
                unit=" s"
              />

              <ParameterControl
                label="Fade Out"
                value={selectedClip?.fadeOut || 0}
                min={0}
                max={5}
                step={0.1}
                onChange={(val) => onClipUpdate?.(selectedClipId, { fadeOut: val })}
                unit=" s"
              />
            </div>
          </CollapsibleSection>
        )}
      </ScrollArea>
    </div>
  );
}
