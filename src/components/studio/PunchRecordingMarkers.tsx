import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Scissors, Play, Square } from 'lucide-react';

interface PunchRecordingMarkersProps {
  enabled: boolean;
  punchIn: number | null;
  punchOut: number | null;
  currentTime: number;
  onEnabledChange: (enabled: boolean) => void;
  onPunchInChange: (time: number | null) => void;
  onPunchOutChange: (time: number | null) => void;
  onSetPunchIn: () => void;
  onSetPunchOut: () => void;
  compact?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function PunchRecordingMarkers({
  enabled,
  punchIn,
  punchOut,
  currentTime,
  onEnabledChange,
  onPunchInChange,
  onPunchOutChange,
  onSetPunchIn,
  onSetPunchOut,
  compact = false,
}: PunchRecordingMarkersProps) {
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const parseTime = (timeStr: string): number => {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;

    const [mins, secsMs] = parts;
    const [secs, ms = '0'] = secsMs.split('.');

    return parseInt(mins) * 60 + parseInt(secs) + parseInt(ms) / 100;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant={enabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => onEnabledChange(!enabled)}
          className="h-7 w-7 p-0"
          title="Punch Recording"
        >
          <Scissors className="h-3 w-3" />
        </Button>

        {enabled && (
          <>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500">In:</span>
              <Badge variant="outline" className="text-xs font-mono">
                {punchIn !== null ? formatTime(punchIn) : '--:--'}
              </Badge>
            </div>

            <div className="flex items-center gap-1 text-xs">
              <span className="text-gray-500">Out:</span>
              <Badge variant="outline" className="text-xs font-mono">
                {punchOut !== null ? formatTime(punchOut) : '--:--'}
              </Badge>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scissors className="h-4 w-4 text-orange-500" />
          <h3 className="text-sm font-semibold">Punch Recording</h3>
          {enabled && (
            <Badge variant="outline" className="text-xs">
              Active
            </Badge>
          )}
        </div>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} />
      </div>

      {enabled && (
        <div className="space-y-3">
          <div className="text-xs text-gray-500 p-2 bg-gray-900/50 rounded border border-gray-800">
            Punch recording automatically starts/stops recording at specific timeline positions.
            Useful for overdubbing specific sections.
          </div>

          {/* Punch In */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Punch In</Label>
              <Button variant="outline" size="sm" onClick={onSetPunchIn} className="h-7 text-xs">
                Set at {formatTime(currentTime)}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={punchIn !== null ? formatTime(punchIn) : ''}
                onChange={(e) => {
                  const time = parseTime(e.target.value);
                  onPunchInChange(time);
                }}
                placeholder="0:00.00"
                className="font-mono"
              />
              {punchIn !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPunchInChange(null)}
                  className="h-9 px-3"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Punch Out */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Punch Out</Label>
              <Button variant="outline" size="sm" onClick={onSetPunchOut} className="h-7 text-xs">
                Set at {formatTime(currentTime)}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Input
                value={punchOut !== null ? formatTime(punchOut) : ''}
                onChange={(e) => {
                  const time = parseTime(e.target.value);
                  onPunchOutChange(time);
                }}
                placeholder="0:00.00"
                className="font-mono"
              />
              {punchOut !== null && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPunchOutChange(null)}
                  className="h-9 px-3"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Visual Indicator */}
          {punchIn !== null && punchOut !== null && (
            <div className="space-y-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded">
              <div className="text-xs font-medium text-orange-300">Punch Range</div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Play className="h-3 w-3 text-green-500" />
                  <span className="font-mono">{formatTime(punchIn)}</span>
                </div>
                <div className="flex-1 mx-2 h-px bg-orange-500/30" />
                <div className="flex items-center gap-2">
                  <span className="font-mono">{formatTime(punchOut)}</span>
                  <Square className="h-3 w-3 text-red-500" />
                </div>
              </div>
              <div className="text-xs text-gray-500">
                Duration: {formatTime(punchOut - punchIn)}
              </div>
            </div>
          )}

          {/* Workflow Tips */}
          <div className="text-xs text-gray-500 space-y-1">
            <div className="font-medium">Workflow Tips:</div>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Set punch points on timeline during playback</li>
              <li>Recording starts automatically at Punch In</li>
              <li>Recording stops automatically at Punch Out</li>
              <li>Perfect for fixing specific sections</li>
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
