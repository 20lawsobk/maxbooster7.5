import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Volume2, Music4, Play, Square } from 'lucide-react';
import { useState } from 'react';
import { useMetronome } from '@/hooks/useMetronome';
import { logger } from '@/lib/logger';

interface MetronomeControlProps {
  bpm?: number;
  onBPMChange?: (bpm: number) => void;
  compact?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function MetronomeControl({
  bpm: externalBPM,
  onBPMChange,
  compact = false,
}: MetronomeControlProps) {
  const metronome = useMetronome({ bpm: externalBPM });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleBPMChange = (value: number) => {
    metronome.setBPM(value);
    onBPMChange?.(value);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant={metronome.enabled ? 'default' : 'outline'}
          size="sm"
          onClick={metronome.toggle}
          className="h-7 w-7 p-0"
        >
          <Music4 className="h-3 w-3" />
        </Button>

        <div className="flex items-center gap-1 text-xs">
          <Input
            type="number"
            value={metronome.bpm}
            onChange={(e) => handleBPMChange(parseInt(e.target.value) || 120)}
            className="h-7 w-14 text-xs text-center p-0"
            min={20}
            max={300}
          />
          <span className="text-gray-500">BPM</span>
        </div>

        {metronome.isPlaying && (
          <div className="flex items-center gap-1">
            <div className="flex gap-1">
              {Array.from({ length: metronome.timeSignature.numerator }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === metronome.currentBeat ? 'bg-green-500' : 'bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music4 className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-semibold">Metronome</h3>
          {metronome.isPlaying && (
            <Badge variant="outline" className="text-xs animate-pulse">
              Playing
            </Badge>
          )}
        </div>
        <Switch checked={metronome.enabled} onCheckedChange={metronome.toggle} />
      </div>

      {/* BPM Control */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Tempo (BPM)</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={metronome.bpm}
              onChange={(e) => handleBPMChange(parseInt(e.target.value) || 120)}
              className="h-8 w-20 text-center"
              min={20}
              max={300}
            />
            <Badge variant="secondary" className="text-xs">
              {metronome.bpm} BPM
            </Badge>
          </div>
        </div>
        <Slider
          value={[metronome.bpm]}
          onValueChange={([value]) => handleBPMChange(value)}
          min={20}
          max={300}
          step={1}
          className="w-full"
        />
      </div>

      {/* Time Signature */}
      <div className="space-y-2">
        <Label className="text-xs">Time Signature</Label>
        <div className="flex items-center gap-2">
          <Select
            value={metronome.timeSignature.numerator.toString()}
            onValueChange={(value) =>
              metronome.setTimeSignature(parseInt(value), metronome.timeSignature.denominator)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5, 6, 7, 8, 12].map((num) => (
                <SelectItem key={num} value={num.toString()}>
                  {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-gray-500">/</span>
          <Select
            value={metronome.timeSignature.denominator.toString()}
            onValueChange={(value) =>
              metronome.setTimeSignature(metronome.timeSignature.numerator, parseInt(value))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 4, 8, 16].map((num) => (
                <SelectItem key={num} value={num.toString()}>
                  {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Beat Indicator */}
      {metronome.isPlaying && (
        <div className="space-y-2">
          <Label className="text-xs">Beat</Label>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: metronome.timeSignature.numerator }).map((_, i) => (
                <div
                  key={i}
                  className={`h-8 w-8 rounded border-2 flex items-center justify-center text-xs font-medium transition-all ${
                    i === metronome.currentBeat
                      ? 'bg-green-500 border-green-400 text-white scale-110'
                      : 'bg-gray-900 border-gray-700 text-gray-500'
                  }`}
                >
                  {i + 1}
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500">Measure {metronome.currentMeasure + 1}</div>
          </div>
        </div>
      )}

      <Separator />

      {/* Advanced Settings */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full text-xs"
        >
          {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
        </Button>

        {showAdvanced && (
          <div className="space-y-3 pt-2">
            {/* Subdivision */}
            <div className="space-y-2">
              <Label className="text-xs">Subdivision</Label>
              <Select
                value={metronome.subdivision}
                onValueChange={(value: 'quarter' | 'eighth' | 'sixteenth') =>
                  metronome.updateSettings({ subdivision: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quarter">Quarter Notes (♩)</SelectItem>
                  <SelectItem value="eighth">Eighth Notes (♪)</SelectItem>
                  <SelectItem value="sixteenth">Sixteenth Notes (♬)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Count-In */}
            <div className="space-y-2">
              <Label className="text-xs">Count-In (Measures)</Label>
              <Select
                value={metronome.countIn.toString()}
                onValueChange={(value) => metronome.updateSettings({ countIn: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 4].map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num === 0 ? 'None' : `${num} measure${num > 1 ? 's' : ''}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Accent First Beat */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Accent First Beat</Label>
              <Switch
                checked={metronome.accentFirstBeat}
                onCheckedChange={(checked) =>
                  metronome.updateSettings({ accentFirstBeat: checked })
                }
              />
            </div>

            {/* Volume */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Volume</Label>
                <div className="flex items-center gap-1">
                  <Volume2 className="h-3 w-3 text-gray-500" />
                  <span className="text-xs text-gray-500">
                    {Math.round(metronome.volume * 100)}%
                  </span>
                </div>
              </div>
              <Slider
                value={[metronome.volume]}
                onValueChange={([value]) => metronome.setVolume(value)}
                min={0}
                max={1}
                step={0.01}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      {/* Control Buttons */}
      <div className="flex gap-2">
        <Button
          variant={metronome.isPlaying ? 'destructive' : 'default'}
          onClick={metronome.isPlaying ? metronome.stop : metronome.start}
          className="flex-1 gap-2"
          disabled={!metronome.enabled}
        >
          {metronome.isPlaying ? (
            <>
              <Square className="h-4 w-4" />
              Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Start
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => metronome.countIn(() => logger.info('Count-in complete'))}
          disabled={!metronome.enabled || metronome.isPlaying}
        >
          Count-In
        </Button>
      </div>
    </Card>
  );
}
