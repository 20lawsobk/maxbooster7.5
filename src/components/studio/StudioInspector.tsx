import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Volume2, Circle } from 'lucide-react';

interface StudioTrack {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  color: string;
  effects?: any;
}

interface StudioInspectorProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  selectedTrack: StudioTrack | null;
  tracks: StudioTrack[];
  onTrackUpdate: (trackId: string, updates: Partial<StudioTrack>) => void;
}

/**
 * TODO: Add function documentation
 */
export function StudioInspector({
  collapsed,
  onToggleCollapse,
  selectedTrack,
  tracks,
  onTrackUpdate,
}: StudioInspectorProps) {
  if (collapsed) {
    return (
      <div
        className="h-full flex flex-col items-center py-4"
        style={{ backgroundColor: 'var(--studio-inspector)' }}
      >
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 mb-4"
          onClick={onToggleCollapse}
          data-testid="button-toggle-inspector"
          style={{ color: 'var(--studio-text)' }}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div
          className="text-xs font-medium rotate-180 mb-auto mt-4"
          style={{
            writingMode: 'vertical-rl',
            color: 'var(--studio-text-muted)',
          }}
        >
          INSPECTOR
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--studio-inspector)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: 'var(--studio-border)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
          Inspector
        </h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={onToggleCollapse}
          data-testid="button-toggle-inspector"
          style={{ color: 'var(--studio-text)' }}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {selectedTrack ? (
            <>
              {/* Track Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: selectedTrack.color }}
                  />
                  <h4 className="text-sm font-medium" style={{ color: 'var(--studio-text)' }}>
                    {selectedTrack.name}
                  </h4>
                </div>
              </div>

              <Separator style={{ backgroundColor: 'var(--studio-border)' }} />

              {/* Volume Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Volume
                  </Label>
                  <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
                    {Math.round((selectedTrack.volume || 0.8) * 100)}%
                  </span>
                </div>
                <Slider
                  value={[(selectedTrack.volume || 0.8) * 100]}
                  onValueChange={([value]) =>
                    onTrackUpdate(selectedTrack.id, { volume: value / 100 })
                  }
                  max={100}
                  step={1}
                  className="w-full"
                  data-testid="slider-track-volume"
                />
              </div>

              {/* Pan Control */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                    Pan
                  </Label>
                  <span className="text-xs font-mono" style={{ color: 'var(--studio-text)' }}>
                    {(selectedTrack.pan || 0) > 0 ? 'R' : (selectedTrack.pan || 0) < 0 ? 'L' : 'C'}{' '}
                    {Math.abs(Math.round((selectedTrack.pan || 0) * 100))}
                  </span>
                </div>
                <Slider
                  value={[(selectedTrack.pan || 0) * 100 + 50]}
                  onValueChange={([value]) =>
                    onTrackUpdate(selectedTrack.id, { pan: (value - 50) / 100 })
                  }
                  max={100}
                  step={1}
                  className="w-full"
                  data-testid="slider-track-pan"
                />
              </div>

              <Separator style={{ backgroundColor: 'var(--studio-border)' }} />

              {/* Track States */}
              <div className="space-y-2">
                <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                  Track State
                </Label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={selectedTrack.mute ? 'destructive' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => onTrackUpdate(selectedTrack.id, { mute: !selectedTrack.mute })}
                    data-testid="button-track-mute"
                  >
                    M
                  </Button>
                  <Button
                    size="sm"
                    variant={selectedTrack.solo ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => onTrackUpdate(selectedTrack.id, { solo: !selectedTrack.solo })}
                    data-testid="button-track-solo"
                    style={{
                      backgroundColor: selectedTrack.solo ? 'var(--studio-accent)' : 'transparent',
                    }}
                  >
                    S
                  </Button>
                </div>
              </div>

              {/* Effects Section */}
              {selectedTrack.effects && (
                <>
                  <Separator style={{ backgroundColor: 'var(--studio-border)' }} />
                  <div className="space-y-2">
                    <Label className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      Effects
                    </Label>
                    <div className="text-xs" style={{ color: 'var(--studio-text-muted)' }}>
                      EQ, Compressor, Reverb available
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--studio-text-muted)' }}>
                No track selected
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--studio-text-muted)' }}>
                Select a track to view and edit its properties
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
