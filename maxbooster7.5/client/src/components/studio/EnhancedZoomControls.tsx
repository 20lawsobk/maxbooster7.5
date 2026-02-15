import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Grid3x3,
  ChevronDown,
  Clock,
  Music2,
  Waves,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useStudioStore } from '@/lib/studioStore';

const ZOOM_PRESETS = [
  { value: 0.25, label: '25%', description: 'Full project view' },
  { value: 0.5, label: '50%', description: 'Overview' },
  { value: 1, label: '100%', description: 'Normal' },
  { value: 2, label: '200%', description: 'Detail' },
  { value: 4, label: '400%', description: 'Fine edit' },
  { value: 8, label: '800%', description: 'Sample-level' },
];

const SNAP_RESOLUTIONS = [
  { value: 0.03125, label: '1/32', icon: '𝅘𝅥𝅯𝅯' },
  { value: 0.0625, label: '1/16', icon: '𝅘𝅥𝅯' },
  { value: 0.125, label: '1/8', icon: '𝅘𝅥𝅮' },
  { value: 0.25, label: '1/4', icon: '𝅘𝅥' },
  { value: 0.5, label: '1/2', icon: '𝅗𝅥' },
  { value: 1, label: '1 Bar', icon: '𝅝' },
  { value: 2, label: '2 Bars', icon: '' },
  { value: 4, label: '4 Bars', icon: '' },
];

const GRID_TYPES = [
  { id: 'bars', label: 'Bars', icon: <Music2 className="h-3 w-3" /> },
  { id: 'seconds', label: 'Seconds', icon: <Clock className="h-3 w-3" /> },
  { id: 'samples', label: 'Samples', icon: <Waves className="h-3 w-3" /> },
];

interface EnhancedZoomControlsProps {
  duration?: number;
  onZoomToSelection?: () => void;
  onZoomToLoop?: () => void;
}

export function EnhancedZoomControls({
  duration = 300,
  onZoomToSelection,
  onZoomToLoop,
}: EnhancedZoomControlsProps) {
  const {
    zoom,
    setZoom,
    snapEnabled,
    toggleSnap,
    snapResolution,
    setSnapResolution,
  } = useStudioStore();

  const [gridType, setGridType] = useState<'bars' | 'seconds' | 'samples'>('bars');
  const [showTriplets, setShowTriplets] = useState(false);

  const handleZoomIn = () => setZoom(Math.min(zoom * 1.25, 16));
  const handleZoomOut = () => setZoom(Math.max(zoom / 1.25, 0.1));
  const handleZoomFit = () => setZoom(1.0);

  const handleZoomPreset = (value: number) => {
    setZoom(value);
  };

  const getZoomPercentage = () => Math.round(zoom * 100);

  const currentSnapLabel = SNAP_RESOLUTIONS.find(
    (r) => r.value === snapResolution
  )?.label || '1/4';

  return (
    <TooltipProvider>
      <div
        className="h-10 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 border-b overflow-x-auto"
        style={{
          background: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 sm:h-11 sm:w-11 p-0 touch-manipulation"
                onClick={handleZoomOut}
                aria-label="Zoom out"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out (Ctrl+-)</TooltipContent>
          </Tooltip>

          <div className="w-20 sm:w-24 px-1 sm:px-2">
            <Slider
              value={[Math.log2(zoom)]}
              onValueChange={([val]) => setZoom(Math.pow(2, val))}
              min={-3}
              max={4}
              step={0.1}
              className="cursor-pointer touch-manipulation"
              aria-label="Zoom level"
            />
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-10 w-10 sm:h-11 sm:w-11 p-0 touch-manipulation"
                onClick={handleZoomIn}
                aria-label="Zoom in"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In (Ctrl++)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs font-mono"
              >
                {getZoomPercentage()}%
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-40">
              {ZOOM_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.value}
                  onClick={() => handleZoomPreset(preset.value)}
                  className="flex justify-between"
                >
                  <span className="text-xs">{preset.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {preset.description}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {onZoomToSelection && (
                <DropdownMenuItem onClick={onZoomToSelection} className="text-xs">
                  Zoom to Selection
                </DropdownMenuItem>
              )}
              {onZoomToLoop && (
                <DropdownMenuItem onClick={onZoomToLoop} className="text-xs">
                  Zoom to Loop Region
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleZoomFit} className="text-xs">
                Fit to Window
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hidden sm:flex"
                onClick={handleZoomFit}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit to Window (Ctrl+0)</TooltipContent>
          </Tooltip>
        </div>

        <div
          className="h-5 w-px mx-1 sm:mx-2 hidden sm:block"
          style={{ background: 'var(--studio-border)' }}
        />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-10 sm:h-11 px-3 sm:px-4 text-xs font-medium touch-manipulation ${
                  snapEnabled ? 'bg-blue-500/20 text-blue-400' : ''
                }`}
                onClick={toggleSnap}
                aria-label="Toggle snap to grid"
                aria-pressed={snapEnabled}
              >
                <Grid3x3 className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">SNAP</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Snap to Grid (G)</TooltipContent>
          </Tooltip>

          {snapEnabled && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="flex items-center gap-1"
            >
              <Select
                value={snapResolution.toString()}
                onValueChange={(val) => setSnapResolution(parseFloat(val))}
              >
                <SelectTrigger className="h-7 w-16 sm:w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SNAP_RESOLUTIONS.map((res) => (
                    <SelectItem
                      key={res.value}
                      value={res.value.toString()}
                      className="text-xs"
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-mono">{res.label}</span>
                        {res.icon && (
                          <span className="text-lg leading-none">{res.icon}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-10 w-10 sm:h-11 sm:w-11 p-0 text-xs font-bold hidden md:flex items-center justify-center touch-manipulation ${
                      showTriplets ? 'bg-purple-500/20 text-purple-400' : ''
                    }`}
                    onClick={() => {
                      const newTripletState = !showTriplets;
                      setShowTriplets(newTripletState);
                      if (newTripletState) {
                        const tripletResolution = snapResolution * (2/3);
                        setSnapResolution(tripletResolution);
                      } else {
                        const normalResolution = snapResolution * (3/2);
                        setSnapResolution(normalResolution);
                      }
                    }}
                    aria-label="Toggle triplet grid"
                    aria-pressed={showTriplets}
                  >
                    T
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Triplet Grid</TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </div>

        <div
          className="h-5 w-px mx-1 sm:mx-2 hidden md:block"
          style={{ background: 'var(--studio-border)' }}
        />

        <div className="hidden md:flex items-center gap-1">
          {GRID_TYPES.map((type) => (
            <Tooltip key={type.id}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-7 p-0 ${
                    gridType === type.id ? 'bg-accent text-accent-foreground' : ''
                  }`}
                  onClick={() => setGridType(type.id as typeof gridType)}
                >
                  {type.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{type.label} Grid</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <div className="flex-1" />

        <div
          className="hidden lg:flex items-center gap-2 text-[10px] font-mono"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          <span>Duration:</span>
          <span style={{ color: 'var(--studio-text)' }}>
            {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>
    </TooltipProvider>
  );
}
