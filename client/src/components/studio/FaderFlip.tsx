import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Globe, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  FaderMode,
  FaderModeType,
  FaderModeConfig,
  FADER_MODES,
  FADER_MODE_COLORS,
  useFaderFlip,
  UseFaderFlipReturn,
} from '@/hooks/useFaderFlip';

interface FaderFlipProps {
  channelId: string;
  faderFlip: UseFaderFlipReturn;
  onValueChange?: (value: number, mode: FaderMode) => void;
  compact?: boolean;
  showGlobalControls?: boolean;
}

interface ModeButtonProps {
  mode: FaderModeConfig;
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}

function ModeButton({ mode, isActive, onClick, compact }: ModeButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          onClick={onClick}
          className="relative px-2 py-1 rounded text-xs font-medium transition-all"
          style={{
            background: isActive ? mode.color + '30' : 'transparent',
            borderColor: isActive ? mode.color : 'var(--studio-border)',
            border: `1px solid ${isActive ? mode.color : 'var(--studio-border)'}`,
            color: isActive ? mode.color : 'var(--studio-text-muted)',
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {compact ? mode.shortLabel : mode.label}
          {isActive && (
            <motion.div
              className="absolute -top-1 -right-1 w-2 h-2 rounded-full"
              style={{ background: mode.color }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              layoutId={`active-indicator-${mode.id}`}
            />
          )}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p>{mode.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ModeSectionProps {
  title: string;
  modes: FaderModeConfig[];
  currentMode: FaderMode;
  onModeSelect: (mode: FaderMode) => void;
  compact?: boolean;
}

function ModeSection({ title, modes, currentMode, onModeSelect, compact }: ModeSectionProps) {
  return (
    <div className="space-y-1.5">
      <div
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--studio-text-muted)' }}
      >
        {title}
      </div>
      <div className="flex flex-wrap gap-1">
        {modes.map((mode) => (
          <ModeButton
            key={mode.id}
            mode={mode}
            isActive={currentMode === mode.id}
            onClick={() => onModeSelect(mode.id)}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

export function FaderFlip({
  channelId,
  faderFlip,
  onValueChange,
  compact = false,
  showGlobalControls = true,
}: FaderFlipProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const currentMode = faderFlip.getChannelMode(channelId);
  const currentValue = faderFlip.getChannelValue(channelId);
  const modeConfig = faderFlip.getModeConfig(currentMode);
  const isSelected = faderFlip.selectedChannels.includes(channelId);

  const handleModeSelect = useCallback((mode: FaderMode) => {
    faderFlip.setChannelMode(channelId, mode);
  }, [channelId, faderFlip]);

  const handleReturnToVolume = useCallback(() => {
    faderFlip.returnToVolume(channelId);
  }, [channelId, faderFlip]);

  const handleChannelSelect = useCallback((e: React.MouseEvent) => {
    faderFlip.selectChannel(channelId, e.shiftKey || e.ctrlKey || e.metaKey);
  }, [channelId, faderFlip]);

  const volumeModes = FADER_MODES.filter(m => m.type === 'volume');
  const fxModes = FADER_MODES.filter(m => m.type === 'fx');
  const cueModes = FADER_MODES.filter(m => m.type === 'cue');
  const busModes = FADER_MODES.filter(m => m.type === 'bus');

  return (
    <div
      className="rounded-lg p-2 space-y-2"
      style={{
        background: 'var(--studio-bg-medium)',
        border: `1px solid ${isSelected ? modeConfig.color : 'var(--studio-border)'}`,
      }}
      onClick={handleChannelSelect}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <motion.div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ background: modeConfig.color }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 gap-1 text-xs font-medium"
                style={{
                  color: modeConfig.color,
                  background: modeConfig.color + '15',
                }}
              >
                {compact ? modeConfig.shortLabel : modeConfig.label}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-48"
              style={{
                background: 'var(--studio-bg-deep)',
                border: '1px solid var(--studio-border)',
              }}
            >
              <DropdownMenuLabel style={{ color: 'var(--studio-text-muted)' }}>
                Fader Mode
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {FADER_MODES.map((mode) => (
                <DropdownMenuItem
                  key={mode.id}
                  onClick={() => handleModeSelect(mode.id)}
                  className="flex items-center justify-between"
                  style={{ color: 'var(--studio-text)' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: mode.color }}
                    />
                    <span>{mode.label}</span>
                  </div>
                  {currentMode === mode.id && (
                    <Check className="h-3 w-3" style={{ color: mode.color }} />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          {currentMode !== 'volume' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReturnToVolume();
                  }}
                  style={{ color: FADER_MODE_COLORS.volume }}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Return to Volume</TooltipContent>
            </Tooltip>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            style={{ color: 'var(--studio-text-muted)' }}
          >
            {isExpanded ? 'Less' : 'More'}
          </Button>
        </div>
      </div>

      <div
        className="text-center py-1 px-2 rounded font-mono text-sm"
        style={{
          background: modeConfig.color + '15',
          color: modeConfig.color,
          border: `1px solid ${modeConfig.color}40`,
        }}
      >
        {faderFlip.formatValue(currentValue, currentMode)}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden space-y-3 pt-2"
          >
            <ModeSection
              title="Volume"
              modes={volumeModes}
              currentMode={currentMode}
              onModeSelect={handleModeSelect}
              compact={compact}
            />
            <ModeSection
              title="FX Sends"
              modes={fxModes}
              currentMode={currentMode}
              onModeSelect={handleModeSelect}
              compact={compact}
            />
            <ModeSection
              title="Cue Mixes"
              modes={cueModes}
              currentMode={currentMode}
              onModeSelect={handleModeSelect}
              compact={compact}
            />
            <ModeSection
              title="Bus Sends"
              modes={busModes}
              currentMode={currentMode}
              onModeSelect={handleModeSelect}
              compact={compact}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showGlobalControls && faderFlip.isGlobalModeActive && isSelected && (
        <div
          className="flex items-center gap-1 pt-2 border-t"
          style={{ borderColor: 'var(--studio-border)' }}
        >
          <Globe className="h-3 w-3" style={{ color: 'var(--studio-text-muted)' }} />
          <span className="text-[10px]" style={{ color: 'var(--studio-text-muted)' }}>
            Global: {faderFlip.getModeConfig(faderFlip.globalMode!).label}
          </span>
        </div>
      )}
    </div>
  );
}

interface FaderFlipGlobalControlsProps {
  faderFlip: UseFaderFlipReturn;
}

export function FaderFlipGlobalControls({ faderFlip }: FaderFlipGlobalControlsProps) {
  const hasSelection = faderFlip.selectedChannels.length > 0;

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-lg"
      style={{
        background: 'var(--studio-bg-medium)',
        border: '1px solid var(--studio-border)',
      }}
    >
      <Globe className="h-4 w-4" style={{ color: 'var(--studio-text-muted)' }} />
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1"
            disabled={!hasSelection}
            style={{
              borderColor: faderFlip.globalMode 
                ? faderFlip.getModeConfig(faderFlip.globalMode).color 
                : 'var(--studio-border)',
              color: faderFlip.globalMode
                ? faderFlip.getModeConfig(faderFlip.globalMode).color
                : 'var(--studio-text)',
            }}
          >
            {faderFlip.globalMode 
              ? faderFlip.getModeConfig(faderFlip.globalMode).shortLabel
              : 'Global Mode'}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          style={{
            background: 'var(--studio-bg-deep)',
            border: '1px solid var(--studio-border)',
          }}
        >
          <DropdownMenuItem
            onClick={() => faderFlip.setGlobalMode(null)}
            style={{ color: 'var(--studio-text)' }}
          >
            <span>None</span>
            {!faderFlip.globalMode && <Check className="h-3 w-3 ml-2" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {FADER_MODES.map((mode) => (
            <DropdownMenuItem
              key={mode.id}
              onClick={() => faderFlip.toggleGlobalMode(mode.id)}
              className="flex items-center gap-2"
              style={{ color: 'var(--studio-text)' }}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ background: mode.color }}
              />
              <span>{mode.shortLabel}</span>
              {faderFlip.globalMode === mode.id && (
                <Check className="h-3 w-3 ml-auto" style={{ color: mode.color }} />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={() => faderFlip.applyGlobalModeToSelected()}
        disabled={!faderFlip.globalMode || !hasSelection}
        style={{ color: 'var(--studio-text-muted)' }}
      >
        Apply to Selected
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={() => faderFlip.returnToVolume()}
        style={{ color: FADER_MODE_COLORS.volume }}
      >
        <RotateCcw className="h-3 w-3 mr-1" />
        Reset All
      </Button>

      {hasSelection && (
        <Badge
          variant="outline"
          className="text-[10px]"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {faderFlip.selectedChannels.length} selected
        </Badge>
      )}
    </div>
  );
}

export { useFaderFlip, FADER_MODES, FADER_MODE_COLORS };
export type { FaderMode, FaderModeType, FaderModeConfig };
