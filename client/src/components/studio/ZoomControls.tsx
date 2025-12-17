import { ZoomIn, ZoomOut, Maximize2, Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useStudioStore } from '@/lib/studioStore';

const SNAP_RESOLUTIONS = [
  { value: 0.0625, label: '1/16' },
  { value: 0.125, label: '1/8' },
  { value: 0.25, label: '1/4' },
  { value: 0.5, label: '1/2' },
  { value: 1, label: '1 Bar' },
  { value: 2, label: '2 Bars' },
  { value: 4, label: '4 Bars' },
];

/**
 * TODO: Add function documentation
 */
export function ZoomControls() {
  const { zoom, setZoom, snapEnabled, toggleSnap, snapResolution, setSnapResolution } =
    useStudioStore();

  const handleZoomIn = () => setZoom(zoom * 1.2);
  const handleZoomOut = () => setZoom(zoom / 1.2);
  const handleZoomFit = () => setZoom(1.0);

  return (
    <div
      className="h-10 flex items-center gap-2 px-3 border-b"
      style={{
        background: 'var(--studio-bg-medium)',
        borderColor: 'var(--studio-border)',
      }}
    >
      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>

        <div className="w-24 px-2">
          <Slider
            value={[Math.log2(zoom)]}
            onValueChange={([val]) => setZoom(Math.pow(2, val))}
            min={-3} // 0.125x
            max={3} // 8x
            step={0.1}
            className="cursor-pointer"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={handleZoomFit}
          title="Fit to Window"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>

        <div
          className="ml-2 px-2 text-[10px] font-mono font-medium"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {zoom.toFixed(1)}x
        </div>
      </div>

      <div className="h-5 w-px mx-2" style={{ background: 'var(--studio-border)' }} />

      {/* Snap Controls */}
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 px-3 text-xs font-medium ${snapEnabled ? 'bg-blue-500/20 text-blue-400' : ''}`}
        onClick={toggleSnap}
        title="Toggle Snap to Grid"
      >
        <Grid3x3 className="h-3 w-3 mr-1.5" />
        SNAP
      </Button>

      {snapEnabled && (
        <Select
          value={snapResolution.toString()}
          onValueChange={(val) => setSnapResolution(parseFloat(val))}
        >
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SNAP_RESOLUTIONS.map((res) => (
              <SelectItem key={res.value} value={res.value.toString()}>
                {res.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
